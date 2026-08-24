import { env } from "cloudflare:workers";
import { abortAllDurableObjects, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import type { SystemCrawlState, SystemCrawlViewerState } from "@team-arcade/games";
import type {
  RoomSessionResponse,
  ServerMessage,
  SystemCrawlCommand,
  TypedGameViewerState
} from "@team-arcade/shared";
import worker from "../src/index";
import type { Env } from "../src/types";

const testEnv = env as unknown as Env;

afterEach(async () => {
  await abortAllDurableObjects();
});

describe("System Crawl room integration", () => {
  it("requires two solo classes, owns both characters, reconnects, and deduplicates turn advancement", async () => {
    const host = await create("Solo Operator");
    const { sockets, views } = await startSystem([host]);
    const socket = sockets[0] as WebSocket;
    expect(systemView(views[0] as TypedGameViewerState)).toMatchObject({
      phase: "class_selection",
      classSelections: { [host.playerId]: [] }
    });
    expect(JSON.stringify(views[0])).not.toContain("rngState");
    expect(JSON.stringify(views[0])).not.toContain("seed");

    sendCommand(socket, "solo-incomplete", {
      type: "select_class",
      classIds: ["infrastructure-architect"]
    });
    await expect(waitForError(socket, "solo-incomplete")).resolves.toMatchObject({
      payload: { code: "class_selection_incomplete" }
    });

    const ready = waitForSystem(socket, (view) => view.phase === "ready_to_start");
    sendCommand(socket, "solo-select", {
      type: "select_class",
      classIds: ["infrastructure-architect", "application-developer"]
    });
    await ready;

    const started = waitForSystem(socket, (view) => view.phase === "player_turn");
    sendCommand(socket, "solo-adventure", { type: "start_adventure" });
    const adventure = await started;
    expect(Object.values(adventure.characters)).toHaveLength(2);
    expect(Object.values(adventure.characters).every((character) => character.ownerPlayerId === host.playerId)).toBe(true);
    expect(JSON.stringify(adventure)).not.toContain("rngState");
    expect(JSON.stringify(adventure)).not.toContain("abilityHistory");

    const firstCharacterId = adventure.activeCharacterId as string;
    const nextTurn = waitForSystem(socket, (view) => view.activeCharacterId !== firstCharacterId);
    const command = { type: "end_turn", characterId: firstCharacterId } satisfies SystemCrawlCommand;
    sendCommand(socket, "solo-end-once", command);
    const afterEnd = await nextTurn;
    const duplicateAck = waitForMessage(socket, (message) => message.type === "command.ack" && message.requestId === "solo-end-once");
    sendCommand(socket, "solo-end-once", command);
    await duplicateAck;

    const reconnected = await connectWithSystem(host);
    expect(reconnected.view.activeCharacterId).toBe(afterEnd.activeCharacterId);
    expect(Object.values(reconnected.view.characters).every((character) => character.ownerPlayerId === host.playerId)).toBe(true);
    reconnected.socket.close(1000, "test complete");
    socket.close(1000, "test complete");
  });

  it("enforces unique selections, host start, ownership, active turn, and rejected-state stability", async () => {
    const host = await create("Host");
    const guest = await join(host.roomCode, "Guest");
    const { sockets } = await startSystem([host, guest]);
    const hostSocket = sockets[0] as WebSocket;
    const guestSocket = sockets[1] as WebSocket;

    const hostSelected = waitForSystem(guestSocket, (view) => view.classSelections[host.playerId]?.[0] === "infrastructure-architect");
    sendCommand(hostSocket, "host-class", { type: "select_class", classIds: ["infrastructure-architect"] });
    await hostSelected;

    sendCommand(guestSocket, "duplicate-class", { type: "select_class", classIds: ["infrastructure-architect"] });
    await expect(waitForError(guestSocket, "duplicate-class")).resolves.toMatchObject({ payload: { code: "class_unavailable" } });

    const ready = waitForSystem(hostSocket, (view) => view.phase === "ready_to_start");
    sendCommand(guestSocket, "guest-class", { type: "select_class", classIds: ["application-developer"] });
    await ready;
    sendCommand(guestSocket, "guest-start", { type: "start_adventure" });
    await expect(waitForError(guestSocket, "guest-start")).resolves.toMatchObject({ payload: { code: "not_host" } });

    const started = Promise.all(sockets.map((socket) => waitForSystem(socket, (view) => view.phase === "player_turn")));
    sendCommand(hostSocket, "host-start", { type: "start_adventure" });
    const [hostView] = await started;
    if (!hostView) throw new Error("Expected host view");
    const hostCharacter = Object.values(hostView.characters).find((character) => character.ownerPlayerId === host.playerId);
    const guestCharacter = Object.values(hostView.characters).find((character) => character.ownerPlayerId === guest.playerId);
    if (!hostCharacter || !guestCharacter) throw new Error("Expected one character per player");

    sendCommand(guestSocket, "steal-host-character", { type: "end_turn", characterId: hostCharacter.id });
    await expect(waitForError(guestSocket, "steal-host-character")).resolves.toMatchObject({ payload: { code: "not_character_owner" } });
    sendCommand(guestSocket, "guest-out-of-turn", { type: "end_turn", characterId: guestCharacter.id });
    await expect(waitForError(guestSocket, "guest-out-of-turn")).resolves.toMatchObject({ payload: { code: "not_current_character" } });

    const beforePosition = { ...hostCharacter.position };
    sendCommand(hostSocket, "blocked-move", {
      type: "move_to",
      characterId: hostCharacter.id,
      destination: { cardIndex: 0, x: 0, y: 0 }
    });
    await expect(waitForError(hostSocket, "blocked-move")).resolves.toMatchObject({ payload: { code: "tile_blocked" } });
    const unchanged = await currentSystemView(hostSocket, host);
    expect(unchanged.characters[hostCharacter.id]?.position).toEqual(beforePosition);

    const reconnected = await connectWithSystem(guest);
    expect(reconnected.view.characters[guestCharacter.id]?.ownerPlayerId).toBe(guest.playerId);
    reconnected.socket.close(1000, "test complete");
    sockets.forEach((socket) => socket.close(1000, "test complete"));
  });

  it("projects Google It candidates only to their owner and preserves the choice across reconnect", async () => {
    const host = await create("Host");
    const guest = await join(host.roomCode, "Chooser");
    const { sockets } = await readyTwoPlayerAdventure(host, guest);
    const hostSocket = sockets[0] as WebSocket;
    const guestSocket = sockets[1] as WebSocket;
    const initial = await currentSystemView(guestSocket, guest);
    const guestCharacter = Object.values(initial.characters).find((character) => character.ownerPlayerId === guest.playerId);
    if (!guestCharacter) throw new Error("Expected guest character");

    await updateStoredSystemGame(host.roomCode, (state) => {
      state.phase = "resolving_choice";
      state.pendingChoice = {
        kind: "google_it",
        id: "choice:test",
        ownerPlayerId: guest.playerId,
        characterId: guestCharacter.id,
        candidateItemIds: ["coffee", "admin-credentials"]
      };
    });

    const ownerView = await currentSystemView(guestSocket, guest);
    const otherView = await currentSystemView(hostSocket, host);
    expect(ownerView.pendingChoice?.candidateItemIds).toEqual(["coffee", "admin-credentials"]);
    expect(otherView.pendingChoice).not.toHaveProperty("candidateItemIds");
    expect(JSON.stringify(otherView)).not.toContain("admin-credentials");

    sendCommand(hostSocket, "steal-choice", { type: "resolve_choice", choiceId: "choice:test", itemId: "coffee" });
    await expect(waitForError(hostSocket, "steal-choice")).resolves.toMatchObject({ payload: { code: "unauthorized_choice" } });
    const reconnected = await connectWithSystem(guest);
    expect(reconnected.view.pendingChoice?.candidateItemIds).toEqual(["coffee", "admin-credentials"]);

    const resolved = waitForSystem(guestSocket, (view) => view.pendingChoice === null);
    sendCommand(guestSocket, "resolve-own-choice", { type: "resolve_choice", choiceId: "choice:test", itemId: "coffee" });
    expect((await resolved).characters[guestCharacter.id]?.carriedItemId).toBe("coffee");
    reconnected.socket.close(1000, "test complete");
    sockets.forEach((socket) => socket.close(1000, "test complete"));
  });

  it("transfers only host privilege and lets the successor start the ready adventure", async () => {
    const host = await create("Original Host");
    const guest = await join(host.roomCode, "Next Host");
    const { sockets } = await startSystem([host, guest]);
    const hostSocket = sockets[0] as WebSocket;
    const guestSocket = sockets[1] as WebSocket;

    const selectedHost = waitForSystem(guestSocket, (view) => view.classSelections[host.playerId]?.length === 1);
    sendCommand(hostSocket, "host-selection", { type: "select_class", classIds: ["infrastructure-architect"] });
    await selectedHost;
    const ready = waitForSystem(guestSocket, (view) => view.phase === "ready_to_start");
    sendCommand(guestSocket, "guest-selection", { type: "select_class", classIds: ["application-developer"] });
    await ready;

    hostSocket.close(1000, "host leaves");
    await waitForMessage(guestSocket, (message) => message.type === "room.presence" && message.payload.players.some((player) => player.id === host.playerId && !player.connected));
    const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(host.roomCode));
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("UPDATE players SET disconnected_at = ? WHERE id = ?", Date.now() - 60_001, host.playerId);
    });
    const transferredRoom = waitForMessage(guestSocket, (message) => message.type === "room.presence" && message.payload.players.some((player) => player.id === guest.playerId && player.isHost));
    const transferredGame = waitForSystem(guestSocket, (view) => view.hostPlayerId === guest.playerId);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await transferredRoom;
    const afterTransfer = await transferredGame;
    expect(afterTransfer.classSelections[host.playerId]).toEqual(["infrastructure-architect"]);
    expect(afterTransfer.classSelections[guest.playerId]).toEqual(["application-developer"]);

    const started = waitForSystem(guestSocket, (view) => view.phase === "player_turn");
    sendCommand(guestSocket, "successor-start", { type: "start_adventure" });
    const adventure = await started;
    expect(Object.values(adventure.characters).find((character) => character.classId === "infrastructure-architect")?.ownerPlayerId).toBe(host.playerId);
    expect(Object.values(adventure.characters).find((character) => character.classId === "application-developer")?.ownerPlayerId).toBe(guest.playerId);
    guestSocket.close(1000, "test complete");
  });

  it("rejects a five-player start without creating game state", async () => {
    const host = await create("Host");
    const sessions = [host];
    for (let index = 1; index < 5; index += 1) sessions.push(await join(host.roomCode, `Guest ${index}`));
    const sockets = await Promise.all(sessions.map(connectReady));
    const hostSocket = sockets[0] as WebSocket;
    const selected = waitForMessage(hostSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "system-crawl");
    hostSocket.send(JSON.stringify({ type: "host.selectGame", requestId: "select-five", payload: { gameId: "system-crawl" } }));
    await selected;
    hostSocket.send(JSON.stringify({ type: "host.startGame", requestId: "start-five", payload: {} }));
    await expect(waitForError(hostSocket, "start-five")).resolves.toMatchObject({ payload: { code: "TOO_MANY_PLAYERS" } });
    const snapshot = await currentRoomView(hostSocket, host);
    expect(snapshot.roomPhase).toBe("lobby");
    sockets.forEach((socket) => socket.close(1000, "test complete"));
  });

  it("routes victory and defeat through results and play again resets all adventure state", async () => {
    const victoryHost = await create("Victory Host");
    const victorySetup = await readySoloAdventure(victoryHost);
    const victorySocket = victorySetup.socket;
    const victoryView = await currentSystemView(victorySocket, victoryHost);
    const architect = Object.values(victoryView.characters).find((character) => character.classId === "infrastructure-architect");
    if (!architect) throw new Error("Expected architect");
    await updateStoredSystemGame(victoryHost.roomCode, (state) => prepareNearVictory(state, architect.id));
    const victoryAck = waitForMessage(victorySocket, (message) => message.type === "command.ack" && message.requestId === "winning-hit");
    sendCommand(victorySocket, "winning-hit", {
      type: "use_ability",
      characterId: architect.id,
      abilityId: "packet-drop",
      target: { type: "enemy", enemyId: "enemy:test-boss" }
    });
    await victoryAck;
    expect((await currentRoomView(victorySocket, victoryHost)).roomPhase).toBe("results");
    expect((await currentSystemView(victorySocket, victoryHost)).phase).toBe("victory");

    const reset = waitForSystem(victorySocket, (view) => view.phase === "class_selection");
    victorySocket.send(JSON.stringify({ type: "host.startGame", requestId: "play-again", payload: {} }));
    const fresh = await reset;
    expect(fresh.round).toBe(0);
    expect(fresh.characters).toEqual({});
    expect(fresh.events).toEqual([]);
    victorySocket.close(1000, "test complete");

    const defeatHost = await create("Defeat Host");
    const defeatSetup = await readySoloAdventure(defeatHost);
    const defeatSocket = defeatSetup.socket;
    const defeatView = await currentSystemView(defeatSocket, defeatHost);
    const activeId = defeatView.activeCharacterId as string;
    await updateStoredSystemGame(defeatHost.roomCode, (state) => prepareNearDefeat(state, activeId));
    const defeatAck = waitForMessage(defeatSocket, (message) => message.type === "command.ack" && message.requestId === "fatal-end");
    sendCommand(defeatSocket, "fatal-end", { type: "end_turn", characterId: activeId });
    await defeatAck;
    expect((await currentRoomView(defeatSocket, defeatHost)).roomPhase).toBe("results");
    expect((await currentSystemView(defeatSocket, defeatHost)).phase).toBe("defeat");
    defeatSocket.close(1000, "test complete");
  });
});

