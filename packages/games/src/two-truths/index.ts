import { addScore, GameRuleError, rankings, shuffled } from "@team-arcade/game-core";
import type { GameContext, GameResult } from "@team-arcade/game-core";
import { twoTruthsDeckSchema, type TwoTruthsCommand, type TwoTruthsDeck, type TwoTruthsPublicView, type TwoTruthsPrivateView, type PlayerView } from "@team-arcade/shared";

export interface TwoTruthsState {
  version: 1;
  gameInstanceId: string;
  phaseNonce: number;
  phase: "setup" | "guessing" | "reveal" | "gameResults";
  deck: TwoTruthsDeck | null;
  playerIds: string[];
  rounds: Array<{ subjectPlayerId: string; statements: string[]; lieOption: number }>;
  roundIndex: number;
  guesses: Record<string, number>;
  gameScores: Record<string, number>;
  pointsAwarded: Record<string, number>;
}
export function createTwoTruthsState(_context: GameContext, gameInstanceId: string): TwoTruthsState {
  return { version: 1, gameInstanceId, phaseNonce: 0, phase: "setup", deck: null, playerIds: [], rounds: [], roundIndex: 0, guesses: {}, gameScores: {}, pointsAwarded: {} };
}
export function loadTwoTruthsDeck(state: TwoTruthsState, deck: TwoTruthsDeck, gameInstanceId: string, phaseNonce: number): TwoTruthsState {
  requireIdentity(state, gameInstanceId, phaseNonce);
  if (state.phase !== "setup" || state.deck) throw new GameRuleError("INVALID_PHASE", "This setup is already sealed. Start a new setup to replace it.");
  const parsed = twoTruthsDeckSchema.safeParse(deck);
  if (!parsed.success) throw new GameRuleError("INVALID_COMMAND", "The prepared game file is invalid. Ask the preparer to check it privately.");
  return { ...state, deck: parsed.data, phaseNonce: state.phaseNonce + 1 };
}
function requireIdentity(state: TwoTruthsState, instance: string, nonce: number) {
  if (instance !== state.gameInstanceId || nonce !== state.phaseNonce) throw new GameRuleError("STALE_PHASE", "That action belongs to an earlier game phase.");
}
export function handleTwoTruthsCommand(state: TwoTruthsState, command: TwoTruthsCommand, actor: string, isHost: boolean, players: readonly PlayerView[], random: () => number): GameResult<TwoTruthsState> {
  requireIdentity(state, command.gameInstanceId, command.phaseNonce);
  if (command.type !== "twoTruths.submitGuess" && !isHost) throw new GameRuleError("NOT_HOST", "Only the host can do that.");
  if (command.type === "twoTruths.begin") {
    if (state.phase !== "setup" || !state.deck) throw new GameRuleError("INVALID_PHASE", "Load the prepared game file first.");
    const deck = state.deck;
    const connected = players.filter(p => p.connected);
    const matched = deck.participants.map(row => connected.find(p => p.displayName.trim().toLowerCase() === row.displayName.toLowerCase()));
    if (connected.length !== 7 || matched.some(p => !p) || new Set(matched.map(p => p?.id)).size !== deck.participants.length)
      throw new GameRuleError("TOO_FEW_PLAYERS", "Seven players must be connected, including every survey respondent under their prepared-file name.");
    const playerIds = connected.map(p => p.id);
    const rounds = shuffled(deck.participants.map((row, index) => {
      const options = shuffled([...row.truths.map(text => ({ text, lie: false })), { text: row.lie, lie: true }], random);
      return { subjectPlayerId: matched[index]!.id, statements: options.map(o => o.text), lieOption: options.findIndex(o => o.lie) };
    }), random);
    return { state: { ...state, phase: "guessing", phaseNonce: state.phaseNonce + 1, playerIds, rounds, gameScores: Object.fromEntries(playerIds.map(id => [id, 0])) } };
  }
  if (command.type === "twoTruths.next") {
    if (state.phase !== "reveal") throw new GameRuleError("INVALID_PHASE", "Reveal this round first.");
    return { state: { ...state, phase: state.roundIndex === state.rounds.length - 1 ? "gameResults" : "guessing", phaseNonce: state.phaseNonce + 1,
      roundIndex: state.roundIndex === state.rounds.length - 1 ? state.roundIndex : state.roundIndex + 1, guesses: {}, pointsAwarded: {} } };
  }
  if (state.phase !== "guessing") throw new GameRuleError("INVALID_PHASE", "Voting is closed.");
  const round = state.rounds[state.roundIndex]!;
  if (command.type === "twoTruths.reveal") return reveal(state);
  if (!state.playerIds.includes(actor) || actor === round.subjectPlayerId) throw new GameRuleError("PLAYER_NOT_ACTIVE", "The subject sits out their own round.");
  if (Object.hasOwn(state.guesses, actor)) throw new GameRuleError("ALREADY_SUBMITTED", "Your guess is locked.");
  if (!Number.isInteger(command.option) || command.option < 0 || command.option > 2) throw new GameRuleError("INVALID_COMMAND", "Choose one of the three statements.");
  const next = { ...state, guesses: { ...state.guesses, [actor]: command.option } };
  return Object.keys(next.guesses).length === state.playerIds.length - 1 ? reveal(next) : { state: next };
}
function reveal(state: TwoTruthsState): GameResult<TwoTruthsState> {
  const round = state.rounds[state.roundIndex]!;
  const delta = Object.fromEntries(state.playerIds.map(id => [id, id !== round.subjectPlayerId && state.guesses[id] === round.lieOption ? 1 : 0]));
  return { state: { ...state, phase: "reveal", phaseNonce: state.phaseNonce + 1, pointsAwarded: delta, gameScores: addScore(state.gameScores, delta) }, scoreDelta: delta };
}
export function getTwoTruthsPublicView(state: TwoTruthsState): TwoTruthsPublicView {
  const round = state.rounds[state.roundIndex];
  return { gameInstanceId: state.gameInstanceId, phaseNonce: state.phaseNonce, loaded: state.deck !== null,
    participantNames: state.phase === "setup" ? state.deck?.participants.map(p => p.displayName) ?? [] : [],
    roundNumber: state.phase === "setup" ? 0 : state.roundIndex + 1, totalRounds: state.phase === "setup" ? state.deck?.participants.length ?? 0 : state.rounds.length,
    guessCount: Object.keys(state.guesses).length, eligibleGuessCount: state.phase === "setup" ? 0 : state.playerIds.length - 1, gameScores: { ...state.gameScores },
    ...(round && state.phase !== "gameResults" ? { subjectPlayerId: round.subjectPlayerId, statements: [...round.statements] } : {}),
    ...(state.phase === "reveal" && round ? { lieOption: round.lieOption, pointsAwarded: { ...state.pointsAwarded } } : {}),
    ...(state.phase === "gameResults" ? { rankings: rankings(state.gameScores) } : {}) };
}
export function getTwoTruthsPrivateView(state: TwoTruthsState, actor: string): TwoTruthsPrivateView {
  const selection = state.guesses[actor];
  return { canGuess: state.phase === "guessing" && state.playerIds.includes(actor) && state.rounds[state.roundIndex]?.subjectPlayerId !== actor,
    hasGuessed: selection !== undefined, ...(selection === undefined ? {} : { selection }) };
}
