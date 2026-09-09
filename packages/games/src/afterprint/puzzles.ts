import {
  AFTERPRINT_EVENT_IDS,
  afterprintBoardSchema,
  afterprintEventSchema,
  type AfterprintBoard,
  type AfterprintEvent,
  type AfterprintEventId
} from "@team-arcade/shared";
import { countAfterprintMismatches, simulateAfterprint, simulateAfterprintSteps } from "./simulator";

export interface AfterprintPuzzleDefinition {
  id: string;
  events: AfterprintEvent[];
  initialEventIds: AfterprintEventId[];
  authoredEventIds: AfterprintEventId[];
  target: AfterprintBoard;
}

export interface FrozenAfterprintPuzzle extends Omit<AfterprintPuzzleDefinition, "authoredEventIds"> {
  puzzleNumber: number;
  bankVersion: string;
}

const board = (inks: Partial<Record<number, NonNullable<AfterprintBoard[number]>>>): AfterprintBoard =>
  Array.from({ length: 25 }, (_, cell) => inks[cell] ?? null);

export const AFTERPRINT_PUZZLE_BANK_V1: readonly AfterprintPuzzleDefinition[] = [
  {
    id: "crossed-colors",
    events: [
      { id: "A", kind: "drop", cell: 5, ink: "coral" },
      { id: "B", kind: "roll", path: [5, 6, 7, 8, 9] },
      { id: "C", kind: "drop", cell: 7, ink: "blue" },
      { id: "D", kind: "roll", path: [2, 7, 12, 17, 22] },
      { id: "E", kind: "wipe", path: [8, 13, 18] }
    ],
    initialEventIds: ["D", "A", "E", "C", "B"],
    authoredEventIds: ["A", "B", "C", "D", "E"],
    target: board({ 5: "coral", 6: "coral", 7: "blue", 9: "coral", 12: "blue", 17: "blue", 22: "blue" })
  },
  {
    id: "golden-corner",
    events: [
      { id: "A", kind: "drop", cell: 20, ink: "gold" },
      { id: "B", kind: "roll", path: [20, 15, 10, 5, 0] },
      { id: "C", kind: "wipe", path: [10, 11, 12, 13, 14] },
      { id: "D", kind: "drop", cell: 9, ink: "plum" },
      { id: "E", kind: "roll", path: [4, 9, 14, 19, 24] }
    ],
    initialEventIds: ["E", "C", "B", "D", "A"],
    authoredEventIds: ["A", "B", "C", "D", "E"],
    target: board({ 0: "gold", 5: "gold", 9: "plum", 14: "plum", 15: "gold", 19: "plum", 20: "gold", 24: "plum" })
  },
  {
    id: "broken-column",
    events: [
      { id: "A", kind: "drop", cell: 1, ink: "blue" },
      { id: "B", kind: "roll", path: [1, 6, 11, 16, 21] },
      { id: "C", kind: "drop", cell: 16, ink: "coral" },
      { id: "D", kind: "roll", path: [15, 16, 17, 18, 19] },
      { id: "E", kind: "wipe", path: [6, 7, 8, 9] }
    ],
    initialEventIds: ["C", "E", "A", "D", "B"],
    authoredEventIds: ["A", "B", "C", "D", "E"],
    target: board({ 1: "blue", 11: "blue", 16: "coral", 17: "coral", 18: "coral", 19: "coral", 21: "blue" })
  },
  {
    id: "corner-lift",
    events: [
      { id: "A", kind: "drop", cell: 24, ink: "gold" },
      { id: "B", kind: "roll", path: [24, 23, 22, 21, 20] },
      { id: "C", kind: "drop", cell: 22, ink: "blue" },
      { id: "D", kind: "roll", path: [22, 17, 12, 7, 2] },
      { id: "E", kind: "wipe", path: [20, 15, 10, 5, 0] }
    ],
    initialEventIds: ["D", "B", "E", "A", "C"],
    authoredEventIds: ["A", "B", "C", "D", "E"],
    target: board({ 2: "blue", 7: "blue", 12: "blue", 17: "blue", 21: "gold", 22: "blue", 23: "gold", 24: "gold" })
  }
] as const;

interface BankEpoch {
  startPuzzleNumber: number;
  version: string;
  puzzles: readonly AfterprintPuzzleDefinition[];
}

