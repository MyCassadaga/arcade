import { describe, expect, it } from "vitest";
import {
  SystemCrawlRuleError,
  createSystemCrawlState,
  projectSystemCrawlState,
  reduceSystemCrawl,
  validateAllMapTemplates
} from ".";
import { characterByClass, startedState, testPlayers, TEST_CLASS_IDS } from "./test-utils";

describe("System Crawl setup, determinism, and serialization", () => {
  it("creates deterministic state and events for the same seed and action sequence", () => {
    const left = startedState(2, "repeatable-seed");
    const right = startedState(2, "repeatable-seed");
    expect(left).toEqual(right);
    const leftActive = left.activeCharacterId as string;
    const rightActive = right.activeCharacterId as string;
    const leftNext = reduceSystemCrawl(left, { type: "end_turn", characterId: leftActive }, left.characters[leftActive]?.ownerPlayerId ?? "").state;
    const rightNext = reduceSystemCrawl(right, { type: "end_turn", characterId: rightActive }, right.characters[rightActive]?.ownerPlayerId ?? "").state;
    expect(leftNext).toEqual(rightNext);
  });

  it("does not advance RNG or mutate state after rejected commands", () => {
    const state = startedState(2);
    const before = JSON.stringify(state);
    const activeId = state.activeCharacterId as string;
    expect(() => reduceSystemCrawl(state, {
      type: "use_ability",
      characterId: activeId,
      abilityId: "packet-drop",
      target: { type: "enemy", enemyId: "missing" }
    }, state.characters[activeId]?.ownerPlayerId ?? "")).toThrow(SystemCrawlRuleError);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("preserves future behavior across a JSON round trip", () => {
    const state = startedState(2, 77);
    const restored = JSON.parse(JSON.stringify(state)) as typeof state;
    const activeId = state.activeCharacterId as string;
    const actor = state.characters[activeId]?.ownerPlayerId ?? "";
    expect(reduceSystemCrawl(restored, { type: "end_turn", characterId: activeId }, actor).state)
      .toEqual(reduceSystemCrawl(state, { type: "end_turn", characterId: activeId }, actor).state);
  });

  it("assigns two distinct characters to a solo player and one per player otherwise", () => {
    const solo = startedState(1);
    expect(Object.values(solo.characters)).toHaveLength(2);
    expect(new Set(Object.values(solo.characters).map((character) => character.ownerPlayerId))).toEqual(new Set(["player-1"]));
    for (const count of [2, 3, 4]) {
      const state = startedState(count);
      expect(Object.values(state.characters)).toHaveLength(count);
      expect(Object.values(state.characters).map((character) => character.ownerPlayerId)).toEqual(
        testPlayers(count).map((player) => player.id)
      );
    }
  });

  it("supports public class revisions, rejects duplicates, and restricts start to the host", () => {
    const players = testPlayers(2);
    let state = createSystemCrawlState(players, players[0]?.id ?? "");
    state = reduceSystemCrawl(state, { type: "select_class", classIds: ["infrastructure-architect"] }, players[0]?.id ?? "").state;
    expect(() => reduceSystemCrawl(state, { type: "select_class", classIds: ["infrastructure-architect"] }, players[1]?.id ?? ""))
      .toThrow(expect.objectContaining({ code: "class_unavailable" }));
    state = reduceSystemCrawl(state, { type: "select_class", classIds: ["senior-systems-analyst"] }, players[0]?.id ?? "").state;
    state = reduceSystemCrawl(state, { type: "select_class", classIds: ["application-developer"] }, players[1]?.id ?? "").state;
    expect(state.phase).toBe("ready_to_start");
    expect(() => reduceSystemCrawl(state, { type: "start_adventure", seed: "x" }, players[1]?.id ?? ""))
      .toThrow(expect.objectContaining({ code: "not_host" }));
  });

  it("bounds events to 100 stable sequential IDs", () => {
    const players = testPlayers(1);
    let state = createSystemCrawlState(players, players[0]?.id ?? "");
    for (let index = 0; index < 120; index += 1) {
      const selection = index % 2 === 0 ? TEST_CLASS_IDS.slice(0, 2) : TEST_CLASS_IDS.slice(2, 4);
      state = reduceSystemCrawl(state, { type: "select_class", classIds: selection }, players[0]?.id ?? "").state;
    }
    expect(state.events).toHaveLength(100);
    expect(state.events[0]?.id).toBe(21);
    expect(state.events.at(-1)?.id).toBe(120);
  });

  it("keeps Google It choices private and removes unrevealed/internal data from projections", () => {
    let state = startedState(4, "privacy");
    const generalist = characterByClass(state, "it-generalist");
    state.phase = "player_turn";
    state.activeCharacterId = generalist.id;
    state.turn = { movementAllowance: 5, movementSpent: 0, actionUsed: false, actionBlocked: false, freeItemUsed: false, actedCharacterIdsThisRound: [] };
    state = reduceSystemCrawl(state, { type: "use_ability", characterId: generalist.id, abilityId: "google-it" }, generalist.ownerPlayerId).state;
    const owner = projectSystemCrawlState(state, generalist.ownerPlayerId);
    const other = projectSystemCrawlState(state, "player-1");
    expect(owner.pendingChoice?.candidateItemIds).toHaveLength(2);
    expect(other.pendingChoice).not.toHaveProperty("candidateItemIds");
    expect(other.maps.slice(1).every((map) => !Object.hasOwn(map, "templateId"))).toBe(true);
    const serialized = JSON.stringify(other);
    expect(serialized).not.toContain("rngState");
    expect(serialized).not.toContain("abilityHistory");
    expect(serialized).not.toContain("turnsStarted");
    expect(serialized).not.toContain("expiresAtSourceTurn");
    expect(serialized).not.toContain(state.seed ?? "unreachable-seed-sentinel");
    expect(serialized).not.toContain(state.maps[1]?.templateId ?? "unreachable-sentinel");
  });

  it("validates all eighteen authored maps for dimensions, routes, and spawn legality", () => {
    expect(validateAllMapTemplates()).toEqual([]);
  });
});
