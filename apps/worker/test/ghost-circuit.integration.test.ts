import { env } from "cloudflare:workers";
import { abortAllDurableObjects, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import type { ClientMessage, RoomSessionResponse, ServerMessage, GhostCircuitCommand } from "@team-arcade/shared";
import type { GhostCircuitState } from "@team-arcade/games";
const testEnv = env as unknown as Env;
afterEach(async () => { await abortAllDurableObjects(); });
async function call(path: string, body: unknown) { return worker.fetch(new Request(`https://example.test${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), testEnv); }
async function create(): Promise<RoomSessionResponse> { return (await call("/api/rooms", { displayName: "Host" })).json<RoomSessionResponse>(); }
const stubFor = (session: RoomSessionResponse) => testEnv.ROOMS.get(testEnv.ROOMS.idFromName(session.roomCode));
async function stored(session: RoomSessionResponse) {
  return runInDurableObject(stubFor(session), (_instance, ctx) => {
    const row = [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")][0] as { json_value: string };
    const metadata = [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'metadata'")][0] as { json_value: string };
    return { game: (JSON.parse(row.json_value) as { state: GhostCircuitState }).state, metadata: JSON.parse(metadata.json_value) as { roomPhase: string }, scores: [...ctx.storage.sql.exec("SELECT id, score FROM players")] as unknown as Array<{ id: string; score: number }>, receipts: [...ctx.storage.sql.exec("SELECT * FROM processed_requests")] };
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
const command = (value: GhostCircuitCommand, requestId: string = crypto.randomUUID()): ClientMessage => ({ type: "game.command", requestId, payload: { command: value } });

import { GHOST_WITNESS_PATHS, layoutForPath } from "../../../packages/games/src/ghost-circuit/witnesses";
async function open(withGuest = false) {
 const host = await create();
 const guest = withGuest ? await (await call(`/api/rooms/${host.roomCode}/join`, { displayName: "Guest" })).json<RoomSessionResponse>() : null;
 const client = await connect(host);
 await client.send({ type: "host.selectGame", requestId: crypto.randomUUID(), payload: { gameId: "ghost-circuit" } });
 await client.send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} });
 return { host, client, guest };
}
const execute = (s: GhostCircuitState, layout = layoutForPath(GHOST_WITNESS_PATHS.basic)): GhostCircuitCommand => ({ type: "ghostCircuit.execute", gameInstanceId: s.gameInstanceId, contractId: "borrowed-identity", contentVersion: 1, rulesVersion: 1, expectedExecution: s.executions, layout });
describe("Ghost Circuit authority and recovery", () => {
 it("persists before ack, restores across DO eviction, refreshes exact duplicate, rejects altered/stale runs and continues improvement", async () => {
  const { host, client } = await open(); const before = (await stored(host)).game;
  const run = command(execute(before), "run-once");
  expect(await client.send(run)).toMatchObject({ type: "command.ack" });
  const accepted = await stored(host); expect(accepted.game).toMatchObject({ executions: 1, firstSuccess: 1, bestRating: "Basic", phase: "playing" }); expect(accepted.metadata.roomPhase).toBe("playing"); expect(accepted.scores[0]!.score).toBe(0);
  expect(await client.send(run)).toMatchObject({ type: "command.ack" }); await client.wait(m => m.type === "game.state"); expect(client.view()!.payload).toMatchObject({ public: { executions: 1 } });
  client.socket.close(); await evictDurableObject(stubFor(host)); const recovered = await connect(host);
  expect(await recovered.send(run)).toMatchObject({ type: "command.ack" }); expect((await stored(host)).game).toEqual(accepted.game);
  expect(await recovered.send(command(execute(before, []), "run-once"))).toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });
  expect(await recovered.send(command(execute(before)))).toMatchObject({ type: "error", payload: { code: "STALE_PHASE" } }); await recovered.wait(m => m.type === "game.state");
  expect(await recovered.send(command(execute(accepted.game, layoutForPath(GHOST_WITNESS_PATHS.full))))).toMatchObject({ type: "command.ack" });
  expect((await stored(host)).game).toMatchObject({ executions: 2, firstSuccess: 1, bestRating: "Full Haul" });
 });
 it("rejects invalid inventory/fixed nodes and unauthorized actors without accounting; counts real failure", async () => {
  const { host, client, guest } = await open(true); const initial = (await stored(host)).game;
  expect(await client.send(command(execute(initial, [{ cell: 0, kind: "straight", rotation: 1 }])))).toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });
  const over = layoutForPath(GHOST_WITNESS_PATHS.full).map(p => ({ ...p, kind: "straight" as const }));
  expect(await client.send(command(execute(initial, over)))).toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });
  const other = await connect(guest!);
  expect(await other.send(command(execute(initial)))).toMatchObject({ type: "error", payload: { code: "PLAYER_NOT_ACTIVE" } });
  expect((await stored(host)).game.executions).toBe(0);
  expect(await client.send(command(execute(initial, layoutForPath(GHOST_WITNESS_PATHS.detected))))).toMatchObject({ type: "command.ack" });
  expect((await stored(host)).game).toMatchObject({ executions: 1, latest: { result: { success: false } } });
 });
 it("serializes concurrent tabs and rejects replay after bounded receipt eviction", async () => {
  const { host, client } = await open(); const tab = await connect(host), initial = (await stored(host)).game;
  const original = command(execute(initial, []), "old-execution");
  const replies = await Promise.all([client.send(original), tab.send(command(execute(initial, [])))]);
  expect(replies.filter(r => r.type === "command.ack")).toHaveLength(1); expect((await stored(host)).game.executions).toBe(1);
  // Whichever tab won, retain the original stale payload and advance beyond both caches.
  for (let i = 0; i < 52; i++) expect(await client.send(command(execute((await stored(host)).game, [])))).toMatchObject({ type: "command.ack" });
  expect(await client.send(original)).toMatchObject({ type: "error", payload: { code: "STALE_PHASE" } }); expect((await stored(host)).game.executions).toBe(53);
  const receipts = await runInDurableObject(stubFor(host), (_instance, ctx) => JSON.parse(([...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'ghost-circuit-receipts'")][0] as {json_value:string}).json_value) as unknown[]);
  expect(receipts).toHaveLength(50);
 });
});
