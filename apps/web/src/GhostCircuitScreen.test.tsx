import { fireEvent, render, screen, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GhostCircuitScreen } from "./GhostCircuitScreen";
import { createGhostCircuitState, getGhostCircuitPublicView, handleGhostCircuitCommand } from "@team-arcade/games/ghost-circuit";
import { GHOST_WITNESS_PATHS, layoutForPath } from "../../../packages/games/src/ghost-circuit/witnesses";
import { ghostDraftKey, ghostSummaryKey, readGhostDraft, saveGhostDraft, saveGhostSummary } from "./ghost-circuit-storage";
import type { ClientMessage, GhostCircuitCommand, TypedGameViewerState } from "@team-arcade/shared";
const state = () => createGhostCircuitState({ players: [{ id: "courier", displayName: "Courier", isHost: true, score: 0, connected: true }], random: () => 0, now: 0 }, "00000000-0000-4000-8000-000000000001");
const game = (s = state()): Extract<TypedGameViewerState, { gameId: "ghost-circuit" }> => ({ gameId: "ghost-circuit", phase: "playing", public: getGhostCircuitPublicView(s), private: { canExecute: true } });
const run = (layout = layoutForPath(GHOST_WITNESS_PATHS.basic)): GhostCircuitCommand => ({ type: "ghostCircuit.execute", gameInstanceId: state().gameInstanceId, contractId: "borrowed-identity", contentVersion: 1, rulesVersion: 1, expectedExecution: 0, layout });
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
describe("Ghost Circuit editor, replay and local recovery", () => {
 it("supports placement, rotate/remove, keyboard navigation and exact undo/redo", () => {
  render(<GhostCircuitScreen game={game()} connected commandPending={false} send={() => true} backToArcade={() => true} />);
  fireEvent.click(screen.getByRole("button", { name: "B1 empty socket" }));
  expect(screen.getByRole("button", { name: /B1 straight, ports E W/ })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("button", { name: /B1 straight/ }), { key: "r" });
  expect(screen.getByRole("button", { name: /B1 straight, ports S N/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Undo" })); expect(screen.getByRole("button", { name: /B1 straight, ports E W/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  fireEvent.keyDown(screen.getByRole("button", { name: /B1 straight/ }), { key: "Delete" }); expect(screen.getByRole("button", { name: /B1 empty socket/ })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("button", { name: /B1 empty/ }), { key: "ArrowRight" }); expect(screen.getByRole("button", { name: /C1 badge/ })).toHaveFocus();
 });
 it("persists immutable pending execution and retries the same ID/payload across reload; server acceptance unlocks editing", () => {
  const send = vi.fn<(m: ClientMessage) => boolean>(() => false);
  const props = { game: game(), connected: true, commandPending: false, send, backToArcade: () => true };
  const first = render(<GhostCircuitScreen {...props} />); fireEvent.click(screen.getByRole("button", { name: "EXECUTE CIRCUIT →" })); const original = send.mock.calls[0]![0];
  expect(original).toMatchObject({ payload: { command: { expectedExecution: 0, layout: [] } } }); first.unmount();
  const next = render(<GhostCircuitScreen {...props} />); fireEvent.click(screen.getByRole("button", { name: "Retry pending execution" })); expect(send.mock.calls[1]![0]).toEqual(original);
  const accepted = handleGhostCircuitCommand(state(), run([]), "courier").state;
  next.rerender(<GhostCircuitScreen {...props} game={game(accepted)} />);
  expect(screen.getByRole("button", { name: "Return to edit" })).toBeEnabled(); fireEvent.click(screen.getByRole("button", { name: "Return to edit" })); expect(screen.getByRole("button", { name: "EXECUTE CIRCUIT →" })).toBeEnabled();
 });
 it("replay, pause, step and return-to-edit never send executions; reload restores count in edit", () => {
  vi.useFakeTimers(); const accepted = handleGhostCircuitCommand(state(), run(), "courier").state, send = vi.fn(() => true);
  const ui = render(<GhostCircuitScreen game={game(accepted)} connected commandPending={false} send={send} backToArcade={() => true} />);
  fireEvent.click(screen.getByRole("button", { name: "Replay latest" })); void act(() => vi.advanceTimersByTime(320)); fireEvent.click(screen.getByRole("button", { name: "Pause" })); fireEvent.click(screen.getByRole("button", { name: "Step" })); fireEvent.click(screen.getByRole("button", { name: "Return to edit" })); expect(send).not.toHaveBeenCalled(); ui.unmount();
  render(<GhostCircuitScreen game={game(accepted)} connected commandPending={false} send={send} backToArcade={() => true} />); expect(screen.getByRole("button", { name: "EXECUTE CIRCUIT →" })).toBeEnabled(); expect(send).not.toHaveBeenCalled(); vi.useRealTimers();
 });
 it("recovers corrupt/version mismatched drafts and denied storage without aborting editing", () => {
  localStorage.setItem(ghostDraftKey(state().gameInstanceId), "{broken"); expect(readGhostDraft(game().public).draft).toBeNull();
  localStorage.setItem(ghostDraftKey(state().gameInstanceId), JSON.stringify({ version: 2 })); expect(readGhostDraft(game().public).draft).toBeNull();
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("denied"); }); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("denied"); });
  render(<GhostCircuitScreen game={game()} connected commandPending={false} send={() => true} backToArcade={() => true} />);
  expect(screen.getByText(/Progress won't be saved/)).toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: /B1 empty socket/ })); expect(screen.getByRole("button", { name: /B1 straight/ })).toBeInTheDocument();
 });
 it("keeps only nonauthoritative versioned best history across a new server session", () => {
  const accepted = handleGhostCircuitCommand(state(), run(layoutForPath(GHOST_WITNESS_PATHS.full)), "courier").state; expect(saveGhostSummary(accepted)).toBe(true);
  const summary: unknown = JSON.parse(localStorage.getItem(ghostSummaryKey)!); expect(summary).toEqual({ version: 1, contentVersion: 1, rulesVersion: 1, completed: true, bestRating: "Full Haul" });
  render(<GhostCircuitScreen game={game()} connected commandPending={false} send={() => true} backToArcade={() => true} />); expect(screen.getByText(/New server session/)).toBeInTheDocument(); expect(screen.getByRole("button", { name: /B1 empty socket/ })).toBeInTheDocument();
 });
 it("reconciles an accepted pending run with server layout and clears obsolete authority", () => {
  saveGhostDraft(state().gameInstanceId, { version: 1, contentVersion: 1, rulesVersion: 1, execution: 0, layout: [], pending: { requestId: "pending", command: run([]) } });
  const accepted = handleGhostCircuitCommand(state(), run(), "courier").state;
  render(<GhostCircuitScreen game={game(accepted)} connected commandPending={false} send={() => true} backToArcade={() => true} />);
  expect(screen.getByRole("button", { name: /B1 straight/ })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "EXECUTE CIRCUIT →" })).toBeEnabled();
 });
});
