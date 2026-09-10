import { describe, expect, it } from "vitest";
import {
  clearPlayerDrawingDrafts,
  drawingDraftStorageKey,
  readDrawingDraft,
  writeDrawingDraft,
  type DrawingDraftIdentity
} from "./shirt-fight-draft";

const identity: DrawingDraftIdentity = {
  roomCode: "ABCDE",
  playerId: "player-one",
  gameInstanceId: "00000000-0000-4000-8000-000000000026",
  generationRound: 1,
  drawingNumber: 1
};

describe("Shirt Fight local drawing drafts", () => {
  it("restores only a bounded draft for the exact authoritative slot identity", () => {
    const strokes = [{ color: "blue" as const, size: "medium" as const, points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] }];
    writeDrawingDraft(identity, strokes);

    expect(readDrawingDraft(identity)).toEqual(strokes);
    expect(readDrawingDraft({ ...identity, drawingNumber: 2 })).toEqual([]);
  });

  it("deletes malformed or out-of-bounds local data instead of rendering it", () => {
    const key = drawingDraftStorageKey(identity);
    sessionStorage.setItem(key, JSON.stringify({ version: 1, ...identity, strokes: [{ color: "blue", size: "medium", points: [{ x: -1, y: 20 }] }] }));

    expect(readDrawingDraft(identity)).toEqual([]);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it("retires stale slots for one player while preserving the current authoritative slot", () => {
    const current = { ...identity, drawingNumber: 2 };
    const otherPlayer = { ...identity, playerId: "player-two" };
    writeDrawingDraft(identity, [{ color: "red", size: "small", points: [{ x: 1, y: 1 }] }]);
    writeDrawingDraft(current, [{ color: "green", size: "large", points: [{ x: 2, y: 2 }] }]);
    writeDrawingDraft(otherPlayer, [{ color: "black", size: "small", points: [{ x: 3, y: 3 }] }]);

    clearPlayerDrawingDrafts(identity.roomCode, identity.playerId, current);

    expect(sessionStorage.getItem(drawingDraftStorageKey(identity))).toBeNull();
    expect(readDrawingDraft(current)).toHaveLength(1);
    expect(readDrawingDraft(otherPlayer)).toHaveLength(1);
  });
});
