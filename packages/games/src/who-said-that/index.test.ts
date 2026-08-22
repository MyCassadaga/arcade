import { describe, expect, it } from "vitest";
import { GameRuleError, type GameContext } from "@team-arcade/game-core";
import {
  advanceWhoSaidThat,
  createWhoSaidThatState,
  getWhoSaidThatPrivateView,
  getWhoSaidThatPublicView,
  handleWhoSaidThatCommand,
  type WhoSaidThatState
} from ".";

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003"
];

function context(random = () => 0): GameContext {
  return {
    now: 1,
    random,
    players: ids.map((id, index) => ({ id, displayName: `Player ${index + 1}`, connected: true, isHost: index === 0, score: 0 }))
  };
}

function submitAll(state = createWhoSaidThatState(context())): WhoSaidThatState {
  let next = state;
  ids.forEach((playerId, index) => {
    next = handleWhoSaidThatCommand(next, { type: "wst.submitAnswer", answer: `Answer ${index + 1}` }, playerId, () => 0).state;
  });
  return next;
}

describe("Who Said That? engine", () => {
  it("selects a non-repeating prompt for each round", () => {
    const first = createWhoSaidThatState(context());
    const roundResults = { ...first, phase: "roundResults" as const };
    const second = advanceWhoSaidThat(roundResults, () => 0).state;
    expect(second.promptId).not.toBe(first.promptId);
    expect(second.usedPromptIds).toHaveLength(2);
  });

  it("validates submissions and permits edits until everyone answers", () => {
    const initial = createWhoSaidThatState(context());
    expect(() => handleWhoSaidThatCommand(initial, { type: "wst.submitAnswer", answer: "" }, ids[0] as string, () => 0)).toThrow(GameRuleError);
    const once = handleWhoSaidThatCommand(initial, { type: "wst.submitAnswer", answer: "First" }, ids[0] as string, () => 0).state;
    const edited = handleWhoSaidThatCommand(once, { type: "wst.submitAnswer", answer: "Edited" }, ids[0] as string, () => 0).state;
    expect(edited.submissions[ids[0] as string]).toBe("Edited");
  });

  it("randomizes answers and never exposes the author mapping before reveal", () => {
    const guessing = submitAll();
    expect(guessing.phase).toBe("guessing");
    expect(guessing.answerOrder).toEqual([ids[1], ids[2], ids[0]]);
    const publicView = getWhoSaidThatPublicView(guessing);
    expect(publicView.currentAnswer).toBe("Answer 2");
    expect(JSON.stringify(publicView)).not.toContain("authorPlayerId");
    expect(JSON.stringify(publicView)).not.toContain("submissions");
  });

  it("prevents the author and self-targeted guesses", () => {
    const guessing = submitAll();
    expect(() => handleWhoSaidThatCommand(guessing, { type: "wst.submitGuess", targetPlayerId: ids[0] as string }, ids[1] as string, () => 0)).toThrow("You wrote this answer");
    expect(() => handleWhoSaidThatCommand(guessing, { type: "wst.submitGuess", targetPlayerId: ids[0] as string }, ids[0] as string, () => 0)).toThrow("cannot guess yourself");
  });

  it("reveals sequentially and scores correct and deceptive guesses", () => {
    let state = submitAll();
    state = handleWhoSaidThatCommand(state, { type: "wst.submitGuess", targetPlayerId: ids[1] as string }, ids[0] as string, () => 0).state;
    const result = handleWhoSaidThatCommand(state, { type: "wst.submitGuess", targetPlayerId: ids[0] as string }, ids[2] as string, () => 0);
    expect(result.state.phase).toBe("reveal");
    expect(result.scoreDelta).toEqual({ [ids[0] as string]: 1, [ids[1] as string]: 1 });
    expect(getWhoSaidThatPublicView(result.state).reveal).toMatchObject({ authorPlayerId: ids[1] });

    const next = advanceWhoSaidThat(result.state, () => 0).state;
    expect(next.phase).toBe("guessing");
    expect(next.currentAnswerIndex).toBe(1);
    expect(next.guesses).toEqual({});
  });

  it("advances round and game results and supplies private reconnect state", () => {
    const guessing = submitAll();
    expect(getWhoSaidThatPrivateView(guessing, { playerId: ids[1] as string, isHost: false })).toMatchObject({
      hasSubmitted: true,
      submittedAnswer: "Answer 2",
      isCurrentAuthor: true
    });
    const finalRound = { ...guessing, phase: "roundResults" as const, roundNumber: 3 };
    const results = advanceWhoSaidThat(finalRound, () => 0).state;
    expect(results.phase).toBe("gameResults");
    expect(getWhoSaidThatPublicView(results).rankings).toHaveLength(3);
  });
});
