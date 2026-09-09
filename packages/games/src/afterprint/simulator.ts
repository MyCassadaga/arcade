import type { AfterprintBoard, AfterprintEvent, AfterprintEventId, AfterprintInk } from "@team-arcade/shared";

export const AFTERPRINT_BOARD_CELLS = 25;

export function emptyAfterprintBoard(): AfterprintBoard {
  return Array.from({ length: AFTERPRINT_BOARD_CELLS }, () => null);
}

export function applyAfterprintEvent(board: AfterprintBoard, event: AfterprintEvent): AfterprintBoard {
  const next = [...board];
  if (event.kind === "drop") {
    next[event.cell] = event.ink;
    return next;
  }
  if (event.kind === "wipe") {
    for (const cell of event.path) next[cell] = null;
    return next;
  }

  let carrying: AfterprintInk | null = null;
  for (const cell of event.path) {
    const encountered = next[cell] ?? null;
    if (encountered !== null) carrying = encountered;
    else if (carrying !== null) next[cell] = carrying;
  }
  return next;
}

export function simulateAfterprintSteps(
  events: readonly AfterprintEvent[],
  eventIds: readonly AfterprintEventId[]
): AfterprintBoard[] {
  const eventById = new Map(events.map((event) => [event.id, event]));
  let board = emptyAfterprintBoard();
  const steps = [board];
  for (const eventId of eventIds) {
    const event = eventById.get(eventId);
    if (!event) throw new Error(`Unknown AFTERPRINT event ${eventId}.`);
    board = applyAfterprintEvent(board, event);
    steps.push(board);
  }
  return steps;
}

export function simulateAfterprint(
  events: readonly AfterprintEvent[],
  eventIds: readonly AfterprintEventId[]
): AfterprintBoard {
  return simulateAfterprintSteps(events, eventIds).at(-1) as AfterprintBoard;
}

export function countAfterprintMismatches(left: readonly unknown[], right: readonly unknown[]): number {
  if (left.length !== AFTERPRINT_BOARD_CELLS || right.length !== AFTERPRINT_BOARD_CELLS) {
    throw new Error("AFTERPRINT boards must contain exactly 25 cells.");
  }
  let count = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) count += 1;
  }
  return count;
}
