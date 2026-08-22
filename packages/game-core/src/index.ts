import type { ErrorCode, GameViewerState, PlayerView } from "@team-arcade/shared";

export interface GameContext {
  players: readonly PlayerView[];
  now: number;
  random: () => number;
}

export interface CommandContext extends GameContext {
  actorPlayerId: string;
  isHost: boolean;
}

export interface ViewerContext {
  playerId: string;
  isHost: boolean;
}

export interface GameResult<State> {
  state: State;
  scoreDelta?: Readonly<Record<string, number>>;
}

export interface GameDefinition<State, Command> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  createInitialState(context: GameContext): State;
  handleCommand(state: State, command: Command, context: CommandContext): GameResult<State>;
  getPublicView(state: State, viewer: ViewerContext): GameViewerState["public"];
  getPrivateView(state: State, playerId: string): GameViewerState["private"];
}

export class GameRuleError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

export function addScore(
  scores: Readonly<Record<string, number>>,
  delta: Readonly<Record<string, number>>
): Record<string, number> {
  const next = { ...scores };
  for (const [playerId, points] of Object.entries(delta)) next[playerId] = (next[playerId] ?? 0) + points;
  return next;
}

export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const value = result[index];
    result[index] = result[swapIndex] as T;
    result[swapIndex] = value as T;
  }
  return result;
}

export function rankings(scores: Readonly<Record<string, number>>): Array<{ playerId: string; score: number }> {
  return Object.entries(scores)
    .map(([playerId, score]) => ({ playerId, score }))
    .sort((left, right) => right.score - left.score || left.playerId.localeCompare(right.playerId));
}
