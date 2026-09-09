import { describe, expect, it } from "vitest";
import { afterprintCommandSchema } from "@team-arcade/shared";
import type { AfterprintCommand, PlayerView } from "@team-arcade/shared";
import {
  AFTERPRINT_EPOCH_UTC,
  AFTERPRINT_PUZZLE_BANK_V1,
  createAfterprintState,
  getAfterprintPublicView,
  getAfterprintPuzzleNumber,
  handleAfterprintCommand,
  selectAfterprintPuzzle,
  simulateAfterprint,
  validateAfterprintPuzzle
} from ".";

const instance = "00000000-0000-4000-8000-000000000019";
const player = (id = "player-1", connected = true): PlayerView => ({
  id, displayName: id, connected, isHost: true, score: 0
});
const create = (now = AFTERPRINT_EPOCH_UTC, players = [player()]) =>
  createAfterprintState({ now, random: () => 0.999, players }, instance);
const command = (state = create(), eventIds = state.puzzle.initialEventIds): AfterprintCommand => ({
  type: "afterprint.submitOrder",
  gameInstanceId: state.gameInstanceId,
  puzzleNumber: state.puzzle.puzzleNumber,
  eventIds: [...eventIds]
});

describe("AFTERPRINT simulator and frozen daily bank", () => {
  it("implements replacement, carried-color changes, blank painting and wiping exactly", () => {
    const puzzle = AFTERPRINT_PUZZLE_BANK_V1[0];
    expect(puzzle).toBeDefined();
    const result = simulateAfterprint(puzzle!.events, puzzle!.authoredEventIds);
    expect(result).toEqual(puzzle!.target);
    expect(result[5]).toBe("coral");
    expect(result[7]).toBe("blue");
    expect(result[12]).toBe("blue");
    expect(result[8]).toBeNull();
  });

  it("validates every frozen puzzle against all 120 event orders with meaningful events", () => {
    for (const puzzle of AFTERPRINT_PUZZLE_BANK_V1) {
      const result = validateAfterprintPuzzle(puzzle);
      expect(result.errors, puzzle.id).toEqual([]);
      expect(result.permutationCount).toBe(120);
      expect(result.solutionOrders.length).toBeGreaterThan(0);
    }
  });

  it("rejects invalid candidate geometry and never stores or projects an authored solution", () => {
    const source = AFTERPRINT_PUZZLE_BANK_V1[0]!;
    const invalid = {
      ...source,
      events: source.events.map((event) => event.id === "B" ? { id: "B" as const, kind: "roll" as const, path: [5, 9] } : event)
    };
    expect(validateAfterprintPuzzle(invalid).errors).toContain("Event B has a non-adjacent path.");
    const state = create();
    expect(state.puzzle).not.toHaveProperty("authoredEventIds");
    expect(JSON.stringify(getAfterprintPublicView(state))).not.toContain("authored");
  });

  it("accepts every mechanically valid order, including a non-authored solution", () => {
    const definition = AFTERPRINT_PUZZLE_BANK_V1[0]!;
    const validOrders = validateAfterprintPuzzle(definition).solutionOrders;
    const alternate = validOrders.find((order) => order.join("") !== definition.authoredEventIds.join(""));
    expect(alternate).toBeDefined();
    const state = create();
    const result = handleAfterprintCommand(state, command(state, alternate), state.activePlayerId).state;
    expect(result).toMatchObject({ phase: "gameResults", solved: true });
    expect(result.attempts).toEqual([{ eventIds: alternate, mismatchCount: 0, solved: true }]);
  });

  it("uses one UTC number and immutable initial order across independent same-day starts", () => {
    const morning = Date.UTC(2026, 8, 12, 0, 0, 1);
    const evening = Date.UTC(2026, 8, 12, 23, 59, 59);
    expect(getAfterprintPuzzleNumber(morning)).toBe(4);
    const first = create(morning);
    const second = create(evening);
    expect(first.puzzle).toEqual(second.puzzle);
    const firstCycle = selectAfterprintPuzzle(1);
    const secondCycle = selectAfterprintPuzzle(5);
    expect({ ...firstCycle, puzzleNumber: 0 }).toEqual({ ...secondCycle, puzzleNumber: 0 });
    expect(firstCycle.puzzleNumber).toBe(1);
    expect(secondCycle.puzzleNumber).toBe(5);
  });

  it("strictly validates stale identity and exactly-once five-event commands", () => {
    const valid = command();
    expect(afterprintCommandSchema.safeParse(valid).success).toBe(true);
    for (const invalid of [
      { ...valid, eventIds: ["A", "B", "C", "D"] },
      { ...valid, eventIds: ["A", "A", "C", "D", "E"] },
      { ...valid, eventIds: ["A", "B", "C", "D", "Z"] },
      { ...valid, puzzleNumber: 0 },
      { ...valid, gameInstanceId: "not-a-uuid" },
      { ...valid, extra: true }
    ]) expect(afterprintCommandSchema.safeParse(invalid).success).toBe(false);
    const state = create();
    expect(() => handleAfterprintCommand(state, { ...valid, puzzleNumber: 2 }, state.activePlayerId)).toThrow(/no longer active/);
    expect(() => handleAfterprintCommand(state, valid, "spectator")).toThrow(/not active/);
  });

  it("enforces one player and finishes after the fourth incorrect submission", () => {
    expect(() => create(AFTERPRINT_EPOCH_UTC, [])).toThrow(/one connected/);
    expect(() => create(AFTERPRINT_EPOCH_UTC, [player("one"), player("two")])).toThrow(/single-player/);
    let state = create();
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      state = handleAfterprintCommand(state, command(state), state.activePlayerId).state;
      expect(state.attempts).toHaveLength(attempt);
    }
    expect(state).toMatchObject({ phase: "gameResults", solved: false });
    expect(() => handleAfterprintCommand(state, command(state), state.activePlayerId)).toThrow(/no longer active/);
  });

  it("keeps the worst-case projected game.state within the 4,096-byte transport bound", () => {
    for (let day = 0; day < AFTERPRINT_PUZZLE_BANK_V1.length; day += 1) {
      let state = create(AFTERPRINT_EPOCH_UTC + day * 86_400_000);
      for (let attempt = 0; attempt < 4; attempt += 1) state = handleAfterprintCommand(state, command(state), state.activePlayerId).state;
      const message = { type: "game.state", payload: { gameId: "afterprint", phase: state.phase, public: getAfterprintPublicView(state), private: { canSubmit: false } } };
      expect(new TextEncoder().encode(JSON.stringify(message)).byteLength).toBeLessThanOrEqual(4_096);
    }
  });
});
