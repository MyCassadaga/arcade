import { DurableObject } from "cloudflare:workers";
import { GameRuleError } from "@team-arcade/game-core";
import {
  SystemCrawlRuleError,
  advanceShirtFightDue,
  canViewerAccessShirtFightDrawing,
  deterministicUuid,
  isShirtFightDrawingUploadCurrent,
  missingShirtFightDrawings,
  registerShirtFightDrawing,
  type ShirtFightDrawing,
  type ShirtFightFallbackDrawing,
  type ShirtFightState,
  type SystemCrawlState
} from "@team-arcade/games";
import { GAME_REGISTRY, bindGame, isRegisteredGame, type StoredPartyGame } from "./game-registry";
import {
  MAX_PLAYERS,
  clientMessageSchema,
  systemCrawlCommandSchema,
  type ClientMessage,
  type ErrorCode,
  type GameCommand,
  type RoomSessionResponse,
  type ServerMessage,
  type SystemCrawlCommand,
  type TypedGameViewerState
} from "@team-arcade/shared";
import {
  canIssueHostCommand,
  chooseHostSuccessor,
  hasDuplicateName,
  projectRoom,
  type RoomMetadata,
  type StoredPlayer
} from "./room-model";
import {
  createSystemCrawlRoomState,
  createSystemCrawlReplayRoomState,
  handleSystemCrawlRoomCommand,
  projectSystemCrawlRoomState
} from "./system-crawl-adapter";
import type { Env } from "./types";

const HOST_GRACE_MS = 60_000;
const ROOM_EXPIRY_MS = 12 * 60 * 60 * 1_000;
const RECENT_REQUEST_LIMIT = 50;
const MAX_WEBSOCKET_MESSAGE_BYTES = 4_096;
const MAX_DRAWING_BYTES = 160_000;
const DRAWING_RETENTION_MS = 24 * 60 * 60 * 1_000;
const CLEANUP_RETRY_BASE_MS = 60_000;
const CLEANUP_RETRY_MAX_MS = 60 * 60 * 1_000;
const FALLBACK_WEBP = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEALmk0mk0iIiIiIgBoSygABc6zbAAA";

interface SocketAttachment {
  playerId?: string;
}

interface PlayerRow {
  id: string;
  display_name: string;
  session_token_hash: string;
  joined_at: number;
  last_seen_at: number;
  connected: number;
  disconnected_at: number | null;
  is_host: number;
  score: number;
}

interface StateRow {
  json_value: string;
}

interface ShirtFightAssetEntry {
  drawingId: string;
  objectKey: string;
  gameInstanceId: string;
  playerId: string;
  round: 1 | 2;
  drawingNumber: 1 | 2;
  status: "reserved" | "finalized";
  createdAt: number;
  cleanupAt?: number;
  fallbackRetryCount: number;
  fallbackRetryAt: number | undefined;
  cleanupRetryCount: number;
}

interface ShirtFightAssetManifest {
  entries: ShirtFightAssetEntry[];
}

interface NewPlayer {
  id: string;
  displayName: string;
  sessionTokenHash: string;
  isHost: boolean;
  now: number;
  session: Omit<RoomSessionResponse, "roomCode">;
}

type StoredGame =
  | StoredPartyGame
  | { gameId: "system-crawl"; state: SystemCrawlState };

