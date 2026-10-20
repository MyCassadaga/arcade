import { z } from "zod";
export const ghostPieceSchema = z.object({ cell: z.number().int().min(0).max(35), kind: z.enum(["straight", "elbow"]), rotation: z.number().int().min(0).max(3) }).strict();
export const ghostLayoutSchema = z.array(ghostPieceSchema).max(36);
export const ghostCircuitCommandSchema = z.object({ type: z.literal("ghostCircuit.execute"), gameInstanceId: z.string().uuid(), contractId: z.literal("borrowed-identity"), contentVersion: z.literal(1), rulesVersion: z.literal(1), expectedExecution: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1), layout: ghostLayoutSchema }).strict();
export type GhostPiece = z.infer<typeof ghostPieceSchema>;
export type GhostLayout = GhostPiece[];
export type GhostCircuitCommand = z.infer<typeof ghostCircuitCommandSchema>;
export type GhostDirection = "N" | "E" | "S" | "W";
export type GhostNodeKind = "entry" | "badge" | "scanner" | "vault" | "cache" | "exit";
export interface GhostNode { cell: number; kind: GhostNodeKind; ports: GhostDirection[] }
export interface GhostEvent { cell: number; text: string; disguise: boolean; archive: boolean; caches: number; kind: "move" | "effect" | "fail" | "exit" }
export interface GhostResult { events: GhostEvent[]; success: boolean; rating: "Basic" | "Full Haul" | null; failure: string | null }
export interface GhostAttempt { execution: number; layout: GhostLayout; result: GhostResult }
export interface GhostCircuitPublicView { gameInstanceId: string; contractId: "borrowed-identity"; contentVersion: 1; rulesVersion: 1; executions: number; firstSuccess: number | null; bestRating: "Basic" | "Full Haul" | null; latest: GhostAttempt | null; activePlayerId: string }
