import { describe, expect, it } from "vitest";
import { GameRuleError, type GameContext } from "@team-arcade/game-core";
import {
  advanceImpostor,
  createImpostorState,
  getImpostorPrivateView,
  getImpostorPublicView,
  handleImpostorCommand,
  type ImpostorState
} from ".";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004"
];

function context(random = () => 0): GameContext {
  return {
    now: 1,
    random,
    players: ids.map((id, index) => ({ id, displayName: `Player ${index + 1}`, connected: true, isHost: index === 0, score: 0 }))
  };
}

function votingState(): ImpostorState {
  let state = advanceImpostor(createImpostorState(context()), () => 0).state;
  ids.forEach((playerId, index) => {
    state = handleImpostorCommand(state, { type: "impostor.submitClue", clue: `clue ${index}` }, playerId).state;
  });
  while (state.phase === "clueReveal") state = advanceImpostor(state, () => 0).state;
  return advanceImpostor(state, () => 0).state;
}

function vote(state: ImpostorState, targets: string[]): ImpostorState {
  let next = state;
  ids.forEach((playerId, index) => {
    next = handleImpostorCommand(next, { type: "impostor.submitVote", targetPlayerId: targets[index] as string }, playerId).state;
  });
  return next;
}

describe("Impostor engine", () => {
  it("assigns one impostor and keeps roles viewer-private", () => {
    const state = createImpostorState(context());
    expect(state.impostorPlayerId).toBe(ids[0]);
    expect(getImpostorPrivateView(state, { playerId: ids[0] as string, isHost: true })).toEqual({
      role: "impostor", hasSubmittedClue: false, hasVoted: false
    });
    expect(getImpostorPrivateView(state, { playerId: ids[1] as string, isHost: false })).toMatchObject({ role: "player", secretWord: "microwave" });
  });

  it("never places the secret word in public pre-reveal messages", () => {
    let state = createImpostorState(context());
    const phases: ImpostorState[] = [state];
    state = advanceImpostor(state, () => 0).state;
    phases.push(state);
    ids.forEach((playerId, index) => {
      state = handleImpostorCommand(state, { type: "impostor.submitClue", clue: `hint ${index}` }, playerId).state;
    });
    phases.push(state);
    while (state.phase === "clueReveal") {
      state = advanceImpostor(state, () => 0).state;
      phases.push(state);
    }
    for (const phase of phases) expect(JSON.stringify(getImpostorPublicView(phase))).not.toContain("microwave");
  });

  it("validates clues and rejects duplicate submission", () => {
    const state = advanceImpostor(createImpostorState(context()), () => 0).state;
    expect(() => handleImpostorCommand(state, { type: "impostor.submitClue", clue: "  MICROwave " }, ids[1] as string)).toThrow(GameRuleError);
    const submitted = handleImpostorCommand(state, { type: "impostor.submitClue", clue: "warm" }, ids[1] as string).state;
    expect(() => handleImpostorCommand(submitted, { type: "impostor.submitClue", clue: "kitchen" }, ids[1] as string)).toThrow("already locked");
    expect(handleImpostorCommand(state, { type: "impostor.submitClue", clue: "microwave" }, ids[0] as string).state.clues[ids[0] as string]).toBe("microwave");
  });

  it("reveals clues in randomized order", () => {
    let state = advanceImpostor(createImpostorState(context()), () => 0).state;
    ids.forEach((playerId, index) => {
      state = handleImpostorCommand(state, { type: "impostor.submitClue", clue: `hint ${index}` }, playerId).state;
    });
    expect(state.phase).toBe("clueReveal");
    expect(getImpostorPublicView(state).revealedClues).toHaveLength(1);
    state = advanceImpostor(state, () => 0).state;
    expect(getImpostorPublicView(state).revealedClues).toHaveLength(2);
  });

  it("runs a runoff and treats a second tie as an impostor escape", () => {
    let state = vote(votingState(), [ids[1], ids[0], ids[1], ids[0]] as string[]);
    expect(getImpostorPublicView(state).voteReveal?.outcome).toBe("runoff");
    state = advanceImpostor(state, () => 0).state;
    expect(state.voteRound).toBe(2);
    expect(state.runoffCandidates).toEqual([ids[1], ids[0]]);
    state = vote(state, [ids[1], ids[0], ids[1], ids[0]] as string[]);
    expect(getImpostorPublicView(state).voteReveal?.outcome).toBe("escaped");
    const result = advanceImpostor(state, () => 0);
    expect(result.state.phase).toBe("roundResults");
    expect(result.scoreDelta).toEqual({ [ids[0] as string]: 3 });
  });

  it("allows a caught impostor to steal and awards accurate-voter bonuses", () => {
    let state = vote(votingState(), [ids[1], ids[0], ids[0], ids[0]] as string[]);
    expect(getImpostorPublicView(state).voteReveal).toMatchObject({ outcome: "caught", accusedPlayerId: ids[0] });
    state = advanceImpostor(state, () => 0).state;
    expect(state.phase).toBe("impostorGuess");
    const result = handleImpostorCommand(state, { type: "impostor.submitGuess", guess: "  MICROwave " }, ids[0] as string);
    expect(result.state.roundResult?.outcome).toBe("stolen");
    expect(result.scoreDelta).toEqual({ [ids[0] as string]: 2, [ids[1] as string]: 1, [ids[2] as string]: 1, [ids[3] as string]: 1 });
  });

  it("awards team points and voter bonuses after a failed steal", () => {
    let state = vote(votingState(), [ids[1], ids[0], ids[0], ids[0]] as string[]);
    state = advanceImpostor(state, () => 0).state;
    const result = handleImpostorCommand(state, { type: "impostor.submitGuess", guess: "toaster" }, ids[0] as string);
    expect(result.state.roundResult?.outcome).toBe("team-won");
    expect(result.scoreDelta).toEqual({ [ids[1] as string]: 2, [ids[2] as string]: 2, [ids[3] as string]: 2 });
  });

  it("avoids repeating impostors and reaches game results", () => {
    const first = createImpostorState(context());
    const next = advanceImpostor({ ...first, phase: "roundResults", roundResult: {
      secretWord: first.secretWord, impostorPlayerId: first.impostorPlayerId, outcome: "escaped", pointsAwarded: {}
    } }, () => 0).state;
    expect(next.impostorPlayerId).not.toBe(first.impostorPlayerId);
    const gameResults = advanceImpostor({ ...next, phase: "roundResults", roundNumber: 4 }, () => 0).state;
    expect(gameResults.phase).toBe("gameResults");
    expect(getImpostorPublicView(gameResults).rankings).toHaveLength(4);
  });
});
