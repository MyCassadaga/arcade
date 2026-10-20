import { GameRuleError, type GameContext } from "@team-arcade/game-core";
import { ghostLayoutSchema, type GhostCircuitCommand, type GhostCircuitPublicView, type GhostDirection, type GhostLayout, type GhostNode, type GhostResult } from "@team-arcade/shared";
export const coordinate = (cell: number) => `${"ABCDEF"[cell % 6]}${Math.floor(cell / 6) + 1}`;
export const cellAt = (name: string) => (Number(name.slice(1)) - 1) * 6 + "ABCDEF".indexOf(name[0]!);
export const GHOST_NODES: GhostNode[] = [
  ["A1", "entry", "E"], ["C1", "badge", "WE"], ["E1", "scanner", "WE"], ["D3", "vault", "WE"], ["B2", "scanner", "WE"], ["D5", "cache", "WE"], ["A6", "exit", "E"]
].map(([cell, kind, ports]) => ({ cell: cellAt(cell!), kind: kind as GhostNode["kind"], ports: [...ports!] as GhostDirection[] }));
const pathNames = ["A1 B1 C1 D1 E1 F1 F2 F3 E3 D3 C3 B3 B4 B5 B6 A6", "A1 B1 C1 D1 E1 F1 F2 F3 E3 D3 C3 C4 C5 D5 E5 E6 D6 C6 B6 A6", "A1 B1 C1 D1 E1 F1 F2 F3 E3 D3 C3 C2 B2 A2 A3 A4 A5 B5 B6 A6"];
export const GHOST_SOCKETS = [...new Set(pathNames.flatMap(p => p.split(" ").map(cellAt)))].filter(c => !GHOST_NODES.some(n => n.cell === c));
export const GHOST_INVENTORY = { straight: 8, elbow: 8 } as const;
const directions: GhostDirection[] = ["N", "E", "S", "W"];
const opposite = (d: GhostDirection) => directions[(directions.indexOf(d) + 2) % 4]!;
export function piecePorts(kind: "straight" | "elbow", rotation: number): GhostDirection[] { return (kind === "straight" ? [0, 2] : [0, 1]).map(d => directions[(d + rotation) % 4]!); }
export function validateGhostLayout(input: unknown): GhostLayout {
  const parsed = ghostLayoutSchema.safeParse(input);
  if (!parsed.success) throw new GameRuleError("INVALID_COMMAND", "Invalid cable layout.");
  const layout = parsed.data;
  if (new Set(layout.map(p => p.cell)).size !== layout.length || layout.some(p => !GHOST_SOCKETS.includes(p.cell))) throw new GameRuleError("INVALID_COMMAND", "Place one cable per editable socket.");
  for (const kind of ["straight", "elbow"] as const) if (layout.filter(p => p.kind === kind).length > GHOST_INVENTORY[kind]) throw new GameRuleError("INVALID_COMMAND", `Only ${GHOST_INVENTORY[kind]} ${kind} cables available.`);
  return layout.map(p => ({ ...p })).sort((a,b) => a.cell-b.cell);
}
export function simulateGhostCircuit(input: unknown): GhostResult {
  const layout = validateGhostLayout(input), events: GhostResult["events"] = [];
  let cell = 0, out: GhostDirection = "E", disguise = false, archive = false;
  const caches = new Set<number>(), visited = new Set<string>();
  const emit = (kind: GhostResult["events"][number]["kind"], text: string) => events.push({ cell, kind, text, disguise, archive, caches: caches.size });
  const fail = (reason: string): GhostResult => { emit("fail", `${coordinate(cell)}: ${reason}`); return { events, success: false, rating: null, failure: reason }; };
  emit("move", "A1: Courier enters the network.");
  for (let step = 0; step < 144; step++) {
    const x = cell % 6, y = Math.floor(cell / 6);
    if ((out === "N" && y === 0) || (out === "S" && y === 5) || (out === "W" && x === 0) || (out === "E" && x === 5)) return fail("Cable leaves the board.");
    cell += { N: -6, E: 1, S: 6, W: -1 }[out];
    const arrival = opposite(out), key = `${cell}:${arrival}`;
    if (visited.has(key)) return fail("Repeated route state; invalid circuit.");
    visited.add(key);
    const node = GHOST_NODES.find(n => n.cell === cell), piece = layout.find(p => p.cell === cell);
    if (!node && !GHOST_SOCKETS.includes(cell)) return fail("Blocked hardware cannot carry a route.");
    const ports = node?.ports ?? (piece ? piecePorts(piece.kind, piece.rotation) : []);
    if (!ports.includes(arrival)) return fail(piece || node ? "Facing ports do not connect." : "Missing cable.");
    emit("move", `${coordinate(cell)}: ${node?.kind ?? "cable"}.`);
    if (node?.kind === "entry") return fail("Entry cannot be re-entered.");
    if (node?.kind === "badge") { disguise = true; emit("effect", "Badge acquired. Scanners accept this disguise."); }
    if (node?.kind === "scanner") { if (!disguise) return fail("Detected: scanner requires a badge. The vault removes your disguise."); emit("effect", "Scanner passed with badge."); }
    if (node?.kind === "vault") { archive = true; disguise = false; emit("effect", "Archive acquired. Disguise lost: avoid further scanners."); }
    if (node?.kind === "cache") { caches.add(cell); emit("effect", "Optional cache acquired."); }
    if (node?.kind === "exit") { if (!archive) return fail("Archive still missing."); emit("exit", "Archive extracted. Escape complete."); return { events, success: true, rating: caches.size === 1 ? "Full Haul" : "Basic", failure: null }; }
    const next = ports.find(p => p !== arrival);
    if (!next) return fail("No outbound connection.");
    out = next;
  }
  return fail("Circuit exceeds the safe step bound.");
}
export interface GhostCircuitState extends GhostCircuitPublicView { phase: "playing" }
export function createGhostCircuitState(context: GameContext, gameInstanceId: string): GhostCircuitState {
  const players = context.players.filter(p => p.connected);
  if (players.length !== 1) throw new GameRuleError(players.length ? "TOO_MANY_PLAYERS" : "TOO_FEW_PLAYERS", "Ghost Circuit needs one player.");
  return { phase: "playing", gameInstanceId, contractId: "borrowed-identity", contentVersion: 1, rulesVersion: 1, executions: 0, firstSuccess: null, bestRating: null, latest: null, activePlayerId: players[0]!.id };
}
export function handleGhostCircuitCommand(state: GhostCircuitState, command: GhostCircuitCommand, actor: string) {
  if (actor !== state.activePlayerId) throw new GameRuleError("PLAYER_NOT_ACTIVE", "Only the active courier may execute.");
  if (command.gameInstanceId !== state.gameInstanceId || command.contractId !== state.contractId || command.contentVersion !== state.contentVersion || command.rulesVersion !== state.rulesVersion || command.expectedExecution !== state.executions) throw new GameRuleError("STALE_PHASE", "Execution changed. Refresh the current session before running again.");
  const layout = validateGhostLayout(command.layout), result = simulateGhostCircuit(layout), execution = state.executions + 1;
  return { state: { ...state, executions: execution, latest: { execution, layout, result }, firstSuccess: state.firstSuccess ?? (result.success ? execution : null), bestRating: state.bestRating === "Full Haul" ? state.bestRating : result.rating ?? state.bestRating } };
}
export function getGhostCircuitPublicView(state: GhostCircuitState): GhostCircuitPublicView { return structuredClone({ gameInstanceId: state.gameInstanceId, contractId: state.contractId, contentVersion: state.contentVersion, rulesVersion: state.rulesVersion, executions: state.executions, firstSuccess: state.firstSuccess, bestRating: state.bestRating, latest: state.latest, activePlayerId: state.activePlayerId }); }
