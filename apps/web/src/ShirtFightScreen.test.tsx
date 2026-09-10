import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayerView, TypedGameViewerState } from "@team-arcade/shared";
import { ShirtFightScreen } from "./ShirtFightScreen";
import { drawingDraftStorageKey, writeDrawingDraft } from "./shirt-fight-draft";

const players: PlayerView[] = [
  { id: "p1", displayName: "Ada", connected: true, isHost: true, score: 0 },
  { id: "p2", displayName: "Grace", connected: true, isHost: false, score: 0 },
  { id: "p3", displayName: "Linus", connected: true, isHost: false, score: 0 }
];
const drawing = { id: "00000000-0000-4000-8000-000000000101", width: 600, height: 800 };

function game(overrides: Partial<Extract<TypedGameViewerState, { gameId: "shirt-fight" }>> = {}): Extract<TypedGameViewerState, { gameId: "shirt-fight" }> {
  return {
    gameId: "shirt-fight",
    phase: "drawing",
    public: { gameInstanceId: "00000000-0000-4000-8000-000000000022", phaseNonce: 0, phase: "drawing", generationRound: 1, drawingNumber: 1, deadlineAt: Date.now() + 60_000, completedCount: 0, totalPlayers: 3 },
    private: { drawingSubmitted: false },
    ...overrides
  };
}

function renderGame(value: ReturnType<typeof game>, sendGame = vi.fn(() => true)) {
  render(shirtFightElement(value, sendGame));
  return sendGame;
}

function shirtFightElement(value: ReturnType<typeof game>, sendGame = vi.fn(() => true)) {
  return <ShirtFightScreen game={value} players={players} playerId="p1" isHost roomCode="ABCDE" sessionToken={"s".repeat(43)} sendGame={sendGame} hostAdvance={() => true} playAgain={() => true} backToArcade={() => true} />;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(["image"], { type: "image/webp" })) }));
  vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:drawing"), revokeObjectURL: vi.fn() });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillStyle: "", strokeStyle: "", lineWidth: 0, lineCap: "round", lineJoin: "round",
    fillRect: vi.fn(), fill: vi.fn(), arc: vi.fn(), getImageData: vi.fn(() => ({}) as ImageData), putImageData: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn()
  } as unknown as CanvasRenderingContext2D);
});

