import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  createSystemCrawlState,
  projectSystemCrawlState,
  reduceSystemCrawl,
  type SystemCrawlState,
  type SystemCrawlViewerState
} from "@team-arcade/games";
import type { PlayerView, SystemCrawlCommand } from "@team-arcade/shared";
import { SystemCrawlScreen } from "./SystemCrawlScreen";

const hostPlayer = player("host", "Host", true);
const guestPlayer = player("guest", "Guest", false);

describe("System Crawl screen", () => {
  it("supports solo two-class selection and host adventure start", async () => {
    const user = userEvent.setup();
    const sendGame = vi.fn((command: SystemCrawlCommand) => command.type.length > 0);
    const state = createSystemCrawlState([{ id: "host", displayName: "Host" }], "host");
    const { rerender } = renderScreen(projectSystemCrawlState(state, "host"), [hostPlayer], sendGame);

    expect(screen.getByRole("heading", { name: "Choose your support classes" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Infrastructure Architect/ }));
    await user.click(screen.getByRole("button", { name: /Application Developer/ }));
    await user.click(screen.getByRole("button", { name: "Save two classes" }));
    expect(sendGame).toHaveBeenLastCalledWith({
      type: "select_class",
      classIds: ["infrastructure-architect", "application-developer"]
    });

    const ready = reduceSystemCrawl(state, {
      type: "select_class",
      classIds: ["infrastructure-architect", "application-developer"]
    }, "host").state;
    rerender(screenElement(projectSystemCrawlState(ready, "host"), [hostPlayer], sendGame));
    await user.click(screen.getByRole("button", { name: "Start adventure" }));
    expect(sendGame).toHaveBeenLastCalledWith({ type: "start_adventure" });
  });

  it("renders the authoritative map, owned turn controls, valid moves, and pending lock", async () => {
    const user = userEvent.setup();
    const sendGame = vi.fn((command: SystemCrawlCommand) => command.type.length > 0);
    const gameplay = soloGameplay();
    const view = projectSystemCrawlState(gameplay, "host");
    const { rerender } = renderScreen(view, [hostPlayer], sendGame);

    expect(screen.getByRole("heading", { name: "Round 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "System map" })).toBeInTheDocument();
    expect(screen.getByText("Abilities")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reboot / End turn" })).toBeEnabled();
    const destination = screen.getAllByRole("gridcell", { name: /valid move/ })[0];
    if (!destination) throw new Error("Expected a valid movement tile");
    await user.click(destination);
    expect(sendGame.mock.calls.at(-1)?.[0]).toMatchObject({ type: "move_to", characterId: view.activeCharacterId });

    rerender(screenElement(view, [hostPlayer], sendGame, { commandPending: true }));
    expect(screen.getByText("Applying your command on the server…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reboot / End turn" })).toBeDisabled();
  });

  it("shows Google It candidates only to the choosing player", () => {
    const state = twoPlayerGameplay();
    const generalist = Object.values(state.characters).find((character) => character.classId === "it-generalist");
    if (!generalist) throw new Error("Expected generalist");
    state.phase = "resolving_choice";
    state.pendingChoice = {
      kind: "google_it",
      id: "choice:test",
      ownerPlayerId: "host",
      characterId: generalist.id,
      candidateItemIds: ["coffee", "admin-credentials"]
    };

    const { unmount } = renderScreen(projectSystemCrawlState(state, "host"), [hostPlayer, guestPlayer]);
    expect(screen.getByRole("button", { name: /Coffee/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Admin Credentials/ })).toBeInTheDocument();
    unmount();

    renderScreen(projectSystemCrawlState(state, "guest"), [hostPlayer, guestPlayer], undefined, { selfId: "guest", isHost: false });
    expect(screen.queryByText("Admin Credentials")).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for Host to resolve a private item choice.")).toBeInTheDocument();
  });

  it.each(["victory", "defeat"] as const)("renders %s through the shared result lifecycle", (phase) => {
    const state = soloGameplay();
    state.phase = phase;
    state.activeCharacterId = null;
    state.turn = null;
    renderScreen(projectSystemCrawlState(state, "host"), [hostPlayer]);
    expect(screen.getByRole("heading", { name: phase === "victory" ? "Production stabilized" : "Incident unresolved" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back to arcade" })).toBeInTheDocument();
  });
});

function soloGameplay(): SystemCrawlState {
  let state = createSystemCrawlState([{ id: "host", displayName: "Host" }], "host");
  state = reduceSystemCrawl(state, {
    type: "select_class",
    classIds: ["infrastructure-architect", "application-developer"]
  }, "host").state;
  return reduceSystemCrawl(state, { type: "start_adventure", seed: "ui-test" }, "host").state;
}

function twoPlayerGameplay(): SystemCrawlState {
  let state = createSystemCrawlState([
    { id: "host", displayName: "Host" },
    { id: "guest", displayName: "Guest" }
  ], "host");
  state = reduceSystemCrawl(state, { type: "select_class", classIds: ["it-generalist"] }, "host").state;
  state = reduceSystemCrawl(state, { type: "select_class", classIds: ["infrastructure-architect"] }, "guest").state;
  return reduceSystemCrawl(state, { type: "start_adventure", seed: "privacy-test" }, "host").state;
}

function renderScreen(
  view: SystemCrawlViewerState,
  players: PlayerView[],
  sendGame = vi.fn((command: SystemCrawlCommand) => command.type.length > 0),
  overrides: Partial<ScreenOptions> = {}
) {
  return render(screenElement(view, players, sendGame, overrides));
}

interface ScreenOptions {
  selfId: string;
  isHost: boolean;
  commandPending: boolean;
}

function screenElement(
  view: SystemCrawlViewerState,
  players: PlayerView[],
  sendGame: (command: SystemCrawlCommand) => boolean,
  overrides: Partial<ScreenOptions> = {}
) {
  return <SystemCrawlScreen
    view={view}
    players={players}
    selfId={overrides.selfId ?? "host"}
    isHost={overrides.isHost ?? true}
    status="connected"
    commandPending={overrides.commandPending ?? false}
    sendGame={sendGame}
    playAgain={() => true}
    backToArcade={() => true}
  />;
}

function player(id: string, displayName: string, isHost: boolean): PlayerView {
  return { id, displayName, isHost, connected: true, score: 0 };
}
