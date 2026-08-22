import { env } from "cloudflare:workers";
import { abortAllDurableObjects, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import type { RoomSessionResponse, ServerMessage, TypedGameViewerState } from "@team-arcade/shared";

const testEnv = env as unknown as Env;

afterEach(async () => {
  await abortAllDurableObjects();
});

describe("room Worker and Durable Object", () => {
  it("creates a room, enforces unique names, and retains SQLite state after eviction", async () => {
    const created = await create("Ada");
    expect(created.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{5}$/u);
    expect(created.sessionToken).toHaveLength(43);

    const duplicate = await call(`/api/rooms/${created.roomCode}/join`, { displayName: "  ADA " });
    expect(duplicate.status).toBe(409);
    await expect(duplicate.json()).resolves.toMatchObject({ error: { code: "NAME_TAKEN" } });

    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(created.roomCode));
    await evictDurableObject(stub);
    const joined = await join(created.roomCode, "Grace");
    expect(joined.playerId).not.toBe(created.playerId);
  });

  it("enforces room capacity, expires inactive rooms, and bounds HTTP payloads", async () => {
    const created = await create("Player 1");
    for (let index = 2; index <= 12; index += 1) await join(created.roomCode, `Player ${index}`);

    const full = await call(`/api/rooms/${created.roomCode}/join`, { displayName: "Player 13" });
    expect(full.status).toBe(409);
    await expect(full.json()).resolves.toMatchObject({ error: { code: "ROOM_FULL" } });

    const oversized = await worker.fetch(new Request("https://example.test/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Ada", padding: "x".repeat(3_000) })
    }), testEnv);
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toMatchObject({ error: { code: "INVALID_COMMAND" } });

    const expiring = await create("Short Lived");
    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(expiring.roomCode));
    await runInDurableObject(stub, (_instance, state) => {
      const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'metadata'")] as unknown as Array<{ json_value: string }>;
      const metadata = JSON.parse(rows[0]?.json_value ?? "{}") as Record<string, unknown>;
      metadata.lastActivityAt = Date.now() - 12 * 60 * 60 * 1_000 - 1;
      state.storage.sql.exec(
        "UPDATE room_state SET json_value = ?, updated_at = ? WHERE key = 'metadata'",
        JSON.stringify(metadata),
        Date.now()
      );
    });
    const expired = await call(`/api/rooms/${expiring.roomCode}/join`, { displayName: "Too Late" });
    expect(expired.status).toBe(410);
    await expect(expired.json()).resolves.toMatchObject({ error: { code: "ROOM_EXPIRED" } });
  });

  it("routes authenticated sockets, broadcasts presence, and enforces host authority", async () => {
    const host = await create("Host");
    const guest = await join(host.roomCode, "Guest");
    const hostSocket = await connect(host);
    const guestSocket = await connect(guest);

    await waitForMessage(guestSocket, (message) => message.type === "room.snapshot");
    const hostSnapshot = await waitForMessage(hostSocket, (message) =>
      message.type === "room.presence" && message.payload.players.filter((player) => player.connected).length === 2
    );
    expect(hostSnapshot.type === "room.presence" && hostSnapshot.payload.players).toHaveLength(2);

    guestSocket.send("x".repeat(4_097));
    await expect(waitForMessage(guestSocket, (message) => message.type === "error" && message.payload.message.includes("too large")))
      .resolves.toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });

    guestSocket.send(JSON.stringify({
      type: "host.selectGame",
      requestId: "guest-select",
      payload: { gameId: "impostor" }
    }));
    await expect(waitForMessage(guestSocket, (message) => message.type === "error" && message.requestId === "guest-select"))
      .resolves.toMatchObject({ type: "error", payload: { code: "NOT_HOST" } });

    for (const [type, requestId] of [["host.startGame", "guest-start"], ["host.advance", "guest-advance"], ["host.backToArcade", "guest-back"]] as const) {
      guestSocket.send(JSON.stringify({ type, requestId, payload: {} }));
      await expect(waitForMessage(guestSocket, (message) => message.type === "error" && message.requestId === requestId))
        .resolves.toMatchObject({ type: "error", payload: { code: "NOT_HOST" } });
    }

    hostSocket.send(JSON.stringify({
      type: "host.selectGame",
      requestId: "host-select",
      payload: { gameId: "who-said-that" }
    }));
    await expect(waitForMessage(guestSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "who-said-that"))
      .resolves.toMatchObject({ type: "room.presence", payload: { selectedGameId: "who-said-that" } });

    hostSocket.close(1000, "test complete");
    guestSocket.close(1000, "test complete");
  });

  it("rejects stale commands and processes a scoring request ID exactly once", async () => {
    const host = await create("Host");
    const sessions = [host, await join(host.roomCode, "Guest One"), await join(host.roomCode, "Guest Two")];
    const sockets = await Promise.all(sessions.map(connectReady));
    const hostSocket = sockets[0] as WebSocket;

    hostSocket.send(JSON.stringify({ type: "host.selectGame", requestId: "pick-once", payload: { gameId: "who-said-that" } }));
    await waitForMessage(sockets[1] as WebSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "who-said-that");
    const starts = sockets.map((socket) => waitForGame(socket, (game) => game.gameId === "who-said-that" && game.phase === "submitting"));
    hostSocket.send(JSON.stringify({ type: "host.startGame", requestId: "start-once", payload: {} }));
    await Promise.all(starts);

    const staleMessage = {
      type: "game.command",
      requestId: "stale-guess",
      payload: { command: { type: "wst.submitGuess", targetPlayerId: sessions[1]?.playerId } }
    };
    hostSocket.send(JSON.stringify(staleMessage));
    await expect(waitForMessage(hostSocket, (message) => message.type === "error" && message.requestId === "stale-guess"))
      .resolves.toMatchObject({ type: "error", payload: { code: "STALE_PHASE" } });

    for (let index = 0; index < sockets.length; index += 1) {
      const expectedPhase = index === sockets.length - 1 ? "guessing" : "submitting";
      const update = waitForGame(hostSocket, (game) => game.gameId === "who-said-that" && game.phase === expectedPhase && game.public.submissionCount === index + 1);
      (sockets[index] as WebSocket).send(JSON.stringify({
        type: "game.command",
        requestId: `idempotent-answer-${index}`,
        payload: { command: { type: "wst.submitAnswer", answer: `Answer ${index}` } }
      }));
      await update;
    }

    const views = await collectCurrentGameViews(sockets);
    const authorIndex = views.findIndex((view) => view.gameId === "who-said-that" && view.private.isCurrentAuthor);
    const authorId = sessions[authorIndex]?.playerId;
    if (!authorId) throw new Error("Expected current answer author");
    const guesserIndexes = sockets.map((_, index) => index).filter((index) => index !== authorIndex);
    for (let order = 0; order < guesserIndexes.length; order += 1) {
      const index = guesserIndexes[order] as number;
      const isFinal = order === guesserIndexes.length - 1;
      const requestId = isFinal ? "score-exactly-once" : `idempotent-guess-${index}`;
      const command = {
        type: "game.command",
        requestId,
        payload: { command: { type: "wst.submitGuess", targetPlayerId: authorId } }
      };
      const update = waitForGame(hostSocket, (game) => game.gameId === "who-said-that" && game.phase === (isFinal ? "reveal" : "guessing"));
      (sockets[index] as WebSocket).send(JSON.stringify(command));
      await update;
      if (isFinal) {
        const duplicateAck = waitForMessage(sockets[index] as WebSocket, (message) => message.type === "command.ack" && message.requestId === requestId);
        (sockets[index] as WebSocket).send(JSON.stringify(command));
        await duplicateAck;
      }
    }

    const snapshotPromise = waitForMessage(hostSocket, (message) => message.type === "room.snapshot");
    hostSocket.send(JSON.stringify({ type: "room.reconnect", requestId: "score-snapshot", payload: { sessionToken: host.sessionToken } }));
    const snapshot = await snapshotPromise;
    if (snapshot.type !== "room.snapshot") throw new Error("Expected room snapshot");
    expect(snapshot.payload.players.reduce((sum, player) => sum + player.score, 0)).toBe(2);
    for (const socket of sockets) socket.close(1000, "test complete");
  });

  it("keeps an authenticated WebSocket usable across Durable Object eviction", async () => {
    const session = await create("Hibernator");
    const socket = await connect(session);
    await waitForMessage(socket, (message) => message.type === "room.snapshot");
    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(session.roomCode));
    await evictDurableObject(stub);

    socket.send(JSON.stringify({ type: "ping", requestId: "after-wake", payload: { clientTime: 1 } }));
    await expect(waitForMessage(socket, (message) => message.type === "pong")).resolves.toMatchObject({ type: "pong" });
    socket.close(1000, "test complete");
  });

  it("transfers a disconnected host after the persisted grace deadline", async () => {
    const host = await create("Original Host");
    const guest = await join(host.roomCode, "Next Host");
    const hostSocket = await connect(host);
    const guestSocket = await connect(guest);
    await waitForMessage(guestSocket, (message) => message.type === "room.snapshot");
    await waitForMessage(hostSocket, (message) =>
      message.type === "room.presence" && message.payload.players.filter((player) => player.connected).length === 2
    );

    hostSocket.close(1000, "simulate host leaving");
    await waitForMessage(guestSocket, (message) =>
      message.type === "room.presence" && message.payload.players.some((player) => player.id === host.playerId && !player.connected)
    );

    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(host.roomCode));
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE players SET disconnected_at = ? WHERE id = ?", Date.now() - 60_001, host.playerId);
    });
    const transfer = waitForMessage(guestSocket, (message) =>
      message.type === "room.presence" && message.payload.players.some((player) => player.id === guest.playerId && player.isHost)
    );
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await expect(transfer).resolves.toMatchObject({ type: "room.presence" });
    guestSocket.close(1000, "test complete");
  });

  it("persists Who Said That, hides authors before reveal, and restores the exact private reconnect view", async () => {
    const firstSession = await create("Ada");
    const sessions = [firstSession, await join(firstSession.roomCode, "Grace"), await join(firstSession.roomCode, "Linus")];
    const sockets = await Promise.all(sessions.map(connectReady));
    const hostSocket = sockets[0] as WebSocket;

    hostSocket.send(JSON.stringify({ type: "host.selectGame", requestId: "pick-wst", payload: { gameId: "who-said-that" } }));
    await waitForMessage(sockets[1] as WebSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "who-said-that");

    const started = sockets.map((socket) => waitForGame(socket, (game) => game.gameId === "who-said-that" && game.phase === "submitting"));
    hostSocket.send(JSON.stringify({ type: "host.startGame", requestId: "start-wst", payload: {} }));
    await Promise.all(started);

    for (let index = 0; index < sockets.length; index += 1) {
      const expectedPhase = index === sockets.length - 1 ? "guessing" : "submitting";
      const updates = sockets.map((socket) => waitForGame(socket, (game) =>
        game.gameId === "who-said-that" && game.phase === expectedPhase && game.public.submissionCount === index + 1
      ));
      (sockets[index] as WebSocket).send(JSON.stringify({
        type: "game.command",
        requestId: `answer-${index}`,
        payload: { command: { type: "wst.submitAnswer", answer: `Answer ${index}` } }
      }));
      const views = await Promise.all(updates);
      if (expectedPhase === "guessing") {
        for (const view of views) {
          expect(JSON.stringify(view.public)).not.toContain("authorPlayerId");
          expect(JSON.stringify(view.public)).not.toContain("submissions");
        }
      }
    }

    const currentViews = await collectCurrentGameViews(sockets);
    const authorIndex = currentViews.findIndex((view) => view.gameId === "who-said-that" && view.private.isCurrentAuthor);
    expect(authorIndex).toBeGreaterThanOrEqual(0);
    const authorSession = sessions[authorIndex] as RoomSessionResponse;
    (sockets[authorIndex] as WebSocket).close(1000, "refresh");
    const reconnected = await connectWithGame(authorSession);
    expect(reconnected.game).toMatchObject({ gameId: "who-said-that", phase: "guessing", private: { isCurrentAuthor: true } });
    sockets[authorIndex] = reconnected.socket;

    const authorId = authorSession.playerId;
    const guessers = sockets.map((_, index) => index).filter((index) => index !== authorIndex);
    for (let order = 0; order < guessers.length; order += 1) {
      const index = guessers[order] as number;
      const finalGuess = order === guessers.length - 1;
      const updates = sockets.map((socket) => waitForGame(socket, (game) =>
        game.gameId === "who-said-that" && game.phase === (finalGuess ? "reveal" : "guessing")
      ));
      const scoreUpdate = finalGuess
        ? waitForMessage(sockets[0] as WebSocket, (message) => message.type === "room.presence" && message.payload.players.some((player) => player.score > 0))
        : null;
      (sockets[index] as WebSocket).send(JSON.stringify({
        type: "game.command",
        requestId: `guess-${index}`,
        payload: { command: { type: "wst.submitGuess", targetPlayerId: authorId } }
      }));
      const views = await Promise.all(updates);
      if (finalGuess) expect(views[0]).toMatchObject({ phase: "reveal", public: { reveal: { authorPlayerId: authorId } } });
      if (scoreUpdate) await scoreUpdate;
    }
    for (const socket of sockets) socket.close(1000, "test complete");
  });

  it("sends one private Impostor role and never leaks the secret word to that client pre-reveal", async () => {
    const host = await create("Host");
    const sessions = [host, await join(host.roomCode, "One"), await join(host.roomCode, "Two"), await join(host.roomCode, "Three")];
    const sockets = await Promise.all(sessions.map(connectReady));
    const hostSocket = sockets[0] as WebSocket;
    hostSocket.send(JSON.stringify({ type: "host.selectGame", requestId: "pick-impostor", payload: { gameId: "impostor" } }));
    await waitForMessage(sockets[1] as WebSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "impostor");

    const statePromises = sockets.map((socket) => waitForGame(socket, (game) => game.gameId === "impostor" && game.phase === "roleReveal"));
    hostSocket.send(JSON.stringify({ type: "host.startGame", requestId: "start-impostor", payload: {} }));
    const states = await Promise.all(statePromises);
    const impostorStates = states.filter((state) => state.gameId === "impostor" && state.private.role === "impostor");
    const playerStates = states.filter((state) => state.gameId === "impostor" && state.private.role === "player");
    expect(impostorStates).toHaveLength(1);
    expect(playerStates).toHaveLength(3);
    const firstPlayerState = playerStates[0];
    if (firstPlayerState?.gameId !== "impostor" || firstPlayerState.private.role !== "player") {
      throw new Error("Expected a non-impostor private state");
    }
    const secretWord = firstPlayerState.private.secretWord;
    expect(secretWord.length).toBeGreaterThan(0);
    expect(JSON.stringify(impostorStates[0])).not.toContain(secretWord);
    for (const state of states) expect(JSON.stringify(state.public)).not.toContain(secretWord);
    for (const socket of sockets) socket.close(1000, "test complete");
  });
});