describe("Shirt Fight mobile presentation", () => {
  it("offers only nine labelled colors, exactly three non-color brush sizes, Undo, Clear, and a touch-safe portrait canvas", () => {
    renderGame(game());
    expect(screen.getByRole("timer")).toHaveAccessibleName(/seconds remaining/);
    expect(screen.getByRole("group", { name: "Brush color" }).querySelectorAll("button")).toHaveLength(9);
    expect(screen.getByRole("group", { name: "Brush size" }).querySelectorAll("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "White eraser" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.getByLabelText("Shirt drawing canvas")).toHaveAttribute("width", "600");
    expect(screen.getByLabelText("Shirt drawing canvas")).toHaveAttribute("height", "800");
  });

  it("retires a private draft when server authority says its slot finalized despite a lost upload response", () => {
    const drawingGame = game();
    const identity = { roomCode: "ABCDE", playerId: "p1", gameInstanceId: drawingGame.public.gameInstanceId, generationRound: 1, drawingNumber: 1 };
    writeDrawingDraft(identity, [{ color: "blue", size: "medium", points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }]);
    const view = render(shirtFightElement(drawingGame));
    expect(sessionStorage.getItem(drawingDraftStorageKey(identity))).not.toBeNull();

    view.rerender(shirtFightElement(game({ private: { drawingSubmitted: true } })));

    expect(sessionStorage.getItem(drawingDraftStorageKey(identity))).toBeNull();
    expect(screen.getByRole("heading", { name: "Drawing locked" })).toBeInTheDocument();
  });

  it("retires an offline private draft after the authoritative phase advances", () => {
    const drawingGame = game();
    const advancedPublic = { ...drawingGame.public };
    delete advancedPublic.drawingNumber;
    const identity = { roomCode: "ABCDE", playerId: "p1", gameInstanceId: drawingGame.public.gameInstanceId, generationRound: 1, drawingNumber: 1 };
    writeDrawingDraft(identity, [{ color: "red", size: "small", points: [{ x: 12, y: 24 }] }]);
    const view = render(shirtFightElement(drawingGame));

    view.rerender(shirtFightElement(game({
      phase: "slogans",
      public: { ...advancedPublic, phase: "slogans", phaseNonce: 2 },
      private: { slogans: [] }
    })));

    expect(sessionStorage.getItem(drawingDraftStorageKey(identity))).toBeNull();
  });

  it("submits multiple slogans quickly, clears the input, and retains accepted entries", async () => {
    const send = renderGame(game({
      phase: "slogans",
      public: { gameInstanceId: "00000000-0000-4000-8000-000000000022", phaseNonce: 3, phase: "slogans", generationRound: 1, deadlineAt: Date.now() + 60_000, completedCount: 1, totalPlayers: 3 },
      private: { slogans: [{ id: "one", text: "Already accepted" }] }
    }));
    const user = userEvent.setup();
    const input = screen.getByLabelText("Your next slogan");
    await user.type(input, "Ship happens{enter}");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "shirtFight.submitSlogan", text: "Ship happens", phaseNonce: 3 }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(screen.getByText("Already accepted")).toBeInTheDocument();
  });

  it("cycles artwork and slogans independently and locks only assigned identifiers", async () => {
    const send = renderGame(game({
      phase: "assembly",
      public: { gameInstanceId: "00000000-0000-4000-8000-000000000022", phaseNonce: 4, phase: "assembly", generationRound: 1, deadlineAt: Date.now() + 60_000, completedCount: 0, totalPlayers: 3 },
      private: { assignment: { drawings: [drawing, { ...drawing, id: "00000000-0000-4000-8000-000000000102" }], slogans: [{ id: "00000000-0000-4000-8000-000000000201", text: "First words" }, { id: "00000000-0000-4000-8000-000000000202", text: "Second words" }] }, draft: { drawingId: drawing.id, sloganId: "00000000-0000-4000-8000-000000000201" }, shirtSubmitted: false }
    }));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Next slogan" }));
    expect(screen.getByText("Second words")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next drawing" }));
    await user.click(screen.getByRole("button", { name: "Lock this shirt" }));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "shirtFight.submitShirt", drawingId: "00000000-0000-4000-8000-000000000102", sloganId: "00000000-0000-4000-8000-000000000202" }));
  });

  it("keeps voting keyboard-operable and removes private controls in shared-display mode", async () => {
    const voting = game({
      phase: "voting",
      public: { gameInstanceId: "00000000-0000-4000-8000-000000000022", phaseNonce: 5, phase: "voting", generationRound: 1, deadlineAt: Date.now() + 15_000, completedCount: 0, totalPlayers: 3, matchup: { id: "match", shirts: [{ id: "shirt-a", drawing, slogan: "A" }, { id: "shirt-b", drawing: { ...drawing, id: "00000000-0000-4000-8000-000000000102" }, slogan: "B" }], voteCount: 0, suddenDeath: false } },
      private: { hasVoted: false }
    });
    const send = renderGame(voting);
    const user = userEvent.setup();
    const vote = screen.getAllByRole("button", { name: /Vote for this shirt/ })[0] as HTMLButtonElement;
    vote.focus();
    await user.keyboard("{Enter}");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ type: "shirtFight.submitVote", shirtId: "shirt-a" }));
    await user.click(screen.getByRole("button", { name: "Use shared display" }));
    expect(screen.queryByRole("button", { name: /Vote for this shirt/ })).not.toBeInTheDocument();
    expect(screen.getByText("Players vote on their own devices.")).toBeInTheDocument();
  });
});
