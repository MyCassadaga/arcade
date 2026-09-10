import { z } from "zod";
import { GAME_IDS } from "./catalog";

export const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4,6}$/;
export const MAX_PLAYERS = 12;

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a display name.")
  .max(24, "Display names can be at most 24 characters.");

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_PATTERN, "Enter a valid room code.");

export const createRoomRequestSchema = z.object({ displayName: displayNameSchema }).strict();
export const joinRoomRequestSchema = z.object({ displayName: displayNameSchema }).strict();
export const roomSessionRequestSchema = z.object({ sessionToken: z.string().min(32).max(200) }).strict();

const requestIdSchema = z.string().min(1).max(100);

export const whoSaidThatCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("wst.submitAnswer"), answer: z.string().trim().min(1).max(160) }).strict(),
  z.object({ type: z.literal("wst.submitGuess"), targetPlayerId: z.string().uuid() }).strict()
]);

export const impostorCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("impostor.submitClue"), clue: z.string().trim().min(1).max(32) }).strict(),
  z.object({ type: z.literal("impostor.submitVote"), targetPlayerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("impostor.submitGuess"), guess: z.string().trim().min(1).max(64) }).strict()
]);

export const SYSTEM_CRAWL_CLASS_IDS = [
  "infrastructure-architect",
  "senior-systems-analyst",
  "application-developer",
  "it-generalist"
] as const;

export const SYSTEM_CRAWL_ABILITY_IDS = [
  "packet-drop",
  "firewall",
  "load-balancer",
  "escalate",
  "requirements-clarification",
  "workaround",
  "process-improvement",
  "reboot-service",
  "hotfix",
  "refactor",
  "deploy-to-production",
  "works-on-my-machine",
  "percussive-maintenance",
  "powershell",
  "google-it",
  "other-duties-as-assigned"
] as const;

export const SYSTEM_CRAWL_ITEM_IDS = [
  "coffee",
  "admin-credentials",
  "approved-change-request",
  "spare-laptop",
  "budget-exception",
  "vendor-documentation",
  "ethernet-cable",
  "noise-canceling-headphones",
  "stack-overflow-answer",
  "maintenance-window",
  "known-good-backup",
  "rubber-duck-debugging"
] as const;

const systemCrawlEntityIdSchema = z.string().trim().min(1).max(100);
const systemCrawlPositionSchema = z
  .object({
    cardIndex: z.number().int().min(0).max(3),
    x: z.number().int().min(0).max(8),
    y: z.number().int().min(0).max(6)
  })
  .strict();

const systemCrawlTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("character"), characterId: systemCrawlEntityIdSchema }).strict(),
  z.object({ type: z.literal("enemy"), enemyId: systemCrawlEntityIdSchema }).strict(),
  z.object({ type: z.literal("door"), doorId: systemCrawlEntityIdSchema }).strict(),
  z.object({ type: z.literal("position"), position: systemCrawlPositionSchema }).strict(),
  z.object({ type: z.literal("ability"), abilityId: z.enum(SYSTEM_CRAWL_ABILITY_IDS) }).strict(),
  z
    .object({
      type: z.literal("load_balancer"),
      characterId: systemCrawlEntityIdSchema,
      destination: systemCrawlPositionSchema
    })
    .strict()
]);

export const systemCrawlCommandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("select_class"),
      classIds: z.array(z.enum(SYSTEM_CRAWL_CLASS_IDS)).min(1).max(2)
    })
    .strict(),
  z.object({ type: z.literal("start_adventure") }).strict(),
  z.object({ type: z.literal("continue_briefing") }).strict(),
  z
    .object({
      type: z.literal("move_to"),
      characterId: systemCrawlEntityIdSchema,
      destination: systemCrawlPositionSchema
    })
    .strict(),
  z
    .object({
      type: z.literal("attack"),
      characterId: systemCrawlEntityIdSchema,
      target: z.object({ type: z.literal("enemy"), enemyId: systemCrawlEntityIdSchema }).strict()
    })
    .strict(),
  z
    .object({
      type: z.literal("use_ability"),
      characterId: systemCrawlEntityIdSchema,
      abilityId: z.enum(SYSTEM_CRAWL_ABILITY_IDS),
      target: systemCrawlTargetSchema.optional()
    })
    .strict(),
  z
    .object({
      type: z.literal("resolve_choice"),
      choiceId: systemCrawlEntityIdSchema,
      itemId: z.enum(SYSTEM_CRAWL_ITEM_IDS)
    })
    .strict(),
  z
    .object({
      type: z.literal("use_item"),
      characterId: systemCrawlEntityIdSchema,
      target: systemCrawlTargetSchema.optional()
    })
    .strict(),
  z.object({ type: z.literal("discard_item"), characterId: systemCrawlEntityIdSchema }).strict(),
  z
    .object({
      type: z.literal("restart_user"),
      characterId: systemCrawlEntityIdSchema,
      targetCharacterId: systemCrawlEntityIdSchema
    })
    .strict(),
  z.object({ type: z.literal("end_turn"), characterId: systemCrawlEntityIdSchema }).strict()
]);

