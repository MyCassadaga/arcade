import { env } from "cloudflare:workers";
import { abortAllDurableObjects, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import type { RoomSessionResponse, ServerMessage, TypedGameViewerState } from "@team-arcade/shared";
import { AFTERPRINT_EVENT_IDS } from "@team-arcade/shared";
import { countAfterprintMismatches, enumerateAfterprintOrders, simulateAfterprint } from "@team-arcade/games";

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

  it("validates stored sessions without exposing or mutating room state", async () => {
    const missing = await call("/api/rooms/ABCDE/session", { sessionToken: "x".repeat(43) });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "ROOM_NOT_FOUND" } });

    const created = await create("Stored Solo");
    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(created.roomCode));
    const readStoredMetadata = () => runInDurableObject(stub, (_instance, state) => {
      const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'metadata'")] as unknown as Array<{ json_value: string }>;
      return rows[0]?.json_value;
    });
    const metadataBefore = await readStoredMetadata();
    const valid = await call(`/api/rooms/${created.roomCode}/session`, { sessionToken: created.sessionToken });
    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toEqual({ valid: true });

    const invalid = await call(`/api/rooms/${created.roomCode}/session`, { sessionToken: "x".repeat(43) });
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "INVALID_SESSION" } });

    const malformed = await call(`/api/rooms/${created.roomCode}/session`, { sessionToken: "short" });
    expect(malformed.status).toBe(401);
    await expect(malformed.json()).resolves.toMatchObject({ error: { code: "INVALID_SESSION" } });
    expect(await readStoredMetadata()).toBe(metadataBefore);
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

