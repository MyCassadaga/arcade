import { z } from "zod";

const statement = z.string().trim().min(1).max(180).refine(value => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 720, "Statement encoding is too large.");
export const twoTruthsDeckSchema = z.object({
  version: z.literal(1),
  participants: z.array(z.object({
    displayName: z.string().trim().min(1).max(24),
    truths: z.tuple([statement, statement]),
    lie: statement,
    lieSource: z.enum(["authored", "generated"])
  }).strict()).length(7)
}).strict().superRefine((deck, ctx) => {
  const names = deck.participants.map(p => p.displayName.toLowerCase());
  if (new Set(names).size !== 7) ctx.addIssue({ code: "custom", message: "Use seven distinct participants." });
  for (const row of deck.participants) {
    if (new Set([...row.truths, row.lie].map(s => s.toLowerCase())).size !== 3)
      ctx.addIssue({ code: "custom", message: "Use three distinct statements per participant." });
  }
});
export type TwoTruthsDeck = z.infer<typeof twoTruthsDeckSchema>;
const identity = { gameInstanceId: z.string().uuid(), phaseNonce: z.number().int().nonnegative() };
export const twoTruthsImportSchema = z.object({
  ...identity, requestId: z.string().min(1).max(100), deck: twoTruthsDeckSchema
}).strict();
export const twoTruthsCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...identity, type: z.literal("twoTruths.begin") }).strict(),
  z.object({ ...identity, type: z.literal("twoTruths.submitGuess"), option: z.number().int().min(0).max(2) }).strict(),
  z.object({ ...identity, type: z.literal("twoTruths.reveal") }).strict(),
  z.object({ ...identity, type: z.literal("twoTruths.next") }).strict()
]);
export type TwoTruthsCommand = z.infer<typeof twoTruthsCommandSchema>;
export interface TwoTruthsPublicView {
  gameInstanceId: string;
  phaseNonce: number;
  loaded: boolean;
  participantNames: string[];
  roundNumber: number;
  totalRounds: number;
  subjectPlayerId?: string;
  statements?: string[];
  guessCount: number;
  eligibleGuessCount: number;
  lieOption?: number;
  pointsAwarded?: Record<string, number>;
  gameScores: Record<string, number>;
  rankings?: Array<{ playerId: string; score: number }>;
}
export interface TwoTruthsPrivateView { canGuess: boolean; hasGuessed: boolean; selection?: number }
