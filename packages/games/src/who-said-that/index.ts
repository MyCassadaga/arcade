import { GameRuleError, addScore, rankings, shuffled } from "@team-arcade/game-core";
import type {
  GameContext,
  GameResult,
  ViewerContext
} from "@team-arcade/game-core";
import type {
  WhoSaidThatCommand,
  WhoSaidThatPrivateView,
  WhoSaidThatPublicView
} from "@team-arcade/shared";
import { WHO_SAID_THAT_PROMPTS, type WhoSaidThatPrompt } from "./prompts";

export type WhoSaidThatPhase = "submitting" | "guessing" | "reveal" | "roundResults" | "gameResults";

interface AnswerReveal {
  authorPlayerId: string;
  distribution: Record<string, number>;
  pointsAwarded: Record<string, number>;
}

export interface WhoSaidThatState {
  phase: WhoSaidThatPhase;
  roundNumber: number;
  totalRounds: number;
  promptId: string;
  prompt: string;
  usedPromptIds: string[];
  playerIds: string[];
  submissions: Record<string, string>;
  answerOrder: string[];
  currentAnswerIndex: number;
  guesses: Record<string, string>;
  roundScores: Record<string, number>;
  gameScores: Record<string, number>;
  lastReveal: AnswerReveal | null;
}

export function createWhoSaidThatState(context: GameContext, totalRounds = 3): WhoSaidThatState {
  const playerIds = context.players.filter((player) => player.connected).map((player) => player.id);
  if (playerIds.length < 3) throw new GameRuleError("TOO_FEW_PLAYERS", "Who Said That? needs at least 3 connected players.");
  const prompt = pickPrompt([], context.random);
  const scores = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));
  return {
    phase: "submitting",
    roundNumber: 1,
    totalRounds,
    promptId: prompt.id,
    prompt: prompt.text,
    usedPromptIds: [prompt.id],
    playerIds,
    submissions: {},
    answerOrder: [],
    currentAnswerIndex: 0,
    guesses: {},
    roundScores: { ...scores },
    gameScores: scores,
    lastReveal: null
  };
}

export function handleWhoSaidThatCommand(
  state: WhoSaidThatState,
  command: WhoSaidThatCommand,
  actorPlayerId: string,
  random: () => number
): GameResult<WhoSaidThatState> {
  requirePlayer(state, actorPlayerId);
  if (command.type === "wst.submitAnswer") return submitAnswer(state, actorPlayerId, command.answer, random);
  if (command.type === "wst.submitGuess") return submitGuess(state, actorPlayerId, command.targetPlayerId);
  throw new GameRuleError("INVALID_COMMAND", "That command does not belong to Who Said That?.");
}

export function advanceWhoSaidThat(state: WhoSaidThatState, random: () => number): GameResult<WhoSaidThatState> {
  if (state.phase === "reveal") {
    if (state.currentAnswerIndex + 1 < state.answerOrder.length) {
      return {
        state: {
          ...state,
          phase: "guessing",
          currentAnswerIndex: state.currentAnswerIndex + 1,
          guesses: {},
          lastReveal: null
        }
      };
    }
    return { state: { ...state, phase: "roundResults", guesses: {}, lastReveal: null } };
  }

  if (state.phase === "roundResults") {
    if (state.roundNumber >= state.totalRounds) return { state: { ...state, phase: "gameResults" } };
    const prompt = pickPrompt(state.usedPromptIds, random);
    return {
      state: {
        ...state,
        phase: "submitting",
        roundNumber: state.roundNumber + 1,
        promptId: prompt.id,
        prompt: prompt.text,
        usedPromptIds: [...state.usedPromptIds, prompt.id],
        submissions: {},
        answerOrder: [],
        currentAnswerIndex: 0,
        guesses: {},
        roundScores: Object.fromEntries(state.playerIds.map((playerId) => [playerId, 0])),
        lastReveal: null
      }
    };
  }

  throw new GameRuleError("STALE_PHASE", "The game cannot advance during this phase.");
}

export function getWhoSaidThatPublicView(state: WhoSaidThatState): WhoSaidThatPublicView {
  const currentAuthorId = state.answerOrder[state.currentAnswerIndex];
  const currentAnswer = currentAuthorId ? state.submissions[currentAuthorId] : undefined;
  return {
    roundNumber: state.roundNumber,
    totalRounds: state.totalRounds,
    prompt: state.prompt,
    submissionCount: Object.keys(state.submissions).length,
    totalPlayers: state.playerIds.length,
    ...((state.phase === "guessing" || state.phase === "reveal") && currentAnswer !== undefined
      ? {
          currentAnswer,
          currentAnswerNumber: state.currentAnswerIndex + 1,
          totalAnswers: state.answerOrder.length,
          guessCount: Object.keys(state.guesses).length,
          eligibleGuessCount: state.playerIds.length - 1
        }
      : {}),
    ...(state.phase === "reveal" && state.lastReveal ? { reveal: state.lastReveal } : {}),
    roundScores: state.roundScores,
    gameScores: state.gameScores,
    ...(state.phase === "gameResults" ? { rankings: rankings(state.gameScores) } : {})
  };
}

