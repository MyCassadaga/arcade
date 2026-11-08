import { describe, expect, it } from "vitest";
import { handleGhostCircuitCommand, LEGACY_GHOST_CONTRACT, simulateGhostCircuit, validateGhostLayout } from "./index";
import { GHOST_WITNESS_PATHS, layoutForPath } from "./witnesses";
import type { GhostCircuitExecute } from "@team-arcade/shared";
const state = () => ({
 phase: "playing" as const, gameInstanceId: "00000000-0000-4000-8000-000000000001", activePlayerId: "courier",
 contractId: LEGACY_GHOST_CONTRACT.id, contentVersion: 1, rulesVersion: 1 as const,
 executions: 0, firstSuccess: null, bestRating: null, latest: null
});
const simulate = (input: unknown) => simulateGhostCircuit(input, LEGACY_GHOST_CONTRACT);
const validate = (input: unknown) => validateGhostLayout(input, LEGACY_GHOST_CONTRACT);
const command = (layout = layoutForPath(GHOST_WITNESS_PATHS.basic)): GhostCircuitExecute => ({ type: "ghostCircuit.execute", gameInstanceId: state().gameInstanceId, contractId: "borrowed-identity", contentVersion: 1, rulesVersion: 1, expectedExecution: 0, layout });
describe("Ghost Circuit frozen M0", () => {
 it("validates distinct inventory-conserving Basic and Full Haul witnesses with deterministic event streams", () => {
  const basic = layoutForPath(GHOST_WITNESS_PATHS.basic), full = layoutForPath(GHOST_WITNESS_PATHS.full);
  expect(basic.filter(p => p.kind === "straight")).toHaveLength(7); expect(basic.filter(p => p.kind === "elbow")).toHaveLength(4);
  expect(full.filter(p => p.kind === "straight")).toHaveLength(8); expect(full.filter(p => p.kind === "elbow")).toHaveLength(6);
  expect(simulate(basic)).toMatchObject({ success: true, rating: "Basic" }); expect(simulate(full)).toMatchObject({ success: true, rating: "Full Haul" });
  expect(simulate(full)).toEqual(simulate(full)); expect(simulate(full).events.length).toBeLessThan(80);
 });
 it("loses disguise at vault, detects at B2, and permits the corrected escape", () => {
  const result = simulate(layoutForPath(GHOST_WITNESS_PATHS.detected));
  expect(result.success).toBe(false); expect(result.events.at(-1)).toMatchObject({ cell: 7, disguise: false, archive: true, kind: "fail" });
  expect(result.failure).toContain("Detected"); expect(simulate(layoutForPath(GHOST_WITNESS_PATHS.basic)).success).toBe(true);
 });
 it("rejects malformed, fixed, duplicate and overspent layouts without changing attempts", () => {
  for (const layout of [[{ cell: 0, kind: "straight", rotation: 0 }], [{ cell: 1, kind: "straight", rotation: 4 }], [...command().layout, command().layout[0]], Array.from({ length: 37 }, () => ({ cell: 1, kind: "straight", rotation: 0 }))]) expect(() => validate(layout)).toThrow();
  const overspent = layoutForPath(GHOST_WITNESS_PATHS.full).map(p => ({ ...p, kind: "straight" as const })); expect(() => validate(overspent)).toThrow("Only 8"); expect(state().executions).toBe(0);
 });
 it("guards actors/stale attempts and records bounded aggregate improvement without scores", () => {
  expect(() => handleGhostCircuitCommand(state(), command(), "intruder")).toThrow("active courier");
  const first = handleGhostCircuitCommand(state(), command(), "courier"); expect(first.state).toMatchObject({ executions: 1, firstSuccess: 1, bestRating: "Basic", phase: "playing" }); expect(first).not.toHaveProperty("scoreDelta");
  expect(() => handleGhostCircuitCommand(first.state, command(), "courier")).toThrow("Execution changed");
  const next = handleGhostCircuitCommand(first.state, { ...command(layoutForPath(GHOST_WITNESS_PATHS.full)), expectedExecution: 1 }, "courier").state;
  expect(next).toMatchObject({ executions: 2, firstSuccess: 1, bestRating: "Full Haul" }); expect(next).not.toHaveProperty("attempts");
 });
 it("reports missing cable and mismatched ports as accepted failed executions; request envelope stays bounded", () => {
  expect(handleGhostCircuitCommand(state(), command([]), "courier").state).toMatchObject({ executions: 1, latest: { result: { success: false, failure: "Missing cable." } } });
  const wrong = command().layout.map(p => p.cell === 1 ? { ...p, rotation: 0 } : p); expect(simulate(wrong).failure).toContain("Facing ports");
  expect(JSON.stringify({ type: "game.command", requestId: "x".repeat(100), payload: { command: { ...command(), layout: Array.from({length:36}, (_,cell) => ({cell, kind:"straight", rotation:0})) } } }).length).toBeLessThan(4096);
 });
});
