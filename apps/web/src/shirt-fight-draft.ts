import { SHIRT_FIGHT_BRUSH_SIZES, SHIRT_FIGHT_COLORS } from "@team-arcade/shared";

export const SHIRT_FIGHT_CANVAS_WIDTH = 600;
export const SHIRT_FIGHT_CANVAS_HEIGHT = 800;

export interface DrawingPoint { x: number; y: number }
export interface DrawingStroke {
  color: (typeof SHIRT_FIGHT_COLORS)[number];
  size: (typeof SHIRT_FIGHT_BRUSH_SIZES)[number];
  points: DrawingPoint[];
}

export interface DrawingDraftIdentity {
  roomCode: string;
  playerId: string;
  gameInstanceId: string;
  generationRound: number;
  drawingNumber: number;
}

interface StoredDrawingDraft extends DrawingDraftIdentity {
  version: 1;
  strokes: DrawingStroke[];
}

const PREFIX = "team-arcade:shirt-fight-draft:";
export const MAX_DRAWING_STROKES = 240;
export const MAX_DRAWING_POINTS_PER_STROKE = 2_500;
export const MAX_DRAWING_TOTAL_POINTS = 30_000;
const MAX_SERIALIZED_BYTES = 1_000_000;

export function drawingDraftStorageKey(identity: DrawingDraftIdentity): string {
  return `${PREFIX}${identity.roomCode}:${identity.playerId}:${identity.gameInstanceId}:${identity.generationRound}:${identity.drawingNumber}`;
}

export function readDrawingDraft(identity: DrawingDraftIdentity): DrawingStroke[] {
  const key = drawingDraftStorageKey(identity);
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw || raw.length > MAX_SERIALIZED_BYTES) {
      if (raw) sessionStorage.removeItem(key);
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredDraft(parsed, identity)) {
      sessionStorage.removeItem(key);
      return [];
    }
    return parsed.strokes;
  } catch {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Storage may be entirely unavailable in a restricted browsing context.
    }
    return [];
  }
}

export function writeDrawingDraft(identity: DrawingDraftIdentity, strokes: DrawingStroke[]): void {
  try {
    const stored: StoredDrawingDraft = { version: 1, ...identity, strokes };
    const serialized = JSON.stringify(stored);
    if (serialized.length > MAX_SERIALIZED_BYTES || !isStoredDraft(stored, identity)) return;
    sessionStorage.setItem(drawingDraftStorageKey(identity), serialized);
  } catch {
    // Draft recovery is best-effort and must never interrupt drawing.
  }
}

export function clearDrawingDraft(identity: DrawingDraftIdentity): void {
  try {
    sessionStorage.removeItem(drawingDraftStorageKey(identity));
  } catch {
    // Storage may be unavailable in a private browsing context.
  }
}

export function clearPlayerDrawingDrafts(roomCode: string, playerId: string, except?: DrawingDraftIdentity): void {
  try {
    const playerPrefix = `${PREFIX}${roomCode}:${playerId}:`;
    const keep = except ? drawingDraftStorageKey(except) : null;
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(playerPrefix) && key !== keep) sessionStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in a private browsing context.
  }
}

function isStoredDraft(value: unknown, identity: DrawingDraftIdentity): value is StoredDrawingDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<StoredDrawingDraft>;
  if (draft.version !== 1
    || draft.roomCode !== identity.roomCode
    || draft.playerId !== identity.playerId
    || draft.gameInstanceId !== identity.gameInstanceId
    || draft.generationRound !== identity.generationRound
    || draft.drawingNumber !== identity.drawingNumber
    || !Array.isArray(draft.strokes)
    || draft.strokes.length > MAX_DRAWING_STROKES) return false;
  let totalPoints = 0;
  for (const stroke of draft.strokes) {
    if (!stroke || typeof stroke !== "object") return false;
    const candidate = stroke as Partial<DrawingStroke>;
    if (!SHIRT_FIGHT_COLORS.includes(candidate.color as DrawingStroke["color"])
      || !SHIRT_FIGHT_BRUSH_SIZES.includes(candidate.size as DrawingStroke["size"])
      || !Array.isArray(candidate.points)
      || candidate.points.length < 1
      || candidate.points.length > MAX_DRAWING_POINTS_PER_STROKE) return false;
    totalPoints += candidate.points.length;
    if (totalPoints > MAX_DRAWING_TOTAL_POINTS) return false;
    for (const point of candidate.points) {
      if (!point || typeof point !== "object") return false;
      const candidatePoint = point as Partial<DrawingPoint>;
      if (!Number.isFinite(candidatePoint.x) || !Number.isFinite(candidatePoint.y)
        || (candidatePoint.x as number) < 0 || (candidatePoint.x as number) > SHIRT_FIGHT_CANVAS_WIDTH
        || (candidatePoint.y as number) < 0 || (candidatePoint.y as number) > SHIRT_FIGHT_CANVAS_HEIGHT) return false;
    }
  }
  return true;
}