describe("Categories through the party-game registry", () => {
  it.each([2, 12])("protects viewer answers, reconnects, and scores once with %i players", async (count) => {
    const host = await create("Categories Host");
    const sessions = [host];
    for (let i = 1; i < count; i++) sessions.push(await join(host.roomCode, `Categories ${i}`));
    const sockets = await Promise.all(sessions.map(connectReady));
    const hostSocket = sockets[0] as WebSocket;
    let serial = 0;
    const accepted = async (socket: WebSocket, type: string, payload: unknown, requestId = `categories-${serial++}`) => {
      const ack = waitForMessage(socket, (m) => m.type === "command.ack" && m.requestId === requestId);
      socket.send(JSON.stringify({ type, payload, requestId }));
      await ack;
    };
    const rejected = async (socket: WebSocket, type: string, payload: unknown, code: string) => {
      const requestId = `rejected-${serial++}`;
      const error = waitForMessage(socket, (m) => m.type === "error" && m.requestId === requestId);
      socket.send(JSON.stringify({ type, payload, requestId }));
      expect(await error).toMatchObject({ type: "error", payload: { code } });
    };
    await accepted(hostSocket, "host.selectGame", { gameId: "categories" });
    await accepted(hostSocket, "host.startGame", {});
    let views = await collectCurrentGameViews(sockets);
    const first = views[0];
    if (first?.gameId !== "categories") throw new Error("Expected Categories");
    const gameInstanceId = first.public.gameInstanceId;
    const answer = (roundNumber: number, text: string) => ({ command: { type: "categories.submitAnswer", gameInstanceId, roundNumber, answer: text } });
    await rejected(sockets[1] as WebSocket, "host.advance", {}, "NOT_HOST");
    await rejected(sockets[1] as WebSocket, "host.startGame", {}, "NOT_HOST");
    await rejected(hostSocket, "game.command", { command: { type: "wst.submitAnswer", answer: "wrong game" } }, "INVALID_COMMAND");
    const invalidEnvelope = waitForMessage(hostSocket, (m) => m.type === "error" && m.requestId === undefined);
    hostSocket.send(JSON.stringify({ type: "game.command", requestId: "oversized-answer", payload: answer(1, "x".repeat(41)) }));
    expect(await invalidEnvelope).toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });
    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(host.roomCode));
    const totals = Object.fromEntries(sessions.map((session) => [session.playerId, 0]));
    for (let round = 1; round <= (count === 2 ? 5 : 1); round++) {
      if (round > 1) await rejected(hostSocket, "game.command", answer(round - 1, "delayed"), "STALE_PHASE");
      await accepted(hostSocket, "game.command", answer(round, "first private draft"));
      await accepted(hostSocket, "game.command", answer(round, "COFFEE mug!"));
      views = await collectCurrentGameViews(sockets);
      for (let i = 1; i < count; i++) {
        expect(JSON.stringify(views[i])).not.toContain("COFFEE mug!");
        expect(JSON.stringify(views[i])).not.toContain("first private draft");
      }
      for (const view of views) {
        expect(view.gameId).toBe("categories");
        expect(JSON.stringify(view.public)).not.toContain("COFFEE mug!");
        expect(view.public).not.toHaveProperty("groups");
      }
      if (round === 1) {
        await evictDurableObject(stub);
        const reconnect = await connectWithGame(host);
        expect(reconnect.game).toEqual(views[0]);
        reconnect.socket.close(1000);
      }
      for (let i = 1; i < count; i++) {
        const text = round % 2 === 1 && i === 1 ? "coffee   MUG" : `unique ${i}`;
        await accepted(sockets[i] as WebSocket, "game.command", answer(round, text), `scoring-${round}-${i}`);
      }
      views = await collectCurrentGameViews(sockets);
      expect(views[0]).toMatchObject({ phase: "reveal" });
      for (let i = 0; i < count; i++) {
        const id = sessions[i]!.playerId;
        totals[id] = (totals[id] ?? 0) + (round % 2 === 1 && i < 2 ? 0 : 1);
      }
      expect(views[0]?.public).toMatchObject({ gameScores: totals });
      const beforeDuplicate = views;
      await accepted(sockets[count - 1] as WebSocket, "game.command", answer(round, "different retry"), `scoring-${round}-${count - 1}`);
      await rejected(hostSocket, "game.command", answer(round, "too late"), "STALE_PHASE");
      expect(await collectCurrentGameViews(sockets)).toEqual(beforeDuplicate);
      if (round === 1) {
        await evictDurableObject(stub);
        const reconnect = await connectWithGame(sessions[1]!);
        expect(reconnect.game).toEqual(views[1]);
        reconnect.socket.close(1000);
      }
      await accepted(hostSocket, "host.advance", {});
      expect((await collectCurrentGameViews(sockets))[0]).toMatchObject({ phase: "roundResults" });
      await accepted(hostSocket, "host.advance", {});
    }
    if (count === 2) {
      views = await collectCurrentGameViews(sockets);
      expect(views[0]).toMatchObject({ phase: "gameResults", public: { gameScores: totals } });
      await evictDurableObject(stub);
      const reconnect = await connectWithGame(host);
      expect(reconnect.game).toEqual(views[0]);
      reconnect.socket.close(1000);
      await accepted(hostSocket, "host.startGame", {});
      const replay = (await collectCurrentGameViews(sockets))[0];
      expect(replay).toMatchObject({ gameId: "categories", phase: "submitting", public: { roundNumber: 1, gameScores: Object.fromEntries(sessions.map((s) => [s.playerId, 0])) } });
      if (replay?.gameId !== "categories") throw new Error("Expected replay");
      expect(replay.public.gameInstanceId).not.toBe(gameInstanceId);
      await rejected(hostSocket, "game.command", answer(1, "previous game"), "STALE_PHASE");
      await rejected(sockets[1] as WebSocket, "host.backToArcade", {}, "NOT_HOST");
      await accepted(hostSocket, "host.backToArcade", {});
      const snapshot = waitForMessage(hostSocket, (m) => m.type === "room.snapshot");
      hostSocket.send(JSON.stringify({ type: "room.reconnect", requestId: "room-scores", payload: { sessionToken: host.sessionToken } }));
      const room = await snapshot;
      if (room.type !== "room.snapshot") throw new Error("Expected room");
      expect(room.payload.roomPhase).toBe("lobby");
      expect(room.payload.players).toHaveLength(count);
      expect(Object.fromEntries(room.payload.players.map((p) => [p.id, p.score]))).toEqual(totals);
    }
    for (const socket of sockets) socket.close(1000, "test complete");
  });
});

