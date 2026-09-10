import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHIRT_FIGHT_MAX_DRAWING_BYTES, exportCanvasWebp, isWebpBlob } from "./shirt-fight-export";

const encode = vi.hoisted(() => vi.fn());
vi.mock("@jsquash/webp/encode.js", () => ({ default: encode }));

beforeEach(() => encode.mockReset());

describe("Shirt Fight WebP export", () => {
  it("uses a real native WebP only when its bytes and size satisfy the upload contract", async () => {
    const native = webpBlob(128);
    const canvas = fakeCanvas((callback) => callback(native));

    await expect(exportCanvasWebp(canvas)).resolves.toBe(native);
    expect(encode).not.toHaveBeenCalled();
    await expect(isWebpBlob(native)).resolves.toBe(true);
  });

  it("uses the bundled encoder when a browser silently falls back to PNG", async () => {
    const fallbackBytes = webpBytes(256);
    encode.mockResolvedValue(fallbackBytes.buffer);
    const canvas = fakeCanvas((callback) => callback(new Blob([new Uint8Array(40)], { type: "image/png" })));

    const result = await exportCanvasWebp(canvas);

    expect(result.type).toBe("image/webp");
    expect(result.size).toBe(256);
    expect(encode).toHaveBeenCalledWith(expect.objectContaining({ width: 600, height: 800 }), { quality: 78 });
  });

  it("uses the bundled encoder when native canvas export throws", async () => {
    const fallbackBytes = webpBytes(256);
    encode.mockResolvedValue(fallbackBytes.buffer);
    const canvas = fakeCanvas(() => { throw new Error("Native WebP unavailable"); });

    await expect(exportCanvasWebp(canvas)).resolves.toEqual(expect.objectContaining({ type: "image/webp", size: 256 }));
    expect(encode).toHaveBeenCalledOnce();
  });

  it("reports excessive detail only after native and fallback quality attempts remain oversized", async () => {
    const oversized = webpBytes(SHIRT_FIGHT_MAX_DRAWING_BYTES + 1);
    encode.mockResolvedValue(oversized.buffer);
    const canvas = fakeCanvas((callback) => callback(new Blob([oversized.buffer as ArrayBuffer], { type: "image/webp" })));

    await expect(exportCanvasWebp(canvas)).rejects.toEqual(expect.objectContaining({ reason: "too-large" }));
    expect(encode).toHaveBeenCalledTimes(4);
  });

  it("reports an unavailable encoder without exposing pixel or file-format requirements", async () => {
    encode.mockResolvedValue(new Uint8Array(40).buffer);
    const canvas = fakeCanvas((callback) => callback(new Blob([new Uint8Array(40)], { type: "image/png" })));

    await expect(exportCanvasWebp(canvas)).rejects.toThrow("This browser could not prepare the drawing");
  });
});

function fakeCanvas(toBlob: (callback: BlobCallback) => void): HTMLCanvasElement {
  return {
    width: 600,
    height: 800,
    toBlob,
    getContext: () => ({ getImageData: () => ({ width: 600, height: 800, data: new Uint8ClampedArray(600 * 800 * 4) }) })
  } as unknown as HTMLCanvasElement;
}

function webpBlob(size: number): Blob {
  return new Blob([webpBytes(size).buffer as ArrayBuffer], { type: "image/webp" });
}

function webpBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode("VP8 "), 12);
  return bytes;
}
