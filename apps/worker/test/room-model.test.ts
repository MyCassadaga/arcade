import { describe, expect, it } from "vitest";
import {
  canIssueHostCommand,
  chooseHostSuccessor,
  hasDuplicateName,
  projectRoom,
  type RoomMetadata,
  type StoredPlayer
} from "../src/room-model";

const metadata: RoomMetadata = {
  roomCode: "ABCDE",
  selectedGameId: null,
  roomPhase: "lobby",
  createdAt: 1,
  lastActivityAt: 1
};

function player(overrides: Partial<StoredPlayer> = {}): StoredPlayer {
  return {
    id: "player-a",
    displayName: "Ada",
    sessionTokenHash: "hash",
    joinedAt: 1,
    lastSeenAt: 1,
    connected: true,
    disconnectedAt: null,
    isHost: false,
    score: 0,
    ...overrides
  };
}

describe("room model", () => {
  it("treats names as trimmed and case-insensitively unique", () => {
    expect(hasDuplicateName([player()], "  ADA ")).toBe(true);
    expect(hasDuplicateName([player()], "Grace")).toBe(false);
  });

  it("chooses the longest-connected active non-host for failover", () => {
    const successor = chooseHostSuccessor([
      player({ id: "host", isHost: true, connected: false, disconnectedAt: 100 }),
      player({ id: "late", displayName: "Late", joinedAt: 30 }),
      player({ id: "early", displayName: "Early", joinedAt: 20 }),
      player({ id: "offline", displayName: "Offline", joinedAt: 10, connected: false })
    ]);
    expect(successor?.id).toBe("early");
  });

  it("authorizes only a connected host", () => {
    expect(canIssueHostCommand(player({ isHost: true }))).toBe(true);
    expect(canIssueHostCommand(player({ isHost: true, connected: false }))).toBe(false);
    expect(canIssueHostCommand(player())).toBe(false);
  });

  it("projects no session hashes or persistence details", () => {
    const view = projectRoom(metadata, [player({ score: 7 })]);
    expect(view.players[0]).toEqual({ id: "player-a", displayName: "Ada", connected: true, isHost: false, score: 7 });
    expect(JSON.stringify(view)).not.toContain("hash");
  });
});
