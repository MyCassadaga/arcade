import { describe, expect, it } from "vitest";
import { shirtFightCommandSchema } from "@team-arcade/shared";
import type { ShirtFightCommand } from "@team-arcade/shared";
import {
  advanceShirtFightDue,
  canViewerAccessShirtFightDrawing,
  createShirtFightState,
  deterministicUuid,
  getShirtFightPrivateView,
  getShirtFightPublicView,
  handleShirtFightCommand,
  isShirtFightDrawingUploadCurrent,
  missingShirtFightDrawings,
  registerShirtFightDrawing,
  type ShirtFightFallbackDrawing,
  type ShirtFightState
} from ".";

const instance = "00000000-0000-4000-8000-000000000022";
const players = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: `player-${index}`, displayName: `Player ${index}`, connected: true, isHost: index === 0, score: 0
}));
const create = (count = 3) => createShirtFightState({ players: players(count), now: 1_000, random: () => 0.5 }, instance);
const fallbacks = (state: ShirtFightState): ShirtFightFallbackDrawing[] => missingShirtFightDrawings(state).map((slot) => ({
  id: deterministicUuid(state.seed, `fallback:${slot.round}:${slot.drawingNumber}:${slot.playerId}`),
  playerId: slot.playerId,
  round: slot.round,
  drawingNumber: slot.drawingNumber,
  createdAt: state.deadlineAt ?? 0,
  width: 600,
  height: 800,
  byteLength: 128,
  mediaType: "image/webp"
}));
const expire = (state: ShirtFightState, extra = 0) => advanceShirtFightDue(state, (state.deadlineAt ?? 0) + extra, fallbacks(state)).state;
type BareCommand = ShirtFightCommand extends infer Command ? Command extends unknown ? Omit<Command, "gameInstanceId" | "phaseNonce"> : never : never;
const command = (state: ShirtFightState, value: BareCommand) => ({
  ...value, gameInstanceId: state.gameInstanceId, phaseNonce: state.phaseNonce
});

function reachAssembly(state = create()): ShirtFightState {
  state = expire(state);
  state = expire(state);
  state = expire(state);
  expect(state.phase).toBe("assembly");
  return state;
}

function submitAllShirts(state: ShirtFightState): ShirtFightState {
  for (const playerId of state.playerIds) {
    const assignment = getShirtFightPrivateView(state, { playerId, isHost: playerId === "player-0" }).assignment;
    state = handleShirtFightCommand(state, command(state, {
      type: "shirtFight.submitShirt",
      drawingId: assignment?.drawings[0]?.id ?? "",
      sloganId: assignment?.slogans[0]?.id ?? ""
    }), playerId, state.phaseStartedAt + 1).state;
  }
  return state;
}

