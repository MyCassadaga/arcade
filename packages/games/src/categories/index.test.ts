import { describe, expect, it } from "vitest";
import { categoriesCommandSchema } from "@team-arcade/shared";
import { advanceCategories, createCategoriesState, getCategoriesPrivateView, getCategoriesPublicView, handleCategoriesCommand, normalizeCategoriesAnswer } from ".";
import type { CategoriesState } from ".";

const instance = "00000000-0000-4000-8000-000000000001";
function create(count = 3) {
  return createCategoriesState({ now: 0, random: () => 0.5, players: Array.from({ length: count }, (_, i) => ({
    id: `player-${i}`, displayName: `Player ${i}`, connected: true, isHost: i === 0, score: 0
  })) }, instance);
}
function command(state: CategoriesState, answer: string) {
  return { type: "categories.submitAnswer" as const, answer, gameInstanceId: state.gameInstanceId, roundNumber: state.roundNumber };
}
function submit(state: CategoriesState, player: number, answer: string) {
  return handleCategoriesCommand(state, command(state, answer), `player-${player}`);
}

describe("Categories", () => {
  it.each([
    ["  ‘  COFFEE   mug ’  ", "coffee mug"], ["Straße", "strasse"], ["STRASSE", "strasse"],
    ["ΟΣ", "οσ"], ["ος", "οσ"], ["ﬃ", "ffi"], ["—...?!", ""], ["A\t\nB", "a b"],
    ["rock-n-roll", "rock-n-roll"], ["résumé", "résumé"], ["ı", "ı"]
  ])("normalizes %s to %s exactly", (input, output) => expect(normalizeCategoriesAnswer(input)).toBe(output));

  it("strictly validates answer bounds and the game/round identity", () => {
    const valid = command(create(), " a ");
    expect(categoriesCommandSchema.parse(valid).answer).toBe("a");
    for (const changes of [{ answer: " " }, { answer: "x".repeat(41) }, { gameInstanceId: "bad" }, { roundNumber: 0 }, { roundNumber: 6 }, { roundNumber: 1.5 }, { extra: true }]) {
      expect(categoriesCommandSchema.safeParse({ ...valid, ...changes }).success).toBe(false);
    }
    expect(categoriesCommandSchema.safeParse({ ...valid, answer: "x".repeat(40) }).success).toBe(true);
  });

  it("enforces 2–12 players and freezes the active roster", () => {
    expect(() => create(1)).toThrow(/at least 2/);
    expect(() => create(13)).toThrow(/up to 12/);
    expect(create(2).playerIds).toHaveLength(2);
    let state = create(12);
    expect(() => handleCategoriesCommand(state, command(state, "a"), "spectator")).toThrow(/not active/);
    for (let i = 0; i < 12; i++) state = submit(state, i, `answer ${i}`).state;
    expect(state.phase).toBe("reveal");
    expect(Object.values(state.gameScores)).toEqual(Array(12).fill(1));
  });

  it("allows edits, keeps other viewers and the public projection free of submitted answers", () => {
    const initial = create();
    let state = submit(initial, 0, "secret first").state;
    state = submit(state, 0, "secret revised").state;
    expect(initial.submissions).toEqual({});
    state = submit(state, 1, "secret second").state;
    expect(getCategoriesPublicView(state)).toMatchObject({ submissionCount: 2 });
    expect(getCategoriesPublicView(state)).not.toHaveProperty("groups");
    expect(getCategoriesPublicView(state)).not.toHaveProperty("categories");
    for (const id of state.playerIds) {
      const view = { public: getCategoriesPublicView(state), private: getCategoriesPrivateView(state, { playerId: id, isHost: false }) };
      for (const [author, answer] of Object.entries(state.submissions)) {
        if (author !== id) expect(JSON.stringify(view)).not.toContain(answer);
      }
    }
    expect(getCategoriesPrivateView(state, { playerId: "player-0", isHost: true })).toEqual({ hasSubmitted: true, submittedAnswer: "secret revised" });
  });

  it.each([
    [["apple", "pear", "plum"], [1, 1, 1]],
    [["coffee", "COFFEE!", "‘coffee’"], [0, 0, 0]],
    [["coffee mug", " COFFEE  MUG! ", "teapot"], [0, 0, 1]],
    [["!", "—", "..."], [0, 0, 0]],
    [["résumé", "resume", "resumé"], [1, 1, 1]]
  ])("scores exact groups for %j", (answers, expected) => {
    let state = create();
    answers.forEach((answer, i) => {
      const result = submit(state, i, answer);
      expect(result.scoreDelta === undefined).toBe(i < 2);
      state = result.state;
    });
    expect(Object.values(state.roundScores)).toEqual(expected);
    expect(Object.values(state.gameScores)).toEqual(expected);
    expect(getCategoriesPublicView(state).groups?.flatMap((g) => g.answers)).toHaveLength(3);
    expect(() => submit(state, 0, "late")).toThrow(/closed/);
  });

  it("completes five non-repeating rounds, rejects stale transitions and submissions, and ranks ties", () => {
    let state = create();
    const seen = new Set<string>();
    const old = command(state, "old request");
    expect(() => advanceCategories(state)).toThrow(/cannot advance/);
    for (let round = 1; round <= 5; round++) {
      const category = getCategoriesPublicView(state).category;
      expect(seen.has(category)).toBe(false);
      seen.add(category);
      for (let i = 0; i < 3; i++) state = submit(state, i, i === 2 ? "third" : "same").state;
      expect(state.phase).toBe("reveal");
      const reveal = JSON.parse(JSON.stringify(state)) as CategoriesState;
      expect(getCategoriesPublicView(reveal)).toEqual(getCategoriesPublicView(state));
      state = advanceCategories(state).state;
      expect(state.phase).toBe("roundResults");
      state = advanceCategories(state).state;
      expect(() => handleCategoriesCommand(state, old, "player-0")).toThrow(/closed/);
    }
    expect(state.phase).toBe("gameResults");
    expect(getCategoriesPublicView(state).rankings).toEqual([
      { playerId: "player-2", score: 5 }, { playerId: "player-0", score: 0 }, { playerId: "player-1", score: 0 }
    ]);
    expect(() => advanceCategories(state)).toThrow(/cannot advance/);
    const replay = { ...create(), gameInstanceId: "00000000-0000-4000-8000-000000000002" };
    expect(() => handleCategoriesCommand(replay, old, "player-0")).toThrow(/closed/);
  });
});
