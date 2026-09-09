import { describe, expect, it } from "vitest";
import { nextSoloLaunchCommand, soloRoomPointerStorageKey } from "./solo-launch";

const requestIds = { select: "select-fixed", start: "start-fixed" };

describe("solo launch state", () => {
  it("selects the game with the same request id after an acknowledgement loss or reconnect", () => {
    const state = {
      gameId: "afterprint" as const,
      room: { roomPhase: "lobby" as const, selectedGameId: null },
      hasGame: false,
      commandPending: false,
      requestIds
    };

    expect(nextSoloLaunchCommand(state)).toEqual({
      type: "host.selectGame",
      requestId: "select-fixed",
      payload: { gameId: "afterprint" }
    });
    expect(nextSoloLaunchCommand(state)).toEqual(nextSoloLaunchCommand(state));
    expect(nextSoloLaunchCommand({ ...state, commandPending: true })).toBeNull();
  });

  it("advances from the authoritative selection snapshot with a stable start id", () => {
    const state = {
      gameId: "afterprint" as const,
      room: { roomPhase: "lobby" as const, selectedGameId: "afterprint" as const },
      hasGame: false,
      commandPending: false,
      requestIds
    };

    expect(nextSoloLaunchCommand(state)).toEqual({
      type: "host.startGame",
      requestId: "start-fixed",
      payload: {}
    });
    expect(nextSoloLaunchCommand(state)).toEqual(nextSoloLaunchCommand(state));
  });

  it("stops for game-state-first, playing, and results snapshots", () => {
    const base = {
      gameId: "afterprint" as const,
      room: { roomPhase: "lobby" as const, selectedGameId: "afterprint" as const },
      hasGame: false,
      commandPending: false,
      requestIds
    };

    expect(nextSoloLaunchCommand({ ...base, hasGame: true })).toBeNull();
    expect(nextSoloLaunchCommand({ ...base, room: { ...base.room, roomPhase: "playing" } })).toBeNull();
    expect(nextSoloLaunchCommand({ ...base, room: { ...base.room, roomPhase: "results" } })).toBeNull();
    expect(nextSoloLaunchCommand({ ...base, room: null })).toBeNull();
  });

  it("names the pointer without containing a session token", () => {
    expect(soloRoomPointerStorageKey("afterprint")).toBe("team-arcade:solo-room:afterprint");
  });
});
