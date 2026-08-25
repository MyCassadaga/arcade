import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSystemCrawlState,
  getViewerReachableMovementTiles,
  positionKey,
  projectSystemCrawlState,
  reduceSystemCrawl,
  type SystemCrawlEvent,
  type SystemCrawlState,
  type SystemCrawlViewerState
} from "@team-arcade/games";
import type { PlayerView, SystemCrawlCommand } from "@team-arcade/shared";
import { SystemCrawlScreen } from "./SystemCrawlScreen";

const hostPlayer = player("host", "Host", true);
const guestPlayer = player("guest", "Guest", false);

afterEach(() => vi.unstubAllGlobals());

describe("final System Crawl interface", () => {
  it("renders setup, four distinct class sprites, solo selection, and ready start", async () => {
    const user = userEvent.setup();
    const sendGame = vi.fn((command: SystemCrawlCommand) => { void command; return true; });
    const state = createSystemCrawlState([{ id: "host", displayName: "Host" }], "host");
    const { rerender } = renderScreen(projectSystemCrawlState(state, "host"), [hostPlayer], sendGame);
    expect(screen.getByRole("heading", { name: "Assemble the response team" })).toBeInTheDocument();
    for (const className of ["Infrastructure Architect", "Senior Systems Analyst", "Application Developer", "IT Generalist"]) {
      expect(screen.getByRole("img", { name: new RegExp(`${className}.*character sprite`, "i") })).toBeInTheDocument();
    }
    for (const abilityName of ["Packet Drop", "Firewall", "Hotfix", "Deploy to Production", "Google It"]) {
      expect(screen.getAllByText(abilityName).length).toBeGreaterThan(0);
    }
    await user.click(screen.getByRole("button", { name: /Infrastructure Architect/ }));
    await user.click(screen.getByRole("button", { name: /Application Developer/ }));
    await user.click(screen.getByRole("button", { name: "Save two operators" }));
    expect(sendGame).toHaveBeenLastCalledWith({ type: "select_class", classIds: ["infrastructure-architect", "application-developer"] });
    const ready = reduceSystemCrawl(state, { type: "select_class", classIds: ["infrastructure-architect", "application-developer"] }, "host").state;
    rerender(screenElement(projectSystemCrawlState(ready, "host"), [hostPlayer], sendGame));
    await user.click(screen.getByRole("button", { name: "Initialize adventure" }));
    expect(sendGame).toHaveBeenLastCalledWith({ type: "start_adventure" });
  });

  it("uses public selectors for movement and supports keyboard movement", () => {
    const sendGame = vi.fn((command: SystemCrawlCommand) => { void command; return true; });
    const view = projectSystemCrawlState(soloGameplay(), "host");
    renderScreen(view, [hostPlayer], sendGame);
    const activeId = view.activeCharacterId;
    if (!activeId) throw new Error("Expected active character");
    const expected = new Set(getViewerReachableMovementTiles(view, activeId).map(positionKey));
    const destinations = screen.getAllByRole("gridcell", { name: /valid movement destination/i });
    expect(destinations).toHaveLength(expected.size);
    expect(screen.getByRole("img", { name: "Unknown node 2" })).toBeInTheDocument();
    expect(document.querySelector('[data-card-index="0"]')).toBeInTheDocument();
    fireEvent.keyDown(destinations[0] as Element, { key: "Enter" });
    expect(sendGame).toHaveBeenLastCalledWith(expect.objectContaining({ type: "move_to", characterId: activeId }));
    const destination = sendGame.mock.calls.at(-1)?.[0];
    expect(destination?.type === "move_to" && expected.has(positionKey(destination.destination))).toBe(true);
  });

  it("enters ability target mode, supports keyboard activation, and cancels with Escape", async () => {
    const user = userEvent.setup();
    const sendGame = vi.fn((command: SystemCrawlCommand) => { void command; return true; });
    const view = projectSystemCrawlState(soloGameplay(["application-developer", "infrastructure-architect"]), "host");
    renderScreen(view, [hostPlayer], sendGame);
    const ability = screen.getByRole("button", { name: /Works on My Machine/ });
    ability.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: /Cancel targeting/ })).toBeInTheDocument();
    const target = screen.getByRole("gridcell", { name: /valid works on my machine target/i });
    fireEvent.keyDown(target, { key: " " });
    expect(sendGame).toHaveBeenLastCalledWith({ type: "use_ability", characterId: view.activeCharacterId, abilityId: "works-on-my-machine", target: { type: "character", characterId: view.activeCharacterId } });
    await user.click(screen.getByRole("button", { name: /Works on My Machine/ }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /Cancel targeting/ })).not.toBeInTheDocument();
  });

  it("offers a universal adjacent Attack and sends its authoritative target", async () => {
    const user = userEvent.setup();
    const sendGame = vi.fn((command: SystemCrawlCommand) => { void command; return true; });
    const state = soloGameplay();
    const active = state.characters[state.activeCharacterId ?? ""];
    const enemy = Object.values(state.enemies)[0];
    if (!active || !enemy) throw new Error("Expected an active character and enemy");
    active.position = { cardIndex: 0, x: 2, y: 3 };
    enemy.position = { cardIndex: 0, x: 3, y: 3 };
    const view = projectSystemCrawlState(state, "host");
    renderScreen(view, [hostPlayer], sendGame);

    await user.click(screen.getByRole("button", { name: /^Attack/ }));
    fireEvent.keyDown(screen.getByRole("gridcell", { name: /valid attack target/i }), { key: "Enter" });
    expect(sendGame).toHaveBeenLastCalledWith({
      type: "attack",
      characterId: active.id,
      target: { type: "enemy", enemyId: enemy.id }
    });
  });

  it("labels item caches and names every visible threat on both the board and HUD", () => {
    const state = soloGameplay();
    const enemy = Object.values(state.enemies)[0];
    if (!enemy) throw new Error("Expected a visible enemy");
    renderScreen(projectSystemCrawlState(state, "host"), [hostPlayer]);
    expect(screen.getByRole("heading", { name: "Visible threats" })).toBeInTheDocument();
    expect(screen.getAllByText(enemy.displayName).length).toBeGreaterThan(0);
    expect(screen.getByText("ITEM CACHE", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(/ITEM CACHE — step onto it/)).toBeInTheDocument();
  });

  it("explains locked actions and shows both solo-owned character cards", () => {
    const state = soloGameplay();
    const active = state.characters[state.activeCharacterId ?? ""];
    if (!active) throw new Error("Expected active character");
    active.lastActionKey = "ability:packet-drop";
    const { container } = renderScreen(projectSystemCrawlState(state, "host"), [hostPlayer]);
    expect(screen.getAllByText(/Used last turn — choose another action or end the turn without acting to Reboot/).length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".sc-owned-characters .sc-character-card")).toHaveLength(2);
  });

  it("keeps non-owner, pending, and rejected-action controls safe", () => {
    const view = projectSystemCrawlState(twoPlayerGameplay(), "guest");
    const sendGame = vi.fn((command: SystemCrawlCommand) => { void command; return true; });
    const { rerender } = renderScreen(view, [hostPlayer, guestPlayer], sendGame, { selfId: "guest", isHost: false });
    expect(screen.getByRole("button", { name: /Packet Drop/ })).toBeDisabled();
    expect(screen.getByText(/Waiting for Host to control/)).toBeInTheDocument();
    const hostView = projectSystemCrawlState(soloGameplay(), "host");
    rerender(screenElement(hostView, [hostPlayer], sendGame, { commandPending: true }));
    expect(screen.getByText(/Command pending — controls are locked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /End Turn/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /End Turn/ }));
    expect(sendGame).not.toHaveBeenCalled();
    rerender(screenElement(hostView, [hostPlayer], sendGame, { status: "reconnecting" }));
    expect(screen.getByText(/Reconnecting — the latest board remains available/)).toBeInTheDocument();
    rerender(screenElement(hostView, [hostPlayer], sendGame));
    expect(screen.getByRole("button", { name: "End Turn and Reboot" })).toBeEnabled();
    expect(screen.getAllByRole("gridcell", { name: /valid movement destination/i }).length).toBeGreaterThan(0);
  });

  it("shows Google It candidate details only in the owning projection", () => {
    const state = twoPlayerGameplay();
    const generalist = Object.values(state.characters).find((character) => character.classId === "it-generalist");
    if (!generalist) throw new Error("Expected generalist");
    state.phase = "resolving_choice";
    state.pendingChoice = { kind: "google_it", id: "choice:test", ownerPlayerId: "host", characterId: generalist.id, candidateItemIds: ["coffee", "admin-credentials"] };
    const { unmount } = renderScreen(projectSystemCrawlState(state, "host"), [hostPlayer, guestPlayer]);
    expect(screen.getByRole("button", { name: /Coffee/ })).toHaveTextContent("Restore 3 HP");
    expect(screen.getByRole("button", { name: /Admin Credentials/ })).toHaveTextContent("Uncommon");
    unmount();
    renderScreen(projectSystemCrawlState(state, "guest"), [hostPlayer, guestPlayer], undefined, { selfId: "guest", isHost: false });
    expect(screen.queryByText("Admin Credentials")).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for Host to select a private result/)).toBeInTheDocument();
  });

  it("renders every lifecycle phase and final result controls", () => {
    const setup = createSystemCrawlState([{ id: "host", displayName: "Host" }], "host");
    const { rerender } = renderScreen(projectSystemCrawlState(setup, "host"), [hostPlayer]);
    expect(screen.getByText(/Waiting for every operator/)).toBeInTheDocument();
    const ready = reduceSystemCrawl(setup, { type: "select_class", classIds: ["infrastructure-architect", "application-developer"] }, "host").state;
    rerender(screenElement(projectSystemCrawlState(ready, "host"), [hostPlayer]));
    expect(screen.getByRole("button", { name: "Initialize adventure" })).toBeInTheDocument();
    const gameplay = soloGameplay();
    rerender(screenElement(projectSystemCrawlState(gameplay, "host"), [hostPlayer]));
    expect(screen.getByRole("heading", { name: "System topology" })).toBeInTheDocument();
    const enemyPhase = structuredClone(gameplay); enemyPhase.phase = "enemy_phase"; enemyPhase.turn = null;
    rerender(screenElement(projectSystemCrawlState(enemyPhase, "host"), [hostPlayer]));
    expect(screen.getByText("SYSTEM PHASE")).toBeInTheDocument();
    for (const phase of ["victory", "defeat"] as const) {
      const result = structuredClone(gameplay); result.phase = phase; result.activeCharacterId = null; result.turn = null;
      rerender(screenElement(projectSystemCrawlState(result, "host"), [hostPlayer]));
      expect(screen.getByRole("heading", { name: phase === "victory" ? "Production stabilized" : "Incident unresolved" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Play Again With New Seed" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Replay Same Seed" })).toBeInTheDocument();
    }
  });

  it("does not replay old effects after reconnect but sequences a new reveal event", async () => {
    const state = soloGameplay();
    const initial = projectSystemCrawlState(state, "host");
    const { container, rerender, unmount } = renderScreen(initial, [hostPlayer]);
    expect(container.querySelector(".sc-event-effects > *")).toBeNull();
    state.maps[1]!.revealed = true;
    state.revealedCardCount = 2;
    pushEvent(state, "map_card_revealed", { cardIndex: 1, displayName: "Data Center", templateId: state.maps[1]!.templateId });
    pushEvent(state, "healing", { characterId: state.activeCharacterId, amount: 2 });
    const revealed = projectSystemCrawlState(state, "host");
    rerender(screenElement(revealed, [hostPlayer]));
    await waitFor(() => expect(container.querySelector('[data-card-index="1"]')).toHaveClass("is-revealing"));
    await waitFor(() => expect(container.querySelector(".sc-fx-number.healing")).toHaveTextContent("+2"), { timeout: 1_500 });
    unmount();
    const remounted = renderScreen(revealed, [hostPlayer]);
    expect(remounted.container.querySelector(".is-revealing")).toBeNull();
  });

  it("summarizes new authoritative events immediately under reduced motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    const state = soloGameplay();
    const { container, rerender } = renderScreen(projectSystemCrawlState(state, "host"), [hostPlayer]);
    pushEvent(state, "healing", { characterId: state.activeCharacterId, amount: 3 });
    rerender(screenElement(projectSystemCrawlState(state, "host"), [hostPlayer]));
    await waitFor(() => expect(screen.getAllByText("3 health restored.").length).toBeGreaterThan(0));
    expect(container.querySelector(".sc-event-effects > *")).toBeNull();
  });

  it("shows an accessible first-time tutorial and keeps Rules permanently available", async () => {
    window.localStorage.removeItem("team-arcade:system-crawl:tutorial-dismissed");
    const user = userEvent.setup();
    const setup = createSystemCrawlState([{ id: "host", displayName: "Host" }], "host");
    const first = renderScreen(projectSystemCrawlState(setup, "host"), [hostPlayer]);
    expect(screen.getByRole("dialog", { name: "System Crawl rules" })).toBeInTheDocument();
    expect(first.container.querySelectorAll("#sc-tutorial-title + ol > li")).toHaveLength(8);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(window.localStorage.getItem("team-arcade:system-crawl:tutorial-dismissed")).toBe("1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rules & tutorial" }));
    expect(screen.getByRole("dialog", { name: "System Crawl rules" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps sound muted by default and only creates audio after a user gesture", async () => {
    window.localStorage.removeItem("team-arcade:system-crawl:sound-enabled");
    const resume = vi.fn(() => Promise.resolve());
    const AudioContextStub = vi.fn(function AudioContextStub(this: { resume: typeof resume }) { this.resume = resume; });
    vi.stubGlobal("AudioContext", AudioContextStub);
    const user = userEvent.setup();
    renderScreen(projectSystemCrawlState(soloGameplay(), "host"), [hostPlayer]);
    const toggle = screen.getByRole("button", { name: "Sound muted" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(AudioContextStub).not.toHaveBeenCalled();
    await user.click(toggle);
    expect(AudioContextStub).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("team-arcade:system-crawl:sound-enabled")).toBe("1");
  });
});

