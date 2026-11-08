import { GameRuleError, type GameContext } from "@team-arcade/game-core";
import { ghostLayoutSchema, type GhostCircuitCommand, type GhostCircuitPublicView, type GhostContractProgress, type GhostDirection, type GhostLayout, type GhostResult } from "@team-arcade/shared";
import { coordinate, findGhostContract, getGhostContract, GHOST_CAMPAIGN, LEGACY_GHOST_CONTRACT, type GhostContract } from "./contracts";
export { coordinate, cellAt, GHOST_CAMPAIGN, GHOST_CHAPTERS, getGhostContract, LEGACY_GHOST_CONTRACT, type GhostContract } from "./contracts";
const directions: GhostDirection[] = ["N", "E", "S", "W"];
const opposite = (d: GhostDirection) => directions[(directions.indexOf(d) + 2) % 4]!;
export function piecePorts(kind: "straight" | "elbow", rotation: number): GhostDirection[] { return (kind === "straight" ? [0, 2] : [0, 1]).map(d => directions[(d + rotation) % 4]!); }
export function validateGhostLayout(input: unknown, contract: GhostContract): GhostLayout {
  const parsed = ghostLayoutSchema.safeParse(input);
  if (!parsed.success) throw new GameRuleError("INVALID_COMMAND", "Invalid cable layout.");
  const layout = parsed.data;
  if (new Set(layout.map(p => p.cell)).size !== layout.length || layout.some(p => !contract.sockets.includes(p.cell))) throw new GameRuleError("INVALID_COMMAND", "Place one cable per editable socket.");
  for (const kind of ["straight", "elbow"] as const) if (layout.filter(p => p.kind === kind).length > contract.inventory[kind]) throw new GameRuleError("INVALID_COMMAND", `Only ${contract.inventory[kind]} ${kind} cables available.`);
  return layout.map(p => ({ ...p })).sort((a,b) => a.cell-b.cell);
}
export function simulateGhostCircuit(input: unknown, contract: GhostContract): GhostResult {
  const layout = validateGhostLayout(input, contract), events: GhostResult["events"] = [];
  const entry = contract.nodes.find(node => node.kind === "entry")!;
  let cell = entry.cell, out = entry.ports[0]!, disguise = false, archive = false;
  const cacheCount = contract.nodes.filter(node => node.kind === "cache").length;
  const caches = new Set<number>(), visited = new Set<string>();
  const emit = (kind: GhostResult["events"][number]["kind"], text: string) => events.push({ cell, kind, text, disguise, archive, caches: caches.size });
  const fail = (reason: string): GhostResult => { emit("fail", `${coordinate(cell)}: ${reason}`); return { events, success: false, rating: null, failure: reason }; };
  emit("move", `${coordinate(cell)}: Courier enters the network.`);
  for (let step = 0; step < 144; step++) {
    const x = cell % 6, y = Math.floor(cell / 6);
    if ((out === "N" && y === 0) || (out === "S" && y === 5) || (out === "W" && x === 0) || (out === "E" && x === 5)) return fail("Cable leaves the board.");
    cell += { N: -6, E: 1, S: 6, W: -1 }[out];
    const arrival = opposite(out), key = `${cell}:${arrival}`;
    if (visited.has(key)) return fail("Repeated route state; invalid circuit.");
    visited.add(key);
    const node = contract.nodes.find(n => n.cell === cell), piece = layout.find(p => p.cell === cell);
    if (!node && !contract.sockets.includes(cell)) return fail("Blocked hardware cannot carry a route.");
    const ports = node?.ports ?? (piece ? piecePorts(piece.kind, piece.rotation) : []);
    if (!ports.includes(arrival)) return fail(piece || node ? "Facing ports do not connect." : "Missing cable.");
    emit("move", `${coordinate(cell)}: ${node?.kind ?? "cable"}.`);
    if (node?.kind === "entry") return fail("Entry cannot be re-entered.");
    if (node?.kind === "badge") { disguise = true; emit("effect", "Badge acquired. Scanners accept this disguise."); }
    if (node?.kind === "scanner") { if (!disguise) return fail("Detected: scanner requires a badge. The vault removes your disguise."); emit("effect", "Scanner passed with badge."); }
    if (node?.kind === "vault") { archive = true; disguise = false; emit("effect", "Archive acquired. Disguise lost: avoid further scanners."); }
    if (node?.kind === "cache") { caches.add(cell); emit("effect", "Optional cache acquired."); }
    if (node?.kind === "exit") { if (!archive) return fail("Archive still missing."); emit("exit", "Archive extracted. Escape complete."); return { events, success: true, rating: cacheCount > 0 && caches.size === cacheCount ? "Full Haul" : "Basic", failure: null }; }
    const next = ports.find(p => p !== arrival);
    if (!next) return fail("No outbound connection.");
    out = next;
  }
  return fail("Circuit exceeds the safe step bound.");
}
export interface GhostCircuitState extends GhostContractProgress {
  phase: "playing";
  gameInstanceId: string;
  activePlayerId: string;
  contractId: string;
  contentVersion: number;
  rulesVersion: 1;
  // Old saved rooms omit these fields. Their flat active progress remains authoritative.
  selectionRevision?: number;
  otherContracts?: Record<string, GhostContractProgress>;
}

