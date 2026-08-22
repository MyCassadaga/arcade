import { GameRuleError, addScore, rankings, shuffled } from "@team-arcade/game-core";
import type { GameContext, GameResult, ViewerContext } from "@team-arcade/game-core";
import type { ImpostorCommand, ImpostorPrivateView, ImpostorPublicView } from "@team-arcade/shared";
import { IMPOSTOR_WORDS, type ImpostorWord } from "./words";

export type ImpostorPhase = "roleReveal" | "clueSubmission" | "clueReveal" | "discussion" | "voting" | "voteReveal" | "impostorGuess" | "roundResults" | "gameResults";

interface VoteReveal {
  totals: Record<string, number>;
  outcome: "caught" | "escaped" | "runoff";
  accusedPlayerId?: string;
  tiedPlayerIds: string[];
}

interface ImpostorRoundResult {
  secretWord: string;
  impostorPlayerId: string;
  outcome: "escaped" | "stolen" | "team-won";
  finalGuess?: string;
  pointsAwarded: Record<string, number>;
}

export interface ImpostorState {
  phase: ImpostorPhase;
  roundNumber: number;
  totalRounds: number;
  playerIds: string[];
  secretWord: string;
  wordId: string;
  usedWordIds: string[];
  impostorPlayerId: string;
  usedImpostorIds: string[];
  clues: Record<string, string>;
  clueOrder: string[];
  currentClueIndex: number;
  votes: Record<string, string>;
  voteRound: 1 | 2;
  runoffCandidates: string[];
  voteReveal: VoteReveal | null;
  roundResult: ImpostorRoundResult | null;
  roundScores: Record<string, number>;
  gameScores: Record<string, number>;
}

export function createImpostorState(context: GameContext, totalRounds = 4): ImpostorState {
  const playerIds = context.players.filter((player) => player.connected).map((player) => player.id);
  if (playerIds.length < 4) throw new GameRuleError("TOO_FEW_PLAYERS", "Impostor needs at least 4 connected players.");
  return createRound(playerIds, totalRounds, 1, [], [], {}, context.random);
}

export function handleImpostorCommand(
  state: ImpostorState,
  command: ImpostorCommand,
  actorPlayerId: string
): GameResult<ImpostorState> {
  requirePlayer(state, actorPlayerId);
  if (command.type === "impostor.submitClue") return submitClue(state, actorPlayerId, command.clue);
  if (command.type === "impostor.submitVote") return submitVote(state, actorPlayerId, command.targetPlayerId);
  if (command.type === "impostor.submitGuess") return submitFinalGuess(state, actorPlayerId, command.guess);
  throw new GameRuleError("INVALID_COMMAND", "That command does not belong to Impostor.");
}

export function advanceImpostor(state: ImpostorState, random: () => number): GameResult<ImpostorState> {
  if (state.phase === "roleReveal") return { state: { ...state, phase: "clueSubmission" } };
  if (state.phase === "clueReveal") {
    if (state.currentClueIndex + 1 < state.clueOrder.length) {
      return { state: { ...state, currentClueIndex: state.currentClueIndex + 1 } };
    }
    return { state: { ...state, phase: "discussion" } };
  }
  if (state.phase === "discussion") return { state: { ...state, phase: "voting", votes: {}, voteRound: 1, runoffCandidates: [], voteReveal: null } };
  if (state.phase === "voteReveal") return advanceVoteReveal(state);
  if (state.phase === "roundResults") {
    if (state.roundNumber >= state.totalRounds) return { state: { ...state, phase: "gameResults" } };
    return {
      state: createRound(
        state.playerIds,
        state.totalRounds,
        state.roundNumber + 1,
        state.usedWordIds,
        state.usedImpostorIds,
        state.gameScores,
        random
      )
    };
  }
  throw new GameRuleError("STALE_PHASE", "The game cannot advance during this phase.");
}

