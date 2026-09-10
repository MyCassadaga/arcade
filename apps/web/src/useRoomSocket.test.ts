import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isTerminalSessionClose, useRoomSocket } from "./useRoomSocket";

class MockWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static instances: MockWebSocket[] = [];
  readonly send = vi.fn();
  readonly close = vi.fn();
  readyState = 0;

  constructor(readonly url: string) {
    super();
    MockWebSocket.instances.push(this);
  }
}

afterEach(() => {
  vi.useRealTimers();
  MockWebSocket.instances = [];
  vi.unstubAllGlobals();
});

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

describe("solo room-session revalidation", () => {
  it("turns an opaque upgrade failure after a successful preflight into a terminal typed result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: { code: "ROOM_NOT_FOUND", message: "Room not found." } })
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", MockWebSocket);

    const sessionToken = "x".repeat(32);
    const { result } = renderHook(() => useRoomSocket("ABCDE", sessionToken, true));
    const socket = MockWebSocket.instances[0];
    expect(socket?.url).toContain("/api/rooms/ABCDE/socket");

    act(() => {
      socket?.dispatchEvent(new CloseEvent("close", { code: 1006 }));
    });

    await waitFor(() => expect(result.current.fatalSession).toBe(true));
    expect(result.current.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledWith("/api/rooms/ABCDE/session", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ sessionToken })
    }));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("keeps an opaque failure retryable when revalidation cannot reach the server", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("WebSocket", MockWebSocket);

    const { result } = renderHook(() => useRoomSocket("ABCDE", "x".repeat(32), true));
    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(new CloseEvent("close", { code: 1006 }));
    });

    await waitFor(() => expect(result.current.message).toMatch(/could not reach the arcade/i));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current.fatalSession).toBe(false);
    expect(result.current.status).toBe("reconnecting");
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});

describe("socket reconnect ownership", () => {
  it("ignores a stale socket close after an online event starts its replacement", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", MockWebSocket);
    const { result } = renderHook(() => useRoomSocket("ABCDE", "x".repeat(32), true));
    const stale = MockWebSocket.instances[0] as MockWebSocket;
    stale.readyState = MockWebSocket.CLOSING;

    await act(() => window.dispatchEvent(new Event("online")));
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
    const current = MockWebSocket.instances[1] as MockWebSocket;

    await act(() => stale.dispatchEvent(new CloseEvent("close", { code: 1006 })));
    await vi.advanceTimersByTimeAsync(20_000);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(result.current.status).toBe("reconnecting");
    expect(current.url).toContain("/api/rooms/ABCDE/socket");
  });
});
