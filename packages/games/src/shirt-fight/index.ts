import { GameRuleError } from "@team-arcade/game-core";
import type { GameContext, GameResult, ViewerContext } from "@team-arcade/game-core";
import type {
  ShirtFightAwardView,
  ShirtFightCommand,
  ShirtFightPrivateView,
  ShirtFightPublicView,
  ShirtFightShirtView
} from "@team-arcade/shared";

export const SHIRT_FIGHT_DRAWING_MS = 60_000;
export const SHIRT_FIGHT_SLOGAN_MS = 60_000;
export const SHIRT_FIGHT_ASSEMBLY_MS = 60_000;
export const SHIRT_FIGHT_VOTE_MS = 15_000;
export const SHIRT_FIGHT_SUDDEN_DEATH_MS = 10_000;
export const SHIRT_FIGHT_REVEAL_MS = 10_000;

export interface ShirtFightDrawing {
  id: string;
  artistPlayerId: string;
  round: 1 | 2;
  drawingNumber: 1 | 2;
  createdAt: number;
  durationMs: number;
  width: 600;
  height: 800;
  byteLength: number;
  mediaType: "image/webp";
  fallback: boolean;
}

export interface ShirtFightSlogan {
  id: string;
  authorPlayerId: string;
  round: 1 | 2;
  text: string;
  submittedAt: number;
  submissionOrder: number;
  synthetic: boolean;
}

export interface ShirtFightAssignment {
  drawingIds: string[];
  sloganIds: string[];
}

export interface ShirtFightShirt {
  id: string;
  drawingId: string;
  sloganId: string;
  assemblerPlayerId: string;
  sourceRound: 1 | 2;
  createdAt: number;
}

export interface ShirtFightMatchupRecord {
  id: string;
  stage: "round-1" | "round-2" | "final";
  shirtIds: [string, string];
  votes: Record<string, string>;
  suddenDeathVotes?: Record<string, string>;
  winnerShirtId: string;
  randomTieBreak: boolean;
  completedAt: number;
}

interface ActiveMatchup {
  id: string;
  shirtIds: [string, string];
  votes: Record<string, string>;
  suddenDeath: boolean;
  initialVotes?: Record<string, string>;
}

export interface ShirtFightState {
  gameInstanceId: string;
  seed: string;
  phase: "drawing" | "slogans" | "assembly" | "voting" | "roundReveal" | "finalVoting" | "finalReveal" | "gameResults";
  phaseNonce: number;
  phaseStartedAt: number;
  deadlineAt: number | undefined;
  generationRound: 1 | 2 | 3;
  drawingNumber: 1 | 2 | undefined;
  playerIds: string[];
  drawings: ShirtFightDrawing[];
  slogans: ShirtFightSlogan[];
  sloganReadyPlayerIds: string[];
  assignments: Partial<Record<1 | 2, Record<string, ShirtFightAssignment>>>;
  shirts: ShirtFightShirt[];
  matches: ShirtFightMatchupRecord[];
  qualifiedShirtIds: string[];
  votingQueue: string[];
  activeMatchup: ActiveMatchup | undefined;
  roundWinnerShirtIds: Partial<Record<1 | 2, string>>;
  finalWinnerShirtId: string | undefined;
  lastRandomTieBreak: boolean;
  awards: ShirtFightAwardView[];
}

export interface ShirtFightFallbackDrawing extends Omit<ShirtFightDrawing, "artistPlayerId" | "durationMs" | "fallback"> {
  playerId: string;
}