function soloGameplay(classes: ["application-developer", "infrastructure-architect"] | ["infrastructure-architect", "application-developer"] = ["infrastructure-architect", "application-developer"]): SystemCrawlState {
  let state = createSystemCrawlState([{ id: "host", displayName: "Host" }], "host");
  state = reduceSystemCrawl(state, { type: "select_class", classIds: classes }, "host").state;
  state = reduceSystemCrawl(state, { type: "start_adventure", seed: "ui-test" }, "host").state;
  return reduceSystemCrawl(state, { type: "continue_briefing" }, "host").state;
}

function twoPlayerGameplay(): SystemCrawlState {
  let state = createSystemCrawlState([{ id: "host", displayName: "Host" }, { id: "guest", displayName: "Guest" }], "host");
  state = reduceSystemCrawl(state, { type: "select_class", classIds: ["it-generalist"] }, "host").state;
  state = reduceSystemCrawl(state, { type: "select_class", classIds: ["infrastructure-architect"] }, "guest").state;
  state = reduceSystemCrawl(state, { type: "start_adventure", seed: "privacy-test" }, "host").state;
  return reduceSystemCrawl(state, { type: "continue_briefing" }, "host").state;
}

function pushEvent(state: SystemCrawlState, type: SystemCrawlEvent["type"], data: SystemCrawlEvent["data"]) { state.events.push({ id: state.nextEventId++, round: state.round, type, data }); }
function renderScreen(view: SystemCrawlViewerState, players: PlayerView[], sendGame = vi.fn((command: SystemCrawlCommand) => { void command; return true; }), overrides: Partial<ScreenOptions> = {}) { return render(screenElement(view, players, sendGame, overrides)); }
interface ScreenOptions { selfId: string; isHost: boolean; commandPending: boolean; status: "connecting" | "connected" | "reconnecting" | "offline" | "error"; }
function screenElement(view: SystemCrawlViewerState, players: PlayerView[], sendGame = vi.fn((command: SystemCrawlCommand) => { void command; return true; }), overrides: Partial<ScreenOptions> = {}) { return <SystemCrawlScreen view={view} players={players} selfId={overrides.selfId ?? "host"} isHost={overrides.isHost ?? true} status={overrides.status ?? "connected"} commandPending={overrides.commandPending ?? false} sendGame={sendGame} playAgainNewSeed={() => true} replaySameSeed={() => true} backToArcade={() => true} />; }
function player(id: string, displayName: string, isHost: boolean): PlayerView { return { id, displayName, isHost, connected: true, score: 0 }; }
