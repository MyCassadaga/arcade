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

export const gameCommandSchema = z.union([whoSaidThatCommandSchema, impostorCommandSchema]);
export type WhoSaidThatCommand = z.infer<typeof whoSaidThatCommandSchema>;
export type ImpostorCommand = z.infer<typeof impostorCommandSchema>;
export type GameCommand = z.infer<typeof gameCommandSchema>;

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("room.reconnect"),
    requestId: requestIdSchema,
    payload: z.object({ sessionToken: z.string().min(32).max(200) }).strict()
  }).strict(),
  z.object({
    type: z.literal("host.selectGame"),
    requestId: requestIdSchema,
    payload: z.object({ gameId: z.enum(GAME_IDS) }).strict()
  }).strict(),
  z.object({
    type: z.literal("host.startGame"),
    requestId: requestIdSchema,
    payload: z.object({}).strict()
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
  gameId: "who-said-that" | "impostor";
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

export type TypedGameViewerState =
  | { gameId: "who-said-that"; phase: "submitting" | "guessing" | "reveal" | "roundResults" | "gameResults"; public: WhoSaidThatPublicView; private: WhoSaidThatPrivateView }
  | { gameId: "impostor"; phase: "roleReveal" | "clueSubmission" | "clueReveal" | "discussion" | "voting" | "voteReveal" | "impostorGuess" | "roundResults" | "gameResults"; public: ImpostorPublicView; private: ImpostorPrivateView };

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