const emptyProgress: GhostContractProgress = { executions: 0, firstSuccess: null, bestRating: null, latest: null };
const contractProgress = ({ executions, firstSuccess, bestRating, latest }: GhostContractProgress): GhostContractProgress =>
  ({ executions, firstSuccess, bestRating, latest });
const contractIdentity = ({ id, contentVersion, rulesVersion }: GhostContract) => ({ contractId: id, contentVersion, rulesVersion });

export function createGhostCircuitState(context: GameContext, gameInstanceId: string): GhostCircuitState {
  const players = context.players.filter(p => p.connected);
  if (players.length !== 1) throw new GameRuleError(players.length ? "TOO_MANY_PLAYERS" : "TOO_FEW_PLAYERS", "Ghost Circuit needs one player.");
  return {
    phase: "playing", gameInstanceId, activePlayerId: players[0]!.id,
    ...contractIdentity(GHOST_CAMPAIGN[0]!), ...emptyProgress, selectionRevision: 0
  };
}

export function handleGhostCircuitCommand(state: GhostCircuitState, command: GhostCircuitCommand, actor: string) {
  if (actor !== state.activePlayerId) throw new GameRuleError("PLAYER_NOT_ACTIVE", "Only the active courier may change the circuit.");
  const revision = state.selectionRevision ?? 0;
  const legacyExecute = command.type === "ghostCircuit.execute" && command.selectionRevision === undefined &&
    state.selectionRevision === undefined && state.contractId === LEGACY_GHOST_CONTRACT.id;
  if (command.gameInstanceId !== state.gameInstanceId || (!legacyExecute && command.selectionRevision !== revision)) {
    throw new GameRuleError("STALE_PHASE", "Contract selection changed. Refresh the current session.");
  }

  if (command.type === "ghostCircuit.select") {
    const contract = findGhostContract(command.contractId);
    if (!contract || command.contentVersion !== contract.contentVersion || command.rulesVersion !== contract.rulesVersion) {
      throw new GameRuleError("INVALID_COMMAND", "That contract version is unavailable.");
    }
    if (contract.id === state.contractId) return { state };
    if (revision >= Number.MAX_SAFE_INTEGER - 1) throw new GameRuleError("INVALID_PHASE", "Contract selection limit reached.");
    const otherContracts = { ...state.otherContracts };
    const nextProgress = otherContracts[contract.id] ?? emptyProgress;
    delete otherContracts[contract.id];
    if (state.executions > 0) otherContracts[state.contractId] = contractProgress(state);
    return { state: {
      ...state, ...contractIdentity(contract), ...nextProgress, otherContracts, selectionRevision: revision + 1
    } };
  }

  if (command.contractId !== state.contractId || command.contentVersion !== state.contentVersion ||
      command.rulesVersion !== state.rulesVersion || command.expectedExecution !== state.executions) {
    throw new GameRuleError("STALE_PHASE", "Execution changed. Refresh the current session before running again.");
  }
  const contract = getGhostContract(state.contractId);
  const layout = validateGhostLayout(command.layout, contract);
  const result = simulateGhostCircuit(layout, contract);
  const execution = state.executions + 1;
  return { state: {
    ...state, executions: execution, latest: { execution, layout, result },
    firstSuccess: state.firstSuccess ?? (result.success ? execution : null),
    bestRating: state.bestRating === "Full Haul" ? state.bestRating : result.rating ?? state.bestRating
  } };
}

export function getGhostCircuitPublicView(state: GhostCircuitState): GhostCircuitPublicView {
  const completedContractIds = Object.entries(state.otherContracts ?? {}).flatMap(([id, progress]) => progress.bestRating ? [id] : []);
  if (state.bestRating) completedContractIds.push(state.contractId);
  return structuredClone({
    gameInstanceId: state.gameInstanceId, activePlayerId: state.activePlayerId, contractId: state.contractId,
    contentVersion: state.contentVersion, rulesVersion: state.rulesVersion, ...contractProgress(state),
    selectionRevision: state.selectionRevision ?? 0, completedContractIds
  });
}