export function createShirtFightState(context: GameContext, gameInstanceId: string): ShirtFightState {
  const playerIds = context.players.filter((player) => player.connected).map((player) => player.id);
  if (playerIds.length < 3) throw new GameRuleError("TOO_FEW_PLAYERS", "Shirt Fight needs at least 3 connected players.");
  if (playerIds.length > 8) throw new GameRuleError("TOO_MANY_PLAYERS", "Shirt Fight supports up to 8 connected players.");
  return {
    gameInstanceId,
    seed: gameInstanceId,
    phase: "drawing",
    phaseNonce: 0,
    phaseStartedAt: context.now,
    deadlineAt: context.now + SHIRT_FIGHT_DRAWING_MS,
    generationRound: 1,
    drawingNumber: 1,
    playerIds,
    drawings: [],
    slogans: [],
    sloganReadyPlayerIds: [],
    assignments: {},
    shirts: [],
    matches: [],
    qualifiedShirtIds: [],
    votingQueue: [],
    activeMatchup: undefined,
    roundWinnerShirtIds: {},
    finalWinnerShirtId: undefined,
    lastRandomTieBreak: false,
    awards: []
  };
}

export function missingShirtFightDrawings(state: ShirtFightState): Array<{ playerId: string; round: 1 | 2; drawingNumber: 1 | 2 }> {
  if (state.phase !== "drawing" || state.generationRound === 3 || state.drawingNumber === undefined) return [];
  return state.playerIds.filter((playerId) => !state.drawings.some((drawing) =>
    drawing.artistPlayerId === playerId && drawing.round === state.generationRound && drawing.drawingNumber === state.drawingNumber
  )).map((playerId) => ({ playerId, round: state.generationRound as 1 | 2, drawingNumber: state.drawingNumber as 1 | 2 }));
}

export function registerShirtFightDrawing(state: ShirtFightState, drawing: ShirtFightDrawing, now: number): GameResult<ShirtFightState> {
  assertActive(state, drawing.artistPlayerId);
  if (state.phase !== "drawing" || state.generationRound !== drawing.round || state.drawingNumber !== drawing.drawingNumber) {
    throw new GameRuleError("STALE_PHASE", "That drawing phase is closed.");
  }
  if (state.drawings.some((item) => item.artistPlayerId === drawing.artistPlayerId && item.round === drawing.round && item.drawingNumber === drawing.drawingNumber)) {
    throw new GameRuleError("ALREADY_SUBMITTED", "That drawing is already finalized.");
  }
  const next = { ...state, drawings: [...state.drawings, { ...drawing, durationMs: Math.max(0, now - state.phaseStartedAt) }] };
  return { state: missingShirtFightDrawings(next).length === 0 ? enterAfterDrawing(next, now) : next };
}