export function getWhoSaidThatPrivateView(state: WhoSaidThatState, viewer: ViewerContext): WhoSaidThatPrivateView {
  const currentAuthorId = state.answerOrder[state.currentAnswerIndex];
  const submittedAnswer = state.submissions[viewer.playerId];
  return {
    hasSubmitted: submittedAnswer !== undefined,
    ...(submittedAnswer === undefined ? {} : { submittedAnswer }),
    isCurrentAuthor: currentAuthorId === viewer.playerId,
    hasGuessed: state.guesses[viewer.playerId] !== undefined
  };
}

function submitAnswer(
  state: WhoSaidThatState,
  actorPlayerId: string,
  answer: string,
  random: () => number
): GameResult<WhoSaidThatState> {
  if (state.phase !== "submitting") throw new GameRuleError("STALE_PHASE", "Answers are closed for this round.");
  const trimmed = answer.trim();
  if (trimmed.length === 0 || trimmed.length > 160) throw new GameRuleError("INVALID_COMMAND", "Answers must be 1–160 characters.");
  const submissions = { ...state.submissions, [actorPlayerId]: trimmed };
  if (Object.keys(submissions).length === state.playerIds.length) {
    return {
      state: {
        ...state,
        phase: "guessing",
        submissions,
        answerOrder: shuffled(state.playerIds, random),
        currentAnswerIndex: 0,
        guesses: {},
        lastReveal: null
      }
    };
  }
  return { state: { ...state, submissions } };
}

function submitGuess(
  state: WhoSaidThatState,
  actorPlayerId: string,
  targetPlayerId: string
): GameResult<WhoSaidThatState> {
  if (state.phase !== "guessing") throw new GameRuleError("STALE_PHASE", "Guesses are closed for this answer.");
  const authorPlayerId = state.answerOrder[state.currentAnswerIndex];
  if (!authorPlayerId) throw new GameRuleError("INVALID_PHASE", "There is no answer to guess.");
  if (actorPlayerId === authorPlayerId) throw new GameRuleError("PLAYER_NOT_ACTIVE", "You wrote this answer and do not submit a guess.");
  if (targetPlayerId === actorPlayerId) throw new GameRuleError("INVALID_COMMAND", "You cannot guess yourself.");
  if (!state.playerIds.includes(targetPlayerId)) throw new GameRuleError("INVALID_COMMAND", "Choose a player in this game.");
  if (state.guesses[actorPlayerId] !== undefined) throw new GameRuleError("ALREADY_SUBMITTED", "Your guess is already locked in.");

  const guesses = { ...state.guesses, [actorPlayerId]: targetPlayerId };
  if (Object.keys(guesses).length < state.playerIds.length - 1) return { state: { ...state, guesses } };

  const distribution: Record<string, number> = {};
  const pointsAwarded: Record<string, number> = {};
  for (const [guesserId, guessedId] of Object.entries(guesses)) {
    distribution[guessedId] = (distribution[guessedId] ?? 0) + 1;
    if (guessedId === authorPlayerId) pointsAwarded[guesserId] = (pointsAwarded[guesserId] ?? 0) + 1;
    else pointsAwarded[authorPlayerId] = (pointsAwarded[authorPlayerId] ?? 0) + 1;
  }
  return {
    state: {
      ...state,
      phase: "reveal",
      guesses,
      roundScores: addScore(state.roundScores, pointsAwarded),
      gameScores: addScore(state.gameScores, pointsAwarded),
      lastReveal: { authorPlayerId, distribution, pointsAwarded }
    },
    scoreDelta: pointsAwarded
  };
}

function requirePlayer(state: WhoSaidThatState, playerId: string): void {
  if (!state.playerIds.includes(playerId)) throw new GameRuleError("PLAYER_NOT_ACTIVE", "You are not active in this game.");
}

function pickPrompt(usedPromptIds: readonly string[], random: () => number): WhoSaidThatPrompt {
  const available = WHO_SAID_THAT_PROMPTS.filter((prompt) => !usedPromptIds.includes(prompt.id));
  if (available.length === 0) throw new GameRuleError("SERVER_ERROR", "The prompt deck is exhausted.");
  return available[Math.floor(random() * available.length)] as WhoSaidThatPrompt;
}
