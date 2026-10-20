import { ghostCircuitCommandSchema, ghostLayoutSchema, type GhostCircuitCommand, type GhostCircuitPublicView, type GhostLayout } from "@team-arcade/shared";
import { validateGhostLayout } from "@team-arcade/games/ghost-circuit";
export const ghostSummaryKey = "team-arcade:ghost-circuit:summary:borrowed-identity:1:1";
export const ghostDraftKey = (id: string) => `team-arcade:ghost-circuit:draft:${id}`;
export interface GhostDraft { version: 1; contentVersion: 1; rulesVersion: 1; execution: number; layout: GhostLayout; pending: { requestId: string; command: GhostCircuitCommand } | null }
export interface GhostSummary { version: 1; contentVersion: 1; rulesVersion: 1; completed: true; bestRating: "Basic" | "Full Haul" }
export function readGhostDraft(view: GhostCircuitPublicView): { draft: GhostDraft | null; notice: string } {
 try {
  const raw = localStorage.getItem(ghostDraftKey(view.gameInstanceId)); if (!raw) return { draft: null, notice: "" };
  if (raw.length > 12000) throw Error();
  const d = JSON.parse(raw) as GhostDraft;
  if (d.version !== 1 || d.contentVersion !== view.contentVersion || d.rulesVersion !== view.rulesVersion || !Number.isSafeInteger(d.execution) || d.execution > view.executions) throw Error();
  validateGhostLayout(d.layout);
  if (d.pending !== null && (typeof d.pending.requestId !== "string" || d.pending.requestId.length < 1 || d.pending.requestId.length > 100 || !ghostCircuitCommandSchema.safeParse(d.pending.command).success || d.pending.command.gameInstanceId !== view.gameInstanceId || d.pending.command.expectedExecution !== d.execution || JSON.stringify(d.pending.command.layout) !== JSON.stringify(d.layout))) throw Error();
  return { draft: d, notice: d.pending && view.executions > d.pending.command.expectedExecution ? "Accepted execution restored. Playback returned to edit." : "Editor draft restored." };
 } catch { return { draft: null, notice: "Saved draft is unavailable or incompatible. Starting from the server layout; editing still works." }; }
}
export function saveGhostDraft(id: string, draft: GhostDraft): boolean { try { localStorage.setItem(ghostDraftKey(id), JSON.stringify(draft)); return true; } catch { return false; } }
export function readGhostSummary(): GhostSummary | null { try { const s = JSON.parse(localStorage.getItem(ghostSummaryKey) ?? "null") as GhostSummary | null; return s?.version === 1 && s.contentVersion === 1 && s.rulesVersion === 1 && s.completed === true && ["Basic", "Full Haul"].includes(s.bestRating) ? s : null; } catch { return null; } }
export function saveGhostSummary(view: GhostCircuitPublicView): boolean { if (!view.bestRating) return true; const old = readGhostSummary(); try { localStorage.setItem(ghostSummaryKey, JSON.stringify({ version: 1, contentVersion: 1, rulesVersion: 1, completed: true, bestRating: old?.bestRating === "Full Haul" ? old.bestRating : view.bestRating } satisfies GhostSummary)); return true; } catch { return false; } }
export function storageAvailable(): boolean { try { const key = "team-arcade:ghost-circuit:probe"; localStorage.setItem(key, "1"); localStorage.removeItem(key); return true; } catch { return false; } }
export const emptyGhostLayout = () => ghostLayoutSchema.parse([]);
