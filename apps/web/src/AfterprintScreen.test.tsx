import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectAfterprintPuzzle } from "@team-arcade/games";
import type { TypedGameViewerState } from "@team-arcade/shared";
import { AfterprintScreen, formatAfterprintShare } from "./AfterprintScreen";

const instance = "00000000-0000-4000-8000-000000000019";

function game(attempts: Extract<TypedGameViewerState, { gameId: "afterprint" }>["public"]["attempts"] = [], solved = false) {
  const puzzle = selectAfterprintPuzzle(1);
  return {
    gameId: "afterprint",
    phase: solved || attempts.length === 4 ? "gameResults" : "playing",
    public: {
      gameInstanceId: instance,
      puzzleNumber: puzzle.puzzleNumber,
      bankVersion: puzzle.bankVersion,
      target: puzzle.target,
      events: puzzle.events,
      initialEventIds: puzzle.initialEventIds,
      attempts,
      maxAttempts: 4,
      activePlayerId: "player-1",
      solved
    },
    private: { canSubmit: !solved && attempts.length < 4 }
  } satisfies Extract<TypedGameViewerState, { gameId: "afterprint" }>;
}

describe("AfterprintScreen", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    });
  });

  it("keeps both boards and all five diagram events together and swaps by two taps", async () => {
    const user = userEvent.setup();
    const sendGame = vi.fn(() => true);
    render(<AfterprintScreen game={game()} commandPending={false} sendGame={sendGame} playAgain={() => true} backToArcade={() => true} />);
    expect(screen.getByRole("region", { name: /^Target board:/ })).toBeVisible();
    expect(screen.getByRole("region", { name: /^Replay board:/ })).toBeVisible();
    const first = screen.getByRole("button", { name: /^1\./ });
    const third = screen.getByRole("button", { name: /^3\./ });
    await user.click(first);
    expect(first).toHaveAttribute("aria-pressed", "true");
    await user.click(third);
    await user.click(screen.getByRole("button", { name: "Replay order" }));
    expect(sendGame).toHaveBeenCalledWith(expect.objectContaining({
      type: "afterprint.submitOrder",
      eventIds: ["E", "A", "D", "C", "B"]
    }));
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("enlarges boards and replays history without submitting another attempt", async () => {
    const user = userEvent.setup();
    const sendGame = vi.fn(() => true);
    const attempt = { eventIds: ["D", "A", "E", "C", "B"] as const, mismatchCount: 8, solved: false };
    render(<AfterprintScreen game={game([{ ...attempt, eventIds: [...attempt.eventIds] }])} commandPending={false} sendGame={sendGame} playAgain={() => true} backToArcade={() => true} />);
    await user.click(screen.getByRole("button", { name: "Enlarge target board" }));
    expect(screen.getByRole("dialog", { name: "Enlarged target board" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Close enlarged board" }));
    await user.click(screen.getByRole("button", { name: "Replay attempt 1: 8 mismatches" }));
    expect(sendGame).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Attempt 1 replayed. No attempt used.");
  });

  it("shows a spoiler-free share result", async () => {
    const user = userEvent.setup();
    const attempts = [
      { eventIds: ["D", "A", "E", "C", "B"] as const, mismatchCount: 5, solved: false },
      { eventIds: ["A", "B", "E", "C", "D"] as const, mismatchCount: 0, solved: true }
    ].map((attempt) => ({ ...attempt, eventIds: [...attempt.eventIds] }));
    render(<AfterprintScreen game={game(attempts, true)} commandPending={false} sendGame={() => true} playAgain={() => true} backToArcade={() => true} />);
    await user.click(screen.getByRole("button", { name: "Share result" }));
    const output = screen.getByLabelText("Spoiler-free result");
    expect(output).toHaveValue("AFTERPRINT #001\n▶ Solved in 2/4\n\n5 → 0 ✦");
    expect(String((output as HTMLTextAreaElement).value)).not.toMatch(/[A-E]{5}/u);
    expect(formatAfterprintShare(42, attempts, true)).toContain("AFTERPRINT #042");
  });
});