describe("AFTERPRINT through the party-game registry", () => {
  it("freezes one shared daily puzzle across rooms and rejects multiplayer starts", async () => {
    const first = await create("First Solo");
    const second = await create("Second Solo");
    const firstSocket = await connectReady(first);
    const secondSocket = await connectReady(second);
    const start = async (socket: WebSocket, prefix: string) => {
      const selectAck = waitForMessage(socket, (message) => message.type === "command.ack" && message.requestId === `${prefix}-select`);
      socket.send(JSON.stringify({ type: "host.selectGame", requestId: `${prefix}-select`, payload: { gameId: "afterprint" } }));
      await selectAck;
      const game = waitForGame(socket, (candidate) => candidate.gameId === "afterprint");
      socket.send(JSON.stringify({ type: "host.startGame", requestId: `${prefix}-start`, payload: {} }));
      return game;
    };
    const [firstView, secondView] = await Promise.all([start(firstSocket, "first"), start(secondSocket, "second")]);
    if (firstView.gameId !== "afterprint" || secondView.gameId !== "afterprint") throw new Error("Expected AFTERPRINT");
    expect({ ...firstView.public, gameInstanceId: "stable", activePlayerId: "stable" })
      .toEqual({ ...secondView.public, gameInstanceId: "stable", activePlayerId: "stable" });

    const crowded = await create("Crowded Host");
    const crowdedGuest = await join(crowded.roomCode, "Crowded Guest");
    const crowdedSocket = await connectReady(crowded);
    const crowdedPresence = waitForMessage(crowdedSocket, (message) => message.type === "room.presence" && message.payload.players.filter((player) => player.connected).length === 2);
    const crowdedGuestSocket = await connectReady(crowdedGuest);
    await crowdedPresence;
    const crowdedSelect = waitForMessage(crowdedSocket, (message) => message.type === "command.ack" && message.requestId === "crowded-select");
    crowdedSocket.send(JSON.stringify({ type: "host.selectGame", requestId: "crowded-select", payload: { gameId: "afterprint" } }));
    await crowdedSelect;
    const error = waitForMessage(crowdedSocket, (message) => message.type === "error" && message.requestId === "crowded-start");
    crowdedSocket.send(JSON.stringify({ type: "host.startGame", requestId: "crowded-start", payload: {} }));
    await expect(error).resolves.toMatchObject({ type: "error", payload: { code: "TOO_MANY_PLAYERS" } });
    firstSocket.close(1000); secondSocket.close(1000); crowdedSocket.close(1000); crowdedGuestSocket.close(1000);
  });

  it("persists attempts, rejects stale/foreign commands, and atomically finishes on the fourth miss", async () => {
    const session = await create("Trace Solver");
    const socket = await connectReady(session);
    socket.send(JSON.stringify({ type: "host.selectGame", requestId: "afterprint-select", payload: { gameId: "afterprint" } }));
    await waitForMessage(socket, (message) => message.type === "command.ack" && message.requestId === "afterprint-select");
    const started = waitForGame(socket, (game) => game.gameId === "afterprint");
    socket.send(JSON.stringify({ type: "host.startGame", requestId: "afterprint-start", payload: {} }));
    const view = await started;
    if (view.gameId !== "afterprint") throw new Error("Expected AFTERPRINT");
    const submitted = (eventIds = view.public.initialEventIds) => ({
      command: { type: "afterprint.submitOrder", gameInstanceId: view.public.gameInstanceId, puzzleNumber: view.public.puzzleNumber, eventIds }
    });
    const invalid = waitForMessage(socket, (message) => message.type === "error" && message.requestId === undefined);
    socket.send(JSON.stringify({ type: "game.command", requestId: "invalid-order", payload: submitted(["A", "B", "C", "D", "D"]) }));
    await expect(invalid).resolves.toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });

    const foreign = waitForMessage(socket, (message) => message.type === "error" && message.requestId === "foreign-command");
    socket.send(JSON.stringify({ type: "game.command", requestId: "foreign-command", payload: {
      command: { type: "wst.submitAnswer", answer: "wrong game" }
    } }));
    await expect(foreign).resolves.toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });

    const stale = waitForMessage(socket, (message) => message.type === "error" && message.requestId === "stale-puzzle");
    socket.send(JSON.stringify({ type: "game.command", requestId: "stale-puzzle", payload: {
      command: { ...submitted().command, puzzleNumber: view.public.puzzleNumber + 1 }
    } }));
    await expect(stale).resolves.toMatchObject({ type: "error", payload: { code: "STALE_PHASE" } });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const requestId = `miss-${attempt}`;
      const next = waitForGame(socket, (game) => game.gameId === "afterprint" && game.public.attempts.length === attempt);
      socket.send(JSON.stringify({ type: "game.command", requestId, payload: submitted() }));
      const attemptView = await next;
      if (attemptView.gameId !== "afterprint") throw new Error("Expected AFTERPRINT");
      expect(attemptView).toMatchObject({ phase: "playing", public: { solved: false } });
      expect(attemptView.public.attempts.at(-1)?.mismatchCount).toBeGreaterThan(0);
    }
    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(session.roomCode));
    await evictDurableObject(stub);
    const reconnected = await connectWithGame(session);
    expect(reconnected.game).toMatchObject({ gameId: "afterprint", phase: "playing" });
    if (reconnected.game.gameId !== "afterprint") throw new Error("Expected AFTERPRINT");
    expect(reconnected.game.public.attempts).toHaveLength(3);
    expect(reconnected.game.public.attempts.every((attempt) => !attempt.solved)).toBe(true);
    reconnected.socket.close(1000);

    const finalGame = waitForGame(socket, (game) => game.gameId === "afterprint" && game.phase === "gameResults");
    const finalRoom = waitForMessage(socket, (message) => message.type === "room.presence" && message.payload.roomPhase === "results");
    socket.send(JSON.stringify({ type: "game.command", requestId: "miss-4", payload: submitted() }));
    const [finished] = await Promise.all([finalGame, finalRoom]);
    expect(finished).toMatchObject({ gameId: "afterprint", phase: "gameResults", public: { solved: false } });
    if (finished.gameId !== "afterprint") throw new Error("Expected AFTERPRINT");
    expect(finished.public.attempts).toHaveLength(4);
    await evictDurableObject(stub);
    const finalReconnect = await connectWithGame(session);
    expect(finalReconnect.game).toEqual(finished);
    finalReconnect.socket.close(1000); socket.close(1000);
  });

  it("accepts a mechanically valid order and persists an idempotent win before broadcasting results", async () => {
    const session = await create("Daily Solver");
    const socket = await connectReady(session);
    socket.send(JSON.stringify({ type: "host.selectGame", requestId: "win-select", payload: { gameId: "afterprint" } }));
    await waitForMessage(socket, (message) => message.type === "command.ack" && message.requestId === "win-select");
    const started = waitForGame(socket, (game) => game.gameId === "afterprint");
    socket.send(JSON.stringify({ type: "host.startGame", requestId: "win-start", payload: {} }));
    const view = await started;
    if (view.gameId !== "afterprint") throw new Error("Expected AFTERPRINT");
    const solution = enumerateAfterprintOrders([...AFTERPRINT_EVENT_IDS]).find((order) =>
      countAfterprintMismatches(simulateAfterprint(view.public.events, order), view.public.target) === 0
    );
    expect(solution).toBeDefined();
    const requestId = "winning-order";
    const finalGame = waitForGame(socket, (game) => game.gameId === "afterprint" && game.phase === "gameResults");
    const finalRoom = waitForMessage(socket, (message) => message.type === "room.presence" && message.payload.roomPhase === "results");
    const winningCommand = { type: "game.command", requestId, payload: { command: {
      type: "afterprint.submitOrder", gameInstanceId: view.public.gameInstanceId, puzzleNumber: view.public.puzzleNumber, eventIds: solution
    } } };
    socket.send(JSON.stringify(winningCommand));
    const [finished] = await Promise.all([finalGame, finalRoom]);
    expect(finished).toMatchObject({ gameId: "afterprint", phase: "gameResults", public: { solved: true, attempts: [{ mismatchCount: 0, solved: true }] } });
    const duplicateAck = waitForMessage(socket, (message) => message.type === "command.ack" && message.requestId === requestId);
    socket.send(JSON.stringify(winningCommand));
    await duplicateAck;
    const reconnect = await connectWithGame(session);
    expect(reconnect.game).toEqual(finished);
    reconnect.socket.close(1000); socket.close(1000);
  });

  it("runs Shirt Fight drawing uploads through private R2 authorization and deadline reconciliation", async () => {
    const host = await create("Shirt Host");
    const sessions = [host, await join(host.roomCode, "Shirt Two"), await join(host.roomCode, "Shirt Three")];
    const sockets = await Promise.all(sessions.map(connectReady));
    const hostSocket = sockets[0] as WebSocket;
    hostSocket.send(JSON.stringify({ type: "host.selectGame", requestId: "shirt-select", payload: { gameId: "shirt-fight" } }));
    await waitForMessage(sockets[1] as WebSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "shirt-fight");
    const started = waitForGame(hostSocket, (game) => game.gameId === "shirt-fight" && game.phase === "drawing");
    hostSocket.send(JSON.stringify({ type: "host.startGame", requestId: "shirt-start", payload: {} }));
    const initial = await started;
    expect(initial).toMatchObject({ gameId: "shirt-fight", public: { generationRound: 1, drawingNumber: 1, totalPlayers: 3, completedCount: 0 } });
    expect(JSON.stringify(initial)).not.toContain("objectKey");

    const unauthorized = await drawingUpload(host.roomCode, "x".repeat(43), validWebp());
    expect(unauthorized.status).toBe(401);
    const wrongType = await worker.fetch(new Request(`https://example.test/api/rooms/${host.roomCode}/shirt-fight/drawings`, {
      method: "POST", headers: { authorization: `Bearer ${host.sessionToken}`, "content-type": "image/png" }, body: new Uint8Array(30).buffer
    }), testEnv);
    expect(wrongType.status).toBe(415);
    const oversizedWithoutLength = await worker.fetch(new Request(`https://example.test/api/rooms/${host.roomCode}/shirt-fight/drawings`, {
      method: "POST", headers: { authorization: `Bearer ${host.sessionToken}`, "content-type": "image/webp" }, body: new Uint8Array(160_001).buffer
    }), testEnv);
    expect(oversizedWithoutLength.status).toBe(413);

    const drawingIds: string[] = [];
    const phaseTwoPromise = waitForGame(hostSocket, (game) => game.gameId === "shirt-fight" && game.public.drawingNumber === 2);
    const uploadResponses = await Promise.all(sessions.map((session) => drawingUpload(host.roomCode, session.sessionToken, validWebp())));
    for (const response of uploadResponses) {
      expect(response.status).toBe(201);
      drawingIds.push((await response.json<{ drawingId: string }>()).drawingId);
    }
    const phaseTwo = await phaseTwoPromise;
    expect(phaseTwo).toMatchObject({ private: { drawingSubmitted: false } });

    const own = await drawingRead(host.roomCode, host.sessionToken, drawingIds[0] as string);
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toBe("private, no-store");
    expect(own.headers.get("content-type")).toBe("image/webp");
    const foreign = await drawingRead(host.roomCode, sessions[1]?.sessionToken ?? "", drawingIds[0] as string);
    expect(foreign.status).toBe(404);
    const arbitrary = await drawingRead(host.roomCode, host.sessionToken, "00000000-0000-4000-8000-000000009999");
    expect(arbitrary.status).toBe(404);

    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(host.roomCode));
    await runInDurableObject(stub, (_instance, state) => {
      const row = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")] as unknown as Array<{ json_value: string }>;
      const game = JSON.parse(row[0]?.json_value ?? "{}") as { state: { deadlineAt: number } };
      game.state.deadlineAt = Date.now() - 1;
      state.storage.sql.exec("UPDATE room_state SET json_value = ? WHERE key = 'game'", JSON.stringify(game));
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const afterAlarm = await runInDurableObject(stub, (_instance, state) => {
      const row = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")] as unknown as Array<{ json_value: string }>;
      return JSON.parse(row[0]?.json_value ?? "{}") as { state: { phase: string; phaseNonce: number; drawings: unknown[] } };
    });
    expect(afterAlarm.state.phase).toBe("slogans");
    expect(Array.isArray(afterAlarm.state.drawings)).toBe(true);
    expect(afterAlarm.state.drawings).toHaveLength(6);
    const nonce = afterAlarm.state.phaseNonce;
    await runDurableObjectAlarm(stub);
    const repeatedNonce = await runInDurableObject(stub, (_instance, state) => {
      const row = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")] as unknown as Array<{ json_value: string }>;
      return (JSON.parse(row[0]?.json_value ?? "{}") as { state: { phaseNonce: number } }).state.phaseNonce;
    });
    expect(repeatedNonce).toBe(nonce);
    for (const socket of sockets) socket.close(1000, "test complete");
  });

  it("logically expires rooms while retaining an inaccessible Shirt Fight cleanup manifest", async () => {
    const host = await create("Expiry Host");
    const sessions = [host, await join(host.roomCode, "Expiry Two"), await join(host.roomCode, "Expiry Three")];
    const sockets = await Promise.all(sessions.map(connectReady));
    (sockets[0] as WebSocket).send(JSON.stringify({ type: "host.selectGame", requestId: "expiry-select", payload: { gameId: "shirt-fight" } }));
    await waitForMessage(sockets[1] as WebSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "shirt-fight");
    const started = waitForGame(sockets[0] as WebSocket, (game) => game.gameId === "shirt-fight");
    (sockets[0] as WebSocket).send(JSON.stringify({ type: "host.startGame", requestId: "expiry-start", payload: {} }));
    await started;
    const upload = await drawingUpload(host.roomCode, host.sessionToken, validWebp());
    const { drawingId } = await upload.json<{ drawingId: string }>();
    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(host.roomCode));
    const returned = waitForMessage(sockets[1] as WebSocket, (message) => message.type === "room.presence" && message.payload.roomPhase === "lobby");
    (sockets[0] as WebSocket).send(JSON.stringify({ type: "host.backToArcade", requestId: "abort-shirt-fight", payload: {} }));
    await returned;
    const abandonedManifest = await runInDurableObject(stub, (_instance, state) => {
      const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'shirt-fight-assets'")] as unknown as Array<{ json_value: string }>;
      return JSON.parse(rows[0]?.json_value ?? "{}") as { entries: Array<{ drawingId: string; cleanupAt?: number }> };
    });
    expect(abandonedManifest.entries.find((entry) => entry.drawingId === drawingId)?.cleanupAt).toBeGreaterThan(Date.now());
    await runInDurableObject(stub, (_instance, state) => {
      const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'metadata'")] as unknown as Array<{ json_value: string }>;
      const metadata = JSON.parse(rows[0]?.json_value ?? "{}") as Record<string, unknown>;
      metadata.lastActivityAt = Date.now() - 12 * 60 * 60 * 1_000 - 1;
      state.storage.sql.exec("UPDATE room_state SET json_value = ? WHERE key = 'metadata'", JSON.stringify(metadata));
    });
    const expired = await call(`/api/rooms/${host.roomCode}/session`, { sessionToken: host.sessionToken });
    expect(expired.status).toBe(410);
    expect((await drawingRead(host.roomCode, host.sessionToken, drawingId)).status).toBe(410);
    const tombstone = await runInDurableObject(stub, (_instance, state) => {
      const rows = [...state.storage.sql.exec("SELECT key, json_value FROM room_state")] as unknown as Array<{ key: string; json_value: string }>;
      return rows;
    });
    expect(tombstone.some((row) => row.key === "metadata" && row.json_value.includes("expiredAt"))).toBe(true);
    expect(tombstone.some((row) => row.key === "shirt-fight-assets" && row.json_value.includes("cleanupAt"))).toBe(true);
    expect(JSON.stringify(tombstone)).toContain(drawingId);
    for (const socket of sockets) socket.close(1000, "test complete");
  });

  it("durably retries transient fallback storage failure", async () => {
    const host = await create("Deadline Host");
    const sessions = [host, await join(host.roomCode, "Deadline Two"), await join(host.roomCode, "Deadline Three")];
    const sockets = await Promise.all(sessions.map(connectReady));
    (sockets[0] as WebSocket).send(JSON.stringify({ type: "host.selectGame", requestId: "deadline-select", payload: { gameId: "shirt-fight" } }));
    await waitForMessage(sockets[1] as WebSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "shirt-fight");
    const started = waitForGame(sockets[0] as WebSocket, (game) => game.gameId === "shirt-fight");
    (sockets[0] as WebSocket).send(JSON.stringify({ type: "host.startGame", requestId: "deadline-start", payload: {} }));
    await started;
    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(host.roomCode));
    const bucket = testEnv.SHIRT_FIGHT_DRAWINGS;
    await setShirtFightDeadline(stub, Date.now() - 1);
    const failedPut = vi.spyOn(bucket, "put").mockRejectedValueOnce(new Error("transient R2 failure"));
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    failedPut.mockRestore();
    const retryManifest = await runInDurableObject(stub, (_instance, state) => {
      const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'shirt-fight-assets'")] as unknown as Array<{ json_value: string }>;
      return JSON.parse(rows[0]?.json_value ?? "{}") as { entries: Array<{ fallbackRetryCount: number; fallbackRetryAt?: number }> };
    });
    expect(retryManifest.entries.some((entry) => entry.fallbackRetryCount === 1 && typeof entry.fallbackRetryAt === "number")).toBe(true);
    await runInDurableObject(stub, (_instance, state) => {
      const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'shirt-fight-assets'")] as unknown as Array<{ json_value: string }>;
      const manifest = JSON.parse(rows[0]?.json_value ?? "{}") as { entries: Array<Record<string, unknown>> };
      for (const entry of manifest.entries) if (entry.fallbackRetryAt) entry.fallbackRetryAt = Date.now() - 1;
      state.storage.sql.exec("UPDATE room_state SET json_value = ? WHERE key = 'shirt-fight-assets'", JSON.stringify(manifest));
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const recoveredFirstPhase = await readStoredShirtFight(stub);
    expect(recoveredFirstPhase.state).toMatchObject({ phase: "drawing", drawingNumber: 2 });
    expect(recoveredFirstPhase.state.drawings).toHaveLength(3);
    await setShirtFightDeadline(stub, Date.now() - 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const recoveredSecondPhase = await readStoredShirtFight(stub);
    expect(recoveredSecondPhase.state.phase).toBe("slogans");
    expect(recoveredSecondPhase.state.drawings).toHaveLength(6);
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

function drawingUpload(roomCode: string, sessionToken: string, body: Uint8Array): Promise<Response> {
  return worker.fetch(new Request(`https://example.test/api/rooms/${roomCode}/shirt-fight/drawings`, {
    method: "POST",
    headers: { "content-type": "image/webp", authorization: `Bearer ${sessionToken}` },
    body: new Uint8Array(body).buffer
  }), testEnv);
}

function drawingRead(roomCode: string, sessionToken: string, drawingId: string): Promise<Response> {
  return worker.fetch(new Request(`https://example.test/api/rooms/${roomCode}/shirt-fight/assets/${drawingId}`, {
    headers: { authorization: `Bearer ${sessionToken}` }
  }), testEnv);
}

function validWebp(): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set([40, 0, 0, 0], 4);
  bytes.set(new TextEncoder().encode("WEBPVP8X"), 8);
  bytes.set([10, 0, 0, 0], 16);
  bytes.set([0, 0, 0, 0], 20);
  bytes.set([0x57, 0x02, 0x00], 24);
  bytes.set([0x1f, 0x03, 0x00], 27);
  bytes.set(new TextEncoder().encode("VP8 "), 30);
  bytes.set([10, 0, 0, 0], 34);
  bytes.set([0, 0, 0, 0x9d, 0x01, 0x2a, 0x57, 0x02, 0x1f, 0x03], 38);
  return bytes;
}

async function setShirtFightDeadline(stub: DurableObjectStub, deadlineAt: number): Promise<void> {
  await runInDurableObject(stub, (_instance, state) => {
    const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")] as unknown as Array<{ json_value: string }>;
    const game = JSON.parse(rows[0]?.json_value ?? "{}") as { state: { deadlineAt: number } };
    game.state.deadlineAt = deadlineAt;
    state.storage.sql.exec("UPDATE room_state SET json_value = ? WHERE key = 'game'", JSON.stringify(game));
  });
}

function readStoredShirtFight(stub: DurableObjectStub) {
  return runInDurableObject(stub, (_instance, state) => {
    const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")] as unknown as Array<{ json_value: string }>;
    return JSON.parse(rows[0]?.json_value ?? "{}") as { state: { phase: string; drawingNumber?: number; drawings: Array<{ artistPlayerId: string; fallback: boolean }> } };
  });
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
