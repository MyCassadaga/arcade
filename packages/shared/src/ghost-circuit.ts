import { z } from "zod";
export const ghostPieceSchema = z.object({ cell: z.number().int().min(0).max(35), kind: z.enum(["straight", "elbow"]), rotation: z.number().int().min(0).max(3) }).strict();
export const ghostLayoutSchema = z.array(ghostPieceSchema).max(36);

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
const contractIdentity = {
  gameInstanceId: z.string().uuid(),
  contractId: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/),
  contentVersion: z.number().int().positive().max(1000),
  rulesVersion: z.literal(1)
};
export const ghostCircuitExecuteSchema = z.object({
  type: z.literal("ghostCircuit.execute"), ...contractIdentity,
  // Only untouched M0 rooms accept an execution from the pre-campaign client.
  selectionRevision: counter.optional(), expectedExecution: counter, layout: ghostLayoutSchema
}).strict();
export const ghostCircuitSelectSchema = z.object({
  type: z.literal("ghostCircuit.select"), ...contractIdentity, selectionRevision: counter
}).strict();
export const ghostCircuitCommandSchema = z.discriminatedUnion("type", [ghostCircuitExecuteSchema, ghostCircuitSelectSchema]);

export type GhostPiece = z.infer<typeof ghostPieceSchema>;
export type GhostLayout = GhostPiece[];
export type GhostCircuitCommand = z.infer<typeof ghostCircuitCommandSchema>;
export type GhostCircuitExecute = z.infer<typeof ghostCircuitExecuteSchema>;
export type GhostDirection = "N" | "E" | "S" | "W";
export type GhostNodeKind = "entry" | "badge" | "scanner" | "vault" | "cache" | "exit";
export interface GhostNode { readonly cell: number; readonly kind: GhostNodeKind; readonly ports: readonly GhostDirection[] }
export interface GhostEvent { cell: number; text: string; disguise: boolean; archive: boolean; caches: number; kind: "move" | "effect" | "fail" | "exit" }
export type GhostRating = "Basic" | "Full Haul";
export interface GhostResult { events: GhostEvent[]; success: boolean; rating: GhostRating | null; failure: string | null }
export interface GhostAttempt { execution: number; layout: GhostLayout; result: GhostResult }
export interface GhostContractProgress {
  executions: number;
  firstSuccess: number | null;
  bestRating: GhostRating | null;
  latest: GhostAttempt | null;
}
export interface GhostCircuitPublicView extends GhostContractProgress {
  gameInstanceId: string;
  activePlayerId: string;
  contractId: string;
  contentVersion: number;
  rulesVersion: 1;
  selectionRevision: number;
  completedContractIds: string[];
}
