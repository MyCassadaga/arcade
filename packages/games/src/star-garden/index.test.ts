import { describe, expect, it } from "vitest";
import { starGardenCommandSchema } from "@team-arcade/shared";
import type { StarGardenCommand, StarGardenEffect, StarGardenMode, StarKind } from "@team-arcade/shared";
import { STAR_GARDEN_ACTIONS, STAR_GARDEN_GOALS, STAR_GARDEN_PATH, STAR_GARDEN_TIERS, advanceStarGardenDue, createStarGardenState, currentStarGardenGoals, fnv1a, getStarGardenPrivateView, getStarGardenPublicView, handleStarGardenCommand, matchStarGardenGoal, nextStarGardenInteger, previewStarGardenAction, refillStars, starGardenDeck, starGardenMatches, starGardenShuffle, transformStars } from ".";
import type { StarGardenState } from ".";
const instance = "00000000-0000-4000-8000-000000000031";
const now = Date.UTC(2026, 8, 28, 12);
const setup = (count = 1) => createStarGardenState({ now, random: () => { throw Error("ambient random"); }, players: Array.from({ length: count }, (_, i) => ({ id: `p${i}`, displayName: `P${i}`, isHost: i === 0, connected: i === 0, score: 0 })) }, instance);
const identity = (s: StarGardenState, actor = "p0") => ({ gameInstanceId: s.gameInstanceId, roundNumber: s.roundNumber, expectedRevision: s.players[actor]!.revision });
const start = (count = 1, mode: StarGardenMode = count === 1 ? "daily" : "cup", time = now, seed = "seed") => {
  const s = setup(count);
  return handleStarGardenCommand(s, { type: "starGarden.begin", ...identity(s), mode }, "p0", time, true, seed).state;
};
const apply = (s: StarGardenState, command: StarGardenCommand, actor = "p0", time = now + 1) => handleStarGardenCommand(s, command, actor, time, actor === "p0", "seed");
const done = (s: StarGardenState, actor: string, time = now + 1) => apply(s, { type: "starGarden.doneRound", ...identity(s, actor) }, actor, time);
function fixture(pattern: string, origin = 0, a: StarKind = 0, b: StarKind = 1): StarKind[] {
  const board: StarKind[] = Array<StarKind>(10).fill(2);
  pattern.split("/").forEach((row, r) => [...row].forEach((letter, c) => { if (letter !== ".") board[origin + r * 5 + c] = letter === "A" ? a : b; }));
  return board;
}
export const defaultEffect = (action: StarGardenEffect["action"]): StarGardenEffect => {
  switch (action) {
    case "exchange": case "blink": case "echo": return { action, source: 0, target: 1 };
    case "spin": return { action, origin: 0, direction: "clockwise" };
    case "scramble": return { action, origin: 0, permutation: [1, 2, 0] };
    case "mutation": case "collapse": return { action, target: 0 };
    case "drift": return { action, row: 0, direction: "right" };
    case "mirror": return { action, row: 0 };
    case "crosswind": return { action, direction: "left" };
  }
};
function availableFixture(s: StarGardenState, id: string) {
  const goal = STAR_GARDEN_GOALS.find((g) => g.id === id)!;
  s.lanes[goal.tier] = [goal.id, ...s.lanes[goal.tier].filter((g) => g !== id)];
  for (const p of Object.values(s.players)) p.board = fixture(goal.pattern);
  return goal;
}
const claim = (s: StarGardenState, id: string, actor = "p0", time = now + 1, origin = 0) => apply(s, { type: "starGarden.claimGoal", ...identity(s, actor), goalId: id, origin }, actor, time);

