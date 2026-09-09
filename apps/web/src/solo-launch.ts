import type { ClientMessage, GameId } from "@team-arcade/shared";

export interface SoloLaunchRequestIds {
  select: string;
  start: string;
}

interface SoloLaunchState {
  gameId: GameId;
  room: { roomPhase: "lobby" | "playing" | "results"; selectedGameId: string | null } | null;
  hasGame: boolean;
  commandPending: boolean;
  requestIds: SoloLaunchRequestIds;
}

export function nextSoloLaunchCommand(state: SoloLaunchState): ClientMessage | null {
  if (!state.room || state.hasGame || state.commandPending || state.room.roomPhase !== "lobby") return null;
  if (state.room.selectedGameId !== state.gameId) {
    return {
      type: "host.selectGame",
      requestId: state.requestIds.select,
      payload: { gameId: state.gameId }
    };
  }
  return {
    type: "host.startGame",
    requestId: state.requestIds.start,
    payload: {}
  };
}

export function soloRoomPointerStorageKey(gameId: GameId): string {
  return `team-arcade:solo-room:${gameId}`;
}
