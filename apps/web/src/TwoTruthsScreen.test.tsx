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
  const props = { game, players: [], selfId: "self", isHost: true, roomCode: "ABCD", sessionToken: "fixture-only", disabled, sendGame, playAgain: () => true, backToArcade: () => true };
  const rendered = render(<TwoTruthsScreen game={game} players={[]} selfId="self" isHost roomCode="ABCD" sessionToken="fixture-only" disabled={disabled} sendGame={sendGame} playAgain={() => true} backToArcade={() => true} />);
  return { game, sendGame, props, ...rendered };
}
describe("Two Truths presentation boundary", () => {
  it("separates five respondent matches from seven-player readiness and uses dynamic round labels", () => {
    const names = Array.from({ length: 7 }, (_, i) => `Player ${i}`);
    const { props, rerender } = setup();
    const players = names.map((displayName, i) => ({ id: String(i), displayName, connected: true, isHost: i === 0, score: 0 }));
    const game: View = { ...props.game, public: { ...props.game.public, loaded: true, totalRounds: 5, participantNames: names.slice(0, 5) } };
    rerender(<TwoTruthsScreen {...props} game={game} players={players} />);
    expect(screen.getByText(/5 responses loaded/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Begin blind game" })).toBeEnabled();
    expect(screen.getByText(/Players without a survey response can guess every round/)).toBeVisible();
    rerender(<TwoTruthsScreen {...props} game={game} players={players.slice(0, 6)} />);
    expect(screen.getByRole("button", { name: "Begin blind game" })).toBeDisabled();
    rerender(<TwoTruthsScreen {...props} game={{ ...game, phase: "reveal", public: { ...game.public, roundNumber: 5, statements: ["Fixture A", "Fixture B", "Fixture C"], lieOption: 1 } }} players={players} />);
    expect(screen.getByText("Round 5 of 5 · Two Truths and a Lie")).toBeVisible();
    expect(screen.getByRole("button", { name: "See final standings" })).toBeVisible();
  });

  it.each([undefined, 1])("uses the authoritative locked selection after same-phase rerender (draft %s)", (draft) => {
    const publicView = { gameInstanceId: "00000000-0000-4000-8000-000000000000", phaseNonce: 2, loaded: true, participantNames: [], roundNumber: 1, totalRounds: 7, guessCount: 0, eligibleGuessCount: 6, gameScores: {}, subjectPlayerId: "other", statements: ["Fixture A", "Fixture B", "Fixture C"] };
    const { props, rerender } = setup({ phase: "guessing", public: publicView, private: { canGuess: true, hasGuessed: false } });
    if (draft !== undefined) fireEvent.click(screen.getAllByRole("radio")[draft]!);
    rerender(<TwoTruthsScreen {...props} game={{ ...props.game, private: { canGuess: true, hasGuessed: true, selection: 0 } }} />);
    expect(screen.getAllByRole("radio")[0]).toBeChecked();
    expect(screen.getAllByRole("radio")[1]).not.toBeChecked();
    expect(screen.getByText("Guess locked. Waiting for the reveal.")).toBeVisible();
    expect(screen.getAllByRole("radio")[0]).toBeDisabled();
  });

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