export function handleShirtFightCommand(state: ShirtFightState, command: ShirtFightCommand, actorPlayerId: string, now: number): GameResult<ShirtFightState> {
  assertActive(state, actorPlayerId);
  if (command.gameInstanceId !== state.gameInstanceId || command.phaseNonce !== state.phaseNonce) {
    throw new GameRuleError("STALE_PHASE", "That Shirt Fight phase has ended.");
  }
  if (state.deadlineAt !== undefined && now >= state.deadlineAt) throw new GameRuleError("STALE_PHASE", "Time is up for that phase.");

  if (command.type === "shirtFight.submitSlogan") {
    if (state.phase !== "slogans" || state.generationRound === 3) throw new GameRuleError("STALE_PHASE", "Slogans are closed.");
    const text = command.text.trim();
    if (text.length < 1 || text.length > 80) throw new GameRuleError("INVALID_COMMAND", "Slogans must be 1–80 characters.");
    const submissionOrder = state.slogans.filter((slogan) => slogan.authorPlayerId === actorPlayerId && slogan.round === state.generationRound).length + 1;
    return { state: { ...state, slogans: [...state.slogans, {
      id: deterministicUuid(state.seed, `slogan:${state.generationRound}:${actorPlayerId}:${submissionOrder}`),
      authorPlayerId: actorPlayerId,
      round: state.generationRound,
      text,
      submittedAt: now,
      submissionOrder,
      synthetic: false
    }] } };
  }

  if (command.type === "shirtFight.finishSlogans") {
    if (state.phase !== "slogans") throw new GameRuleError("STALE_PHASE", "Slogans are closed.");
    if (state.sloganReadyPlayerIds.includes(actorPlayerId)) throw new GameRuleError("ALREADY_SUBMITTED", "You are already done writing.");
    const sloganReadyPlayerIds = [...state.sloganReadyPlayerIds, actorPlayerId];
    const next = { ...state, sloganReadyPlayerIds };
    return { state: sloganReadyPlayerIds.length === state.playerIds.length ? beginAssembly(withFallbackSlogans(next, now), now) : next };
  }

  if (command.type === "shirtFight.submitShirt") {
    if (state.phase !== "assembly" || state.generationRound === 3) throw new GameRuleError("STALE_PHASE", "Shirt assembly is closed.");
    if (state.shirts.some((shirt) => shirt.assemblerPlayerId === actorPlayerId && shirt.sourceRound === state.generationRound)) {
      throw new GameRuleError("ALREADY_SUBMITTED", "Your shirt is already locked.");
    }
    const assignment = state.assignments[state.generationRound]?.[actorPlayerId];
    if (!assignment?.drawingIds.includes(command.drawingId) || !assignment.sloganIds.includes(command.sloganId)) {
      throw new GameRuleError("INVALID_COMMAND", "Choose only from your assigned artwork and slogans.");
    }
    const shirt: ShirtFightShirt = {
      id: deterministicUuid(state.seed, `shirt:${state.generationRound}:${actorPlayerId}`),
      drawingId: command.drawingId,
      sloganId: command.sloganId,
      assemblerPlayerId: actorPlayerId,
      sourceRound: state.generationRound,
      createdAt: now
    };
    const next = { ...state, shirts: [...state.shirts, shirt] };
    return { state: shirtsForRound(next, state.generationRound).length === state.playerIds.length ? beginRoundVoting(next, now) : next };
  }

  if (command.type === "shirtFight.submitVote") {
    if ((state.phase !== "voting" && state.phase !== "finalVoting") || !state.activeMatchup) throw new GameRuleError("STALE_PHASE", "Voting is closed.");
    if (!state.activeMatchup.shirtIds.includes(command.shirtId)) throw new GameRuleError("INVALID_COMMAND", "Vote for one of the two shirts shown.");
    if (state.activeMatchup.votes[actorPlayerId]) throw new GameRuleError("ALREADY_SUBMITTED", "Your vote is already locked.");
    const activeMatchup = { ...state.activeMatchup, votes: { ...state.activeMatchup.votes, [actorPlayerId]: command.shirtId } };
    const next = { ...state, activeMatchup };
    return { state: Object.keys(activeMatchup.votes).length === state.playerIds.length ? resolveMatchup(next, now) : next };
  }

  throw new GameRuleError("INVALID_COMMAND", "That command is not available.");
}

export function advanceShirtFightDue(state: ShirtFightState, now: number, fallbackDrawings: ShirtFightFallbackDrawing[] = []): GameResult<ShirtFightState> {
  let next = state;
  let guard = 0;
  while (next.deadlineAt !== undefined && now >= next.deadlineAt && guard < 32) {
    guard += 1;
    const dueAt = next.deadlineAt;
    if (next.phase === "drawing") {
      const drawingPhaseNonce = next.phaseNonce;
      for (const missing of missingShirtFightDrawings(next)) {
        const fallback = fallbackDrawings.find((item) => item.playerId === missing.playerId && item.round === missing.round && item.drawingNumber === missing.drawingNumber);
        if (!fallback) return { state: next };
        next = registerShirtFightDrawing(next, {
          ...fallback,
          artistPlayerId: missing.playerId,
          round: missing.round,
          drawingNumber: missing.drawingNumber,
          durationMs: SHIRT_FIGHT_DRAWING_MS,
          fallback: true
        }, dueAt).state;
      }
      if (next.phase === "drawing" && next.phaseNonce === drawingPhaseNonce) next = enterAfterDrawing(next, dueAt);
    } else if (next.phase === "slogans") {
      next = beginAssembly(withFallbackSlogans(next, dueAt), dueAt);
    } else if (next.phase === "assembly") {
      next = finalizeMissingShirts(next, dueAt);
      next = beginRoundVoting(next, dueAt);
    } else if (next.phase === "voting" || next.phase === "finalVoting") {
      next = resolveMatchup(next, dueAt);
    } else if (next.phase === "roundReveal") {
      next = next.generationRound === 1 ? beginDrawingRound(next, 2, dueAt) : beginFinalVoting(next, dueAt);
    } else if (next.phase === "finalReveal") {
      next = { ...next, phase: "gameResults", phaseNonce: next.phaseNonce + 1, phaseStartedAt: dueAt, deadlineAt: undefined, awards: calculateShirtFightAwards(next) };
    } else break;
  }
  return { state: next };
}

