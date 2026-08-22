import { describe, expect, it } from "vitest";
import { clientMessageSchema, displayNameSchema, roomCodeSchema } from "./protocol";

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
});
