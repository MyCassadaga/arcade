import { SHIRT_FIGHT_CANVAS_HEIGHT, SHIRT_FIGHT_CANVAS_WIDTH } from "./shirt-fight-draft";

export const SHIRT_FIGHT_MAX_DRAWING_BYTES = 160_000;
const NATIVE_QUALITIES = [0.78, 0.62, 0.46, 0.3] as const;
const FALLBACK_QUALITIES = [78, 62, 46, 30] as const;

export class DrawingExportError extends Error {
  constructor(readonly reason: "unavailable" | "too-large") {
    super(reason === "too-large"
      ? "This drawing has too much detail to save. Undo a few strokes and try again."
      : "This browser could not prepare the drawing. Refresh the page and try again.");
  }
}

export async function exportCanvasWebp(canvas: HTMLCanvasElement): Promise<Blob> {
  if (canvas.width !== SHIRT_FIGHT_CANVAS_WIDTH || canvas.height !== SHIRT_FIGHT_CANVAS_HEIGHT) {
    throw new DrawingExportError("unavailable");
  }

  let sawValidOversizedWebp = false;
  for (const quality of NATIVE_QUALITIES) {
    let blob: Blob | null;
    try {
      blob = await canvasToBlob(canvas, quality);
    } catch {
      break;
    }
    if (!blob || !await isWebpBlob(blob)) break;
    if (blob.size <= SHIRT_FIGHT_MAX_DRAWING_BYTES) return blob;
    sawValidOversizedWebp = true;
  }

  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas unavailable");
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { default: encode } = await import("@jsquash/webp/encode.js");
    for (const quality of FALLBACK_QUALITIES) {
      const bytes = await encode(image, { quality });
      const blob = new Blob([bytes], { type: "image/webp" });
      if (!await isWebpBlob(blob)) throw new Error("Encoder returned invalid WebP");
      if (blob.size <= SHIRT_FIGHT_MAX_DRAWING_BYTES) return blob;
      sawValidOversizedWebp = true;
    }
  } catch {
    if (!sawValidOversizedWebp) throw new DrawingExportError("unavailable");
  }
  throw new DrawingExportError("too-large");
}

export async function isWebpBlob(blob: Blob): Promise<boolean> {
  if (blob.type.toLowerCase() !== "image/webp" || blob.size < 20) return false;
  const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  return ascii(header, 0, 4) === "RIFF" && ascii(header, 8, 12) === "WEBP";
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