// Add future banks as a new epoch. Never edit or reorder a published epoch.
const AFTERPRINT_BANK_EPOCHS: readonly BankEpoch[] = [
  { startPuzzleNumber: 1, version: "v1", puzzles: AFTERPRINT_PUZZLE_BANK_V1 }
];

export const AFTERPRINT_EPOCH_UTC = Date.UTC(2026, 8, 9);
const DAY_MS = 86_400_000;

export function getAfterprintPuzzleNumber(now: number): number {
  const date = new Date(now);
  const utcDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.max(1, Math.floor((utcDay - AFTERPRINT_EPOCH_UTC) / DAY_MS) + 1);
}

export function selectAfterprintPuzzle(puzzleNumber: number): FrozenAfterprintPuzzle {
  const epoch = [...AFTERPRINT_BANK_EPOCHS].reverse().find((candidate) => candidate.startPuzzleNumber <= puzzleNumber);
  if (!epoch) throw new Error("No AFTERPRINT bank covers this puzzle number.");
  const index = (puzzleNumber - epoch.startPuzzleNumber) % epoch.puzzles.length;
  const puzzle = epoch.puzzles[index] as AfterprintPuzzleDefinition;
  return {
    id: puzzle.id,
    puzzleNumber,
    bankVersion: epoch.version,
    events: puzzle.events.map((event) => event.kind === "drop" ? { ...event } : { ...event, path: [...event.path] }),
    initialEventIds: [...puzzle.initialEventIds],
    target: [...puzzle.target]
  };
}

export function enumerateAfterprintOrders(ids: readonly AfterprintEventId[]): AfterprintEventId[][] {
  if (ids.length === 0) return [[]];
  return ids.flatMap((id, index) => enumerateAfterprintOrders(ids.filter((_, candidate) => candidate !== index))
    .map((rest) => [id, ...rest]));
}

export function validateAfterprintPuzzle(puzzle: AfterprintPuzzleDefinition) {
  const errors: string[] = [];
  if (puzzle.events.length !== 5 || new Set(puzzle.events.map((event) => event.id)).size !== 5) errors.push("Puzzle must define five unique events.");
  for (const event of puzzle.events) {
    if (!afterprintEventSchema.safeParse(event).success) errors.push(`Event ${event.id} has invalid bounded geometry.`);
    if (event.kind !== "drop") {
      if (new Set(event.path).size !== event.path.length) errors.push(`Event ${event.id} repeats a cell.`);
      if (event.path.some((cell, index) => index > 0 && !adjacent(event.path[index - 1] as number, cell))) errors.push(`Event ${event.id} has a non-adjacent path.`);
    }
  }
  if (!afterprintBoardSchema.safeParse(puzzle.target).success) errors.push("Target must be a bounded 25-cell board.");
  for (const [name, order] of [["initial", puzzle.initialEventIds], ["authored", puzzle.authoredEventIds]] as const) {
    if (order.length !== 5 || new Set(order).size !== 5 || order.some((id) => !AFTERPRINT_EVENT_IDS.includes(id))) errors.push(`${name} order must use all five events exactly once.`);
  }
  if (errors.length > 0) return { errors, permutationCount: 0, solutionOrders: [] as AfterprintEventId[][] };
  if (countAfterprintMismatches(simulateAfterprint(puzzle.events, puzzle.authoredEventIds), puzzle.target) !== 0) errors.push("Authored order does not produce the frozen target.");
  const authoredSteps = simulateAfterprintSteps(puzzle.events, puzzle.authoredEventIds);
  if (authoredSteps.slice(1).some((step, index) => countAfterprintMismatches(step, authoredSteps[index] as AfterprintBoard) === 0)) {
    errors.push("Every event must have a meaningful effect in the authored order.");
  }
  const orders = enumerateAfterprintOrders([...AFTERPRINT_EVENT_IDS]);
  const solutionOrders = orders.filter((order) => countAfterprintMismatches(simulateAfterprint(puzzle.events, order), puzzle.target) === 0);
  if (solutionOrders.length === 0) errors.push("Puzzle has no mechanically valid solution.");
  if (countAfterprintMismatches(simulateAfterprint(puzzle.events, puzzle.initialEventIds), puzzle.target) === 0) errors.push("Initial order must not already solve the puzzle.");
  return { errors, permutationCount: orders.length, solutionOrders };
}

function adjacent(left: number, right: number): boolean {
  return Math.abs(Math.floor(left / 5) - Math.floor(right / 5)) + Math.abs(left % 5 - right % 5) === 1;
}