async function readyTwoPlayerAdventure(host: RoomSessionResponse, guest: RoomSessionResponse) {
  const started = await startSystem([host, guest]);
  const hostSocket = started.sockets[0] as WebSocket;
  const guestSocket = started.sockets[1] as WebSocket;
  const hostSelected = waitForSystem(guestSocket, (view) => view.classSelections[host.playerId]?.length === 1);
  sendCommand(hostSocket, "setup-host-class", { type: "select_class", classIds: ["infrastructure-architect"] });
  await hostSelected;
  const ready = waitForSystem(hostSocket, (view) => view.phase === "ready_to_start");
  sendCommand(guestSocket, "setup-guest-class", { type: "select_class", classIds: ["it-generalist"] });
  await ready;
  const gameplay = waitForSystem(hostSocket, (view) => view.phase === "player_turn");
  sendCommand(hostSocket, "setup-adventure", { type: "start_adventure" });
  await gameplay;
  return { sockets: started.sockets };
}

async function readySoloAdventure(host: RoomSessionResponse) {
  const started = await startSystem([host]);
  const socket = started.sockets[0] as WebSocket;
  const ready = waitForSystem(socket, (view) => view.phase === "ready_to_start");
  sendCommand(socket, "solo-classes", {
    type: "select_class",
    classIds: ["infrastructure-architect", "application-developer"]
  });
  await ready;
  const adventure = waitForSystem(socket, (view) => view.phase === "player_turn");
  sendCommand(socket, "solo-start", { type: "start_adventure" });
  await adventure;
  return { socket };
}

