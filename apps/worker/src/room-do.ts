import { DurableObject } from "cloudflare:workers";
import { GameRuleError } from "@team-arcade/game-core";
import {
  advanceImpostor,
  advanceWhoSaidThat,
  createImpostorState,
  createWhoSaidThatState,
  getImpostorPrivateView,
  getImpostorPublicView,
  getWhoSaidThatPrivateView,
  getWhoSaidThatPublicView,
  handleImpostorCommand,
  handleWhoSaidThatCommand,
  type ImpostorState,
  SystemCrawlRuleError,
  type SystemCrawlState,
  type WhoSaidThatState
} from "@team-arcade/games";
import {
  MAX_PLAYERS,
  clientMessageSchema,
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
  handleSystemCrawlRoomCommand,
  projectSystemCrawlRoomState
} from "./system-crawl-adapter";
import type { Env } from "./types";

const HOST_GRACE_MS = 60_000;
const ROOM_EXPIRY_MS = 12 * 60 * 60 * 1_000;
const RECENT_REQUEST_LIMIT = 50;
const MAX_WEBSOCKET_MESSAGE_BYTES = 4_096;

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

interface NewPlayer {
  id: string;
  displayName: string;
  sessionTokenHash: string;
  isHost: boolean;
  now: number;
  session: Omit<RoomSessionResponse, "roomCode">;
}

type StoredGame =
  | { gameId: "who-said-that"; state: WhoSaidThatState }
  | { gameId: "impostor"; state: ImpostorState }
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
    if (request.method === "GET" && url.pathname === "/internal/socket") {
      return this.openSocket(request);
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
    const metadata = this.readMetadata();
    if (!metadata) return;
    const now = Date.now();
    if (now - metadata.lastActivityAt >= ROOM_EXPIRY_MS) {
      for (const socket of this.ctx.getWebSockets()) socket.close(1001, "Room expired");
      await this.ctx.storage.deleteAll();
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
      this.ctx.storage.transactionSync(() => {
        this.writeMetadata({ ...metadata, roomPhase: "lobby", selectedGameId: null, lastActivityAt: Date.now() });
        this.clearGame();
        this.markProcessed(playerId, message.requestId);
      });
      this.send(socket, { type: "command.ack", requestId: message.requestId, payload: { accepted: true } });
      this.broadcast({ type: "room.presence", payload: this.roomView() });
      await this.scheduleAlarm();
      return;
    }

    if (message.type === "host.startGame") {
      await this.startGame(socket, playerId, message.requestId);
      return;
    }

    if (message.type === "host.advance") {
      await this.advanceGame(socket, playerId, message.requestId);
      return;
    }

  }

  private async startGame(socket: WebSocket, playerId: string, requestId: string): Promise<void> {
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
    const context = {
      players,
      now: Date.now(),
      random: secureRandom
    };
    let game: StoredGame;
    if (metadata.selectedGameId === "who-said-that") {
      game = { gameId: "who-said-that", state: createWhoSaidThatState(context) };
    } else if (metadata.selectedGameId === "impostor") {
      game = { gameId: "impostor", state: createImpostorState(context) };
    } else if (metadata.selectedGameId === "system-crawl") {
      game = { gameId: "system-crawl", state: createSystemCrawlRoomState(players) };
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
    const result = game.gameId === "who-said-that"
      ? advanceWhoSaidThat(game.state, secureRandom)
      : advanceImpostor(game.state, secureRandom);
    const nextGame: StoredGame = game.gameId === "who-said-that"
      ? { gameId: game.gameId, state: result.state as WhoSaidThatState }
      : { gameId: game.gameId, state: result.state as ImpostorState };
    const isFinished = result.state.phase === "gameResults";
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
    const metadata = this.readMetadata();
    const game = this.readGame();
    if (!metadata || metadata.roomPhase !== "playing" || !game) {
      this.sendError(socket, "STALE_PHASE", "No game command is available right now.", requestId);
      return;
    }
    let nextGame: StoredGame;
    let scoreDelta: Readonly<Record<string, number>> = {};
    if (game.gameId === "who-said-that") {
      if (!command.type.startsWith("wst.")) throw new GameRuleError("INVALID_COMMAND", "That command belongs to a different game.");
      const result = handleWhoSaidThatCommand(
        game.state,
        command as Extract<GameCommand, { type: `wst.${string}` }>,
        playerId,
        secureRandom
      );
      nextGame = { gameId: game.gameId, state: result.state };
      scoreDelta = result.scoreDelta ?? {};
    } else if (game.gameId === "impostor") {
      if (!command.type.startsWith("impostor.")) throw new GameRuleError("INVALID_COMMAND", "That command belongs to a different game.");
      const result = handleImpostorCommand(
        game.state,
        command as Extract<GameCommand, { type: `impostor.${string}` }>,
        playerId
      );
      nextGame = { gameId: game.gameId, state: result.state };
      scoreDelta = result.scoreDelta ?? {};
    } else {
      if (command.type.startsWith("wst.") || command.type.startsWith("impostor.")) {
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
      && (nextGame.state.phase === "victory" || nextGame.state.phase === "defeat");
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
    if (Date.now() - metadata.lastActivityAt >= ROOM_EXPIRY_MS) {
      await this.ctx.storage.deleteAll();
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
    if (game.gameId === "who-said-that") {
      return {
        gameId: game.gameId,
        phase: game.state.phase,
        public: getWhoSaidThatPublicView(game.state),
        private: getWhoSaidThatPrivateView(game.state, viewer)
      };
    }
    if (game.gameId === "impostor") {
      return {
        gameId: game.gameId,
        phase: game.state.phase,
        public: getImpostorPublicView(game.state),
        private: getImpostorPrivateView(game.state, viewer)
      };
    }
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
    let nextAlarm = metadata.lastActivityAt + ROOM_EXPIRY_MS;
    const host = this.readPlayers().find((player) => player.isHost);
    if (host && !host.connected && host.disconnectedAt !== null) {
      nextAlarm = Math.min(nextAlarm, host.disconnectedAt + HOST_GRACE_MS);
    }
    await this.ctx.storage.setAlarm(nextAlarm);
  }
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