export function getImpostorPublicView(state: ImpostorState): ImpostorPublicView {
  const revealedClues = state.phase === "clueReveal"
    ? state.clueOrder.slice(0, state.currentClueIndex + 1).map((playerId) => ({ playerId, clue: state.clues[playerId] as string }))
    : ["discussion", "voting", "voteReveal", "impostorGuess", "roundResults", "gameResults"].includes(state.phase)
      ? state.clueOrder.map((playerId) => ({ playerId, clue: state.clues[playerId] as string }))
      : [];
  return {
    roundNumber: state.roundNumber,
    totalRounds: state.totalRounds,
    clueCount: Object.keys(state.clues).length,
    totalPlayers: state.playerIds.length,
    revealedClues,
    voteCount: Object.keys(state.votes).length,
    voteRound: state.voteRound,
    ...(state.runoffCandidates.length > 0 ? { runoffCandidates: state.runoffCandidates } : {}),
    ...(state.phase === "voteReveal" && state.voteReveal
      ? {
          voteReveal: {
            totals: state.voteReveal.totals,
            outcome: state.voteReveal.outcome,
            ...(state.voteReveal.accusedPlayerId === undefined ? {} : { accusedPlayerId: state.voteReveal.accusedPlayerId })
          }
        }
      : {}),
    ...((state.phase === "roundResults" || state.phase === "gameResults") && state.roundResult ? { roundResult: state.roundResult } : {}),
    roundScores: state.roundScores,
    gameScores: state.gameScores,
    ...(state.phase === "gameResults" ? { rankings: rankings(state.gameScores) } : {})
  };
}

export function getImpostorPrivateView(state: ImpostorState, viewer: ViewerContext): ImpostorPrivateView {
  const common = {
    hasSubmittedClue: state.clues[viewer.playerId] !== undefined,
    hasVoted: state.votes[viewer.playerId] !== undefined
  };
  return viewer.playerId === state.impostorPlayerId
    ? { role: "impostor", ...common }
    : { role: "player", secretWord: state.secretWord, ...common };
}

function submitClue(state: ImpostorState, actorPlayerId: string, clue: string): GameResult<ImpostorState> {
  if (state.phase !== "clueSubmission") throw new GameRuleError("STALE_PHASE", "Clue submission is closed.");
  if (state.clues[actorPlayerId] !== undefined) throw new GameRuleError("ALREADY_SUBMITTED", "Your clue is already locked in.");
  const trimmed = clue.trim();
  if (trimmed.length === 0 || trimmed.length > 32) throw new GameRuleError("INVALID_COMMAND", "Clues must be 1–32 characters.");
  if (actorPlayerId !== state.impostorPlayerId && normalize(trimmed) === normalize(state.secretWord)) {
    throw new GameRuleError("INVALID_COMMAND", "Your clue cannot be the secret word.");
  }
  const clues = { ...state.clues, [actorPlayerId]: trimmed };
  return Object.keys(clues).length === state.playerIds.length
    ? { state: { ...state, phase: "clueReveal", clues, currentClueIndex: 0 } }
    : { state: { ...state, clues } };
}

function submitVote(state: ImpostorState, actorPlayerId: string, targetPlayerId: string): GameResult<ImpostorState> {
  if (state.phase !== "voting") throw new GameRuleError("STALE_PHASE", "Voting is closed.");
  if (state.votes[actorPlayerId] !== undefined) throw new GameRuleError("ALREADY_SUBMITTED", "Your vote is already locked in.");
  if (targetPlayerId === actorPlayerId) throw new GameRuleError("INVALID_COMMAND", "You cannot vote for yourself.");
  const candidates = state.voteRound === 2 ? state.runoffCandidates : state.playerIds;
  if (!candidates.includes(targetPlayerId)) throw new GameRuleError("INVALID_COMMAND", "Choose an eligible player.");
  const votes = { ...state.votes, [actorPlayerId]: targetPlayerId };
  if (Object.keys(votes).length < state.playerIds.length) return { state: { ...state, votes } };

  const totals = countVotes(votes);
  const maxVotes = Math.max(...Object.values(totals));
  const leaders = Object.entries(totals).filter(([, count]) => count === maxVotes).map(([playerId]) => playerId);
  const uniqueLeader = leaders.length === 1 ? leaders[0] : undefined;
  const outcome: VoteReveal["outcome"] = uniqueLeader === state.impostorPlayerId
    ? "caught"
    : uniqueLeader === undefined && state.voteRound === 1
      ? "runoff"
      : "escaped";
  return {
    state: {
      ...state,
      phase: "voteReveal",
      votes,
      voteReveal: {
        totals,
        outcome,
        ...(uniqueLeader === undefined ? {} : { accusedPlayerId: uniqueLeader }),
        tiedPlayerIds: leaders
      }
    }
  };
}

