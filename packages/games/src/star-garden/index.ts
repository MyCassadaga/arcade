import { GameRuleError } from "@team-arcade/game-core";
import type { GameContext, GameResult } from "@team-arcade/game-core";
import { starGardenCommandSchema } from "@team-arcade/shared";
import type { StarGardenCard, StarGardenCommand, StarGardenMode, StarGardenPhase, StarGardenPrivateView, StarGardenPublicView, StarGardenRoundResult, StarGardenStanding, StarGardenTier, StarKind } from "@team-arcade/shared";
import { STAR_GARDEN_GOALS, STAR_GARDEN_TIERS, starGardenDeck } from "./content";
import { fnv1a, matchStarGardenGoal, refillStars, starGardenIndex, starGardenMatches, starGardenShuffle, transformStars } from "./rules";
import type { StarGardenRng } from "./rules";
export * from "./content";
export * from "./rules";

export interface StarGardenPlayer {
  board: StarKind[]; hand: StarGardenCard[]; drawPile: StarGardenCard[]; drawCursor: number; discard: StarGardenCard[];
  stars: StarGardenRng; actions: StarGardenRng; score: number; goalsClaimed: number; actionsSpent: number;
  revision: number; remainingActions: number; done: boolean; pending: { goalId: string; points: number } | null;
  closedActions: number;
}
export interface StarGardenState {
  gameInstanceId: string; rulesVersion: "v1"; contentVersion: "v1"; phase: StarGardenPhase; mode: StarGardenMode | null;
  roster: string[]; dailyDate: string | null; roundNumber: number; deadlineAt: number | null;
  lanes: Record<StarGardenTier, string[]>; laneCursors: Record<StarGardenTier, number>; goalStreams: Record<StarGardenTier, StarGardenRng>;
  players: Record<string, StarGardenPlayer>; history: StarGardenRoundResult[]; endingReason: StarGardenPublicView["endingReason"];
}
function fail(message: string, code: "INVALID_COMMAND" | "STALE_PHASE" | "PLAYER_NOT_ACTIVE" | "NOT_HOST" = "INVALID_COMMAND"): never { throw new GameRuleError(code, message); }
function emptyPlayer(): StarGardenPlayer {
  return { board: [], hand: [], drawPile: [], drawCursor: 0, discard: [], stars: { state: 1 }, actions: { state: 1 }, score: 0, goalsClaimed: 0, actionsSpent: 0, revision: 0, remainingActions: 3, done: false, pending: null, closedActions: 0 };
}
export function createStarGardenState(context: GameContext, gameInstanceId: string): StarGardenState {
  if (context.players.length < 1) throw new GameRuleError("TOO_FEW_PLAYERS", "Star Garden needs at least one player.");
  if (context.players.length > 8) throw new GameRuleError("TOO_MANY_PLAYERS", "Star Garden supports at most eight players.");
  const roster = context.players.map((p) => p.id);
  return { gameInstanceId, rulesVersion: "v1", contentVersion: "v1", phase: "setup", mode: null, roster, dailyDate: null, roundNumber: 0, deadlineAt: null,
    lanes: { easy: [], medium: [], hard: [] }, laneCursors: { easy: 0, medium: 0, hard: 0 }, goalStreams: { easy: { state: 1 }, medium: { state: 1 }, hard: { state: 1 } },
    players: Object.fromEntries(roster.map((id) => [id, emptyPlayer()])), history: [], endingReason: null };
}
function drawCards(player: StarGardenPlayer, count: number): void {
  for (let i = 0; i < count && player.hand.length < 5; i++) {
    if (player.drawCursor >= player.drawPile.length) {
      player.drawPile = starGardenShuffle(player.discard, player.actions);
      player.discard = []; player.drawCursor = 0;
    }
    const card = player.drawPile[player.drawCursor];
    if (!card) break;
    player.drawCursor++; player.hand.push(card);
  }
}
function drawStar(player: StarGardenPlayer): StarKind { return starGardenIndex(player.stars, 4) as StarKind; }
export function currentStarGardenGoals(state: StarGardenState) {
  if (state.phase === "setup") return [];
  return STAR_GARDEN_TIERS.flatMap((tier) => {
    const id = state.lanes[tier][state.mode === "cup" ? state.roundNumber - 1 : state.laneCursors[tier]];
    const goal = STAR_GARDEN_GOALS.find((g) => g.id === id);
    return goal ? [{ ...goal }] : [];
  });
}
function finishSolo(state: StarGardenState, player: StarGardenPlayer): void {
  if (player.goalsClaimed === 30) state.endingReason = "all-goals";
  else if (!player.hand.length && !currentStarGardenGoals(state).some((goal) => starGardenMatches(player.board, goal).length > 0)) state.endingReason = "out-of-cards";
  if (state.endingReason) state.phase = "gameResults";
}
function closeRound(state: StarGardenState, closedAt: number): Record<string, number> {
  const delta: Record<string, number> = {};
  const claims = state.roster.map((id) => {
    const p = state.players[id]!;
    const points = p.pending?.points ?? 0;
    delta[id] = points; p.score += points;
    if (p.pending) p.goalsClaimed++;
    const goalId = p.pending?.goalId ?? null;
    p.pending = null; p.done = true; p.revision++; p.closedActions = p.actionsSpent;
    return { playerId: id, goalId, points };
  });
  state.history.push({ roundNumber: state.roundNumber, closedAt, claims });
  state.phase = state.roundNumber === 6 ? "gameResults" : "reveal";
  state.deadlineAt = state.phase === "reveal" ? closedAt + 6000 : null;
  if (state.phase === "gameResults") state.endingReason = "cup-complete";
  return delta;
}
// No global clock: late alarms advance using scheduled boundaries, at most 11 transitions.
export function advanceStarGardenDue(original: StarGardenState, now: number): GameResult<StarGardenState> {
  if (original.mode !== "cup" || original.deadlineAt === null || now < original.deadlineAt) return { state: original };
  const state = structuredClone(original);
  const scoreDelta: Record<string, number> = {};
  for (let guard = 0; guard < 12 && state.deadlineAt !== null && now >= state.deadlineAt; guard++) {
    const boundary = state.deadlineAt;
    if (state.phase === "playing") {
      const delta = closeRound(state, boundary);
      for (const id of state.roster) scoreDelta[id] = (scoreDelta[id] ?? 0) + delta[id]!;
    } else if (state.phase === "reveal") {
      state.roundNumber++; state.phase = "playing"; state.deadlineAt = boundary + 75000;
      for (const p of Object.values(state.players)) { drawCards(p, 5 - p.hand.length); p.remainingActions = 3; p.done = false; p.pending = null; p.revision++; }
    } else break;
  }
  return { state, scoreDelta };
}
export function handleStarGardenCommand(original: StarGardenState, raw: StarGardenCommand, actor: string, now: number, isHost: boolean, seedUuid: string): GameResult<StarGardenState> {
  const parsed = starGardenCommandSchema.safeParse(raw);
  if (!parsed.success) fail("That Star Garden command is invalid.");
  const command = parsed.data;
  const oldPlayer = original.players[actor];
  if (!oldPlayer) fail("You are not in this game's frozen roster.", "PLAYER_NOT_ACTIVE");
  if (original.rulesVersion !== "v1" || original.contentVersion !== "v1") fail("This version is not supported.", "STALE_PHASE");
  if (command.gameInstanceId !== original.gameInstanceId || command.roundNumber !== original.roundNumber || command.expectedRevision !== oldPlayer.revision) fail("Your selection is out of date. Select again from the restored board.", "STALE_PHASE");
  const state = structuredClone(original);
  const player = state.players[actor]!;
  if (command.type === "starGarden.begin") {
    if (!isHost) fail("Only the host can Begin.", "NOT_HOST");
    if (state.phase !== "setup") fail("This run has already begun.", "STALE_PHASE");
    if (state.roster.length < 1 || state.roster.length > 8 || (state.roster.length === 1 ? command.mode === "cup" : command.mode !== "cup")) fail("Choose Daily or Practice for one player, or Cup for 2–8 players.");
    state.mode = command.mode; state.phase = "playing";
    state.dailyDate = command.mode === "daily" ? new Date(now).toISOString().slice(0, 10) : null;
    const root = `star-garden:v1:${command.mode}:${state.dailyDate ?? seedUuid}`;
    for (const tier of STAR_GARDEN_TIERS) {
      state.goalStreams[tier] = { state: fnv1a(`${root}:goals:${tier}`) };
      state.lanes[tier] = starGardenShuffle(STAR_GARDEN_GOALS.filter((g) => g.tier === tier).map((g) => g.id), state.goalStreams[tier]);
    }
    for (const id of state.roster) {
      const p = state.players[id]!;
      p.stars = { state: fnv1a(`${root}:stars`) }; p.actions = { state: fnv1a(`${root}:actions`) };
      p.board = Array.from({ length: 10 }, () => drawStar(p));
      p.drawPile = starGardenShuffle(starGardenDeck(), p.actions); drawCards(p, 5); p.revision++;
    }
    if (state.mode === "cup") { state.roundNumber = 1; state.deadlineAt = now + 75000; }
    return { state };
  }
  if (state.phase !== "playing" || player.done || (state.deadlineAt !== null && now >= state.deadlineAt)) fail("This play phase is closed.", "STALE_PHASE");
  let scoreDelta: Record<string, number> = {};
  const spend = (ids: readonly string[]) => {
    if (new Set(ids).size !== ids.length || ids.some((id) => !player.hand.some((card) => card.id === id))) fail("Select cards from your current hand.");
    if (state.mode === "cup" && player.remainingActions < ids.length) fail("Not enough action allowances remain.");
    // Selection order determines discard order, including Refresh.
    player.discard.push(...ids.map((id) => player.hand.find((card) => card.id === id)!));
    player.hand = player.hand.filter((card) => !ids.includes(card.id));
    player.actionsSpent += ids.length;
    if (state.mode === "cup") player.remainingActions -= ids.length;
  };
  switch (command.type) {
    case "starGarden.playCard": {
      const card = player.hand.find((card) => card.id === command.cardId);
      if (!card || card.action !== command.effect.action) fail("That card is not in your hand or has a different action.");
      spend([command.cardId]);
      player.board = transformStars(player.board, command.effect, () => drawStar(player), (old) => {
        const alternatives = ([0, 1, 2, 3] as StarKind[]).filter((kind) => kind !== old);
        return alternatives[starGardenIndex(player.stars, 3)]!;
      });
      break;
    }
    case "starGarden.refresh": spend(command.cardIds); player.board = refillStars(player.board, Array.from({ length: 10 }, (_, i) => i), () => drawStar(player)); break;
    case "starGarden.claimGoal": {
      const goal = currentStarGardenGoals(state).find((g) => g.id === command.goalId);
      if (!goal) fail("That constellation is not available.");
      const cells = matchStarGardenGoal(player.board, goal, command.origin);
      if (!cells) fail("That origin does not match this constellation.");
      player.board = refillStars(player.board, cells, () => drawStar(player));
      if (state.mode === "cup") { player.pending = { goalId: goal.id, points: goal.points }; player.done = true; }
      else { player.score += goal.points; player.goalsClaimed++; state.laneCursors[goal.tier]++; drawCards(player, Math.min(2, 5 - player.hand.length)); scoreDelta[actor] = goal.points; }
      break;
    }
    case "starGarden.doneRound": if (state.mode !== "cup") fail("Done is only available in Cup."); player.done = true; break;
    case "starGarden.endRun": if (state.mode === "cup") fail("Cup ends after six rounds."); state.endingReason = "ended"; state.phase = "gameResults"; break;
  }
  player.revision++;
  if (state.mode === "cup") {
    if (state.roster.every((id) => state.players[id]!.done)) scoreDelta = closeRound(state, now);
  } else if (state.phase === "playing") finishSolo(state, player);
  return { state, scoreDelta };
}
export function starGardenStandings(state: StarGardenState): StarGardenStanding[] {
  const entries = state.roster.map((id) => {
    const p = state.players[id]!;
    return { playerId: id, score: p.score, goals: p.goalsClaimed, actions: state.mode === "cup" ? p.closedActions : p.actionsSpent, rank: 1 };
  }).sort((a, b) => b.score - a.score || b.goals - a.goals || a.actions - b.actions);
  entries.forEach((p, i) => { const previous = entries[i - 1]; p.rank = previous && p.score === previous.score && p.goals === previous.goals && p.actions === previous.actions ? previous.rank : i + 1; });
  return entries;
}
export function getStarGardenPublicView(state: StarGardenState): StarGardenPublicView {
  return { gameInstanceId: state.gameInstanceId, rulesVersion: state.rulesVersion, contentVersion: state.contentVersion, mode: state.mode, dailyDate: state.dailyDate, roundNumber: state.roundNumber, deadlineAt: state.deadlineAt,
    roster: [...state.roster], goals: currentStarGardenGoals(state), readiness: Object.fromEntries(state.roster.map((id) => [id, state.players[id]!.done])), standings: starGardenStandings(state), history: state.history.map((round) => ({ roundNumber: round.roundNumber, closedAt: round.closedAt, claims: state.roster.map((id): [string | null, number] => { const claim = round.claims.find((entry) => entry.playerId === id)!; return [claim.goalId, claim.points]; }) })), endingReason: state.endingReason };
}
export function getStarGardenPrivateView(state: StarGardenState, actor: string): StarGardenPrivateView {
  const p = state.players[actor];
  if (!p) return { board: [], hand: [], revision: 0, score: 0, goalsClaimed: 0, actionsSpent: 0, remainingActions: 0, done: true, pendingGoalId: null };
  return { board: [...p.board], hand: p.hand.map((c) => ({ ...c })), revision: p.revision, score: p.score, goalsClaimed: p.goalsClaimed, actionsSpent: p.actionsSpent, remainingActions: p.remainingActions, done: p.done, pendingGoalId: p.pending?.goalId ?? null };
}