describe("Star Garden published v1 content and geometry", () => {
  it("has the exact frozen 30-goal catalog and 60 unique physical cards in construction order", () => {
    expect(STAR_GARDEN_GOALS.map((g) => `${g.id}:${g.name}:${g.points}:${g.pattern}`).join("|" )).toBe("G01:Ember:2:AAA|G02:Sprig:2:AA/A.|G03:Hook:2:AA/.A|G04:Arrow:3:A.A/.A.|G05:Kite:3:.A./A.A|G06:Rhythm:1:ABA|G07:Pairlight:3:AA/BB|G08:Offset:3:AA./.BB|G09:Braids:3:AB/AB|G10:Switchback:3:AB/BA|G11:Flare:4:AAAA|G12:Hearth:4:AA/AA|G13:Shelter:5:AAA/.A.|G14:Chalice:5:A.A/AA.|G15:Ribbon:6:AA../..AA|G16:Duet:6:AAABB|G17:Signal:5:AAB/BB.|G18:Portal:5:A.A/BBB|G19:Pennant:5:ABB/AA.|G20:Stepstone:5:ABA/.BB|G21:Horizon:7:AAAAA|G22:Lantern:7:AAA/AA.|G23:Crown:7:A.A/AAA|G24:Sail:7:AA../.AAA|G25:Bridge:8:A...A/.AAA.|G26:Weave:7:ABA/BAB|G27:Sunroom:9:AAA/AAA|G28:Fireflies:9:AA.A/A.AA|G29:Starfall:8:A.A.A/.A.A.|G30:Starhouse:10:AAAA/A.AA");
    expect(new Set(STAR_GARDEN_GOALS.map((g) => g.id)).size).toBe(30);
    expect(STAR_GARDEN_ACTIONS.map((a) => a.copies)).toEqual([10, 8, 4, 8, 6, 6, 6, 4, 4, 4]);
    const deck = starGardenDeck(); expect(deck).toHaveLength(60); expect(new Set(deck.map((c) => c.id)).size).toBe(60);
    for (const tier of STAR_GARDEN_TIERS) expect(STAR_GARDEN_GOALS.filter((g) => g.tier === tier)).toHaveLength(10);
    for (const action of STAR_GARDEN_ACTIONS) expect(deck.filter((c) => c.action === action.id)).toHaveLength(action.copies);
  });
  for (const goal of STAR_GARDEN_GOALS) it(`${goal.id} has rectangular, translated, color-substitutable positive and negative fixtures`, () => {
    const rows = goal.pattern.split("/"); const width = rows[0]!.length;
    expect(rows.length).toBeLessThanOrEqual(2); expect(width).toBeLessThanOrEqual(5); expect(width).toBeGreaterThan(0);
    expect(rows.every((r) => r.length === width && /^[AB.]+$/u.test(r))).toBe(true);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
      if (a === b) continue;
      for (let r = 0; r <= 2 - rows.length; r++) for (let c = 0; c <= 5 - width; c++) {
        const origin = r * 5 + c; const board = fixture(goal.pattern, origin, a as StarKind, b as StarKind);
        const cells = matchStarGardenGoal(board, goal, origin)!;
        expect(cells.length).toBe(goal.pattern.replace(/[^AB]/gu, "").length);
        const negative = [...board]; negative[cells[0]!] = ((board[cells[0]!]! + 1) % 4) as StarKind;
        expect(matchStarGardenGoal(negative, goal, origin)).toBeNull();
        if (goal.pattern.includes("B")) expect(matchStarGardenGoal(fixture(goal.pattern, origin, a as StarKind, a as StarKind), goal, origin)).toBeNull();
        for (const i of Array.from({ length: 10 }, (_, i) => i).filter((i) => !cells.includes(i))) board[i] = a as StarKind;
        expect(matchStarGardenGoal(board, goal, origin)).toEqual(cells);
      }
    }
    expect(matchStarGardenGoal(fixture(goal.pattern), goal, 9)).toBeNull();
    expect(matchStarGardenGoal(fixture(goal.pattern), goal, -1)).toBeNull();
  });
  it("does not rotate, reflect or wrap; exposes overlapping and either-row matches", () => {
    const sprig = STAR_GARDEN_GOALS[1]!;
    expect(matchStarGardenGoal(fixture("AA/.A"), sprig, 0)).toBeNull();
    expect(matchStarGardenGoal(fixture(".A/AA"), sprig, 0)).toBeNull();
    expect(starGardenMatches(Array<StarKind>(10).fill(0), STAR_GARDEN_GOALS[0]!)).toEqual([0, 1, 2, 5, 6, 7]);
  });
});
describe("Star Garden RNG, flow and actions", () => {
  it("matches the FNV and xorshift reference vectors, shuffle and stream isolation", () => {
    expect(fnv1a("hello")).toBe(0x4f9f2cab);
    const rng = { state: 1 }; expect(Array.from({ length: 5 }, () => nextStarGardenInteger(rng))).toEqual([270369, 67634689, 2647435461, 307599695, 2398689233]);
    expect(starGardenShuffle([0, 1, 2, 3], { state: 1 })).toEqual([2, 1, 3, 0]);
    expect(fnv1a("root:stars")).not.toBe(fnv1a("root:actions"));
  });
  it("implements labeled downstream order for single/multiple/all removals", () => {
    const board: string[] = Array<string>(10); STAR_GARDEN_PATH.forEach((cell, i) => { board[cell] = "abcdefghij"[i]!; });
    const draws = ["x", "y", "z"];
    const result = refillStars(board, [1, 4, 6], () => draws.shift()!);
    expect(STAR_GARDEN_PATH.map((i) => result[i]).join("")).toBe("zyxacdfghj");
    for (const removed of [[0], [5], [4, 9], [...STAR_GARDEN_PATH], []]) {
      let n = 0; const result = refillStars(board, removed, () => `new${++n}`);
      expect(n).toBe(removed.length);
      expect(STAR_GARDEN_PATH.map((i) => result[i]).slice(removed.length)).toEqual(STAR_GARDEN_PATH.filter((i) => !removed.includes(i)).map((i) => board[i]));
    }
    expect(() => refillStars(board, [0, 0], () => "x")).toThrow();
  });
  it("implements exact permutations, wrapping, echo and positional validation", () => {
    const board = [..."abcdefghij"];
    const run = (effect: StarGardenEffect) => transformStars(board, effect, () => "x", () => "y").join("");
    expect(run({ action: "exchange", source: 0, target: 5 })).toBe("fbcdeaghij");
    expect(run({ action: "blink", source: 0, target: 9 })).toBe("jbcdefghia");
    expect(run({ action: "spin", origin: 0, direction: "clockwise" })).toBe("facdeg bhij".replace(" ", ""));
    expect(run({ action: "spin", origin: 0, direction: "counterclockwise" })).toBe("bgcdeafhij");
    expect(run({ action: "scramble", origin: 6, permutation: [2, 0, 1] })).toBe("abcdefighj");
    expect(run({ action: "mutation", target: 4 })).toBe("abcdyfghij");
    expect(run({ action: "drift", row: 0, direction: "left" })).toBe("bcdeafghij");
    expect(run({ action: "drift", row: 1, direction: "right" })).toBe("abcdejfghi");
    expect(run({ action: "mirror", row: 1 })).toBe("abcdejihgf");
    expect(run({ action: "crosswind", direction: "right" })).toBe("eabcdghijf");
    expect(run({ action: "crosswind", direction: "left" })).toBe("bcdeajfghi");
    expect(run({ action: "echo", source: 0, target: 5 })).toBe("abcdeaghij");
    for (const effect of [
      { action: "exchange", source: 4, target: 5 }, { action: "exchange", source: 0, target: 6 }, { action: "blink", source: 0, target: 0 },
      { action: "echo", source: 4, target: 5 }, { action: "spin", origin: 4, direction: "clockwise" }, { action: "spin", origin: 0, direction: "left" },
      { action: "scramble", origin: 3, permutation: [1, 2, 0] }, { action: "scramble", origin: 0, permutation: [0, 1, 2] }, { action: "scramble", origin: 0, permutation: [1, 1, 0] },
      { action: "mutation", target: 10 }, { action: "collapse", target: -1 }, { action: "drift", row: 2, direction: "left" }, { action: "mirror", row: -1 }, { action: "crosswind", direction: "up" }
    ]) expect(() => run(effect as StarGardenEffect)).toThrow();
    expect(board.join("")).toBe("abcdefghij");
  });
  it("previews random values as unknown; legal no-ops spend cards without draws", () => {
    for (const action of STAR_GARDEN_ACTIONS) {
      const s = start(); s.players.p0!.board.fill(0); s.players.p0!.hand = [{ id: "test", action: action.id }];
      const before = structuredClone(s); const effect = defaultEffect(action.id);
      const preview = previewStarGardenAction(s.players.p0!.board, effect);
      expect(s).toEqual(before);
      expect(preview.filter((x) => x === null)).toHaveLength(["mutation", "collapse"].includes(action.id) ? 1 : 0);
      const next = apply(s, { type: "starGarden.playCard", ...identity(s), cardId: "test", effect }).state.players.p0!;
      expect(next.hand).toHaveLength(0); expect(next.discard).toHaveLength(1); expect(next.actionsSpent).toBe(1); expect(next.drawCursor).toBe(before.players.p0!.drawCursor);
      if (action.id === "mutation") expect(next.board[0]).not.toBe(0);
    }
  });
});
describe("Star Garden solo and Daily", () => {
  it("freezes UTC date and yields the same gameplay across identities, seeds, serialization and midnight", () => {
    const a = start(1, "daily", now, "a"), b = start(1, "daily", now + 3600000, "b");
    b.gameInstanceId = "00000000-0000-4000-8000-000000000032"; b.players.other = b.players.p0!; delete b.players.p0; b.roster = ["other"];
    const card = a.players.p0!.hand[0]!;
    const nextA = apply(a, { type: "starGarden.playCard", ...identity(a), cardId: card.id, effect: defaultEffect(card.action) }, "p0", now + 86400000).state;
    const nextB = apply(JSON.parse(JSON.stringify(b)) as StarGardenState, { type: "starGarden.playCard", ...identity(b, "other"), cardId: card.id, effect: defaultEffect(card.action) }, "other", now + 86400000).state;
    expect(nextA.players.p0).toEqual(nextB.players.other); expect(nextA.lanes).toEqual(nextB.lanes); expect(nextA.dailyDate).toBe("2026-09-28");
    expect(start(1, "practice", now, "a").players.p0).not.toEqual(start(1, "practice", now, "b").players.p0);
  });
  it("caps claim rewards, retires only one lane, permits zero-card claims and does not end on a last-card match", () => {
    let s = start(); expect(s.players.p0!.hand).toHaveLength(5); availableFixture(s, "G01");
    s = claim(s, "G01").state; expect(s.players.p0!.hand).toHaveLength(5); expect(s.players.p0!.score).toBe(2); expect(s.laneCursors).toEqual({ easy: 1, medium: 0, hard: 0 });
    s = start(); availableFixture(s, "G01"); s.players.p0!.hand = [{ id: "exchange-1", action: "exchange" }];
    s = apply(s, { type: "starGarden.playCard", ...identity(s), cardId: "exchange-1", effect: { action: "exchange", source: 0, target: 1 } }).state;
    expect(s.phase).toBe("playing"); expect(s.players.p0!.hand).toHaveLength(0);
    s = claim(s, "G01").state; expect(s.players.p0!.hand).toHaveLength(2);
    s.laneCursors.easy = 10; expect(currentStarGardenGoals(s).map((g) => g.tier)).toEqual(["medium", "hard"]);
  });
  it("ends only on actual empty/no-match, all 30, or explicit End Run; Refresh costs three", () => {
    let s = start(); availableFixture(s, "G06"); s.lanes.medium = []; s.lanes.hard = [];
    s.players.p0!.board.fill(0); s.players.p0!.hand = [{ id: "mirror-1", action: "mirror" }];
    s = apply(s, { type: "starGarden.playCard", ...identity(s), cardId: "mirror-1", effect: { action: "mirror", row: 0 } }).state;
    expect(s.endingReason).toBe("out-of-cards");
    s = start(); const cards = s.players.p0!.hand.slice(0, 3).map((c) => c.id) as [string, string, string]; const cursor = s.players.p0!.drawCursor;
    s = apply(s, { type: "starGarden.refresh", ...identity(s), cardIds: cards }).state;
    expect(s.players.p0).toMatchObject({ actionsSpent: 3, drawCursor: cursor }); expect(s.players.p0!.hand).toHaveLength(2); expect(s.players.p0!.discard).toHaveLength(3);
    s = apply(s, { type: "starGarden.endRun", ...identity(s) }).state; expect(s.endingReason).toBe("ended");
    s = start(); availableFixture(s, "G01"); s.players.p0!.goalsClaimed = 29; s.laneCursors = { easy: 0, medium: 10, hard: 10 }; s.lanes.easy = ["G01"];
    s = claim(s, "G01").state; expect(s.endingReason).toBe("all-goals"); expect(s.players.p0!.goalsClaimed).toBe(30);
  });
  it("reshuffles only discard deterministically, keeping held copies separate", () => {
    const s = start(); availableFixture(s, "G01"); const p = s.players.p0!;
    p.drawPile = []; p.drawCursor = 0; p.hand = starGardenDeck().slice(0, 3); p.discard = starGardenDeck().slice(3);
    const a = claim(s, "G01").state; const b = claim(structuredClone(s), "G01").state;
    expect(a).toEqual(b); expect(a.players.p0!.hand).toHaveLength(5); expect(a.players.p0!.drawPile).toHaveLength(57);
    expect(a.players.p0!.drawPile.some((c) => p.hand.some((h) => h.id === c.id))).toBe(false);
  });
});
describe("Star Garden Cup and authority", () => {
  for (const count of [2, 8]) it(`${count} seats share starts and independently claim, then complete six scheduled rounds`, () => {
    let s = start(count); expect(s.roster).toHaveLength(count);
    for (const p of Object.values(s.players)) expect(p).toEqual(s.players.p0);
    availableFixture(s, "G01"); const other = structuredClone(s.players.p1);
    const first = claim(s, "G01"); s = first.state; expect(first.scoreDelta).toEqual({}); expect(s.players.p1).toEqual(other);
    expect(getStarGardenPublicView(s).standings.every((p) => p.score === 0)).toBe(true);
    expect(getStarGardenPublicView(s).readiness.p0).toBe(true); expect(getStarGardenPublicView(s).history).toEqual([]);
    for (let i = 1; i < count; i++) s = claim(s, "G01", `p${i}`, now + 2).state;
    expect(s.phase).toBe("reveal"); expect(s.deadlineAt).toBe(now + 6002); expect(s.history[0]!.claims.every((c) => c.points === 2)).toBe(true);
    expect(advanceStarGardenDue(s, now + 6001).state).toBe(s);
    s = advanceStarGardenDue(s, now + 6002).state; expect(s.roundNumber).toBe(2); expect(s.deadlineAt).toBe(now + 81002);
    expect(s.players.p0!.remainingActions).toBe(3); expect(s.players.p0!.hand).toHaveLength(5);
    s = advanceStarGardenDue(s, now + 999999).state; expect(s.history).toHaveLength(6); expect(s.phase).toBe("gameResults");
    expect(s.history.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4, 5, 6]); expect(getStarGardenPublicView(s).standings.every((p) => p.rank === 1)).toBe(true);
    for (const tier of STAR_GARDEN_TIERS) expect(new Set(s.lanes[tier].slice(0, 6)).size).toBe(6);
    expect(advanceStarGardenDue(s, now + 1000000).state).toBe(s);
  });
  it("allows claim after all three actions/Refresh, no replacement on claims, then locks", () => {
    let s = start(2); availableFixture(s, "G01");
    s.players.p0!.hand = starGardenDeck().slice(0, 5);
    for (let i = 0; i < 3; i++) s = apply(s, { type: "starGarden.playCard", ...identity(s), cardId: s.players.p0!.hand[0]!.id, effect: { action: "exchange", source: 0, target: 1 } }).state;
    expect(s.players.p0!.remainingActions).toBe(0); expect(s.players.p0!.done).toBe(false);
    expect(() => apply(s, { type: "starGarden.playCard", ...identity(s), cardId: s.players.p0!.hand[0]!.id, effect: { action: "exchange", source: 0, target: 1 } })).toThrow(/allowances/);
    s = claim(s, "G01").state; expect(s.players.p0!.hand).toHaveLength(2); expect(currentStarGardenGoals(s).some((g) => g.id === "G01")).toBe(true);
    expect(() => claim(s, "G01")).toThrow(/closed/);
    let refresh = start(2); const ids = refresh.players.p0!.hand.slice(0, 3).map((c) => c.id) as [string, string, string];
    refresh = apply(refresh, { type: "starGarden.refresh", ...identity(refresh), cardIds: ids }).state;
    expect(refresh.players.p0).toMatchObject({ remainingActions: 0, done: false, actionsSpent: 3 });
    expect(() => apply(s, { type: "starGarden.endRun", ...identity(s) })).toThrow();
  });
  it("enforces exact deadlines, retains boards on timeout, and ranks goals then fewer actions with shared ties", () => {
    const s = start(2); const card = s.players.p0!.hand[0]!;
    const changed = apply(s, { type: "starGarden.playCard", ...identity(s), cardId: card.id, effect: defaultEffect(card.action) }, "p0", now + 74999).state;
    expect(() => done(changed, "p0", now + 75000)).toThrow(/closed/);
    const closed = advanceStarGardenDue(changed, now + 75000);
    expect(closed.state.history[0]!.closedAt).toBe(now + 75000); expect(closed.state.players.p0!.board).toEqual(changed.players.p0!.board);
    expect(closed.scoreDelta).toEqual({ p0: 0, p1: 0 });
    expect(getStarGardenPublicView(closed.state).standings[0]!.playerId).toBe("p1");
    const later = advanceStarGardenDue(closed.state, now + 81000).state; expect(later.deadlineAt).toBe(now + 156000);
    later.players.p0!.score = 10; later.players.p1!.score = 10; later.players.p0!.goalsClaimed = 2; later.players.p1!.goalsClaimed = 1;
    expect(getStarGardenPublicView(later).standings[0]!.playerId).toBe("p0");
  });
  it("strictly rejects illegal schemas, identity, phase, ownership, mode, round, revisions and host without mutation", () => {
    const s = start(2); const before = JSON.stringify(s); const card = s.players.p0!.hand[0]!;
    const cmd: StarGardenCommand = { type: "starGarden.playCard", ...identity(s), cardId: card.id, effect: defaultEffect(card.action) };
    for (const patch of [{ expectedRevision: 0 }, { roundNumber: 2 }, { gameInstanceId: "00000000-0000-4000-8000-000000000032" }, { cardId: "not-owned" }, { extra: true }, { board: [] }]) expect(() => apply(s, { ...cmd, ...patch })).toThrow();
    expect(starGardenCommandSchema.safeParse({ ...cmd, expectedRevision: -1 }).success).toBe(false);
    expect(starGardenCommandSchema.safeParse({ ...cmd, effect: { action: "collapse", target: 100 } }).success).toBe(false);
    expect(() => apply(s, cmd, "outsider")).toThrow(); expect(JSON.stringify(s)).toBe(before);
    const initial = setup(2); expect(() => handleStarGardenCommand(initial, { type: "starGarden.begin", ...identity(initial, "p1"), mode: "cup" }, "p1", now, false, "x")).toThrow(/host/);
    expect(() => handleStarGardenCommand(initial, { type: "starGarden.begin", ...identity(initial), mode: "daily" }, "p0", now, true, "x")).toThrow(/2–8/);
    expect(() => setup(9)).toThrow(/eight/);
    expect(() => done(start(), "p0")).toThrow(/Cup/);
    const publicText = JSON.stringify(getStarGardenPublicView(s));
    for (const secret of ["board", "hand", "pending", "drawPile", "stars", "goalStreams", "lanes", "seed"]) expect(publicText).not.toContain(`"${secret}"`);
    expect(getStarGardenPrivateView(s, "p1").board).not.toBe(s.players.p1!.board);
  });
});

