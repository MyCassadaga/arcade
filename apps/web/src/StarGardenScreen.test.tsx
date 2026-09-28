import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createStarGardenState, getStarGardenPrivateView, getStarGardenPublicView, handleStarGardenCommand } from "@team-arcade/games";
import type { StarGardenState } from "@team-arcade/games";
import { StarGardenScreen } from "./StarGardenScreen";
import { readStarGardenHistory, recordStarGardenResult, starGardenHistoryKey } from "./star-garden-history";
const id = "00000000-0000-4000-8000-000000000031";
const players = [{ id: "p", displayName: "Player", connected: true, isHost: true, score: 0 }];
const setup = () => createStarGardenState({ players, now: 0, random: () => 0 }, id);
const start = () => handleStarGardenCommand(setup(), { type: "starGarden.begin", gameInstanceId: id, roundNumber: 0, expectedRevision: 0, mode: "daily" }, "p", Date.UTC(2026, 8, 28), true, "seed").state;
function show(state: StarGardenState, connected = true) {
  const sendGame = vi.fn(() => true), playAgain = vi.fn(() => true), backToArcade = vi.fn(() => true);
  render(<StarGardenScreen game={{ gameId: "star-garden", phase: state.phase, public: getStarGardenPublicView(state), private: getStarGardenPrivateView(state, "p") }} players={players} isHost connected={connected} commandPending={false} sendGame={sendGame} playAgain={playAgain} backToArcade={backToArcade} />);
  return { sendGame, playAgain };
}
describe("Star Garden presentation", () => {
  it("defaults Daily, isolates the complete tutorial and only begins on confirmation", async () => {
    const { sendGame } = show(setup()); const user = userEvent.setup();
    expect(screen.getByRole("radio", { name: /Daily/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Try the short tutorial" }));
    await user.click(screen.getByRole("button", { name: "Select Exchange" }));
    const board = within(screen.getByRole("group", { name: "Tutorial garden" }));
    await user.click(board.getByRole("button", { name: /Row 1 column 2/ })); await user.click(board.getByRole("button", { name: /Row 2 column 2/ }));
    await user.click(screen.getByRole("button", { name: "Confirm Exchange" })); await user.click(screen.getByRole("button", { name: "Claim Ember" }));
    expect(screen.getByText(/three scripted violet/)).toBeVisible(); expect(sendGame).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Begin" })); expect(sendGame).toHaveBeenCalledWith(expect.objectContaining({ type: "starGarden.begin", mode: "daily" }));
  });
  it("warns about no-ops, cancels freely, exposes only unknown random preview and locks duplicate confirmation", async () => {
    const s = start(); s.players.p!.board.fill(0); s.players.p!.hand = [{ id: "exchange-1", action: "exchange" }, { id: "mutation-1", action: "mutation" }];
    const { sendGame } = show(s), user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Exchange 1 action/ }));
    const board = within(screen.getByRole("group", { name: "Your garden" }));
    await user.click(board.getByRole("button", { name: /Row 1 column 1/ })); await user.click(board.getByRole("button", { name: /Row 1 column 2/ }));
    expect(screen.getByText(/leaves the colors unchanged/)).toBeVisible(); await user.click(screen.getByRole("button", { name: "Cancel" })); expect(sendGame).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Mutation 1 action/ })); await user.click(board.getByRole("button", { name: /Row 1 column 1/ }));
    expect(within(screen.getByRole("group", { name: "Preview, not committed" })).getByRole("button", { name: /unknown new star/ })).toBeVisible();
    const confirm = screen.getByRole("button", { name: "Confirm card" }); fireEvent.click(confirm); fireEvent.click(confirm); expect(sendGame).toHaveBeenCalledTimes(1);
  });
  it("allows keyboard selection among overlapping origins and zero-card claims", async () => {
    const s = start(); s.players.p!.board.fill(0); s.players.p!.hand = []; s.lanes.easy = ["G01"];
    const { sendGame } = show(s), user = userEvent.setup();
    const goal = screen.getByRole("button", { name: "Ember, 2 points, 6 matching origins" }); goal.focus(); await user.keyboard("{Enter}");
    const origin = screen.getByRole("button", { name: "Origin row 2 column 3" }); origin.focus(); await user.keyboard("{Enter}");
    const confirm = screen.getByRole("button", { name: "Confirm claim" }); confirm.focus(); await user.keyboard("{Enter}");
    expect(sendGame).toHaveBeenCalledWith(expect.objectContaining({ type: "starGarden.claimGoal", origin: 7 }));
  });
  it("requires End Run confirmation and blocks disconnected commits", async () => {
    const { sendGame } = show(start()); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "End Run" })); expect(sendGame).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Keep playing" })); expect(sendGame).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "End Run" })); await user.click(screen.getByRole("button", { name: "Confirm End Run" })); expect(sendGame).toHaveBeenCalledTimes(1);
  });
  it("provides spoiler-free share fallback and first/best local history without replacing an active board", async () => {
    const s = start(); s.phase = "gameResults"; s.endingReason = "ended"; s.players.p!.score = 47; s.players.p!.goalsClaimed = 9; s.players.p!.actionsSpent = 18;
    show(s); fireEvent.click(screen.getByRole("button", { name: "Share result" }));
    expect(await screen.findByLabelText("Plain-text result")).toHaveValue("Star Garden Daily 2026-09-28 · v1 | 47 points | 9/30 constellations | 18 actions");
    expect(readStarGardenHistory("2026-09-28")?.first.score).toBe(47);
    recordStarGardenResult("2026-09-28", { instance: "replay", score: 60, goals: 12, actions: 20 });
    expect(readStarGardenHistory("2026-09-28")).toMatchObject({ first: { score: 47 }, best: { score: 60 } });
    localStorage.setItem(starGardenHistoryKey("2026-09-29"), "broken"); expect(readStarGardenHistory("2026-09-29")).toBeNull();
    expect(s.players.p!.board).toEqual(start().players.p!.board);
  });
});

it("keeps disconnected controls disabled and never sends a command", () => {
  const { sendGame } = show(start(), false);
  expect(screen.getByRole("button", { name: "End Run" })).toBeDisabled();
  for (const button of within(screen.getByRole("region", { name: "Your hand" })).getAllByRole("button")) expect(button).toBeDisabled();
  expect(sendGame).not.toHaveBeenCalled();
});
