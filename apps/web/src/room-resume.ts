export const multiplayerRoomPointerStorageKey = "team-arcade:multiplayer-room";

export function storeMultiplayerRoomPointer(roomCode: string): void {
  localStorage.setItem(multiplayerRoomPointerStorageKey, roomCode);
}

export function clearMultiplayerRoomPointer(roomCode?: string): void {
  if (roomCode && localStorage.getItem(multiplayerRoomPointerStorageKey) !== roomCode) return;
  localStorage.removeItem(multiplayerRoomPointerStorageKey);
}