export function advanceShirtFight(state: ShirtFightState, now: number): GameResult<ShirtFightState> {
  if (state.phase === "roundReveal") return { state: state.generationRound === 1 ? beginDrawingRound(state, 2, now) : beginFinalVoting(state, now) };
  if (state.phase === "finalReveal") return { state: { ...state, phase: "gameResults", phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: undefined, awards: calculateShirtFightAwards(state) } };
  throw new GameRuleError("STALE_PHASE", "Shirt Fight advances on its authoritative timer.");
}

export function getShirtFightPublicView(state: ShirtFightState): ShirtFightPublicView {
  const completedCount = state.phase === "drawing"
    ? state.playerIds.length - missingShirtFightDrawings(state).length
    : state.phase === "assembly" ? shirtsForRound(state, state.generationRound as 1 | 2).length
      : state.phase === "voting" || state.phase === "finalVoting" ? Object.keys(state.activeMatchup?.votes ?? {}).length
      : state.phase === "slogans" ? state.sloganReadyPlayerIds.length : state.playerIds.length;
  const publicView: ShirtFightPublicView = {
    gameInstanceId: state.gameInstanceId,
    phaseNonce: state.phaseNonce,
    phase: state.phase,
    generationRound: state.generationRound,
    ...(state.drawingNumber === undefined ? {} : { drawingNumber: state.drawingNumber }),
    ...(state.deadlineAt === undefined ? {} : { deadlineAt: state.deadlineAt }),
    completedCount,
    totalPlayers: state.playerIds.length
  };
  if ((state.phase === "voting" || state.phase === "finalVoting") && state.activeMatchup) {
    publicView.matchup = {
      id: state.activeMatchup.id,
      shirts: state.activeMatchup.shirtIds.map((id) => shirtView(state, id)) as [ShirtFightShirtView, ShirtFightShirtView],
      voteCount: Object.keys(state.activeMatchup.votes).length,
      suddenDeath: state.activeMatchup.suddenDeath
    };
  }
  const revealId = state.phase === "roundReveal" ? state.roundWinnerShirtIds[state.generationRound as 1 | 2] : undefined;
  if (revealId) publicView.reveal = { shirt: shirtView(state, revealId), credits: credits(state, revealId), randomTieBreak: state.lastRandomTieBreak };
  if ((state.phase === "finalReveal" || state.phase === "gameResults") && state.finalWinnerShirtId) {
    publicView.winner = { shirt: shirtView(state, state.finalWinnerShirtId), credits: credits(state, state.finalWinnerShirtId) };
  }
  if (state.phase === "gameResults") publicView.awards = state.awards.map((award) => ({ ...award, playerIds: [...award.playerIds] }));
  return publicView;
}

