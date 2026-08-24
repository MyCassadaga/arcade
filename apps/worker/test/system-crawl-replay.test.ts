import { describe, expect, it } from "vitest";
import { reduceSystemCrawl, type SystemCrawlState } from "@team-arcade/games";
import { handleSystemCrawlRoomCommand, createSystemCrawlReplayRoomState, createSystemCrawlRoomState } from "../src/system-crawl-adapter";
import type { StoredPlayer } from "../src/room-model";

describe("System Crawl room replay adapter", () => {
  it("replays the same seed with identical initial content and clean mutable state", () => {
    const players = [storedPlayer("host", "Host", true), storedPlayer("guest", "Guest", false)];
    let previous = createSystemCrawlRoomState(players);
    previous = handleSystemCrawlRoomCommand(previous, { type: "select_class", classIds: ["infrastructure-architect"] }, "host", "host").state;
    previous = handleSystemCrawlRoomCommand(previous, { type: "select_class", classIds: ["application-developer"] }, "guest", "host").state;
    previous = startWithSeed(previous, "same-seed");
    const fingerprint = initialFingerprint(previous);
    previous.characters[previous.activeCharacterId ?? ""]!.hp = 1;
    previous.characters[previous.activeCharacterId ?? ""]!.carriedItemId = "coffee";
    previous.phase = "victory";

    const replay = createSystemCrawlReplayRoomState(players, previous, "same-seed");
    expect(initialFingerprint(replay)).toEqual(fingerprint);
    expect(replay.phase).toBe("player_turn");
    expect(Object.values(replay.characters).every((character) => character.hp === character.maxHp && character.carriedItemId === null)).toBe(true);
    expect(replay.pendingChoice).toBeNull();
    expect(replay.events.some((event) => event.type === "victory")).toBe(false);
  });

  it("uses a fresh seed and drops ownership for departed players", () => {
    const players = [storedPlayer("host", "Host", true), storedPlayer("guest", "Guest", false)];
    let previous = createSystemCrawlRoomState(players);
    previous = handleSystemCrawlRoomCommand(previous, { type: "select_class", classIds: ["infrastructure-architect"] }, "host", "host").state;
    previous = handleSystemCrawlRoomCommand(previous, { type: "select_class", classIds: ["application-developer"] }, "guest", "host").state;
    previous = startWithSeed(previous, "old-seed");

    const fresh = createSystemCrawlReplayRoomState(players, previous, "new-seed");
    expect(fresh.seed).toBe("new-seed");
    expect(fresh.rngState).not.toBe(previous.rngState);
    const withoutGuest = createSystemCrawlReplayRoomState([{ ...players[0]!, connected: true }], previous, "old-seed");
    expect(withoutGuest.players.map((player) => player.id)).toEqual(["host"]);
    expect(Object.values(withoutGuest.characters).every((character) => character.ownerPlayerId !== "guest")).toBe(true);
  });
});

function startWithSeed(state: SystemCrawlState, seed: string): SystemCrawlState {
  state = reduceSystemCrawl(state, { type: "start_adventure", seed }, state.hostPlayerId).state;
  return reduceSystemCrawl(state, { type: "continue_briefing" }, state.hostPlayerId).state;
}

function initialFingerprint(state: SystemCrawlState) {
  return {
    incidentId: state.incidentId,
    maps: state.maps.map((map) => ({ templateId: map.templateId, caches: map.caches.map((cache) => cache.itemId) })),
    enemies: Object.values(state.enemies).map((enemy) => ({ definitionId: enemy.definitionId, position: enemy.position, hp: enemy.hp }))
  };
}

function storedPlayer(id: string, displayName: string, isHost: boolean): StoredPlayer {
  return { id, displayName, isHost, connected: true, score: 0, joinedAt: 1, lastSeenAt: 1, disconnectedAt: null, sessionTokenHash: "hash" };
}
