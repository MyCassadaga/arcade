import { describe, expect, it } from "vitest";
import { isTerminalSessionClose } from "./useRoomSocket";

describe("terminal room-session close classification", () => {
  it.each([
    [1008, "Room unavailable"],
    [1008, "Invalid session"],
    [1001, "Room expired"]
  ])("treats %i %s as terminal", (code, reason) => {
    expect(isTerminalSessionClose(code, reason)).toBe(true);
  });

  it.each([
    [1006, ""],
    [1001, "Going away"],
    [1011, "Server restart"]
  ])("keeps %i %s recoverable", (code, reason) => {
    expect(isTerminalSessionClose(code, reason)).toBe(false);
  });
});