it("runs 200 bounded seeded legal-action simulations with invariants (current-match greedy, otherwise first-card fixed targets)", () => {
  const scores: number[] = [], lengths: number[] = [], goals: number[] = [];
  for (let seed = 0; seed < 200; seed++) {
    let s = start(1, "practice", now, `simulation-${seed}`); let steps = 0;
    while (s.phase === "playing" && steps < 200) {
      const p = s.players.p0!;
      const match = currentStarGardenGoals(s).sort((a, b) => b.points - a.points).map((goal) => ({ goal, origins: starGardenMatches(p.board, goal) })).find((m) => m.origins.length);
      if (match) s = claim(s, match.goal.id, "p0", now + steps, match.origins[0]).state;
      else { const card = p.hand[0]!; s = apply(s, { type: "starGarden.playCard", ...identity(s), cardId: card.id, effect: defaultEffect(card.action) }).state; }
      steps++;
      const next = s.players.p0!;
      expect(next.board).toHaveLength(10); expect(next.board.every((k) => k >= 0 && k <= 3)).toBe(true); expect(next.hand.length).toBeLessThanOrEqual(5);
      const owned = [...next.hand, ...next.drawPile.slice(next.drawCursor), ...next.discard]; expect(owned).toHaveLength(60); expect(new Set(owned.map((c) => c.id)).size).toBe(60);
      expect(next.score).toBeGreaterThanOrEqual(p.score); expect(next.revision).toBeGreaterThan(p.revision);
    }
    expect(s.phase).toBe("gameResults"); expect(steps).toBeLessThan(200);
    scores.push(s.players.p0!.score); lengths.push(s.players.p0!.actionsSpent); goals.push(s.players.p0!.goalsClaimed);
  }
  const distribution = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return { min: sorted[0], median: sorted[100], p90: sorted[180], max: sorted[199], mean: values.reduce((a, b) => a + b, 0) / values.length }; };
  console.info("STAR_GARDEN_SIMULATION", JSON.stringify({ runs: 200, policy: "claim highest-point current match, earliest origin; otherwise first card, fixed legal targets; no future search", score: distribution(scores), actions: distribution(lengths), goals: distribution(goals) }));
});