export function getShirtFightPrivateView(state: ShirtFightState, viewer: ViewerContext): ShirtFightPrivateView {
  if (!state.playerIds.includes(viewer.playerId)) return {};
  if (state.phase === "drawing") return { drawingSubmitted: missingShirtFightDrawings(state).every((item) => item.playerId !== viewer.playerId) };
  if (state.phase === "slogans") return { slogans: state.slogans.filter((item) => item.authorPlayerId === viewer.playerId && item.round === state.generationRound).map(({ id, text }) => ({ id, text })), slogansDone: state.sloganReadyPlayerIds.includes(viewer.playerId) };
  if (state.phase === "assembly") {
    const round = state.generationRound as 1 | 2;
    const assignment = state.assignments[round]?.[viewer.playerId];
    const submitted = state.shirts.find((shirt) => shirt.assemblerPlayerId === viewer.playerId && shirt.sourceRound === state.generationRound);
    const firstDrawingId = assignment?.drawingIds[0];
    const firstSloganId = assignment?.sloganIds[0];
    return {
      ...(assignment ? { assignment: {
        drawings: assignment.drawingIds.map((id) => drawingView(findDrawing(state, id))),
        slogans: assignment.sloganIds.map((id) => { const slogan = findSlogan(state, id); return { id: slogan.id, text: slogan.text }; })
      } } : {}),
      ...(firstDrawingId && firstSloganId ? { draft: { drawingId: submitted?.drawingId ?? firstDrawingId, sloganId: submitted?.sloganId ?? firstSloganId } } : {}),
      shirtSubmitted: submitted !== undefined
    };
  }
  if (state.phase === "voting" || state.phase === "finalVoting") return { hasVoted: Boolean(state.activeMatchup?.votes[viewer.playerId]) };
  return {};
}

export function canViewerAccessShirtFightDrawing(state: ShirtFightState, viewerPlayerId: string, drawingId: string): boolean {
  const drawing = state.drawings.find((item) => item.id === drawingId);
  if (!drawing || !state.playerIds.includes(viewerPlayerId)) return false;
  if (drawing.artistPlayerId === viewerPlayerId) return true;
  if (state.phase === "assembly" && state.assignments[state.generationRound as 1 | 2]?.[viewerPlayerId]?.drawingIds.includes(drawingId)) return true;
  const publicIds = new Set<string>();
  if ((state.phase === "voting" || state.phase === "finalVoting") && state.activeMatchup) {
    for (const shirtId of state.activeMatchup.shirtIds) publicIds.add(findShirt(state, shirtId).drawingId);
  }
  if (state.phase === "roundReveal") {
    const id = state.roundWinnerShirtIds[state.generationRound as 1 | 2];
    if (id) publicIds.add(findShirt(state, id).drawingId);
  }
  if ((state.phase === "finalReveal" || state.phase === "gameResults") && state.finalWinnerShirtId) publicIds.add(findShirt(state, state.finalWinnerShirtId).drawingId);
  return publicIds.has(drawingId);
}

function enterAfterDrawing(state: ShirtFightState, now: number): ShirtFightState {
  if (state.drawingNumber === 1) return { ...state, drawingNumber: 2, phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_DRAWING_MS };
  return { ...state, phase: "slogans", drawingNumber: undefined, phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_SLOGAN_MS };
}

function beginDrawingRound(state: ShirtFightState, round: 1 | 2, now: number): ShirtFightState {
  return { ...state, phase: "drawing", generationRound: round, drawingNumber: 1, sloganReadyPlayerIds: [], phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_DRAWING_MS, lastRandomTieBreak: false };
}

function withFallbackSlogans(state: ShirtFightState, now: number): ShirtFightState {
  const additions = state.playerIds.filter((playerId) => !state.slogans.some((item) => item.round === state.generationRound && item.authorPlayerId === playerId)).map((playerId) => ({
    id: deterministicUuid(state.seed, `fallback-slogan:${state.generationRound}:${playerId}`),
    authorPlayerId: playerId,
    round: state.generationRound as 1 | 2,
    text: "Untitled, but unforgettable",
    submittedAt: now,
    submissionOrder: 0,
    synthetic: true
  } satisfies ShirtFightSlogan));
  return additions.length ? { ...state, slogans: [...state.slogans, ...additions] } : state;
}

