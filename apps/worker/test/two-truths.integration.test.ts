import { env } from "cloudflare:workers";
import { abortAllDurableObjects, evictDurableObject, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import worker from "../src/index";
import type { Env } from "../src/types";
import type { ClientMessage, RoomSessionResponse, ServerMessage, TypedGameViewerState } from "@team-arcade/shared";
import type { TwoTruthsState } from "@team-arcade/games";
const testEnv = env as unknown as Env;
type View = Extract<TypedGameViewerState, { gameId: "two-truths" }>;
afterEach(async () => { await abortAllDurableObjects(); });
async function call(path: string, body: unknown) { return worker.fetch(new Request(`https://example.test${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), testEnv); }
async function create(): Promise<RoomSessionResponse> { return (await call("/api/rooms", { displayName: "Host" })).json<RoomSessionResponse>(); }
const stubFor = (session: RoomSessionResponse) => testEnv.ROOMS.get(testEnv.ROOMS.idFromName(session.roomCode));
async function stored(session: RoomSessionResponse) {
  return runInDurableObject(stubFor(session), (_instance, ctx) => {
    const row = [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'game'")][0] as { json_value: string };
    const metadata = [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'metadata'")][0] as { json_value: string };
    return { game: (JSON.parse(row.json_value) as { state: TwoTruthsState }).state, metadata: JSON.parse(metadata.json_value) as { roomPhase: string }, scores: [...ctx.storage.sql.exec("SELECT id, score FROM players")] as unknown as Array<{ id: string; score: number }>, receipts: [...ctx.storage.sql.exec("SELECT * FROM processed_requests")] };
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
const deck = { version: 1, participants: Array.from({ length: 7 }, (_, i) => ({ displayName: i === 0 ? "Host" : `Guest ${i}`, truths: [`Private fixture ${i} A`, `Private fixture ${i} B`], lie: `Private fixture ${i} C`, lieSource: "generated" })) };
async function open(preload = false) {
  const host = await create(), sessions = [host];
  const client = await connect(host);
  await client.send({ type: "host.selectGame", requestId: crypto.randomUUID(), payload: { gameId: "two-truths" } });
  await client.send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} });
  if (preload) expect((await upload(host, await payload(host))).status).toBe(200);
  for (let i = 1; i < 7; i++) sessions.push(await (await call(`/api/rooms/${host.roomCode}/join`, { displayName: `Guest ${i}` })).json());
  const clients = [client, ...await Promise.all(sessions.slice(1).map(connect))];
  return { host, sessions, clients, client };
}
const cmd = (s: TwoTruthsState, type: "twoTruths.begin" | "twoTruths.reveal" | "twoTruths.next", requestId: string = crypto.randomUUID()): ClientMessage => ({ type: "game.command", requestId, payload: { command: { type, gameInstanceId: s.gameInstanceId, phaseNonce: s.phaseNonce } } });
async function upload(session: RoomSessionResponse, body: unknown, token = session.sessionToken) {
  const response = await worker.fetch(new Request(`https://example.test/api/rooms/${session.roomCode}/two-truths/deck`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: typeof body === "string" ? body : JSON.stringify(body) }), testEnv);
  // Drain the forwarded HTTP body before test-only eviction. An unread proxy
  // response otherwise retains an in-flight DO request in the test runtime.
  return new Response(await response.arrayBuffer(), response);
}
async function payload(host: RoomSessionResponse) { const s = (await stored(host)).game; return { gameInstanceId: s.gameInstanceId, phaseNonce: s.phaseNonce, requestId: crypto.randomUUID(), deck }; }
describe("Two Truths DO import and scoring boundary", () => {
  it("runs five respondent rounds while both nonrespondent seats reconnect, vote and score", async () => {
    const { host, sessions, clients, client } = await open();
    const body = { ...await payload(host), deck: { ...deck, participants: deck.participants.slice(0, 5) } };
    expect((await upload(host, body)).status).toBe(200);
    let state = (await stored(host)).game;
    expect(await client.send(cmd(state, "twoTruths.begin"))).toMatchObject({ type: "command.ack" });
    const nonrespondent = await connect(sessions[6]!);
    for (let round = 0; round < 5; round++) {
      state = (await stored(host)).game;
      expect(state.playerIds).toHaveLength(7); expect(state.rounds).toHaveLength(5);
      const current = state.rounds[state.roundIndex]!;
      for (let i = 0; i < sessions.length; i++) {
        if (sessions[i]!.playerId === current.subjectPlayerId) continue;
        const voter = i === 6 ? nonrespondent : clients[i]!;
        const message: ClientMessage = { type: "game.command", requestId: crypto.randomUUID(), payload: { command: { type: "twoTruths.submitGuess", gameInstanceId: state.gameInstanceId, phaseNonce: state.phaseNonce, option: current.lieOption } } };
        expect(await voter.send(message)).toMatchObject({ type: "command.ack" });
      }
      state = (await stored(host)).game; expect(state.phase).toBe("reveal");
      expect(await client.send(cmd(state, "twoTruths.next"))).toMatchObject({ type: "command.ack" });
    }
    const final = await stored(host); expect(final.game.phase).toBe("gameResults");
    for (let i = 0; i < sessions.length; i++) expect(final.scores.find(p => p.id === sessions[i]!.playerId)?.score).toBe(i < 5 ? 4 : 5);
  });

  it("prepares with only the host, admits six later seats, and freezes admission at Begin", async () => {
    const { host, client } = await open(true);
    const s = (await stored(host)).game; expect(s.deck).toEqual(deck);
    expect((await call(`/api/rooms/${host.roomCode}/join`, { displayName: "Guest 1" })).status).toBe(409);
    const [joining, begun] = await Promise.all([
      call(`/api/rooms/${host.roomCode}/join`, { displayName: "Racing seat" }),
      client.send(cmd(s, "twoTruths.begin"))
    ]);
    expect([201, 409]).toContain(joining.status); expect(begun).toMatchObject({ type: "command.ack" });
    const frozen = (await stored(host)).game; expect(frozen.playerIds).toHaveLength(7); expect(frozen.phase).toBe("guessing");
    expect((await call(`/api/rooms/${host.roomCode}/join`, { displayName: "Too late" })).status).toBe(409);
    if (joining.status === 201) {
      const session = await joining.json<RoomSessionResponse>(); const watcher = await connect(session);
      const message = await watcher.wait(m => m.type === "game.state");
      expect((message.payload as View).private.canGuess).toBe(false);
      expect(frozen.playerIds).not.toContain(session.playerId);
    }
  });

  it("rechecks current host and expiry after delayed streamed body; rejects stale setup and wrong game", async () => {
    const { host, sessions, client } = await open(); const body = await payload(host);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; c.enqueue(new TextEncoder().encode(JSON.stringify(body).slice(0, 50))); } });
    const pending = worker.fetch(new Request(`https://example.test/api/rooms/${host.roomCode}/two-truths/deck`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${host.sessionToken}` }, body: stream }), testEnv);
    await runInDurableObject(stubFor(host), (_instance, ctx) => {
      ctx.storage.sql.exec("UPDATE players SET is_host = CASE WHEN id = ? THEN 1 ELSE 0 END", sessions[1]!.playerId);
    });
    controller.enqueue(new TextEncoder().encode(JSON.stringify(body).slice(50))); controller.close();
    expect((await pending).status).toBe(403);
    await runInDurableObject(stubFor(host), (_instance, ctx) => {
      ctx.storage.sql.exec("UPDATE players SET is_host = CASE WHEN id = ? THEN 1 ELSE 0 END", host.playerId);
    });
    await client.send({ type: "host.backToArcade", requestId: crypto.randomUUID(), payload: {} });
    expect((await upload(host, body)).status).toBe(409);
    await client.send({ type: "host.selectGame", requestId: crypto.randomUUID(), payload: { gameId: "two-truths" } });
    await client.send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} });
    expect((await upload(host, body)).status).toBe(409);
    const current = await payload(host);
    await runInDurableObject(stubFor(host), (_instance, ctx) => {
      const row = [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'metadata'")][0] as { json_value: string };
      const metadata = JSON.parse(row.json_value) as { lastActivityAt: number }; metadata.lastActivityAt = Date.now() - 13 * 60 * 60 * 1000;
      ctx.storage.sql.exec("UPDATE room_state SET json_value = ? WHERE key = 'metadata'", JSON.stringify(metadata));
    });
    expect((await upload(host, current)).status).toBe(410);
  });

  it("rejects unauthenticated/non-host, malformed/oversize/wrong-instance imports without echo or mutation; only one upload wins", async () => {
    const { host, sessions } = await open(); const body = await payload(host);
    expect((await upload(host, body, "invalid")).status).toBe(401);
    expect((await upload(sessions[1]!, body)).status).toBe(403);
    const malformed = await upload(host, '{"secret text":'); expect(malformed.status).toBe(400); expect(await malformed.text()).not.toContain("secret text");
    expect((await upload(host, "x".repeat(33_000))).status).toBe(413);
    expect((await upload(host, { ...body, gameInstanceId: crypto.randomUUID() })).status).toBe(409);
    expect((await upload(host, { ...body, deck: { ...deck, participants: [] } })).status).toBe(400);
    expect((await stored(host)).game.deck).toBeNull();
    const responses = await Promise.all([upload(host, body), upload(host, { ...body, requestId: crypto.randomUUID() })]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const saved = (await stored(host)).game; expect(saved.deck).toEqual(deck); expect(saved.phaseNonce).toBe(1);
    expect((await upload(host, body)).status).toBe(200);
    expect((await upload(host, { ...body, phaseNonce: 1 })).status).toBe(409);
    const response = await upload(host, body); expect(await response.text()).toBe('{"accepted":true}');
    const secretReceipts = await runInDurableObject(stubFor(host), (_instance, ctx) => [...ctx.storage.sql.exec("SELECT json_value FROM room_state WHERE key = 'two-truths-receipts'")]);
    expect(JSON.stringify(secretReceipts)).not.toContain("Private fixture");
  });
  it("withholds keys/future statements, scores once under final-vote/host-close race, and survives eviction and replay", async () => {
    const { host, sessions, clients, client } = await open();
    const body = await payload(host); expect((await upload(host, body)).status).toBe(200);
    const setup = (await stored(host)).game;
    expect(await clients[1]!.send(cmd(setup, "twoTruths.begin"))).toMatchObject({ type: "error", payload: { code: "NOT_HOST" } });
    expect(await client.send(cmd(setup, "twoTruths.begin"))).toMatchObject({ type: "command.ack" });
    let s = (await stored(host)).game;
    const initial = s; const current = s.rounds[0]!;
    for (const c of clients) {
      const message = await c.wait(m => m.type === "game.state" && (m.payload as View).phase === "guessing");
      const v = message.payload as View;
      expect(v.public).not.toHaveProperty("lieOption"); expect(v.public).not.toHaveProperty("deck"); expect(v.public).not.toHaveProperty("guesses");
      const future = s.rounds[1]!.statements[0]!; expect(JSON.stringify(v)).not.toContain(future);
    }
    const eligible = sessions.map((p, i) => ({ p, c: clients[i]! })).filter(x => x.p.playerId !== current.subjectPlayerId);
    const first = eligible[0]!;
    const guess = (option: number, requestId: string = crypto.randomUUID()): ClientMessage => ({ type: "game.command", requestId, payload: { command: { type: "twoTruths.submitGuess", gameInstanceId: s.gameInstanceId, phaseNonce: s.phaseNonce, option } } });
    const locked = guess(current.lieOption, "tt-first");
    expect(await first.c.send(locked)).toMatchObject({ type: "command.ack" });
    expect(await first.c.send(locked)).toMatchObject({ type: "command.ack" });
    expect(await first.c.send(guess((current.lieOption + 1) % 3, "tt-first"))).toMatchObject({ type: "error", payload: { code: "INVALID_COMMAND" } });
    for (const x of eligible.slice(1, 5)) expect(await x.c.send(guess(current.lieOption))).toMatchObject({ type: "command.ack" });
    const last = eligible[5]!;
    await Promise.all([last.c.send(guess(current.lieOption)), client.send(cmd(s, "twoTruths.reveal"))]);
    s = (await stored(host)).game;
    expect(s.phase).toBe("reveal"); const scores = (await stored(host)).scores;
    expect(scores.reduce((a, p) => a + p.score, 0)).toBeGreaterThanOrEqual(5); expect(scores.reduce((a, p) => a + p.score, 0)).toBeLessThanOrEqual(6);
    expect(await client.send(cmd(initial, "twoTruths.reveal"))).toMatchObject({ type: "error", payload: { code: "STALE_PHASE" } });
    expect(await client.send({ type: "host.advance", requestId: crypto.randomUUID(), payload: {} })).toMatchObject({ type: "error" });
    expect((await stored(host)).scores).toEqual(scores);
    await evictDurableObject(stubFor(host));
    expect((await stored(host)).game).toEqual(s);
    const recovered = await connect(host);
    expect(await recovered.send(cmd(s, "twoTruths.next"))).toMatchObject({ type: "command.ack" });
    expect((await stored(host)).game.roundIndex).toBe(1);
    expect((await stored(host)).scores).toEqual(scores);
  });
});
