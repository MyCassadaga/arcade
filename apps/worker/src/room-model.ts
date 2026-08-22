import type { PlayerView, RoomPhase, RoomView } from "@team-arcade/shared";

export interface StoredPlayer extends PlayerView {
  joinedAt: number;
  lastSeenAt: number;
  disconnectedAt: number | null;
  sessionTokenHash: string;
}

export interface RoomMetadata {
  roomCode: string;
  selectedGameId: string | null;
  roomPhase: RoomPhase;
  createdAt: number;
  lastActivityAt: number;
}

export function normalizeDisplayName(displayName: string): string {
  return displayName.trim().toLocaleLowerCase("en-US");
}

export function hasDuplicateName(players: readonly StoredPlayer[], displayName: string): boolean {
  const normalized = normalizeDisplayName(displayName);
  return players.some((player) => normalizeDisplayName(player.displayName) === normalized);
}

export function chooseHostSuccessor(players: readonly StoredPlayer[]): StoredPlayer | undefined {
  return players
    .filter((player) => player.connected && !player.isHost)
    .sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id))[0];
}

export function projectRoom(metadata: RoomMetadata, players: readonly StoredPlayer[]): RoomView {
  return {
    roomCode: metadata.roomCode,
    selectedGameId: metadata.selectedGameId,
    roomPhase: metadata.roomPhase,
    players: [...players]
      .sort((left, right) => left.joinedAt - right.joinedAt || left.id.localeCompare(right.id))
      .map(({ id, displayName, connected, isHost, score }) => ({
        id,
        displayName,
        connected,
        isHost,
        score
      }))
  };
}

export function canIssueHostCommand(player: StoredPlayer | undefined): boolean {
  return player?.connected === true && player.isHost;
}