function beginAssembly(state: ShirtFightState, now: number): ShirtFightState {
  const round = state.generationRound as 1 | 2;
  const previous = state.assignments[1] ?? {};
  const assignments = Object.fromEntries(state.playerIds.map((playerId, index) => {
    const eligibleDrawings = deterministicShuffle(state.drawings.filter((drawing) => drawing.artistPlayerId !== playerId), state.seed, `drawings:${round}:${playerId}`);
    const prior = new Set(previous[playerId]?.drawingIds ?? []);
    const fresh = [...eligibleDrawings.filter((item) => !prior.has(item.id)), ...eligibleDrawings.filter((item) => prior.has(item.id))];
    const drawingIds = fresh.slice(index % Math.max(1, fresh.length)).concat(fresh).map((item) => item.id).filter((id, position, all) => all.indexOf(id) === position).slice(0, 2);
    const otherSlogans = state.slogans.filter((slogan) => slogan.authorPlayerId !== playerId);
    const source = otherSlogans.length ? otherSlogans : state.slogans;
    const sloganIds = deterministicShuffle(source, state.seed, `slogans:${round}:${playerId}`).slice(0, Math.min(7, Math.max(1, source.length))).map((item) => item.id);
    return [playerId, { drawingIds, sloganIds } satisfies ShirtFightAssignment];
  }));
  return { ...state, phase: "assembly", phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_ASSEMBLY_MS,
    assignments: { ...state.assignments, [round]: assignments } };
}

function finalizeMissingShirts(state: ShirtFightState, now: number): ShirtFightState {
  const round = state.generationRound as 1 | 2;
  let next = state;
  for (const playerId of state.playerIds) {
    if (next.shirts.some((shirt) => shirt.assemblerPlayerId === playerId && shirt.sourceRound === round)) continue;
    const assignment = next.assignments[round]?.[playerId];
    const drawingId = assignment?.drawingIds[0];
    const sloganId = assignment?.sloganIds[0];
    if (!drawingId || !sloganId) throw new GameRuleError("SERVER_ERROR", "A valid shirt fallback was unavailable.");
    next = { ...next, shirts: [...next.shirts, { id: deterministicUuid(next.seed, `shirt:${round}:${playerId}`), drawingId, sloganId, assemblerPlayerId: playerId, sourceRound: round, createdAt: now }] };
  }
  return next;
}

function beginRoundVoting(state: ShirtFightState, now: number): ShirtFightState {
  const ids = deterministicShuffle(shirtsForRound(state, state.generationRound as 1 | 2).map((shirt) => shirt.id), state.seed, `round-order:${state.generationRound}`);
  return beginVotingSequence(state, ids, "voting", now);
}

function beginFinalVoting(state: ShirtFightState, now: number): ShirtFightState {
  const fallback = Object.values(state.roundWinnerShirtIds).filter((id): id is string => Boolean(id));
  const ids = deterministicShuffle([...new Set(state.qualifiedShirtIds.length >= 2 ? state.qualifiedShirtIds : fallback)], state.seed, "final-order");
  if (ids.length === 1) return { ...state, phase: "finalReveal", generationRound: 3, finalWinnerShirtId: ids[0], phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_REVEAL_MS };
  return beginVotingSequence({ ...state, generationRound: 3 }, ids, "finalVoting", now);
}

function beginVotingSequence(state: ShirtFightState, ids: string[], phase: "voting" | "finalVoting", now: number): ShirtFightState {
  const [left, right, ...rest] = ids;
  if (!left || !right) throw new GameRuleError("SERVER_ERROR", "Shirt Fight needs at least two shirts to vote.");
  return { ...state, phase, phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_VOTE_MS,
    votingQueue: rest, activeMatchup: { id: deterministicUuid(state.seed, `match:${state.matches.length}`), shirtIds: [left, right], votes: {}, suddenDeath: false } };
}