function advanceVoteReveal(state: ImpostorState): GameResult<ImpostorState> {
  const reveal = state.voteReveal;
  if (!reveal) throw new GameRuleError("INVALID_PHASE", "Vote results are missing.");
  if (reveal.outcome === "runoff") {
    return {
      state: {
        ...state,
        phase: "voting",
        voteRound: 2,
        runoffCandidates: reveal.tiedPlayerIds,
        votes: {},
        voteReveal: null
      }
    };
  }
  if (reveal.outcome === "caught") return { state: { ...state, phase: "impostorGuess" } };

  const pointsAwarded = { [state.impostorPlayerId]: 3 };
  return {
    state: finishRound(state, "escaped", pointsAwarded),
    scoreDelta: pointsAwarded
  };
}

function submitFinalGuess(state: ImpostorState, actorPlayerId: string, guess: string): GameResult<ImpostorState> {
  if (state.phase !== "impostorGuess") throw new GameRuleError("STALE_PHASE", "The final guess is not available.");
  if (actorPlayerId !== state.impostorPlayerId) throw new GameRuleError("PLAYER_NOT_ACTIVE", "Only the impostor can make the final guess.");
  const trimmed = guess.trim();
  if (trimmed.length === 0 || trimmed.length > 64) throw new GameRuleError("INVALID_COMMAND", "Enter a guess of 1–64 characters.");

  const correct = normalize(trimmed) === normalize(state.secretWord);
  const pointsAwarded: Record<string, number> = {};
  if (correct) pointsAwarded[state.impostorPlayerId] = 2;
  else {
    for (const playerId of state.playerIds) if (playerId !== state.impostorPlayerId) pointsAwarded[playerId] = 1;
  }
  for (const [voterId, targetId] of Object.entries(state.votes)) {
    if (voterId !== state.impostorPlayerId && targetId === state.impostorPlayerId) {
      pointsAwarded[voterId] = (pointsAwarded[voterId] ?? 0) + 1;
    }
  }
  return {
    state: finishRound(state, correct ? "stolen" : "team-won", pointsAwarded, trimmed),
    scoreDelta: pointsAwarded
  };
}

function finishRound(
  state: ImpostorState,
  outcome: ImpostorRoundResult["outcome"],
  pointsAwarded: Record<string, number>,
  finalGuess?: string
): ImpostorState {
  return {
    ...state,
    phase: "roundResults",
    roundScores: addScore(state.roundScores, pointsAwarded),
    gameScores: addScore(state.gameScores, pointsAwarded),
    roundResult: {
      secretWord: state.secretWord,
      impostorPlayerId: state.impostorPlayerId,
      outcome,
      ...(finalGuess === undefined ? {} : { finalGuess }),
      pointsAwarded
    }
  };
}

function createRound(
  playerIds: string[],
  totalRounds: number,
  roundNumber: number,
  usedWordIds: string[],
  usedImpostorIds: string[],
  gameScores: Record<string, number>,
  random: () => number
): ImpostorState {
  const word = pickWord(usedWordIds, random);
  const unusedImpostors = playerIds.filter((playerId) => !usedImpostorIds.includes(playerId));
  const candidates = unusedImpostors.length > 0 ? unusedImpostors : playerIds;
  const impostorPlayerId = candidates[Math.floor(random() * candidates.length)] as string;
  return {
    phase: "roleReveal",
    roundNumber,
    totalRounds,
    playerIds,
    secretWord: word.word,
    wordId: word.id,
    usedWordIds: [...usedWordIds, word.id],
    impostorPlayerId,
    usedImpostorIds: [...usedImpostorIds, impostorPlayerId],
    clues: {},
    clueOrder: shuffled(playerIds, random),
    currentClueIndex: 0,
    votes: {},
    voteRound: 1,
    runoffCandidates: [],
    voteReveal: null,
    roundResult: null,
    roundScores: Object.fromEntries(playerIds.map((playerId) => [playerId, 0])),
    gameScores: Object.keys(gameScores).length > 0 ? { ...gameScores } : Object.fromEntries(playerIds.map((playerId) => [playerId, 0]))
  };
}

function pickWord(usedWordIds: readonly string[], random: () => number): ImpostorWord {
  const available = IMPOSTOR_WORDS.filter((word) => !usedWordIds.includes(word.id));
  if (available.length === 0) throw new GameRuleError("SERVER_ERROR", "The word deck is exhausted.");
  return available[Math.floor(random() * available.length)] as ImpostorWord;
}

function countVotes(votes: Record<string, string>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const targetId of Object.values(votes)) totals[targetId] = (totals[targetId] ?? 0) + 1;
  return totals;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function requirePlayer(state: ImpostorState, playerId: string): void {
  if (!state.playerIds.includes(playerId)) throw new GameRuleError("PLAYER_NOT_ACTIVE", "You are not active in this game.");
}