async function startSystem(sessions: RoomSessionResponse[]): Promise<{ sockets: WebSocket[]; views: TypedGameViewerState[] }> {
  const sockets = await Promise.all(sessions.map(connectReady));
  const hostSocket = sockets[0] as WebSocket;
  const selected = waitForMessage(hostSocket, (message) => message.type === "room.presence" && message.payload.selectedGameId === "system-crawl");
  hostSocket.send(JSON.stringify({ type: "host.selectGame", requestId: "select-system", payload: { gameId: "system-crawl" } }));
  await selected;
  const views = sockets.map((socket) => waitForGame(socket, (game) => game.gameId === "system-crawl" && game.phase === "class_selection"));
  hostSocket.send(JSON.stringify({ type: "host.startGame", requestId: "start-system", payload: {} }));
  return { sockets, views: await Promise.all(views) };
}

function prepareNearVictory(state: SystemCrawlState, characterId: string): void {
  const character = state.characters[characterId];
  if (!character) throw new Error("Missing victory character");
  character.position = { cardIndex: 0, x: 1, y: 2 };
  state.enemies = {
    "enemy:test-boss": {
      id: "enemy:test-boss",
      definitionId: "legacy-system",
      displayName: "Legacy System",
      hp: 1,
      maxHp: 16,
      baseMovement: 0,
      attackRange: 1,
      damage: 1,
      position: { cardIndex: 0, x: 2, y: 2 },
      spawnOrder: 1,
      revealedRound: state.round,
      statuses: { movementReductionNextActivation: 0, stunnedNextActivation: false, tauntedByCharacterId: null },
      backwardCompatibilityUsedThisRound: true,
      undocumentedDependencyTriggered: false
    }
  };
  state.phase = "player_turn";
  state.activeCharacterId = characterId;
  state.turn = { movementAllowance: 3, movementSpent: 0, actionUsed: false, actionBlocked: false, actedCharacterIdsThisRound: [] };
}