async function create(displayName: string): Promise<RoomSessionResponse> {
  const response = await call("/api/rooms", { displayName });
  expect(response.status).toBe(201);
  return response.json<RoomSessionResponse>();
}

async function join(roomCode: string, displayName: string): Promise<RoomSessionResponse> {
  const response = await call(`/api/rooms/${roomCode}/join`, { displayName });
  expect(response.status).toBe(201);
  return response.json<RoomSessionResponse>();
}

function call(path: string, body: unknown): Promise<Response> {
  return worker.fetch(new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }), testEnv);
}

async function connect(session: RoomSessionResponse): Promise<WebSocket> {
  const response = await worker.fetch(new Request(`https://example.test/api/rooms/${session.roomCode}/socket`, {
    headers: { Upgrade: "websocket" }
  }), testEnv);
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected WebSocket upgrade");
  socket.accept();
  socket.send(JSON.stringify({
    type: "room.reconnect",
    requestId: crypto.randomUUID(),
    payload: { sessionToken: session.sessionToken }
  }));
  return socket;
}

async function connectReady(session: RoomSessionResponse): Promise<WebSocket> {
  const socket = await connect(session);
  await waitForMessage(socket, (message) => message.type === "room.snapshot");
  return socket;
}

async function connectWithGame(session: RoomSessionResponse): Promise<{ socket: WebSocket; game: TypedGameViewerState }> {
  const response = await worker.fetch(new Request(`https://example.test/api/rooms/${session.roomCode}/socket`, {
    headers: { Upgrade: "websocket" }
  }), testEnv);
  const socket = response.webSocket;
  if (!socket) throw new Error("Expected WebSocket upgrade");
  socket.accept();
  const gamePromise = waitForGame(socket, () => true);
  socket.send(JSON.stringify({
    type: "room.reconnect",
    requestId: crypto.randomUUID(),
    payload: { sessionToken: session.sessionToken }
  }));
  return { socket, game: await gamePromise };
}

async function collectCurrentGameViews(sockets: WebSocket[]): Promise<TypedGameViewerState[]> {
  const views = sockets.map((socket) => waitForGame(socket, () => true));
  sockets.forEach((socket, index) => socket.send(JSON.stringify({
    type: "room.reconnect",
    requestId: `snapshot-${index}`,
    payload: { sessionToken: "x".repeat(32) }
  })));
  return Promise.all(views);
}

function waitForGame(socket: WebSocket, predicate: (game: TypedGameViewerState) => boolean): Promise<TypedGameViewerState> {
  return waitForMessage(socket, (message) => message.type === "game.state" && predicate(message.payload as TypedGameViewerState))
    .then((message) => (message as Extract<ServerMessage, { type: "game.state" }>).payload as TypedGameViewerState);
}

function waitForMessage(socket: WebSocket, predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", listener);
      reject(new Error("Timed out waiting for WebSocket message"));
    }, 2_000);
    const listener = (event: MessageEvent) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      if (!predicate(message)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      resolve(message);
    };
    socket.addEventListener("message", listener);
  });
}
