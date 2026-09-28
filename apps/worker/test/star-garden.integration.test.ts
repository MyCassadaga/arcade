import { env } from "cloudflare:workers";
import { abortAllDurableObjects, evictDurableObject, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import type { ClientMessage, RoomSessionResponse, ServerMessage, StarGardenCommand, TypedGameViewerState } from "@team-arcade/shared";
import type { StarGardenState } from "@team-arcade/games";
const testEnv = env as unknown as Env;
type View = Extract<TypedGameViewerState, { gameId: "star-garden" }>;
afterEach(async () => { await abortAllDurableObjects(); });
async function call(path: string, body: unknown) { return worker.fetch(new Request(`https://example.test${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), testEnv); }
async function create(): Promise<RoomSessionResponse> { return (await call("/api/rooms", { displayName: "Host" })).json<RoomSessionResponse>(); }
const stubFor = (session: RoomSessionResponse) => testEnv.ROOMS.get(testEnv.ROOMS.idFromName(session.roomCode));
async function stored(session: RoomSessionResponse) {
  return runInDurableObject(stubFor(session), (_instance, ctx) => {
    const row = [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")][0] as { json_value: string };
    const metadata = [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'metadata'")][0] as { json_value: string };
    return { game: (JSON.parse(row.json_value) as { state: StarGardenState }).state, metadata: JSON.parse(metadata.json_value) as { roomPhase: string }, scores: [...ctx.storage.sql.exec("SELECT id, score FROM players")] as unknown as Array<{ id: string; score: number }>, receipts: [...ctx.storage.sql.exec("SELECT * FROM processed_requests")] };
  });
}
async function fixture(session: RoomSessionResponse, deadline?: number) {
  await runInDurableObject(stubFor(session), (_instance, ctx) => {
    const row = [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")][0] as { json_value: string };
    const game = JSON.parse(row.json_value) as { state: StarGardenState };
    game.state.lanes.easy = ["G01", ...game.state.lanes.easy.filter((id) => id !== "G01")];
    for (const p of Object.values(game.state.players)) p.board.fill(0);
    if (deadline !== undefined) game.state.deadlineAt = deadline;
    ctx.storage.sql.exec("UPDATE room_state SET json_value = ? WHERE key = 'game'", JSON.stringify(game));
  });
}
async function connect(session: RoomSessionResponse) {
  const response = await worker.fetch(new Request(`https://example.test/api/rooms/${session.roomCode}/socket`, { headers: { Upgrade: "websocket" } }), testEnv);
  const socket = response.webSocket!; socket.accept();
  const messages: ServerMessage[] = [];
  socket.addEventListener("message", (event) => { messages.push(JSON.parse(String(event.data)) as ServerMessage); });
  async function wait(predicate: (message: ServerMessage) => boolean): Promise<ServerMessage> {
    for (let i = 0; i < 200; i++) { const found = messages.find(predicate); if (found) return found; await new Promise((resolve) => setTimeout(resolve, 5)); }
    throw Error(`Missing message. Received ${messages.map((m) => m.type).join(",")}`);
  }
  async function send(message: ClientMessage) {
    messages.splice(0); socket.send(JSON.stringify(message));
    return wait((m) => (m.type === "command.ack" || m.type === "error") && m.requestId === message.requestId);
  }
  await send({ type: "room.reconnect", requestId: crypto.randomUUID(), payload: { sessionToken: session.sessionToken } });
  return { socket, messages, send, wait, view: () => [...messages].reverse().find((m) => m.type === "game.state") };
}
const command = (value: StarGardenCommand, requestId: string = crypto.randomUUID()): ClientMessage => ({ type: "game.command", requestId, payload: { command: value } });
const identity = (s: StarGardenState, actor: string) => ({ gameInstanceId: s.gameInstanceId, roundNumber: s.roundNumber, expectedRevision: s.players[actor]!.revision });
async function open(count = 1) {
  const host = await create(), sessions = [host];
  for (let i = 1; i < count; i++) sessions.push(await (await call(`/api/rooms/${host.roomCode}/join`, { displayName: `Guest ${i}` })).json());
  const clients = await Promise.all(sessions.map(connect)); const client = clients[0]!;
  await client.send({ type: "host.selectGame", requestId: crypto.randomUUID(), payload: { gameId: "star-garden" } });
  await client.send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} });
  const setup = (await stored(host)).game;
  await client.send(command({ type: "starGarden.begin", ...identity(setup, host.playerId), mode: count === 1 ? "daily" : "cup" }));
  return { host, sessions, clients, client };
}
describe("Star Garden DO integration", () => {
  it("persists accepted claims, RNG and receipts before acknowledgement; deduplicates across eviction and rejects reused payload/stale revisions", async () => {
    const { host, client } = await open(); await fixture(host);
    const before = await stored(host);
    const claim = command({ type: "starGarden.claimGoal", ...identity(before.game, host.playerId), goalId: "G01", origin: 0 }, "claim-once");
    expect(await client.send(claim)).toMatchObject({ type: "command.ack" });
    const accepted = await stored(host);
    expect(accepted.scores[0]!.score).toBe(2); expect(accepted.game.players[host.playerId]!.revision).toBe(2); expect(accepted.receipts.some((r) => r.request_id === "claim-once")).toBe(true);
    expect(await client.send(claim)).toMatchObject({ type: "command.ack" }); expect((await stored(host)).game).toEqual(accepted.game);
    client.socket.close(); await evictDurableObject(stubFor(host));
    const recovered = await connect(host); expect(await recovered.send(claim)).toMatchObject({ type: "command.ack" }); expect((await stored(host)).game).toEqual(accepted.game);
    const conflict = command({ type: "starGarden.claimGoal", ...identity(before.game, host.playerId), goalId: "G01", origin: 1 }, "claim-once");
    expect(await recovered.send(conflict)).toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });
    expect(await recovered.send(command({ type: "starGarden.endRun", ...identity(before.game, host.playerId) }))).toMatchObject({ type: "error", payload: { code: "STALE_PHASE" } });
    expect((await stored(host)).scores[0]!.score).toBe(2);
    await recovered.wait((m) => m.type === "game.state"); expect((recovered.view()!.payload as View).private.revision).toBe(2);
  });
  it("keeps Cup boards/hands/pending points private and accepts another player's unchanged revision; commits both equal claims once at closure", async () => {
    const { host, sessions, clients, client } = await open(2); await fixture(host);
    const guest = sessions[1]!, guestClient = clients[1]!, initial = (await stored(host)).game;
    expect(initial.players[host.playerId]).toEqual(initial.players[guest.playerId]);
    await client.send(command({ type: "starGarden.claimGoal", ...identity(initial, host.playerId), goalId: "G01", origin: 0 }));
    const pending = await stored(host); expect(pending.scores.every((p) => p.score === 0)).toBe(true); expect(pending.game.players[guest.playerId]).toEqual(initial.players[guest.playerId]);
    await guestClient.wait((m) => m.type === "game.state" && (m.payload as View).public.readiness[host.playerId] === true);
    const view = guestClient.view()!.payload as View;
    expect(view.public.standings.every((s) => s.score === 0)).toBe(true); expect(view.private.pendingGoalId).toBeNull(); expect(view.public.history).toEqual([]);
    for (const field of ["board", "hand", "pending", "drawPile", "stars", "actions", "goalStreams", "lanes"]) expect(view.public).not.toHaveProperty(field);
    expect(JSON.stringify(view)).not.toContain('"state":');
    expect(await guestClient.send(command({ type: "starGarden.claimGoal", ...identity(initial, guest.playerId), goalId: "G01", origin: 0 }))).toMatchObject({ type: "command.ack" });
    const closed = await stored(host); expect(closed.game.phase).toBe("reveal"); expect(closed.scores.map((p) => p.score)).toEqual([2, 2]); expect(closed.game.history[0]!.claims.map((c) => c.points)).toEqual([2, 2]);
    await runInDurableObject(stubFor(host), (_instance, ctx) => expect(ctx.storage.getAlarm()).resolves.toBe(closed.game.deadlineAt));
    expect(await client.send({ type: "host.advance", requestId: crypto.randomUUID(), payload: {} })).toMatchObject({ type: "error" });
    expect(await client.send({ type: "host.backToArcade", requestId: crypto.randomUUID(), payload: {} })).toMatchObject({ type: "error" });
    expect(await guestClient.send({ type: "host.backToArcade", requestId: crypto.randomUUID(), payload: {} })).toMatchObject({ type: "error", payload: { code: "NOT_HOST" } });
    expect((await call(`/api/rooms/${host.roomCode}/join`, { displayName: "Late" })).status).toBe(409);
  });
  it("persists late deadline catchup despite rejected commands; reconnect cannot restore old metadata; alarms coexist", async () => {
    const { host, sessions, client } = await open(2);
    const before = (await stored(host)).game;
    await fixture(host, Date.now() - 500000);
    expect(await client.send(command({ type: "starGarden.doneRound", ...identity(before, host.playerId) }))).toMatchObject({ type: "error" });
    const completed = await stored(host); expect(completed.game.history).toHaveLength(6); expect(completed.metadata.roomPhase).toBe("results"); expect(completed.scores.every((p) => p.score === 0)).toBe(true);
    await connect(sessions[1]!); expect((await stored(host)).metadata.roomPhase).toBe("results");
    await runDurableObjectAlarm(stubFor(host)); expect((await stored(host)).game.history).toHaveLength(6);
    const alarm = await runInDurableObject(stubFor(host), (_instance, ctx) => ctx.storage.getAlarm());
    expect(alarm).toBeGreaterThan(Date.now());
    expect(await client.send({ type: "host.backToArcade", requestId: crypto.randomUUID(), payload: {} })).toMatchObject({ type: "command.ack" });
  });
  it("freezes disconnected setup seats, checks the live host for Begin, and rejects more than eight", async () => {
    const host = await create(); const guest = await (await call(`/api/rooms/${host.roomCode}/join`, { displayName: "Disconnected" })).json<RoomSessionResponse>();
    const client = await connect(host);
    await client.send({ type: "host.selectGame", requestId: crypto.randomUUID(), payload: { gameId: "star-garden" } });
    await client.send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} });
    const setup = (await stored(host)).game; expect(setup.roster).toContain(guest.playerId);
    const guestClient = await connect(guest);
    expect(await guestClient.send(command({ type: "starGarden.begin", ...identity(setup, guest.playerId), mode: "cup" }))).toMatchObject({ type: "error", payload: { code: "NOT_HOST" } });
    await runInDurableObject(stubFor(host), (_instance, ctx) => { ctx.storage.sql.exec("UPDATE players SET is_host = CASE WHEN id = ? THEN 1 ELSE 0 END", guest.playerId); });
    expect(await guestClient.send(command({ type: "starGarden.begin", ...identity(setup, guest.playerId), mode: "cup" }))).toMatchObject({ type: "command.ack" });
    const large = await create(); for (let i = 0; i < 8; i++) await call(`/api/rooms/${large.roomCode}/join`, { displayName: `Seat ${i}` });
    const largeClient = await connect(large); await largeClient.send({ type: "host.selectGame", requestId: crypto.randomUUID(), payload: { gameId: "star-garden" } });
    expect(await largeClient.send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} })).toMatchObject({ type: "error", payload: { code: "TOO_MANY_PLAYERS" } });
  });
});