function resolveMatchup(state: ShirtFightState, now: number): ShirtFightState {
  const matchup = state.activeMatchup;
  if (!matchup) throw new GameRuleError("SERVER_ERROR", "The active matchup is missing.");
  const totals = matchup.shirtIds.map((id) => Object.values(matchup.votes).filter((vote) => vote === id).length) as [number, number];
  if (totals[0] === totals[1] && !matchup.suddenDeath) {
    return { ...state, phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_SUDDEN_DEATH_MS,
      activeMatchup: { ...matchup, votes: {}, suddenDeath: true, initialVotes: { ...matchup.votes } } };
  }
  const randomTieBreak = totals[0] === totals[1];
  const winnerIndex = randomTieBreak ? Math.floor(deterministicNumber(state.seed, `tie:${matchup.id}`) * 2) : totals[0] > totals[1] ? 0 : 1;
  const winnerShirtId = matchup.shirtIds[winnerIndex] as string;
  const record: ShirtFightMatchupRecord = {
    id: matchup.id,
    stage: state.phase === "finalVoting" ? "final" : state.generationRound === 1 ? "round-1" : "round-2",
    shirtIds: matchup.shirtIds,
    votes: matchup.initialVotes ?? (matchup.suddenDeath ? {} : { ...matchup.votes }),
    ...(matchup.suddenDeath ? { suddenDeathVotes: { ...matchup.votes } } : {}),
    winnerShirtId,
    randomTieBreak,
    completedAt: now
  };
  const qualifiedShirtIds = record.stage === "final" ? state.qualifiedShirtIds : [...new Set([...state.qualifiedShirtIds, winnerShirtId])];
  if (state.votingQueue.length) {
    const [challenger, ...rest] = state.votingQueue;
    if (!challenger) throw new GameRuleError("SERVER_ERROR", "Voting queue is invalid.");
    return { ...state, matches: [...state.matches, record], qualifiedShirtIds, votingQueue: rest, phaseNonce: state.phaseNonce + 1,
      phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_VOTE_MS, lastRandomTieBreak: randomTieBreak,
      activeMatchup: { id: deterministicUuid(state.seed, `match:${state.matches.length + 1}`), shirtIds: [winnerShirtId, challenger], votes: {}, suddenDeath: false } };
  }
  if (state.phase === "finalVoting") return { ...state, matches: [...state.matches, record], qualifiedShirtIds, activeMatchup: undefined, finalWinnerShirtId: winnerShirtId,
    phase: "finalReveal", phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_REVEAL_MS, lastRandomTieBreak: randomTieBreak };
  const round = state.generationRound as 1 | 2;
  return { ...state, matches: [...state.matches, record], qualifiedShirtIds, activeMatchup: undefined, roundWinnerShirtIds: { ...state.roundWinnerShirtIds, [round]: winnerShirtId },
    phase: "roundReveal", phaseNonce: state.phaseNonce + 1, phaseStartedAt: now, deadlineAt: now + SHIRT_FIGHT_REVEAL_MS, lastRandomTieBreak: randomTieBreak };
}

export function calculateShirtFightAwards(state: ShirtFightState): ShirtFightAwardView[] {
  const awards: ShirtFightAwardView[] = [];
  addMaxAward(awards, "Most Prolific", "Submitted the most original slogans.", state.playerIds, (id) => state.slogans.filter((s) => !s.synthetic && s.authorPlayerId === id).length, 1);
  addMinAward(awards, "Speed Artist", "Finished drawings fastest.", state.playerIds, (id) => sum(state.drawings.filter((d) => !d.fallback && d.artistPlayerId === id).map((d) => d.durationMs)), 1);
  addMaxAward(awards, "Crowd Favorite", "Earned the most votes through their assembled shirts.", state.playerIds, (id) => countVotesFor(state, (shirt) => shirt.assemblerPlayerId === id), 1);
  addMaxAward(awards, "Wordsmith", "Wrote slogans that collected the most votes.", state.playerIds, (id) => countVotesFor(state, (shirt) => findSlogan(state, shirt.sloganId).authorPlayerId === id), 1);
  addMaxAward(awards, "Art School", "Created drawings that collected the most votes.", state.playerIds, (id) => countVotesFor(state, (shirt) => findDrawing(state, shirt.drawingId).artistPlayerId === id), 1);
  const final = state.finalWinnerShirtId ? findShirt(state, state.finalWinnerShirtId) : undefined;
  if (final) awards.push({ title: "Fashion Designer", description: "Assembled the tournament champion.", playerIds: [final.assemblerPlayerId] });
  return awards;
}

