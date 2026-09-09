import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessionStorageKey } from "@team-arcade/shared";
import { App } from "./App";
import { soloRoomPointerStorageKey } from "./solo-launch";

interface MockRoomSocketState {
  room: {
    roomPhase: "lobby" | "playing" | "results";
    selectedGameId: string | null;
    players: Array<{ id: string; isHost: boolean; connected: boolean; displayName: string; score: number }>;
  } | null;
  game: null;
  status: "connecting" | "connected" | "reconnecting" | "offline" | "error";
  message: string | null;
  fatalSession: boolean;
  commandPending: boolean;
  send: ReturnType<typeof vi.fn>;
}

const roomSocket = vi.hoisted<{ current: MockRoomSocketState }>(() => ({
  current: {
    room: null,
    game: null,
    status: "connecting",
    message: null,
    fatalSession: false,
    commandPending: false,
    send: vi.fn(() => true)
  }
}));

vi.mock("./useRoomSocket", () => ({ useRoomSocket: () => roomSocket.current }));

beforeEach(() => {
  roomSocket.current = {
    room: null,
    game: null,
    status: "connecting",
    message: null,
    fatalSession: false,
    commandPending: false,
    send: vi.fn(() => true)
  };
});

afterEach(() => vi.unstubAllGlobals());

describe("App entry screen", () => {
  it("offers accessible create and join flows", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("heading", { name: /team\s*arcade/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Single-player" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play AFTERPRINT solo" })).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Room code")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Join room" }));
    expect(screen.getByLabelText("Room code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join the fun" })).toBeInTheDocument();
  });

  it("prefills a valid room code from the invite URL", () => {
    window.history.replaceState(null, "", "/?room=abcde");
    render(<App />);
    expect(screen.getByLabelText("Room code")).toHaveValue("ABCDE");
  });

  it("launches AFTERPRINT without asking for room details or exposing multiplayer chrome", async () => {
    const user = userEvent.setup();
    const session = { roomCode: "ABCDE", playerId: "solo-player", sessionToken: "solo-token" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(session) });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Play AFTERPRINT solo" }));

    expect(await screen.findByRole("heading", { name: "Opening AFTERPRINT" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ displayName: "Solo Player" })
    }));
    expect(window.location.search).toBe("?play=afterprint");
    expect(localStorage.getItem(soloRoomPointerStorageKey("afterprint"))).toBe("ABCDE");
    expect(localStorage.getItem(sessionStorageKey("ABCDE"))).toContain("solo-token");
    expect(screen.queryByText("Room code")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy invite link" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Choose a game" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Players" })).not.toBeInTheDocument();
  });

  it("keeps reconnecting solo presentation free of room and lobby language", async () => {
    storeSoloSession();
    roomSocket.current = {
      ...roomSocket.current,
      status: "reconnecting",
      message: "Connection interrupted. Restoring your puzzle."
    };

    render(<App />);

    expect(await screen.findByText("Connection interrupted. Restoring your puzzle.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Opening AFTERPRINT" })).toBeInTheDocument();
    expect(screen.queryByText(/room code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/share this link/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Choose a game" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Players" })).not.toBeInTheDocument();
  });

  it("clears an invalid solo session and returns to a recoverable main page", async () => {
    storeSoloSession();
    roomSocket.current = { ...roomSocket.current, status: "error", fatalSession: true };

    render(<App />);

    await waitFor(() => expect(screen.getByRole("heading", { name: /team\s*arcade/i })).toBeInTheDocument());
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
    expect(localStorage.getItem(soloRoomPointerStorageKey("afterprint"))).toBeNull();
    expect(localStorage.getItem(sessionStorageKey("ABCDE"))).toBeNull();
  });

  it("preserves a stored solo session when validation has a recoverable network failure", async () => {
    storeSoloSession();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<App />);

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText(/could not reach the arcade/i)).toBeInTheDocument();
    expect(localStorage.getItem(soloRoomPointerStorageKey("afterprint"))).toBe("ABCDE");
    expect(localStorage.getItem(sessionStorageKey("ABCDE"))).toContain("solo-token");
    expect(screen.queryByText(/room code/i)).not.toBeInTheDocument();
    expect(window.location.search).toBe("?play=afterprint");
  });

  it("owns stable select and start ids across reconnect-style pending resets", async () => {
    storeSoloSession();
    const send = vi.fn((message: unknown) => { void message; return true; });
    const lobbyRoom = {
      roomPhase: "lobby" as const,
      selectedGameId: null,
      players: [{ id: "solo-player", isHost: true, connected: true, displayName: "Solo Player", score: 0 }]
    };
    roomSocket.current = { ...roomSocket.current, room: lobbyRoom, status: "connected", send };
    const view = render(<App />);

    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const selectCommand = send.mock.calls[0]?.[0];
    expect(selectCommand).toMatchObject({ type: "host.selectGame", payload: { gameId: "afterprint" } });

    roomSocket.current = { ...roomSocket.current, commandPending: true };
    view.rerender(<App />);
    roomSocket.current = { ...roomSocket.current, commandPending: false };
    view.rerender(<App />);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[0]).toEqual(selectCommand);

    roomSocket.current = {
      ...roomSocket.current,
      room: { ...lobbyRoom, selectedGameId: "afterprint" }
    };
    view.rerender(<App />);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(3));
    const startCommand = send.mock.calls[2]?.[0];
    expect(startCommand).toMatchObject({ type: "host.startGame", payload: {} });

    roomSocket.current = { ...roomSocket.current, commandPending: true };
    view.rerender(<App />);
    roomSocket.current = { ...roomSocket.current, commandPending: false };
    view.rerender(<App />);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(4));
    expect(send.mock.calls[3]?.[0]).toEqual(startCommand);

    roomSocket.current = {
      ...roomSocket.current,
      room: { ...lobbyRoom, roomPhase: "playing", selectedGameId: "afterprint" }
    };
    view.rerender(<App />);
    expect(send).toHaveBeenCalledTimes(4);
  });
});

function storeSoloSession() {
  const session = { roomCode: "ABCDE", playerId: "solo-player", sessionToken: "solo-token" };
  localStorage.setItem(soloRoomPointerStorageKey("afterprint"), session.roomCode);
  localStorage.setItem(sessionStorageKey(session.roomCode), JSON.stringify(session));
  window.history.replaceState(null, "", "/?play=afterprint");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
}
