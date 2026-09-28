import { z } from "zod";

export const STAR_GARDEN_ACTION_IDS = ["exchange", "spin", "blink", "collapse", "scramble", "mutation", "drift", "mirror", "crosswind", "echo"] as const;
export type StarKind = 0 | 1 | 2 | 3;
export type StarGardenActionId = typeof STAR_GARDEN_ACTION_IDS[number];
export type StarGardenMode = "daily" | "practice" | "cup";
export type StarGardenTier = "easy" | "medium" | "hard";
export interface StarGardenGoal { id: string; tier: StarGardenTier; points: number; name: string; pattern: string }
export interface StarGardenCard { id: string; action: StarGardenActionId }
const cell = z.number().int().min(0).max(9);
const row = z.number().int().min(0).max(1);
const direction = z.enum(["left", "right"]);
export const starGardenEffectSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("exchange"), source: cell, target: cell }).strict(),
  z.object({ action: z.literal("spin"), origin: z.number().int().min(0).max(3), direction: z.enum(["clockwise", "counterclockwise"]) }).strict(),
  z.object({ action: z.literal("blink"), source: cell, target: cell }).strict(),
  z.object({ action: z.literal("collapse"), target: cell }).strict(),
  z.object({ action: z.literal("scramble"), origin: cell, permutation: z.tuple([z.number().int().min(0).max(2), z.number().int().min(0).max(2), z.number().int().min(0).max(2)]) }).strict(),
  z.object({ action: z.literal("mutation"), target: cell }).strict(),
  z.object({ action: z.literal("drift"), row, direction }).strict(),
  z.object({ action: z.literal("mirror"), row }).strict(),
  z.object({ action: z.literal("crosswind"), direction }).strict(),
  z.object({ action: z.literal("echo"), source: cell, target: cell }).strict()
]);
export type StarGardenEffect = z.infer<typeof starGardenEffectSchema>;
const identity = z.object({ gameInstanceId: z.string().uuid(), roundNumber: z.number().int().min(0).max(6), expectedRevision: z.number().int().nonnegative().max(10000) });
const cardId = z.string().min(1).max(32);
export const starGardenCommandSchema = z.discriminatedUnion("type", [
  identity.extend({ type: z.literal("starGarden.begin"), mode: z.enum(["daily", "practice", "cup"]) }).strict(),
  identity.extend({ type: z.literal("starGarden.playCard"), cardId, effect: starGardenEffectSchema }).strict(),
  identity.extend({ type: z.literal("starGarden.claimGoal"), goalId: z.string().regex(/^G(0[1-9]|[12][0-9]|30)$/u), origin: cell }).strict(),
  identity.extend({ type: z.literal("starGarden.refresh"), cardIds: z.tuple([cardId, cardId, cardId]) }).strict(),
  identity.extend({ type: z.literal("starGarden.doneRound") }).strict(),
  identity.extend({ type: z.literal("starGarden.endRun") }).strict()
]);
export type StarGardenCommand = z.infer<typeof starGardenCommandSchema>;
export type StarGardenPhase = "setup" | "playing" | "reveal" | "gameResults";
export interface StarGardenStanding { playerId: string; score: number; goals: number; actions: number; rank: number }
export interface StarGardenRoundResult { roundNumber: number; closedAt: number; claims: Array<{ playerId: string; goalId: string | null; points: number }> }
/** Claims are [goalId, points] tuples in frozen public roster order. */
export interface StarGardenRoundView { roundNumber: number; closedAt: number; claims: Array<[string | null, number]> }
export interface StarGardenPublicView {
  gameInstanceId: string; rulesVersion: "v1"; contentVersion: "v1"; mode: StarGardenMode | null;
  dailyDate: string | null; roundNumber: number; deadlineAt: number | null;
  roster: string[]; goals: StarGardenGoal[]; readiness: Record<string, boolean>;
  standings: StarGardenStanding[]; history: StarGardenRoundView[];
  endingReason: "all-goals" | "out-of-cards" | "ended" | "cup-complete" | null;
}
export interface StarGardenPrivateView {
  board: StarKind[]; hand: StarGardenCard[]; revision: number;
  score: number; goalsClaimed: number; actionsSpent: number; remainingActions: number;
  done: boolean; pendingGoalId: string | null;
}
