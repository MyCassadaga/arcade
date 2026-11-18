import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TypedGameViewerState } from "@team-arcade/shared";
import { TwoTruthsScreen } from "./TwoTruthsScreen";
import { uploadTwoTruthsDeck } from "./api";
vi.mock("./api", () => ({ uploadTwoTruthsDeck: vi.fn() }));
type View = Extract<TypedGameViewerState, { gameId: "two-truths" }>;
function setup(overrides: Partial<View> = {}, disabled = false) {
  const game: View = { gameId: "two-truths", phase: "setup", public: { gameInstanceId: "00000000-0000-4000-8000-000000000000", phaseNonce: 0, loaded: false, participantNames: [], roundNumber: 0, totalRounds: 7, guessCount: 0, eligibleGuessCount: 6, gameScores: {} }, private: { canGuess: false, hasGuessed: false }, ...overrides };
  const sendGame = vi.fn(() => true);
  render(<TwoTruthsScreen game={game} players={[]} selfId="self" isHost roomCode="ABCD" sessionToken="fixture-only" disabled={disabled} sendGame={sendGame} playAgain={() => true} backToArcade={() => true} />);
  return { game, sendGame };
}
describe("Two Truths presentation boundary", () => {
  it("forwards an opaque prepared file and never renders content or raw upload errors", async () => {
    vi.mocked(uploadTwoTruthsDeck).mockRejectedValueOnce(new Error("SPOILER-IN-ERROR"));
    setup();
    const file = new File(['SPOILER-IN-FILE'], "sealed.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText(/Prepared game file/), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded"));
    expect(document.body.textContent).not.toContain("SPOILER");
    expect(uploadTwoTruthsDeck).toHaveBeenCalledWith("ABCD", "fixture-only", expect.objectContaining({ phaseNonce: 0 }), file);
  });
  it("disables importing when disconnected/pending", () => {
    setup({}, true); expect(screen.getByLabelText(/Prepared game file/)).toBeDisabled();
  });
  it("requires selection before lock and sends only selected option plus current identity", () => {
    const publicView = { gameInstanceId: "00000000-0000-4000-8000-000000000000", phaseNonce: 2, loaded: true, participantNames: [], roundNumber: 1, totalRounds: 7, guessCount: 0, eligibleGuessCount: 6, gameScores: {}, subjectPlayerId: "other", statements: ["Fixture A", "Fixture B", "Fixture C"] };
    const { sendGame } = setup({ phase: "guessing", public: publicView, private: { canGuess: true, hasGuessed: false } });
    expect(screen.getByRole("button", { name: "Lock guess" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("radio")[1]!); fireEvent.click(screen.getByRole("button", { name: "Lock guess" }));
    expect(sendGame).toHaveBeenCalledWith({ type: "twoTruths.submitGuess", gameInstanceId: publicView.gameInstanceId, phaseNonce: 2, option: 1 });
    expect(document.body.textContent).not.toContain("✓ Truth");
  });
});
