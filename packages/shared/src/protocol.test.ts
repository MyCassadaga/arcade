import { describe, expect, it } from "vitest";
import { clientMessageSchema, displayNameSchema, roomCodeSchema } from "./protocol";
import { GAME_CATALOG } from "./catalog";

describe("shared protocol validation", () => {
  it("normalizes valid room codes and rejects ambiguous characters", () => {
    expect(roomCodeSchema.parse("ab23z")).toBe("AB23Z");
    expect(roomCodeSchema.safeParse("ROOM1").success).toBe(false);
  });

  it("trims names and enforces the documented length", () => {
    expect(displayNameSchema.parse("  Ada  ")).toBe("Ada");
    expect(displayNameSchema.safeParse("x".repeat(25)).success).toBe(false);
  });

  it("rejects unknown and malformed WebSocket commands", () => {
    expect(clientMessageSchema.safeParse({ type: "host.selectGame", requestId: "1", payload: { gameId: "impostor" } }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ type: "host.selectGame", requestId: "1", payload: { gameId: "unknown" } }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ type: "admin.win", requestId: "1", payload: {} }).success).toBe(false);
  });

  it("enforces every documented game text boundary at runtime", () => {
    const message = (command: unknown) => ({ type: "game.command", requestId: "bounded", payload: { command } });
    expect(clientMessageSchema.safeParse(message({ type: "wst.submitAnswer", answer: "x".repeat(160) })).success).toBe(true);
    expect(clientMessageSchema.safeParse(message({ type: "wst.submitAnswer", answer: "x".repeat(161) })).success).toBe(false);
    expect(clientMessageSchema.safeParse(message({ type: "impostor.submitClue", clue: "x".repeat(32) })).success).toBe(true);
    expect(clientMessageSchema.safeParse(message({ type: "impostor.submitClue", clue: "x".repeat(33) })).success).toBe(false);
    expect(clientMessageSchema.safeParse({
      type: "room.reconnect",
      requestId: "bounded",
      payload: { sessionToken: "short" }
    }).success).toBe(false);
  });

  it("publishes System Crawl with its stable catalog identity", () => {
    expect(GAME_CATALOG.find((game) => game.id === "system-crawl")).toMatchObject({
      name: "System Crawl",
      description: "A cooperative IT dungeon crawl through scope creep, meetings, and production incidents.",
      playerRange: "1–4 players"
    });
  });

  it("runtime-validates every System Crawl action intent", () => {
    const position = { cardIndex: 0, x: 2, y: 3 };
    const commands = [
      { type: "select_class", classIds: ["infrastructure-architect"] },
      { type: "select_class", classIds: ["application-developer", "it-generalist"] },
      { type: "start_adventure" },
      { type: "move_to", characterId: "character:1", destination: position },
      { type: "use_ability", characterId: "character:1", abilityId: "hotfix", target: { type: "enemy", enemyId: "enemy:1" } },
      { type: "use_ability", characterId: "character:1", abilityId: "load-balancer", target: { type: "load_balancer", characterId: "character:2", destination: position } },
      { type: "resolve_choice", choiceId: "choice:1", itemId: "coffee" },
      { type: "use_item", characterId: "character:1", target: { type: "door", doorId: "door:1" } },
      { type: "discard_item", characterId: "character:1" },
      { type: "restart_user", characterId: "character:1", targetCharacterId: "character:2" },
      { type: "end_turn", characterId: "character:1" }
    ];
    for (const [index, command] of commands.entries()) {
      expect(clientMessageSchema.safeParse({
        type: "game.command",
        requestId: `system-${index}`,
        payload: { command }
      }).success).toBe(true);
    }
  });

  it("rejects malformed System Crawl commands and client-supplied randomness", () => {
    const message = (command: unknown) => ({ type: "game.command", requestId: "system-bad", payload: { command } });
    expect(clientMessageSchema.safeParse(message({ type: "start_adventure", seed: "client-seed" })).success).toBe(false);
    expect(clientMessageSchema.safeParse(message({ type: "select_class", classIds: [] })).success).toBe(false);
    expect(clientMessageSchema.safeParse(message({ type: "select_class", classIds: ["not-a-class"] })).success).toBe(false);
    expect(clientMessageSchema.safeParse(message({ type: "move_to", characterId: "character:1", destination: { cardIndex: 4, x: 0, y: 0 } })).success).toBe(false);
    expect(clientMessageSchema.safeParse(message({ type: "use_ability", characterId: "character:1", abilityId: "delete-production" })).success).toBe(false);
    expect(clientMessageSchema.safeParse(message({ type: "resolve_choice", choiceId: "choice:1", itemId: "mystery" })).success).toBe(false);
  });
});