describe("Shirt Fight", () => {
  it("enforces 3–8 connected players and strict bounded commands", () => {
    expect(() => create(2)).toThrow(/at least 3/);
    expect(() => create(9)).toThrow(/up to 8/);
    expect(create(3).playerIds).toHaveLength(3);
    const state = reachAssembly();
    const valid = command(state, { type: "shirtFight.submitShirt", drawingId: state.drawings[0]?.id ?? "", sloganId: state.slogans[0]?.id ?? "" });
    expect(shirtFightCommandSchema.safeParse(valid).success).toBe(true);
    expect(shirtFightCommandSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(shirtFightCommandSchema.safeParse({ type: "shirtFight.submitSlogan", gameInstanceId: instance, phaseNonce: 1, text: "x".repeat(81) }).success).toBe(false);
  });

  it("uses two authoritative drawing phases, preserves metadata only, and rejects late/duplicate uploads", () => {
    let state = create();
    const first = fallbacks(state)[0] as ShirtFightFallbackDrawing;
    const uploadSlot = {
      gameInstanceId: state.gameInstanceId,
      playerId: first.playerId,
      round: first.round,
      drawingNumber: first.drawingNumber
    };
    expect(isShirtFightDrawingUploadCurrent(state, uploadSlot, (state.deadlineAt ?? 0) - 1)).toBe(true);
    expect(isShirtFightDrawingUploadCurrent(state, uploadSlot, state.deadlineAt ?? 0)).toBe(false);
    state = registerShirtFightDrawing(state, { ...first, artistPlayerId: first.playerId, round: 1, drawingNumber: 1, durationMs: 0, fallback: false }, 2_000).state;
    expect(isShirtFightDrawingUploadCurrent(state, uploadSlot, 2_001)).toBe(false);
    expect(getShirtFightPrivateView(state, { playerId: first.playerId, isHost: true }).drawingSubmitted).toBe(true);
    expect(getShirtFightPublicView(state)).not.toHaveProperty("drawings");
    expect(JSON.stringify(state)).not.toContain("data:image");
    expect(() => registerShirtFightDrawing(state, { ...first, artistPlayerId: first.playerId, round: 1, drawingNumber: 1, durationMs: 0, fallback: false }, 2_001)).toThrow(/already finalized/);
    state = expire(state);
    expect(state).toMatchObject({ phase: "drawing", drawingNumber: 2 });
    expect(isShirtFightDrawingUploadCurrent(state, uploadSlot, state.phaseStartedAt)).toBe(false);
    expect(state.drawings).toHaveLength(3);
    state = expire(state);
    expect(state.phase).toBe("slogans");
    expect(state.drawings).toHaveLength(6);
  });

  it("accepts rapid slogans, creates fair private assignments, freezes shirts, and hides attribution", () => {
    let state = create();
    state = expire(expire(state));
    for (const playerId of state.playerIds) {
      state = handleShirtFightCommand(state, command(state, { type: "shirtFight.submitSlogan", text: `${playerId} says hello` }), playerId, state.phaseStartedAt + 1).state;
      state = handleShirtFightCommand(state, command(state, { type: "shirtFight.submitSlogan", text: `${playerId} says more` }), playerId, state.phaseStartedAt + 2).state;
    }
    state = expire(state);
    for (const playerId of state.playerIds) {
      const privateView = getShirtFightPrivateView(state, { playerId, isHost: false });
      expect(privateView.assignment?.drawings).toHaveLength(2);
      expect(new Set(privateView.assignment?.drawings.map((item) => item.id)).size).toBe(2);
      expect(privateView.assignment?.slogans.length).toBeGreaterThanOrEqual(4);
      expect(privateView.assignment?.slogans.every((item) => !item.text.startsWith(playerId))).toBe(true);
      expect(JSON.stringify(getShirtFightPublicView(state))).not.toContain(privateView.assignment?.drawings[0]?.id);
    }
    state = submitAllShirts(state);
    expect(state.phase).toBe("voting");
    const first = state.shirts[0];
    if (!first) throw new Error("Missing shirt");
    expect(() => handleShirtFightCommand(state, command(state, { type: "shirtFight.submitShirt", drawingId: first.drawingId, sloganId: first.sloganId }), first.assemblerPlayerId, state.phaseStartedAt + 1)).toThrow(/closed|already/i);
    expect(JSON.stringify(getShirtFightPublicView(state))).not.toContain("artistPlayerId");
    expect(JSON.stringify(getShirtFightPublicView(state))).not.toContain("assemblerPlayerId");
  });

  it("records votes, runs sudden death, resolves a second tie deterministically, and controls asset access", () => {
    let state = submitAllShirts(reachAssembly());
    const matchup = state.activeMatchup;
    if (!matchup) throw new Error("Missing matchup");
    const publicDrawing = state.shirts.find((shirt) => shirt.id === matchup.shirtIds[0])?.drawingId;
    const privateDrawing = state.drawings.find((drawing) => drawing.id !== publicDrawing)?.id;
    expect(canViewerAccessShirtFightDrawing(state, "player-1", publicDrawing ?? "")).toBe(true);
    if (privateDrawing && state.drawings.find((drawing) => drawing.id === privateDrawing)?.artistPlayerId !== "player-1") {
      expect(canViewerAccessShirtFightDrawing(state, "player-1", privateDrawing)).toBe(false);
    }
    state = advanceShirtFightDue(state, state.deadlineAt ?? 0).state;
    expect(state.activeMatchup?.suddenDeath).toBe(true);
    state = advanceShirtFightDue(state, state.deadlineAt ?? 0).state;
    expect(state.matches[0]).toMatchObject({ randomTieBreak: true, votes: {}, suddenDeathVotes: {} });
    expect(state.activeMatchup ?? state.roundWinnerShirtIds[1]).toBeTruthy();
  });

  it("catches up repeated overdue deadlines idempotently and completes two rounds plus a final", () => {
    let state = create();
    const firstDeadline = state.deadlineAt as number;
    const supplied = fallbacks(state);
    const once = advanceShirtFightDue(state, firstDeadline, supplied).state;
    const repeated = advanceShirtFightDue(once, firstDeadline, supplied).state;
    expect(repeated).toEqual(once);
    expect(repeated.phaseNonce).toBe(1);

    for (let safety = 0; safety < 80 && state.phase !== "gameResults"; safety += 1) {
      if (state.phase === "drawing") state = advanceShirtFightDue(state, state.deadlineAt ?? 0, fallbacks(state)).state;
      else if (state.phase === "assembly") state = submitAllShirts(state);
      else state = advanceShirtFightDue(state, state.deadlineAt ?? 0).state;
    }
    expect(state.phase).toBe("gameResults");
    expect(state.drawings).toHaveLength(12);
    expect(state.shirts).toHaveLength(6);
    expect(state.finalWinnerShirtId).toMatch(/[0-9a-f-]{36}/u);
    expect(state.matches.length).toBeGreaterThanOrEqual(5);
    expect(state.awards.some((award) => award.title === "Fashion Designer")).toBe(true);
    expect(typeof getShirtFightPublicView(state).winner?.credits.assemblerPlayerId).toBe("string");
  });

  it("rejects stale phase identities, inactive players, invalid assignments, and duplicate votes", () => {
    let state = reachAssembly();
    const assignment = getShirtFightPrivateView(state, { playerId: "player-0", isHost: true }).assignment;
    const valid = command(state, { type: "shirtFight.submitShirt", drawingId: assignment?.drawings[0]?.id ?? "", sloganId: assignment?.slogans[0]?.id ?? "" }) as Extract<ShirtFightCommand, { type: "shirtFight.submitShirt" }>;
    expect(() => handleShirtFightCommand(state, { ...valid, phaseNonce: valid.phaseNonce - 1 }, "player-0", state.phaseStartedAt + 1)).toThrow(/ended/);
    expect(() => handleShirtFightCommand(state, valid, "spectator", state.phaseStartedAt + 1)).toThrow(/not active/);
    expect(() => handleShirtFightCommand(state, { ...valid, drawingId: deterministicUuid(instance, "arbitrary") }, "player-0", state.phaseStartedAt + 1)).toThrow(/assigned/);
    state = submitAllShirts(state);
    const shirtId = state.activeMatchup?.shirtIds[0] ?? "";
    const vote = command(state, { type: "shirtFight.submitVote", shirtId });
    state = handleShirtFightCommand(state, vote, "player-0", state.phaseStartedAt + 1).state;
    expect(() => handleShirtFightCommand(state, vote, "player-0", state.phaseStartedAt + 2)).toThrow(/already locked/);
    expect(() => handleShirtFightCommand(state, command(state, { type: "shirtFight.submitVote", shirtId: deterministicUuid(instance, "arbitrary-shirt") }), "player-1", state.phaseStartedAt + 2)).toThrow(/two shirts/);
  });
});