export const categoriesCommandSchema = z.object({
  type: z.literal("categories.submitAnswer"),
  gameInstanceId: z.string().uuid(),
  roundNumber: z.number().int().min(1).max(5),
  answer: z.string().trim().min(1).max(40)
}).strict();
export type CategoriesCommand = z.infer<typeof categoriesCommandSchema>;

export const AFTERPRINT_EVENT_IDS = ["A", "B", "C", "D", "E"] as const;
export const AFTERPRINT_INKS = ["coral", "blue", "gold", "plum"] as const;
export const afterprintEventIdSchema = z.enum(AFTERPRINT_EVENT_IDS);
export const afterprintInkSchema = z.enum(AFTERPRINT_INKS);
export const afterprintBoardSchema = z.array(afterprintInkSchema.nullable()).length(25);
const afterprintCellSchema = z.number().int().min(0).max(24);
const afterprintPathSchema = z.array(afterprintCellSchema).min(2).max(5);

export const afterprintEventSchema = z.discriminatedUnion("kind", [
  z.object({ id: afterprintEventIdSchema, kind: z.literal("drop"), cell: afterprintCellSchema, ink: afterprintInkSchema }).strict(),
  z.object({ id: afterprintEventIdSchema, kind: z.literal("roll"), path: afterprintPathSchema }).strict(),
  z.object({ id: afterprintEventIdSchema, kind: z.literal("wipe"), path: afterprintPathSchema }).strict()
]);

const afterprintOrderSchema = z.array(afterprintEventIdSchema).length(5).superRefine((ids, context) => {
  if (new Set(ids).size !== AFTERPRINT_EVENT_IDS.length) {
    context.addIssue({ code: "custom", message: "Use every AFTERPRINT event exactly once." });
  }
});

export const afterprintCommandSchema = z.object({
  type: z.literal("afterprint.submitOrder"),
  gameInstanceId: z.string().uuid(),
  puzzleNumber: z.number().int().min(1),
  eventIds: afterprintOrderSchema
}).strict();
export type AfterprintCommand = z.infer<typeof afterprintCommandSchema>;
export type AfterprintEventId = z.infer<typeof afterprintEventIdSchema>;
export type AfterprintInk = z.infer<typeof afterprintInkSchema>;
export type AfterprintBoard = Array<AfterprintInk | null>;
export type AfterprintEvent = z.infer<typeof afterprintEventSchema>;

export const SHIRT_FIGHT_COLORS = ["red", "orange", "yellow", "green", "blue", "indigo", "violet", "black", "white"] as const;
export const SHIRT_FIGHT_BRUSH_SIZES = ["small", "medium", "large"] as const;
const shirtFightIdentitySchema = z.object({
  gameInstanceId: z.string().uuid(),
  phaseNonce: z.number().int().nonnegative()
});
export const shirtFightCommandSchema = z.discriminatedUnion("type", [
  shirtFightIdentitySchema.extend({
    type: z.literal("shirtFight.submitSlogan"),
    text: z.string().trim().min(1).max(80)
  }).strict(),
  shirtFightIdentitySchema.extend({ type: z.literal("shirtFight.finishSlogans") }).strict(),
  shirtFightIdentitySchema.extend({
    type: z.literal("shirtFight.submitShirt"),
    drawingId: z.string().uuid(),
    sloganId: z.string().uuid()
  }).strict(),
  shirtFightIdentitySchema.extend({
    type: z.literal("shirtFight.submitVote"),
    shirtId: z.string().uuid()
  }).strict()
]);
export type ShirtFightCommand = z.infer<typeof shirtFightCommandSchema>;