it("claims all 30 unique goals through all three lanes, scoring each once and exhausting without substitutions", () => {
  let s = start(); let total = 0;
  for (const tier of STAR_GARDEN_TIERS) {
    for (let i = 0; i < 10; i++) {
      const goal = currentStarGardenGoals(s).find((g) => g.tier === tier)!;
      s.players.p0!.board = fixture(goal.pattern);
      const result = claim(s, goal.id); total += goal.points;
      expect(result.scoreDelta).toEqual({ p0: goal.points }); s = result.state;
      expect(s.players.p0!.score).toBe(total); expect(s.players.p0!.hand.length).toBeLessThanOrEqual(5);
    }
    expect(currentStarGardenGoals(s).some((g) => g.tier === tier)).toBe(false);
  }
  expect(s.phase).toBe("gameResults"); expect(s.endingReason).toBe("all-goals"); expect(s.players.p0!.goalsClaimed).toBe(30);
  expect(total).toBe(STAR_GARDEN_GOALS.reduce((sum, g) => sum + g.points, 0));
});

it("retains committed Cup boards/unused hand, draws only missing cards at next scheduled round, and isolates action RNG", () => {
  let s = start(2); const other = structuredClone(s.players.p1), card = s.players.p0!.hand[0]!;
  const actionStream = s.players.p0!.actions.state;
  s = apply(s, { type: "starGarden.playCard", ...identity(s), cardId: card.id, effect: defaultEffect(card.action) }).state;
  expect(s.players.p1).toEqual(other); expect(s.players.p0!.actions.state).toBe(actionStream);
  const board = [...s.players.p0!.board], retained = [...s.players.p0!.hand];
  s = done(s, "p0").state; s = done(s, "p1", now + 20).state;
  s = advanceStarGardenDue(s, now + 6020).state;
  expect(s.players.p0!.board).toEqual(board); expect(s.players.p0!.hand.slice(0, 4)).toEqual(retained); expect(s.players.p0!.hand).toHaveLength(5);
  expect(s.players.p0!.remainingActions).toBe(3); expect(s.players.p0!.done).toBe(false);
});

it("implements all five Scramble permutations and Mutation excludes each old kind over many stream states", () => {
  const board = [..."abcdefghij"];
  for (const permutation of [[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]] as [number, number, number][]) {
    const result = transformStars(board, { action: "scramble", origin: 7, permutation }, () => "x", () => "y");
    expect(result.slice(7)).toEqual(permutation.map((n) => board[7 + n])); expect(result.slice(0, 7)).toEqual(board.slice(0, 7));
  }
  for (let old = 0; old < 4; old++) for (let seed = 1; seed <= 25; seed++) {
    const s = start(); s.players.p0!.board[0] = old as StarKind; s.players.p0!.stars.state = seed; s.players.p0!.hand = [{ id: "mutation-1", action: "mutation" }];
    const next = apply(s, { type: "starGarden.playCard", ...identity(s), cardId: "mutation-1", effect: { action: "mutation", target: 0 } }).state;
    expect(next.players.p0!.board[0]).not.toBe(old); expect(next.players.p0!.board.slice(1)).toEqual(s.players.p0!.board.slice(1));
  }
});
