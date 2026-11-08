import { ghostCircuitExecuteSchema, type GhostCircuitExecute, type GhostCircuitPublicView, type GhostLayout, type GhostRating } from "@team-arcade/shared";
import { getGhostContract, LEGACY_GHOST_CONTRACT, validateGhostLayout } from "@team-arcade/games/ghost-circuit";

type ContractIdentity = Pick<GhostCircuitPublicView, "contractId" | "contentVersion" | "rulesVersion">;
type DraftIdentity = ContractIdentity & Pick<GhostCircuitPublicView, "gameInstanceId">;
const prefix = "team-arcade:ghost-circuit";
const versionedContract = (identity: ContractIdentity) => `${identity.contractId}:${identity.contentVersion}:${identity.rulesVersion}`;
const draftKey = (view: DraftIdentity) => `${prefix}:draft:${view.gameInstanceId}:${versionedContract(view)}`;
const summaryKey = (contract: ContractIdentity) => `${prefix}:summary:${versionedContract(contract)}`;
export interface GhostDraft {
 version: 1;
 contentVersion: number;
 rulesVersion: 1;
 execution: number;
 layout: GhostLayout;
 pending: { requestId: string; command: GhostCircuitExecute } | null;
}
interface GhostSummary { version: 1; contentVersion: number; rulesVersion: 1; completed: true; bestRating: GhostRating }

export function readGhostDraft(view: GhostCircuitPublicView): { draft: GhostDraft | null; notice: string } {
 try {
  const legacy = view.contractId === LEGACY_GHOST_CONTRACT.id && view.selectionRevision === 0;
  const raw = localStorage.getItem(draftKey(view)) ??
   (legacy ? localStorage.getItem(`${prefix}:draft:${view.gameInstanceId}`) : null);
  if (!raw) return { draft: null, notice: "" };
  if (raw.length > 12000) throw Error();
  const d = JSON.parse(raw) as GhostDraft;
  if (d.version !== 1 || d.contentVersion !== view.contentVersion || d.rulesVersion !== view.rulesVersion ||
      !Number.isSafeInteger(d.execution) || d.execution < 0 || d.execution > view.executions) throw Error();
  validateGhostLayout(d.layout, getGhostContract(view.contractId));
  if (d.pending !== null) {
   const { requestId, command } = d.pending;
   if (typeof requestId !== "string" || requestId.length < 1 || requestId.length > 100 ||
       !ghostCircuitExecuteSchema.safeParse(command).success || command.gameInstanceId !== view.gameInstanceId ||
       command.contractId !== view.contractId || command.contentVersion !== view.contentVersion ||
       command.rulesVersion !== view.rulesVersion || command.expectedExecution !== d.execution ||
       JSON.stringify(command.layout) !== JSON.stringify(d.layout)) throw Error();
   if (command.selectionRevision !== view.selectionRevision && !(legacy && command.selectionRevision === undefined)) {
    return { draft: { ...d, pending: null }, notice: "Editor draft restored. An older selection request was cleared." };
   }
  }
  return { draft: d, notice: d.pending && view.executions > d.pending.command.expectedExecution ? "Accepted execution restored. Playback returned to edit." : "Editor draft restored." };
 } catch { return { draft: null, notice: "Saved draft is unavailable or incompatible. Starting from the server layout; editing still works." }; }
}

export function saveGhostDraft(view: DraftIdentity, draft: GhostDraft): boolean {
 try { localStorage.setItem(draftKey(view), JSON.stringify(draft)); return true; } catch { return false; }
}

export function readGhostSummary(contract: ContractIdentity): GhostSummary | null {
 try {
  const s = JSON.parse(localStorage.getItem(summaryKey(contract)) ?? "null") as GhostSummary | null;
  return s?.version === 1 && s.contentVersion === contract.contentVersion && s.rulesVersion === contract.rulesVersion &&
   s.completed === true && (s.bestRating === "Basic" || s.bestRating === "Full Haul") ? s : null;
 } catch { return null; }
}

export function saveGhostSummary(view: ContractIdentity & { bestRating: GhostRating | null }): boolean {
 if (!view.bestRating) return true;
 const old = readGhostSummary(view);
 const summary: GhostSummary = {
  version: 1, contentVersion: view.contentVersion, rulesVersion: view.rulesVersion, completed: true,
  bestRating: old?.bestRating === "Full Haul" ? old.bestRating : view.bestRating
 };
 try { localStorage.setItem(summaryKey(view), JSON.stringify(summary)); return true; } catch { return false; }
}

export function storageAvailable(): boolean {
 try {
  const key = `${prefix}:probe`; localStorage.setItem(key, "1"); localStorage.removeItem(key);
  return true;
 } catch { return false; }
}