export const gameCommandSchema = z.union([
  afterprintCommandSchema,
  categoriesCommandSchema,
  shirtFightCommandSchema,
  whoSaidThatCommandSchema,
  impostorCommandSchema,
  systemCrawlCommandSchema
]);
export type WhoSaidThatCommand = z.infer<typeof whoSaidThatCommandSchema>;
export type ImpostorCommand = z.infer<typeof impostorCommandSchema>;
export type SystemCrawlCommand = z.infer<typeof systemCrawlCommandSchema>;
export type GameCommand = z.infer<typeof gameCommandSchema>;

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room.reconnect"),
    requestId: requestIdSchema,
    payload: roomSessionRequestSchema
  }).strict(),
  z.object({
    type: z.literal("host.selectGame"),
    requestId: requestIdSchema,
    payload: z.object({ gameId: z.enum(GAME_IDS) }).strict()
  }).strict(),
  z.object({
    type: z.literal("host.startGame"),
    requestId: requestIdSchema,
    payload: z.object({ replayMode: z.enum(["new", "same"]).optional() }).strict()
  }).strict(),
  z.object({
    type: z.literal("host.advance"),
    requestId: requestIdSchema,
    payload: z.object({}).strict()
  }).strict(),
  z.object({
    type: z.literal("host.backToArcade"),
    requestId: requestIdSchema,
    payload: z.object({}).strict()
  }).strict(),
  z.object({
    type: z.literal("game.command"),
    requestId: requestIdSchema,
    payload: z.object({ command: gameCommandSchema }).strict()
  }).strict(),
  z.object({
    type: z.literal("ping"),
    requestId: requestIdSchema,
    payload: z.object({ clientTime: z.number().finite() }).strict()
  }).strict()
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type RoomPhase = "lobby" | "playing" | "results";

export interface PlayerView {
  id: string;
  displayName: string;
  connected: boolean;
  isHost: boolean;
  score: number;
}

export interface RoomView {
  roomCode: string;
  players: PlayerView[];
  selectedGameId: string | null;
  roomPhase: RoomPhase;
}

export interface GameViewerState {
  gameId: "who-said-that" | "impostor" | "categories" | "afterprint" | "shirt-fight" | "system-crawl";
  phase: string;
  public: unknown;
  private?: unknown;
}

export interface ScoreEntry {
  playerId: string;
  score: number;
}

export interface WhoSaidThatPublicView {
  roundNumber: number;
  totalRounds: number;
  prompt: string;
  submissionCount: number;
  totalPlayers: number;
  currentAnswer?: string;
  currentAnswerNumber?: number;
  totalAnswers?: number;
  guessCount?: number;
  eligibleGuessCount?: number;
  reveal?: {
    authorPlayerId: string;
    distribution: Record<string, number>;
    pointsAwarded: Record<string, number>;
  };
  roundScores: Record<string, number>;
  gameScores: Record<string, number>;
  rankings?: ScoreEntry[];
}

export interface WhoSaidThatPrivateView {
  hasSubmitted: boolean;
  submittedAnswer?: string;
  isCurrentAuthor: boolean;
  hasGuessed: boolean;
}

export interface ImpostorPublicView {
  roundNumber: number;
  totalRounds: number;
  clueCount: number;
  totalPlayers: number;
  revealedClues: Array<{ playerId: string; clue: string }>;
  voteCount: number;
  voteRound: 1 | 2;
  runoffCandidates?: string[];
  voteReveal?: {
    totals: Record<string, number>;
    outcome: "caught" | "escaped" | "runoff";
    accusedPlayerId?: string;
  };
  roundResult?: {
    secretWord: string;
    impostorPlayerId: string;
    outcome: "escaped" | "stolen" | "team-won";
    finalGuess?: string;
    pointsAwarded: Record<string, number>;
  };
  roundScores: Record<string, number>;
  gameScores: Record<string, number>;
  rankings?: ScoreEntry[];
}

export type ImpostorPrivateView =
  | { role: "player"; secretWord: string; hasSubmittedClue: boolean; hasVoted: boolean }
  | { role: "impostor"; hasSubmittedClue: boolean; hasVoted: boolean };

export interface CategoriesAnswerGroup {
  result: "unique" | "cancelled";
  answers: Array<{ playerId: string; answer: string }>;
}

export interface CategoriesPublicView {
  gameInstanceId: string;
  roundNumber: number;
  totalRounds: number;
  category: string;
  submissionCount: number;
  totalPlayers: number;
  groups?: CategoriesAnswerGroup[];
  roundScores: Record<string, number>;
  gameScores: Record<string, number>;
  rankings?: ScoreEntry[];
}

export interface CategoriesPrivateView {
  hasSubmitted: boolean;
  submittedAnswer?: string;
}

export interface AfterprintAttemptView {
  eventIds: AfterprintEventId[];
  mismatchCount: number;
  solved: boolean;
}

export interface AfterprintPublicView {
  gameInstanceId: string;
  puzzleNumber: number;
  bankVersion: string;
  target: AfterprintBoard;
  events: AfterprintEvent[];
  initialEventIds: AfterprintEventId[];
  attempts: AfterprintAttemptView[];
  maxAttempts: 4;
  activePlayerId: string;
  solved: boolean;
}

