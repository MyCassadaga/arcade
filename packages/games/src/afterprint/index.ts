import { GameRuleError } from "@team-arcade/game-core";
import type { GameContext, GameResult, ViewerContext } from "@team-arcade/game-core";
import type {
  AfterprintAttemptView,
  AfterprintCommand,
  AfterprintPrivateView,
  AfterprintPublicView
} from "@team-arcade/shared";
import { countAfterprintMismatches, simulateAfterprint } from "./simulator";
import { getAfterprintPuzzleNumber, selectAfterprintPuzzle, type FrozenAfterprintPuzzle } from "./puzzles";

export interface AfterprintState {
  gameInstanceId: string;
  phase: "playing" | "gameResults";
  activePlayerId: string;
  puzzle: FrozenAfterprintPuzzle;
  attempts: AfterprintAttemptView[];
  solved: boolean;
}

export function createAfterprintState(context: GameContext, gameInstanceId: string): AfterprintState {
  const playerIds = context.players.filter((player) => player.connected).map((player) => player.id);
  if (playerIds.length < 1) throw new GameRuleError("TOO_FEW_PLAYERS", "AFTERPRINT needs one connected player.");
  if (playerIds.length > 1) throw new GameRuleError("TOO_MANY_PLAYERS", "AFTERPRINT is a single-player game.");
  return {
    gameInstanceId,
    phase: "playing",
    activePlayerId: playerIds[0] as string,
    puzzle: selectAfterprintPuzzle(getAfterprintPuzzleNumber(context.now)),
    attempts: [],
    solved: false
  };
}

export function handleAfterprintCommand(
  state: AfterprintState,
  command: AfterprintCommand,
  actorPlayerId: string
): GameResult<AfterprintState> {
  if (actorPlayerId !== state.activePlayerId) throw new GameRuleError("PLAYER_NOT_ACTIVE", "You are not active in this game.");
  if (state.phase !== "playing" || command.gameInstanceId !== state.gameInstanceId || command.puzzleNumber !== state.puzzle.puzzleNumber) {
    throw new GameRuleError("STALE_PHASE", "That reconstruction is no longer active.");
  }
  if (state.attempts.length >= 4) throw new GameRuleError("STALE_PHASE", "All four attempts have been used.");
  const board = simulateAfterprint(state.puzzle.events, command.eventIds);
  const mismatchCount = countAfterprintMismatches(board, state.puzzle.target);
  const attempt = { eventIds: [...command.eventIds], mismatchCount, solved: mismatchCount === 0 };
  const attempts = [...state.attempts, attempt];
  const finished = attempt.solved || attempts.length === 4;
  return { state: { ...state, phase: finished ? "gameResults" : "playing", attempts, solved: attempt.solved } };
}

export function advanceAfterprint(): GameResult<AfterprintState> {
  throw new GameRuleError("STALE_PHASE", "AFTERPRINT advances through reconstruction attempts.");
}

export function getAfterprintPublicView(state: AfterprintState): AfterprintPublicView {
  return {
    gameInstanceId: state.gameInstanceId,
    puzzleNumber: state.puzzle.puzzleNumber,
    bankVersion: state.puzzle.bankVersion,
    target: [...state.puzzle.target],
    events: state.puzzle.events.map((event) => event.kind === "drop" ? { ...event } : { ...event, path: [...event.path] }),
    initialEventIds: [...state.puzzle.initialEventIds],
    attempts: state.attempts.map((attempt) => ({ ...attempt, eventIds: [...attempt.eventIds] })),
    maxAttempts: 4,
    activePlayerId: state.activePlayerId,
    solved: state.solved
  };
}

export function getAfterprintPrivateView(state: AfterprintState, viewer: ViewerContext): AfterprintPrivateView {
  return { canSubmit: viewer.playerId === state.activePlayerId && state.phase === "playing" };
}

export * from "./puzzles";
export * from "./simulator";