export class RoomDurableObject extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    void ctx.blockConcurrencyWhile(() => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS room_state (
          key TEXT PRIMARY KEY,
          json_value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          normalized_name TEXT NOT NULL UNIQUE,
          session_token_hash TEXT NOT NULL UNIQUE,
          joined_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          connected INTEGER NOT NULL DEFAULT 0,
          disconnected_at INTEGER,
          is_host INTEGER NOT NULL,
          score INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS processed_requests (
          player_id TEXT NOT NULL,
          request_id TEXT NOT NULL,
          processed_at INTEGER NOT NULL,
          PRIMARY KEY (player_id, request_id)
        );
      `);
      return Promise.resolve();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/internal/create") {
      return this.create(request);
    }
    if (request.method === "POST" && url.pathname === "/internal/join") {
      return this.join(request);
    }
    if (request.method === "POST" && url.pathname === "/internal/session") {
      return this.validateSession(request);
    }
    if (request.method === "GET" && url.pathname === "/internal/socket") {
      return this.openSocket(request);
    }
    if (request.method === "POST" && url.pathname === "/internal/shirt-fight/drawings") {
      return this.receiveShirtFightDrawing(request);
    }
    const assetMatch = url.pathname.match(/^\/internal\/shirt-fight\/assets\/([0-9a-f-]{36})$/u);
    if (request.method === "GET" && assetMatch?.[1]) {
      return this.readShirtFightDrawing(request, assetMatch[1]);
    }
    return jsonError("ROOM_NOT_FOUND", "Room no longer exists.", 404);
  }

  private async create(request: Request): Promise<Response> {
    if (this.readMetadata()) {
      return jsonError("SERVER_ERROR", "Room code collision.", 409);
    }

    const { roomCode, displayName } = await request.json<{ roomCode: string; displayName: string }>();
    const now = Date.now();
    const metadata: RoomMetadata = {
      roomCode,
      selectedGameId: null,
      roomPhase: "lobby",
      createdAt: now,
      lastActivityAt: now
    };
    const newPlayer = await this.preparePlayer(displayName, true, now);
    let collision = false;
    this.ctx.storage.transactionSync(() => {
      if (this.readMetadata()) {
        collision = true;
        return;
      }
      this.writeMetadata(metadata);
      this.insertPlayer(newPlayer);
    });
    if (collision) return jsonError("SERVER_ERROR", "Room code collision.", 409);
    await this.scheduleAlarm();
    console.log(JSON.stringify({ event: "room.created", roomCode, playerId: newPlayer.session.playerId }));
    return Response.json({ ...newPlayer.session, roomCode } satisfies RoomSessionResponse, { status: 201 });
  }

  private async join(request: Request): Promise<Response> {
    const metadata = await this.activeMetadata();
    if (metadata instanceof Response) return metadata;

    const { displayName } = await request.json<{ displayName: string }>();
    const players = this.readPlayers();
    if (metadata.roomPhase !== "lobby") {
      return jsonError("INVALID_PHASE", "This game is already in progress. Join when the room returns to the arcade.", 409);
    }
    if (players.length >= MAX_PLAYERS) {
      return jsonError("ROOM_FULL", "This room already has 12 players.", 409);
    }
    if (hasDuplicateName(players, displayName)) {
      return jsonError("NAME_TAKEN", "That display name is already in this room.", 409);
    }

    const now = Date.now();
    const newPlayer = await this.preparePlayer(displayName, false, now);
    let joinError: Response | null = null;
    this.ctx.storage.transactionSync(() => {
      const currentMetadata = this.readMetadata();
      const currentPlayers = this.readPlayers();
      if (!currentMetadata) {
        joinError = jsonError("ROOM_NOT_FOUND", "Room no longer exists.", 404);
        return;
      }
      if (currentMetadata.roomPhase !== "lobby") {
        joinError = jsonError("INVALID_PHASE", "This game is already in progress. Join when the room returns to the arcade.", 409);
        return;
      }
      if (currentPlayers.length >= MAX_PLAYERS) {
        joinError = jsonError("ROOM_FULL", "This room already has 12 players.", 409);
        return;
      }
      if (hasDuplicateName(currentPlayers, displayName)) {
        joinError = jsonError("NAME_TAKEN", "That display name is already in this room.", 409);
        return;
      }
      this.insertPlayer(newPlayer);
      this.writeMetadata({ ...currentMetadata, lastActivityAt: now });
    });
    if (joinError) return joinError;
    await this.scheduleAlarm();
    console.log(JSON.stringify({ event: "player.joined", roomCode: metadata.roomCode, playerId: newPlayer.session.playerId }));
    return Response.json({ ...newPlayer.session, roomCode: metadata.roomCode } satisfies RoomSessionResponse, { status: 201 });
  }

  private async validateSession(request: Request): Promise<Response> {
    const metadata = await this.activeMetadata();
    if (metadata instanceof Response) return metadata;
    const { sessionToken } = await request.json<{ sessionToken: string }>();
    const tokenHash = await hashSessionToken(sessionToken);
    const player = this.readPlayers().find((candidate) => candidate.sessionTokenHash === tokenHash);
    return player
      ? Response.json({ valid: true })
      : jsonError("INVALID_SESSION", "Your room session is no longer valid.", 401);
  }

  private async receiveShirtFightDrawing(request: Request): Promise<Response> {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "image/webp") return jsonError("INVALID_COMMAND", "Drawings must be WebP images.", 415);
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DRAWING_BYTES) return jsonError("INVALID_COMMAND", "Drawing image is too large.", 413);
    const bytes = await readBoundedBytes(request, MAX_DRAWING_BYTES);
    if (!bytes) return jsonError("INVALID_COMMAND", "Drawing image is invalid or too large.", 413);
    return this.ctx.blockConcurrencyWhile(() => this.uploadShirtFightDrawing(request, bytes));
  }

  private async uploadShirtFightDrawing(request: Request, bytes: Uint8Array): Promise<Response> {
    const metadata = await this.activeMetadata();
    if (metadata instanceof Response) return metadata;
    const player = await this.authenticateHttp(request);
    if (player instanceof Response) return player;
    await this.reconcileShirtFightDue(Date.now(), true);
    const game = this.readGame();
    if (game?.gameId !== "shirt-fight" || game.state.phase !== "drawing" || game.state.drawingNumber === undefined || game.state.generationRound === 3) {
      return jsonError("STALE_PHASE", "Drawing uploads are closed.", 409);
    }
    if (!game.state.playerIds.includes(player.id)) return jsonError("PLAYER_NOT_ACTIVE", "You are not active in this game.", 403);
    if (missingShirtFightDrawings(game.state).every((slot) => slot.playerId !== player.id)) {
      return jsonError("ALREADY_SUBMITTED", "That drawing is already finalized.", 409);
    }
    const dimensions = readWebpDimensions(bytes);
    if (!dimensions || dimensions.width !== 600 || dimensions.height !== 800) {
      return jsonError("INVALID_COMMAND", "Drawings must be a 600 by 800 WebP image.", 400);
    }

    const slot = {
      gameInstanceId: game.state.gameInstanceId,
      playerId: player.id,
      round: game.state.generationRound,
      drawingNumber: game.state.drawingNumber
    };
    const entry = this.ensureAssetReservation(metadata.roomCode, game.state, slot.playerId, slot.round, slot.drawingNumber);
    await this.env.SHIRT_FIGHT_DRAWINGS.put(entry.objectKey, bytes, {
      httpMetadata: { contentType: "image/webp", cacheControl: "private, no-store" },
      customMetadata: { drawingId: entry.drawingId, gameInstanceId: entry.gameInstanceId }
    });
    const confirmed = await this.env.SHIRT_FIGHT_DRAWINGS.head(entry.objectKey);
    if (!confirmed) return jsonError("SERVER_ERROR", "The drawing could not be confirmed. Try again.", 503);
    const now = Date.now();
    await this.reconcileShirtFightDue(now, true);
    const current = this.readGame();
    if (current?.gameId !== "shirt-fight" || !isShirtFightDrawingUploadCurrent(current.state, slot, now)) {
      this.updateAssetEntry(entry.drawingId, (item) => item.status === "reserved" ? { ...item, cleanupAt: now + DRAWING_RETENTION_MS } : item);
      await this.scheduleAlarm();
      return jsonError("STALE_PHASE", "That drawing phase is closed.", 409);
    }
    const drawing: ShirtFightDrawing = {
      id: entry.drawingId,
      artistPlayerId: player.id,
      round: slot.round,
      drawingNumber: slot.drawingNumber,
      createdAt: now,
      durationMs: Math.max(0, now - current.state.phaseStartedAt),
      width: 600,
      height: 800,
      byteLength: bytes.byteLength,
      mediaType: "image/webp",
      fallback: false
    };
    const result = registerShirtFightDrawing(current.state, drawing, now);
    this.ctx.storage.transactionSync(() => {
      this.writeGame({ gameId: "shirt-fight", state: result.state });
      this.updateAssetEntry(entry.drawingId, (item) => ({ ...item, status: "finalized" }));
    });
    this.broadcastGameState();
    await this.scheduleAlarm();
    return Response.json({ drawingId: entry.drawingId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  }

  private async readShirtFightDrawing(request: Request, drawingId: string): Promise<Response> {
    const metadata = await this.activeMetadata();
    if (metadata instanceof Response) return metadata;
    const player = await this.authenticateHttp(request);
    if (player instanceof Response) return player;
    await this.reconcileShirtFightDue(Date.now(), true);
    const game = this.readGame();
    if (game?.gameId !== "shirt-fight" || !canViewerAccessShirtFightDrawing(game.state, player.id, drawingId)) {
      return jsonError("INVALID_COMMAND", "That drawing is not available to you.", 404);
    }
    const entry = this.readAssetManifest().entries.find((item) => item.drawingId === drawingId && item.status === "finalized" && item.gameInstanceId === game.state.gameInstanceId);
    if (!entry) return jsonError("INVALID_COMMAND", "That drawing is not available to you.", 404);
    const object = await this.env.SHIRT_FIGHT_DRAWINGS.get(entry.objectKey);
    if (!object) return jsonError("SERVER_ERROR", "That drawing is temporarily unavailable.", 503);
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType ?? "image/webp",
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  private async authenticateHttp(request: Request): Promise<StoredPlayer | Response> {
    const match = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,200})$/u);
    if (!match?.[1]) return jsonError("INVALID_SESSION", "A valid room session is required.", 401);
    const tokenHash = await hashSessionToken(match[1]);
    const player = this.readPlayers().find((candidate) => candidate.sessionTokenHash === tokenHash);
    return player ?? jsonError("INVALID_SESSION", "Your room session is no longer valid.", 401);
  }

  private openSocket(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return jsonError("INVALID_COMMAND", "Expected a WebSocket upgrade.", 426);
    }
    if (!this.readMetadata()) {
      return jsonError("ROOM_NOT_FOUND", "Room no longer exists.", 404);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({} satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    if (typeof rawMessage !== "string") {
      this.sendError(socket, "INVALID_COMMAND", "Messages must be JSON text.");
      return;
    }
    if (new TextEncoder().encode(rawMessage).byteLength > MAX_WEBSOCKET_MESSAGE_BYTES) {
      this.sendError(socket, "INVALID_COMMAND", "Message payload is too large.");
      return;
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(rawMessage);
    } catch {
      this.sendError(socket, "INVALID_COMMAND", "Message was not valid JSON.");
      return;
    }
    const parsed = clientMessageSchema.safeParse(decoded);
    if (!parsed.success) {
      this.sendError(socket, "INVALID_COMMAND", "Message did not match the protocol.");
      return;
    }

    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.playerId) {
      if (parsed.data.type !== "room.reconnect") {
        this.sendError(socket, "INVALID_SESSION", "Reconnect before sending commands.", parsed.data.requestId);
        return;
      }
      await this.authenticateSocket(socket, parsed.data);
      return;
    }

    try {
      await this.handleAuthenticatedMessage(socket, attachment.playerId, parsed.data);
    } catch (error) {
      if (error instanceof GameRuleError || error instanceof SystemCrawlRuleError) {
        this.sendError(socket, error.code, error.message, parsed.data.requestId);
        return;
      }
      console.error(JSON.stringify({
        event: "game.command.error",
        roomCode: this.readMetadata()?.roomCode,
        playerId: attachment.playerId,
        requestId: parsed.data.requestId
      }));
      this.sendError(socket, "SERVER_ERROR", "Something went wrong. Please try again.", parsed.data.requestId);
    }
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.playerId) return;

    const hasAnotherSocket = this.ctx.getWebSockets().some((candidate) => {
      if (candidate === socket || candidate.readyState !== WebSocket.OPEN) return false;
      const candidateAttachment = candidate.deserializeAttachment() as SocketAttachment | null;
      return candidateAttachment?.playerId === attachment.playerId;
    });
    if (hasAnotherSocket) return;

    const now = Date.now();
    const metadata = this.readMetadata();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE players SET connected = 0, disconnected_at = ?, last_seen_at = ? WHERE id = ?",
        now,
        now,
        attachment.playerId
      );
      if (metadata) this.writeMetadata({ ...metadata, lastActivityAt: now });
    });
    await this.scheduleAlarm();
    this.broadcast({ type: "room.presence", payload: this.roomView() });
    console.log(JSON.stringify({ event: "player.disconnected", roomCode: metadata?.roomCode, playerId: attachment.playerId }));
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket);
  }

  async alarm(): Promise<void> {
    let metadata = this.readMetadata();
    if (!metadata) return;
    const now = Date.now();
    if (metadata.expiredAt === undefined && now - metadata.lastActivityAt >= ROOM_EXPIRY_MS) {
      for (const socket of this.ctx.getWebSockets()) socket.close(1001, "Room expired");
      metadata = { ...metadata, expiredAt: now };
      this.ctx.storage.transactionSync(() => {
        this.writeMetadata(metadata as RoomMetadata);
        const manifest = this.readAssetManifest();
        this.writeAssetManifest({ entries: manifest.entries.map((entry) => ({ ...entry, cleanupAt: Math.min(entry.cleanupAt ?? Number.POSITIVE_INFINITY, now + DRAWING_RETENTION_MS) })) });
      });
    }

    if (metadata.expiredAt === undefined) await this.reconcileShirtFightDue(now, true);
    await this.cleanupDueAssets(now);
    metadata = this.readMetadata();
    if (!metadata || metadata.expiredAt !== undefined) {
      await this.scheduleAlarm();
      return;
    }

    const players = this.readPlayers();
    const host = players.find((player) => player.isHost);
    if (host && !host.connected && host.disconnectedAt !== null && now - host.disconnectedAt >= HOST_GRACE_MS) {
      const successor = chooseHostSuccessor(players);
      if (successor) {
        this.ctx.storage.transactionSync(() => {
          this.sql.exec("UPDATE players SET is_host = 0 WHERE is_host = 1");
          this.sql.exec("UPDATE players SET is_host = 1 WHERE id = ?", successor.id);
          const game = this.readGame();
          if (game?.gameId === "system-crawl" && game.state.hostPlayerId !== successor.id) {
            this.writeGame({
              gameId: game.gameId,
              state: { ...game.state, hostPlayerId: successor.id }
            });
          }
        });
        this.broadcast({ type: "room.presence", payload: this.roomView() });
        this.broadcastGameState();
        console.log(JSON.stringify({ event: "host.transferred", roomCode: metadata.roomCode, playerId: successor.id }));
      }
    }
    await this.scheduleAlarm();
  }

  private async authenticateSocket(
    socket: WebSocket,
    message: Extract<ClientMessage, { type: "room.reconnect" }>
  ): Promise<void> {
    const metadata = await this.activeMetadata();
    if (metadata instanceof Response) {
      this.sendError(socket, metadata.status === 410 ? "ROOM_EXPIRED" : "ROOM_NOT_FOUND", "Room no longer exists.", message.requestId);
      socket.close(1008, "Room unavailable");
      return;
    }

    await this.reconcileShirtFightDue(Date.now(), true);

    const tokenHash = await hashSessionToken(message.payload.sessionToken);
    const player = this.readPlayers().find((candidate) => candidate.sessionTokenHash === tokenHash);
    if (!player) {
      this.sendError(socket, "INVALID_SESSION", "Your room session is no longer valid.", message.requestId);
      socket.close(1008, "Invalid session");
      return;
    }

    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        "UPDATE players SET connected = 1, disconnected_at = NULL, last_seen_at = ? WHERE id = ?",
        now,
        player.id
      );
      this.writeMetadata({ ...metadata, lastActivityAt: now });
    });
    socket.serializeAttachment({ playerId: player.id } satisfies SocketAttachment);
    await this.scheduleAlarm();
    this.send(socket, { type: "room.snapshot", payload: this.roomView() });
    this.sendGameState(socket, player.id);
    this.send(socket, { type: "command.ack", requestId: message.requestId, payload: { accepted: true } });
    this.broadcast({ type: "room.presence", payload: this.roomView() });
    console.log(JSON.stringify({ event: "player.reconnected", roomCode: metadata.roomCode, playerId: player.id }));
  }

  private async handleAuthenticatedMessage(socket: WebSocket, playerId: string, message: ClientMessage): Promise<void> {
    if (message.type === "room.reconnect") {
      this.send(socket, { type: "room.snapshot", payload: this.roomView() });
      this.sendGameState(socket, playerId);
      this.send(socket, { type: "command.ack", requestId: message.requestId, payload: { accepted: true } });
      return;
    }
    if (message.type === "ping") {
      const now = Date.now();
      this.sql.exec("UPDATE players SET last_seen_at = ? WHERE id = ?", now, playerId);
      const metadata = this.readMetadata();
      if (metadata) this.writeMetadata({ ...metadata, lastActivityAt: now });
      await this.scheduleAlarm();
      this.send(socket, { type: "pong", payload: { serverTime: now } });
      return;
    }

    if (this.wasProcessed(playerId, message.requestId)) {
      this.send(socket, { type: "command.ack", requestId: message.requestId, payload: { accepted: true } });
      return;
    }

    if (message.type === "game.command") {
      await this.handleGameCommand(socket, playerId, message.requestId, message.payload.command);
      return;
    }

    const player = this.readPlayers().find((candidate) => candidate.id === playerId);
    if (!canIssueHostCommand(player)) {
      this.sendError(socket, "NOT_HOST", "Only the host can do that.", message.requestId);
      return;
    }

    if (message.type === "host.selectGame") {
      const metadata = this.readMetadata();
      if (!metadata || metadata.roomPhase !== "lobby") {
        this.sendError(socket, "INVALID_PHASE", "Return to the arcade before choosing a game.", message.requestId);
        return;
      }
      this.ctx.storage.transactionSync(() => {
        this.writeMetadata({ ...metadata, selectedGameId: message.payload.gameId, lastActivityAt: Date.now() });
        this.markProcessed(playerId, message.requestId);
      });
      this.send(socket, { type: "command.ack", requestId: message.requestId, payload: { accepted: true } });
      this.broadcast({ type: "room.presence", payload: this.roomView() });
      await this.scheduleAlarm();
      return;
    }

    if (message.type === "host.backToArcade") {
      const metadata = this.readMetadata();
      if (!metadata) return;
      const currentGame = this.readGame();
      const cleanupAt = Date.now() + DRAWING_RETENTION_MS;
      this.ctx.storage.transactionSync(() => {
        this.writeMetadata({ ...metadata, roomPhase: "lobby", selectedGameId: null, lastActivityAt: Date.now() });
        if (currentGame?.gameId === "shirt-fight") this.markGameAssetsForCleanup(currentGame.state.gameInstanceId, cleanupAt);
        this.clearGame();
        this.markProcessed(playerId, message.requestId);
      });
      this.send(socket, { type: "command.ack", requestId: message.requestId, payload: { accepted: true } });
      this.broadcast({ type: "room.presence", payload: this.roomView() });
      await this.scheduleAlarm();
      return;
    }

    if (message.type === "host.startGame") {
      await this.startGame(socket, playerId, message.requestId, message.payload.replayMode);
      return;
    }

    if (message.type === "host.advance") {
      await this.advanceGame(socket, playerId, message.requestId);
      return;
    }

  }

  private async startGame(socket: WebSocket, playerId: string, requestId: string, replayMode?: "new" | "same"): Promise<void> {
    const metadata = this.readMetadata();
    if (!metadata?.selectedGameId) {
      this.sendError(socket, "GAME_NOT_AVAILABLE", "Choose a game first.", requestId);
      return;
    }
    if (metadata.roomPhase !== "lobby" && metadata.roomPhase !== "results") {
      this.sendError(socket, "INVALID_PHASE", "A game is already in progress.", requestId);
      return;
    }
    const players = this.readPlayers();
    const previousGame = this.readGame();
    const context = {
      players,
      now: Date.now(),
      random: secureRandom
    };
    let game: StoredGame;
    if (isRegisteredGame(metadata.selectedGameId)) {
      game = GAME_REGISTRY[metadata.selectedGameId].create(context);
    } else if (metadata.selectedGameId === "system-crawl") {
      const canReplay = metadata.roomPhase === "results" && previousGame?.gameId === "system-crawl" && replayMode !== undefined;
      const seed = replayMode === "same" ? previousGame?.gameId === "system-crawl" ? previousGame.state.seed : null : crypto.randomUUID();
      game = {
        gameId: "system-crawl",
        state: canReplay && seed
          ? createSystemCrawlReplayRoomState(players, previousGame.state, seed)
          : createSystemCrawlRoomState(players)
      };
    } else {
      this.sendError(socket, "GAME_NOT_AVAILABLE", "That game is not available.", requestId);
      return;
    }
    this.persistGameMutation({ ...metadata, roomPhase: "playing", lastActivityAt: Date.now() }, game, {}, playerId, requestId);
    this.send(socket, { type: "command.ack", requestId, payload: { accepted: true } });
    this.broadcast({ type: "room.presence", payload: this.roomView() });
    this.broadcastGameState();
    await this.scheduleAlarm();
    console.log(JSON.stringify({ event: "game.started", roomCode: metadata.roomCode, gameId: game.gameId }));
  }

  private async advanceGame(socket: WebSocket, playerId: string, requestId: string): Promise<void> {
    const metadata = this.readMetadata();
    const game = this.readGame();
    if (!metadata || !game) {
      this.sendError(socket, "INVALID_PHASE", "No game is active.", requestId);
      return;
    }
    if (game.gameId === "system-crawl") {
      this.sendError(socket, "INVALID_PHASE", "System Crawl advances through player actions.", requestId);
      return;
    }
    const result = bindGame(game).advance(Date.now(), secureRandom);
    const nextGame = result.state;
    const isFinished = nextGame.state.phase === "gameResults";
    this.persistGameMutation(
      { ...metadata, roomPhase: isFinished ? "results" : "playing", lastActivityAt: Date.now() },
      nextGame,
      result.scoreDelta,
      playerId,
      requestId
    );
    this.send(socket, { type: "command.ack", requestId, payload: { accepted: true } });
    this.broadcast({ type: "room.presence", payload: this.roomView() });
    this.broadcastGameState();
    await this.scheduleAlarm();
    if (isFinished) console.log(JSON.stringify({ event: "game.ended", roomCode: metadata.roomCode, gameId: game.gameId }));
  }

  private async handleGameCommand(
    socket: WebSocket,
    playerId: string,
    requestId: string,
    command: GameCommand
  ): Promise<void> {
    await this.reconcileShirtFightDue(Date.now(), true);
    const metadata = this.readMetadata();
    const game = this.readGame();
    if (!metadata || metadata.roomPhase !== "playing" || !game) {
      this.sendError(socket, "STALE_PHASE", "No game command is available right now.", requestId);
      return;
    }
    let nextGame: StoredGame;
    let scoreDelta: Readonly<Record<string, number>> = {};
    if (game.gameId !== "system-crawl") {
      const result = bindGame(game).command(command, playerId, Date.now(), secureRandom);
      nextGame = result.state;
      scoreDelta = result.scoreDelta ?? {};
    } else {
      if (!systemCrawlCommandSchema.safeParse(command).success) {
        throw new GameRuleError("INVALID_COMMAND", "That command belongs to a different game.");
      }
      const currentHost = this.readPlayers().find((candidate) => candidate.isHost);
      if (!currentHost) throw new GameRuleError("NOT_HOST", "This room does not have a host.");
      const result = handleSystemCrawlRoomCommand(
        game.state,
        command as SystemCrawlCommand,
        playerId,
        currentHost.id
      );
      nextGame = { gameId: game.gameId, state: result.state };
    }
    const isFinished = nextGame.gameId === "system-crawl"
      ? nextGame.state.phase === "victory" || nextGame.state.phase === "defeat"
      : nextGame.state.phase === "gameResults";
    this.persistGameMutation(
      { ...metadata, roomPhase: isFinished ? "results" : "playing", lastActivityAt: Date.now() },
      nextGame,
      scoreDelta,
      playerId,
      requestId
    );
    this.send(socket, { type: "command.ack", requestId, payload: { accepted: true } });
    this.broadcast({ type: "room.presence", payload: this.roomView() });
    this.broadcastGameState();
    await this.scheduleAlarm();
  }

  private async preparePlayer(displayName: string, isHost: boolean, now: number): Promise<NewPlayer> {
    const playerId = crypto.randomUUID();
    const sessionToken = randomToken();
    const sessionTokenHash = await hashSessionToken(sessionToken);
    return {
      id: playerId,
      displayName,
      sessionTokenHash,
      isHost,
      now,
      session: { playerId, sessionToken }
    };
  }

  private insertPlayer(player: NewPlayer): void {
    this.sql.exec(
      `INSERT INTO players
        (id, display_name, normalized_name, session_token_hash, joined_at, last_seen_at, connected, disconnected_at, is_host, score)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, 0)`,
      player.id,
      player.displayName,
      player.displayName.toLocaleLowerCase("en-US"),
      player.sessionTokenHash,
      player.now,
      player.now,
      player.isHost ? 1 : 0
    );
  }

  private readMetadata(): RoomMetadata | null {
    const row = ([...this.sql.exec("SELECT json_value FROM room_state WHERE key = 'metadata'")] as unknown as StateRow[])[0];
    return row ? (JSON.parse(row.json_value) as RoomMetadata) : null;
  }

  private async activeMetadata(): Promise<RoomMetadata | Response> {
    const metadata = this.readMetadata();
    if (!metadata) return jsonError("ROOM_NOT_FOUND", "Room no longer exists.", 404);
    if (metadata.expiredAt !== undefined || Date.now() - metadata.lastActivityAt >= ROOM_EXPIRY_MS) {
      if (metadata.expiredAt === undefined) {
        const now = Date.now();
        const manifest = this.readAssetManifest();
        if (manifest.entries.length === 0) {
          await this.ctx.storage.deleteAll();
          return jsonError("ROOM_EXPIRED", "Room no longer exists.", 410);
        }
        this.ctx.storage.transactionSync(() => {
          this.writeMetadata({ ...metadata, expiredAt: now });
          this.writeAssetManifest({ entries: manifest.entries.map((entry) => ({ ...entry, cleanupAt: Math.min(entry.cleanupAt ?? Number.POSITIVE_INFINITY, now + DRAWING_RETENTION_MS) })) });
        });
        await this.scheduleAlarm();
      }
      return jsonError("ROOM_EXPIRED", "Room no longer exists.", 410);
    }
    return metadata;
  }

  private writeMetadata(metadata: RoomMetadata): void {
    this.sql.exec(
      `INSERT INTO room_state (key, json_value, updated_at) VALUES ('metadata', ?, ?)
       ON CONFLICT(key) DO UPDATE SET json_value = excluded.json_value, updated_at = excluded.updated_at`,
      JSON.stringify(metadata),
      Date.now()
    );
  }

  private readPlayers(): StoredPlayer[] {
    return ([...this.sql.exec("SELECT * FROM players ORDER BY joined_at, id")] as unknown as PlayerRow[]).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      sessionTokenHash: row.session_token_hash,
      joinedAt: row.joined_at,
      lastSeenAt: row.last_seen_at,
      connected: row.connected === 1,
      disconnectedAt: row.disconnected_at,
      isHost: row.is_host === 1,
      score: row.score
    }));
  }

  private roomView() {
    const metadata = this.readMetadata();
    if (!metadata) throw new Error("Room metadata missing");
    return projectRoom(metadata, this.readPlayers());
  }

  private readGame(): StoredGame | null {
    const row = ([...this.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")] as unknown as StateRow[])[0];
    return row ? (JSON.parse(row.json_value) as StoredGame) : null;
  }

  private readAssetManifest(): ShirtFightAssetManifest {
    const row = ([...this.sql.exec("SELECT json_value FROM room_state WHERE key = 'shirt-fight-assets'")] as unknown as StateRow[])[0];
    return row ? JSON.parse(row.json_value) as ShirtFightAssetManifest : { entries: [] };
  }

  private writeAssetManifest(manifest: ShirtFightAssetManifest): void {
    this.sql.exec(
      `INSERT INTO room_state (key, json_value, updated_at) VALUES ('shirt-fight-assets', ?, ?)
       ON CONFLICT(key) DO UPDATE SET json_value = excluded.json_value, updated_at = excluded.updated_at`,
      JSON.stringify(manifest),
      Date.now()
    );
  }

  private ensureAssetReservation(
    roomCode: string,
    state: ShirtFightState,
    playerId: string,
    round: 1 | 2,
    drawingNumber: 1 | 2
  ): ShirtFightAssetEntry {
    const manifest = this.readAssetManifest();
    const existing = manifest.entries.find((item) => item.gameInstanceId === state.gameInstanceId && item.playerId === playerId && item.round === round && item.drawingNumber === drawingNumber);
    if (existing) return existing;
    const drawingId = deterministicUuid(state.seed, `drawing:${round}:${drawingNumber}:${playerId}`);
    const entry: ShirtFightAssetEntry = {
      drawingId,
      objectKey: `${roomCode}/${state.gameInstanceId}/${crypto.randomUUID()}.webp`,
      gameInstanceId: state.gameInstanceId,
      playerId,
      round,
      drawingNumber,
      status: "reserved",
      createdAt: Date.now(),
      fallbackRetryCount: 0,
      fallbackRetryAt: undefined,
      cleanupRetryCount: 0
    };
    this.writeAssetManifest({ entries: [...manifest.entries, entry] });
    return entry;
  }

  private updateAssetEntry(drawingId: string, update: (entry: ShirtFightAssetEntry) => ShirtFightAssetEntry): void {
    const manifest = this.readAssetManifest();
    this.writeAssetManifest({ entries: manifest.entries.map((entry) => entry.drawingId === drawingId ? update(entry) : entry) });
  }

  private async reconcileShirtFightDue(now: number, shouldBroadcast: boolean): Promise<void> {
    for (let guard = 0; guard < 32; guard += 1) {
      const game = this.readGame();
      const metadata = this.readMetadata();
      if (!metadata || game?.gameId !== "shirt-fight" || game.state.deadlineAt === undefined || now < game.state.deadlineAt) return;
      const fallbacks: ShirtFightFallbackDrawing[] = [];
      for (const slot of missingShirtFightDrawings(game.state)) {
        const entry = this.ensureAssetReservation(metadata.roomCode, game.state, slot.playerId, slot.round, slot.drawingNumber);
        if (entry.fallbackRetryAt !== undefined && now < entry.fallbackRetryAt) return;
        try {
          await this.env.SHIRT_FIGHT_DRAWINGS.put(entry.objectKey, decodeBase64(FALLBACK_WEBP), {
            httpMetadata: { contentType: "image/webp", cacheControl: "private, no-store" },
            customMetadata: { drawingId: entry.drawingId, gameInstanceId: entry.gameInstanceId, fallback: "true" }
          });
          const confirmed = await this.env.SHIRT_FIGHT_DRAWINGS.head(entry.objectKey);
          if (!confirmed) throw new Error("Fallback drawing could not be confirmed");
          fallbacks.push({
            id: entry.drawingId,
            playerId: slot.playerId,
            round: slot.round,
            drawingNumber: slot.drawingNumber,
            createdAt: game.state.deadlineAt,
            width: 600,
            height: 800,
            byteLength: confirmed.size,
            mediaType: "image/webp"
          });
        } catch {
          const fallbackRetryCount = entry.fallbackRetryCount + 1;
          const delay = Math.min(CLEANUP_RETRY_MAX_MS, CLEANUP_RETRY_BASE_MS * 2 ** Math.min(fallbackRetryCount - 1, 6));
          this.updateAssetEntry(entry.drawingId, (item) => ({ ...item, fallbackRetryCount, fallbackRetryAt: now + delay }));
          await this.scheduleAlarm();
          return;
        }
      }
      const result = advanceShirtFightDue(game.state, now, fallbacks);
      if (result.state === game.state) return;
      const completedNow = result.state.phase === "gameResults" && game.state.phase !== "gameResults";
      this.ctx.storage.transactionSync(() => {
        this.writeGame({ gameId: "shirt-fight", state: result.state });
        for (const fallback of fallbacks) this.updateAssetEntry(fallback.id, (entry) => ({ ...entry, status: "finalized", fallbackRetryAt: undefined }));
        if (completedNow) this.markGameAssetsForCleanup(result.state.gameInstanceId, now + DRAWING_RETENTION_MS);
      });
      if (shouldBroadcast) this.broadcastGameState();
    }
  }

  private markGameAssetsForCleanup(gameInstanceId: string, cleanupAt: number): void {
    const manifest = this.readAssetManifest();
    this.writeAssetManifest({ entries: manifest.entries.map((entry) => entry.gameInstanceId === gameInstanceId && entry.cleanupAt === undefined ? { ...entry, cleanupAt } : entry) });
  }

  private async cleanupDueAssets(now: number): Promise<void> {
    let manifest = this.readAssetManifest();
    for (const entry of manifest.entries.filter((item) => item.cleanupAt !== undefined && item.cleanupAt <= now)) {
      try {
        await this.env.SHIRT_FIGHT_DRAWINGS.delete(entry.objectKey);
        manifest = { entries: manifest.entries.filter((item) => item.drawingId !== entry.drawingId) };
      } catch {
        const cleanupRetryCount = entry.cleanupRetryCount + 1;
        const delay = Math.min(CLEANUP_RETRY_MAX_MS, CLEANUP_RETRY_BASE_MS * 2 ** Math.min(cleanupRetryCount - 1, 6));
        manifest = { entries: manifest.entries.map((item) => item.drawingId === entry.drawingId ? { ...item, cleanupRetryCount, cleanupAt: now + delay } : item) };
      }
      this.writeAssetManifest(manifest);
    }
    const metadata = this.readMetadata();
    if (metadata?.expiredAt !== undefined && manifest.entries.length === 0) await this.ctx.storage.deleteAll();
  }

  private writeGame(game: StoredGame): void {
    this.sql.exec(
      `INSERT INTO room_state (key, json_value, updated_at) VALUES ('game', ?, ?)
       ON CONFLICT(key) DO UPDATE SET json_value = excluded.json_value, updated_at = excluded.updated_at`,
      JSON.stringify(game),
      Date.now()
    );
  }

  private clearGame(): void {
    this.sql.exec("DELETE FROM room_state WHERE key = 'game'");
  }

  private persistGameMutation(
    metadata: RoomMetadata,
    game: StoredGame,
    scoreDelta: Readonly<Record<string, number>> = {},
    actorPlayerId?: string,
    requestId?: string
  ): void {
    this.ctx.storage.transactionSync(() => {
      this.writeMetadata(metadata);
      this.writeGame(game);
      if (game.gameId === "shirt-fight" && game.state.phase === "gameResults") {
        this.markGameAssetsForCleanup(game.state.gameInstanceId, Date.now() + DRAWING_RETENTION_MS);
      }
      for (const [scorePlayerId, points] of Object.entries(scoreDelta)) {
        this.sql.exec("UPDATE players SET score = score + ? WHERE id = ?", points, scorePlayerId);
      }
      if (actorPlayerId !== undefined && requestId !== undefined) this.markProcessed(actorPlayerId, requestId);
    });
  }

  private gameView(game: StoredGame, playerId: string): TypedGameViewerState {
    const player = this.readPlayers().find((candidate) => candidate.id === playerId);
    if (!player) throw new GameRuleError("INVALID_SESSION", "Player no longer exists.");
    const viewer = { playerId, isHost: player.isHost };
    if (game.gameId !== "system-crawl") return bindGame(game).project(viewer);
    return {
      gameId: game.gameId,
      phase: game.state.phase,
      public: projectSystemCrawlRoomState(game.state, playerId)
    };
  }

  private sendGameState(socket: WebSocket, playerId: string): void {
    const game = this.readGame();
    if (game) this.send(socket, { type: "game.state", payload: this.gameView(game, playerId) });
  }

  private broadcastGameState(): void {
    const game = this.readGame();
    if (!game) return;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.playerId && socket.readyState === WebSocket.OPEN) {
        this.send(socket, { type: "game.state", payload: this.gameView(game, attachment.playerId) });
      }
    }
  }

  private wasProcessed(playerId: string, requestId: string): boolean {
    return [...this.sql.exec("SELECT 1 FROM processed_requests WHERE player_id = ? AND request_id = ?", playerId, requestId)].length > 0;
  }

  private markProcessed(playerId: string, requestId: string): void {
    this.sql.exec(
      "INSERT OR IGNORE INTO processed_requests (player_id, request_id, processed_at) VALUES (?, ?, ?)",
      playerId,
      requestId,
      Date.now()
    );
    this.sql.exec(
      `DELETE FROM processed_requests WHERE player_id = ? AND request_id NOT IN (
         SELECT request_id FROM processed_requests WHERE player_id = ? ORDER BY processed_at DESC LIMIT ?
       )`,
      playerId,
      playerId,
      RECENT_REQUEST_LIMIT
    );
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  private sendError(socket: WebSocket, code: ErrorCode, message: string, requestId?: string): void {
    this.send(socket, {
      type: "error",
      ...(requestId === undefined ? {} : { requestId }),
      payload: { code, message }
    });
  }

  private broadcast(message: ServerMessage): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.playerId && socket.readyState === WebSocket.OPEN) socket.send(encoded);
    }
  }

  private async scheduleAlarm(): Promise<void> {
    const metadata = this.readMetadata();
    if (!metadata) return;
    let nextAlarm = metadata.expiredAt === undefined ? metadata.lastActivityAt + ROOM_EXPIRY_MS : Number.POSITIVE_INFINITY;
    const host = this.readPlayers().find((player) => player.isHost);
    if (host && !host.connected && host.disconnectedAt !== null) {
      nextAlarm = Math.min(nextAlarm, host.disconnectedAt + HOST_GRACE_MS);
    }
    const game = this.readGame();
    if (metadata.expiredAt === undefined && game?.gameId === "shirt-fight" && game.state.deadlineAt !== undefined) {
      let gameDue = game.state.deadlineAt;
      if (game.state.phase === "drawing" && gameDue <= Date.now()) {
        const manifest = this.readAssetManifest();
        const retryTimes = missingShirtFightDrawings(game.state).flatMap((slot) => {
          const entry = manifest.entries.find((item) => item.gameInstanceId === game.state.gameInstanceId && item.playerId === slot.playerId && item.round === slot.round && item.drawingNumber === slot.drawingNumber);
          return entry?.fallbackRetryAt !== undefined && entry.fallbackRetryAt > Date.now() ? [entry.fallbackRetryAt] : [];
        });
        if (retryTimes.length) gameDue = Math.min(...retryTimes);
      }
      nextAlarm = Math.min(nextAlarm, gameDue);
    }
    for (const entry of this.readAssetManifest().entries) {
      if (entry.cleanupAt !== undefined) nextAlarm = Math.min(nextAlarm, entry.cleanupAt);
    }
    if (Number.isFinite(nextAlarm)) await this.ctx.storage.setAlarm(nextAlarm);
  }
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function readBoundedBytes(request: Request, limit: number): Promise<Uint8Array | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel("payload too large");
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function readWebpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 12) !== "WEBP") return null;
  if (u32(bytes, 4) + 8 !== bytes.length) return null;
  let dimensions: { width: number; height: number } | null = null;
  let hasImagePayload = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = ascii(offset, offset + 4);
    const size = u32(bytes, offset + 4);
    const data = offset + 8;
    const end = data + size;
    if (end > bytes.length) return null;
    if (kind === "VP8X" && size >= 10) dimensions = { width: 1 + u24(bytes, data + 4), height: 1 + u24(bytes, data + 7) };
    if (kind === "VP8 " && size >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      hasImagePayload = true;
      dimensions ??= { width: ((bytes[data + 7] as number) << 8 | (bytes[data + 6] as number)) & 0x3fff, height: ((bytes[data + 9] as number) << 8 | (bytes[data + 8] as number)) & 0x3fff };
    }
    if (kind === "VP8L" && size >= 5 && bytes[data] === 0x2f) {
      hasImagePayload = true;
      const b1 = bytes[data + 1] as number, b2 = bytes[data + 2] as number, b3 = bytes[data + 3] as number, b4 = bytes[data + 4] as number;
      dimensions ??= { width: 1 + b1 + ((b2 & 0x3f) << 8), height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10) };
    }
    offset = end + (size % 2);
    if (offset === bytes.length) return hasImagePayload ? dimensions : null;
  }
  return null;
}

function u24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] as number) | ((bytes[offset + 1] as number) << 8) | ((bytes[offset + 2] as number) << 16);
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] as number) | ((bytes[offset + 1] as number) << 8) | ((bytes[offset + 2] as number) << 16) | ((bytes[offset + 3] as number) << 24);
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonError(code: ErrorCode, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

function secureRandom(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return (value[0] as number) / 0x1_0000_0000;
}
