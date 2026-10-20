export const multiplayerRoomPointerStorageKey = "team-arcade:multiplayer-room";

export function storeMultiplayerRoomPointer(roomCode: string): void {
  try { localStorage.setItem(multiplayerRoomPointerStorageKey, roomCode); } catch { /* In-memory navigation remains usable. */ }
}

export function clearMultiplayerRoomPointer(roomCode?: string): void {
  try {
    if (roomCode && localStorage.getItem(multiplayerRoomPointerStorageKey) !== roomCode) return;
    localStorage.removeItem(multiplayerRoomPointerStorageKey);
  } catch { /* Storage may be unavailable. */ }
}
