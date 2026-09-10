import { describe, expect, it } from "vitest";
import { readThenRevalidate } from "../src/post-io-authorization";

describe("post-I/O authorization", () => {
  it("revalidates only after a pending read resolves", async () => {
    const events: string[] = [];
    let releaseRead: ((value: { bytes: number }) => void) | undefined;
    let authorized = true;
    const pending = readThenRevalidate(
      () => new Promise<{ bytes: number }>((resolve) => {
        events.push("read-started");
        releaseRead = resolve;
      }),
      () => {
        events.push("revalidated");
        return authorized;
      }
    );

    expect(events).toEqual(["read-started"]);
    authorized = false;
    releaseRead?.({ bytes: 48 });

    await expect(pending).resolves.toEqual({ object: { bytes: 48 }, authorization: false });
    expect(events).toEqual(["read-started", "revalidated"]);
  });

  it("does not authorize a missing object", async () => {
    let authorizationCalls = 0;
    await expect(readThenRevalidate(
      () => Promise.resolve(null),
      () => { authorizationCalls += 1; return true; }
    )).resolves.toEqual({ object: null });
    expect(authorizationCalls).toBe(0);
  });
});