export interface AfterprintPrivateView {
  canSubmit: boolean;
}

export interface ShirtFightDrawingView {
  id: string;
  width: number;
  height: number;
}

export interface ShirtFightShirtView {
  id: string;
  drawing: ShirtFightDrawingView;
  slogan: string;
}

export interface ShirtFightCreditView {
  artistPlayerId: string;
  authorPlayerId: string;
  assemblerPlayerId: string;
}

export interface ShirtFightAwardView {
  title: string;
  description: string;
  playerIds: string[];
}

export interface ShirtFightPublicView {
  gameInstanceId: string;
  phaseNonce: number;
  phase: string;
  generationRound: 1 | 2 | 3;
  drawingNumber?: 1 | 2;
  deadlineAt?: number;
  completedCount: number;
  totalPlayers: number;
  matchup?: { id: string; shirts: [ShirtFightShirtView, ShirtFightShirtView]; voteCount: number; suddenDeath: boolean };
  reveal?: { shirt: ShirtFightShirtView; credits: ShirtFightCreditView; randomTieBreak: boolean };
  winner?: { shirt: ShirtFightShirtView; credits: ShirtFightCreditView };
  awards?: ShirtFightAwardView[];
}

export interface ShirtFightPrivateView {
  drawingSubmitted?: boolean;
  slogans?: Array<{ id: string; text: string }>;
  slogansDone?: boolean;
  assignment?: { drawings: ShirtFightDrawingView[]; slogans: Array<{ id: string; text: string }> };
  draft?: { drawingId: string; sloganId: string };
  shirtSubmitted?: boolean;
  hasVoted?: boolean;
}

export type TypedGameViewerState =
  | { gameId: "afterprint"; phase: "playing" | "gameResults"; public: AfterprintPublicView; private: AfterprintPrivateView }
  | { gameId: "categories"; phase: "submitting" | "reveal" | "roundResults" | "gameResults"; public: CategoriesPublicView; private: CategoriesPrivateView }
  | { gameId: "shirt-fight"; phase: "drawing" | "slogans" | "assembly" | "voting" | "roundReveal" | "finalVoting" | "finalReveal" | "gameResults"; public: ShirtFightPublicView; private: ShirtFightPrivateView }
  | { gameId: "who-said-that"; phase: "submitting" | "guessing" | "reveal" | "roundResults" | "gameResults"; public: WhoSaidThatPublicView; private: WhoSaidThatPrivateView }
  | { gameId: "impostor"; phase: "roleReveal" | "clueSubmission" | "clueReveal" | "discussion" | "voting" | "voteReveal" | "impostorGuess" | "roundResults" | "gameResults"; public: ImpostorPublicView; private: ImpostorPrivateView }
  | { gameId: "system-crawl"; phase: "class_selection" | "ready_to_start" | "incident_briefing" | "player_turn" | "resolving_choice" | "enemy_phase" | "victory" | "defeat"; public: unknown; private?: unknown };

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_EXPIRED"
  | "ROOM_FULL"
  | "NAME_TAKEN"
  | "INVALID_NAME"
  | "INVALID_SESSION"
  | "NOT_HOST"
  | "INVALID_PHASE"
  | "STALE_PHASE"
  | "INVALID_COMMAND"
  | "ALREADY_SUBMITTED"
  | "PLAYER_NOT_ACTIVE"
  | "GAME_NOT_AVAILABLE"
  | "TOO_FEW_PLAYERS"
  | "TOO_MANY_PLAYERS"
  | "wrong_phase"
  | "not_host"
  | "not_character_owner"
  | "not_current_character"
  | "class_unavailable"
  | "class_selection_incomplete"
  | "invalid_target"
  | "out_of_range"
  | "line_of_sight_blocked"
  | "movement_exceeded"
  | "tile_blocked"
  | "action_already_used"
  | "repeated_action"
  | "item_slot_full"
  | "no_item"
  | "invalid_item_use"
  | "pending_choice_required"
  | "unauthorized_choice"
  | "game_finished"
  | "SERVER_ERROR";

export type ServerMessage =
  | { type: "room.snapshot"; payload: RoomView }
  | { type: "room.presence"; payload: RoomView }
  | { type: "game.state"; payload: GameViewerState }
  | { type: "command.ack"; requestId: string; payload: { accepted: true } }
  | { type: "error"; requestId?: string; payload: { code: ErrorCode; message: string } }
  | { type: "pong"; payload: { serverTime: number } };

export interface RoomSessionResponse {
  roomCode: string;
  playerId: string;
  sessionToken: string;
}

export function sessionStorageKey(roomCode: string): string {
  return `team-arcade:session:${roomCode}`;
}
