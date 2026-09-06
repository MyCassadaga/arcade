import { addScore, GameRuleError, rankings, shuffled } from "@team-arcade/game-core";
import type { GameContext, GameResult, ViewerContext } from "@team-arcade/game-core";
import type { CategoriesAnswerGroup, CategoriesCommand, CategoriesPrivateView, CategoriesPublicView } from "@team-arcade/shared";
import caseFold from "./case-fold.json";
import { CATEGORIES_DECK } from "./deck";

export interface CategoriesState {
  gameInstanceId: string;
  phase: "submitting" | "reveal" | "roundResults" | "gameResults";
  roundNumber: number;
  totalRounds: number;
  categories: string[];
  playerIds: string[];
  submissions: Record<string, string>;
  groups: CategoriesAnswerGroup[];
  roundScores: Record<string, number>;
  gameScores: Record<string, number>;
}

// Unicode 17.0.0 default full case folding (C + F), pinned in case-fold.json.
// Source: https://www.unicode.org/Public/17.0.0/ucd/CaseFolding.txt
// See UNICODE-LICENSE.txt. No locale casing, accent removal, or fuzzy matching.
export function normalizeCategoriesAnswer(answer: string): string {
  const mapping: Readonly<Record<string, string>> = caseFold;
  return Array.from(answer.trim(), (character) => mapping[character] ?? character)
    .join("")
    .replace(/\s+/gu, " ")
    .replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, "");
}

export function createCategoriesState(context: GameContext, gameInstanceId: string): CategoriesState {
  const playerIds = context.players.filter((player) => player.connected).map((player) => player.id);
  if (playerIds.length < 2) throw new GameRuleError("TOO_FEW_PLAYERS", "Categories needs at least 2 connected players.");
  if (playerIds.length > 12) throw new GameRuleError("TOO_MANY_PLAYERS", "Categories supports up to 12 players.");
  const categories = shuffled([...new Set(CATEGORIES_DECK)], context.random).slice(0, 5);
  if (categories.length !== 5) throw new GameRuleError("SERVER_ERROR", "Categories needs five distinct categories.");
  const scores = Object.fromEntries(playerIds.map((id) => [id, 0]));
  return { gameInstanceId, phase: "submitting", roundNumber: 1, totalRounds: 5, categories, playerIds,
    submissions: {}, groups: [], roundScores: { ...scores }, gameScores: scores };
}

export function handleCategoriesCommand(state: CategoriesState, command: CategoriesCommand, actorPlayerId: string): GameResult<CategoriesState> {
  if (!state.playerIds.includes(actorPlayerId)) throw new GameRuleError("PLAYER_NOT_ACTIVE", "You are not active in this game.");
  if (state.phase !== "submitting" || command.gameInstanceId !== state.gameInstanceId || command.roundNumber !== state.roundNumber) {
    throw new GameRuleError("STALE_PHASE", "Answers are closed for that round.");
  }
  const answer = command.answer.trim();
  if (answer.length < 1 || answer.length > 40) throw new GameRuleError("INVALID_COMMAND", "Answers must be 1–40 characters.");
  const submissions = { ...state.submissions, [actorPlayerId]: answer };
  if (Object.keys(submissions).length < state.playerIds.length) return { state: { ...state, submissions } };

  const byNormalized = new Map<string, CategoriesAnswerGroup["answers"]>();
  for (const playerId of state.playerIds) {
    const submitted = submissions[playerId] as string;
    const normalized = normalizeCategoriesAnswer(submitted);
    const group = byNormalized.get(normalized) ?? [];
    group.push({ playerId, answer: submitted });
    byNormalized.set(normalized, group);
  }
  const groups: CategoriesAnswerGroup[] = Array.from(byNormalized.values(), (answers) => ({
    result: answers.length === 1 ? "unique" : "cancelled", answers
  }));
  const scoreDelta = Object.fromEntries(groups.flatMap((group) => group.answers.map(({ playerId }) => [playerId, group.result === "unique" ? 1 : 0])));
  return { state: { ...state, phase: "reveal", submissions, groups, roundScores: scoreDelta,
    gameScores: addScore(state.gameScores, scoreDelta) }, scoreDelta };
}

export function advanceCategories(state: CategoriesState): GameResult<CategoriesState> {
  if (state.phase === "reveal") return { state: { ...state, phase: "roundResults" } };
  if (state.phase !== "roundResults") throw new GameRuleError("STALE_PHASE", "The game cannot advance during this phase.");
  if (state.roundNumber === state.totalRounds) return { state: { ...state, phase: "gameResults" } };
  return { state: { ...state, phase: "submitting", roundNumber: state.roundNumber + 1, submissions: {}, groups: [],
    roundScores: Object.fromEntries(state.playerIds.map((id) => [id, 0])) } };
}

export function getCategoriesPublicView(state: CategoriesState): CategoriesPublicView {
  return {
    gameInstanceId: state.gameInstanceId, roundNumber: state.roundNumber, totalRounds: state.totalRounds,
    category: state.categories[state.roundNumber - 1] as string,
    submissionCount: Object.keys(state.submissions).length, totalPlayers: state.playerIds.length,
    roundScores: { ...state.roundScores }, gameScores: { ...state.gameScores },
    ...(state.phase === "submitting" ? {} : { groups: state.groups.map((group) => ({ ...group, answers: group.answers.map((answer) => ({ ...answer })) })) }),
    ...(state.phase === "gameResults" ? { rankings: rankings(state.gameScores) } : {})
  };
}

export function getCategoriesPrivateView(state: CategoriesState, viewer: ViewerContext): CategoriesPrivateView {
  const answer = state.submissions[viewer.playerId];
  return { hasSubmitted: answer !== undefined, ...(answer === undefined ? {} : { submittedAnswer: answer }) };
}