function prepareNearDefeat(state: SystemCrawlState, characterId: string): void {
  const active = state.characters[characterId];
  if (!active) throw new Error("Missing defeat character");
  for (const character of Object.values(state.characters)) {
    character.downed = character.id !== characterId;
    character.hp = character.id === characterId ? 1 : 0;
  }
  active.position = { cardIndex: 0, x: 1, y: 2 };
  state.enemies = {
    "enemy:fatal": {
      id: "enemy:fatal",
      definitionId: "budget-reduction",
      displayName: "Budget Reduction",
      hp: 5,
      maxHp: 5,
      baseMovement: 0,
      attackRange: 1,
      damage: 10,
      position: { cardIndex: 0, x: 2, y: 2 },
      spawnOrder: 1,
      revealedRound: state.round,
      statuses: { movementReductionNextActivation: 0, stunnedNextActivation: false, tauntedByCharacterId: null },
      backwardCompatibilityUsedThisRound: false,
      undocumentedDependencyTriggered: false
    }
  };
  state.phase = "player_turn";
  state.turnOrder = [characterId];
  state.activeCharacterId = characterId;
  state.turn = { movementAllowance: 3, movementSpent: 0, actionUsed: false, actionBlocked: false, actedCharacterIdsThisRound: [] };
}

async function updateStoredSystemGame(roomCode: string, mutate: (state: SystemCrawlState) => void): Promise<void> {
  const stub = testEnv.ROOMS.get(testEnv.ROOMS.idFromName(roomCode));
  await runInDurableObject(stub, (_instance, state) => {
    const rows = [...state.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")] as unknown as Array<{ json_value: string }>;
    const game = JSON.parse(rows[0]?.json_value ?? "{}") as { gameId: string; state: SystemCrawlState };
    if (game.gameId !== "system-crawl") throw new Error("Expected System Crawl state");
    mutate(game.state);
    state.storage.sql.exec("UPDATE room_state SET json_value = ?, updated_at = ? WHERE key = 'game'", JSON.stringify(game), Date.now());
  });
}

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

async function connectWithSystem(session: RoomSessionResponse): Promise<{ socket: WebSocket; view: SystemCrawlViewerState }> {
  const socket = await connect(session);
  return { socket, view: await waitForSystem(socket, () => true) };
}

async function currentSystemView(socket: WebSocket, session: RoomSessionResponse): Promise<SystemCrawlViewerState> {
  const view = waitForSystem(socket, () => true);
  socket.send(JSON.stringify({ type: "room.reconnect", requestId: crypto.randomUUID(), payload: { sessionToken: session.sessionToken } }));
  return view;
}

async function currentRoomView(socket: WebSocket, session: RoomSessionResponse) {
  const snapshot = waitForMessage(socket, (message) => message.type === "room.snapshot");
  socket.send(JSON.stringify({ type: "room.reconnect", requestId: crypto.randomUUID(), payload: { sessionToken: session.sessionToken } }));
  const message = await snapshot;
  if (message.type !== "room.snapshot") throw new Error("Expected room snapshot");
  return message.payload;
}

function sendCommand(socket: WebSocket, requestId: string, command: SystemCrawlCommand): void {
  socket.send(JSON.stringify({ type: "game.command", requestId, payload: { command } }));
}

function waitForError(socket: WebSocket, requestId: string): Promise<Extract<ServerMessage, { type: "error" }>> {
  return waitForMessage(socket, (message) => message.type === "error" && message.requestId === requestId)
    .then((message) => message as Extract<ServerMessage, { type: "error" }>);
}

function waitForSystem(socket: WebSocket, predicate: (view: SystemCrawlViewerState) => boolean): Promise<SystemCrawlViewerState> {
  return waitForGame(socket, (game) => game.gameId === "system-crawl" && predicate(systemView(game)))
    .then(systemView);
}

function systemView(game: TypedGameViewerState): SystemCrawlViewerState {
  if (game.gameId !== "system-crawl") throw new Error("Expected System Crawl view");
  return game.public as SystemCrawlViewerState;
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
    }, 3_000);
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