function addMaxAward(awards: ShirtFightAwardView[], title: string, description: string, ids: string[], value: (id: string) => number, minimum: number) {
  const values = ids.map((id) => [id, value(id)] as const);
  const best = Math.max(...values.map(([, score]) => score));
  if (best >= minimum) awards.push({ title, description, playerIds: values.filter(([, score]) => score === best).map(([id]) => id) });
}
function addMinAward(awards: ShirtFightAwardView[], title: string, description: string, ids: string[], value: (id: string) => number, minimum: number) {
  const values = ids.map((id) => [id, value(id)] as const).filter(([, score]) => score >= minimum);
  if (!values.length) return;
  const best = Math.min(...values.map(([, score]) => score));
  awards.push({ title, description, playerIds: values.filter(([, score]) => score === best).map(([id]) => id) });
}
function countVotesFor(state: ShirtFightState, predicate: (shirt: ShirtFightShirt) => boolean): number {
  return state.matches.reduce((total, match) => total + [...Object.values(match.votes), ...Object.values(match.suddenDeathVotes ?? {})].filter((shirtId) => predicate(findShirt(state, shirtId))).length, 0);
}
function sum(values: number[]) { return values.reduce((total, value) => total + value, 0); }
function shirtsForRound(state: ShirtFightState, round: 1 | 2) { return state.shirts.filter((shirt) => shirt.sourceRound === round); }
function assertActive(state: ShirtFightState, playerId: string) { if (!state.playerIds.includes(playerId)) throw new GameRuleError("PLAYER_NOT_ACTIVE", "You are not active in this game."); }
function findDrawing(state: ShirtFightState, id: string) { const value = state.drawings.find((item) => item.id === id); if (!value) throw new GameRuleError("SERVER_ERROR", "Drawing metadata is missing."); return value; }
function findSlogan(state: ShirtFightState, id: string) { const value = state.slogans.find((item) => item.id === id); if (!value) throw new GameRuleError("SERVER_ERROR", "Slogan metadata is missing."); return value; }
function findShirt(state: ShirtFightState, id: string) { const value = state.shirts.find((item) => item.id === id); if (!value) throw new GameRuleError("SERVER_ERROR", "Shirt metadata is missing."); return value; }
function drawingView(drawing: ShirtFightDrawing) { return { id: drawing.id, width: drawing.width, height: drawing.height }; }
function shirtView(state: ShirtFightState, id: string): ShirtFightShirtView { const shirt = findShirt(state, id); return { id, drawing: drawingView(findDrawing(state, shirt.drawingId)), slogan: findSlogan(state, shirt.sloganId).text }; }
function credits(state: ShirtFightState, id: string) { const shirt = findShirt(state, id); return { artistPlayerId: findDrawing(state, shirt.drawingId).artistPlayerId, authorPlayerId: findSlogan(state, shirt.sloganId).authorPlayerId, assemblerPlayerId: shirt.assemblerPlayerId }; }

function deterministicShuffle<T>(values: readonly T[], seed: string, key: string): T[] {
  return [...values].map((value, index) => ({ value, score: deterministicNumber(seed, `${key}:${index}`) })).sort((a, b) => a.score - b.score).map(({ value }) => value);
}
function deterministicNumber(seed: string, key: string): number {
  let hash = 2166136261;
  for (const character of `${seed}:${key}`) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967296;
}
export function deterministicUuid(seed: string, key: string): string {
  const words = Array.from({ length: 4 }, (_, index) => Math.floor(deterministicNumber(seed, `${key}:${index}`) * 0x1_0000_0000) >>> 0);
  const hex = words.map((word) => word.toString(16).padStart(8, "0")).join("").split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16] ?? "0", 16) % 4] as string;
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}
