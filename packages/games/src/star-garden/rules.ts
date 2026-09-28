import { GameRuleError, shuffled } from "@team-arcade/game-core";
import { starGardenEffectSchema } from "@team-arcade/shared";
import type { StarGardenEffect, StarGardenGoal, StarKind } from "@team-arcade/shared";

export const STAR_GARDEN_PATH = [0, 1, 2, 3, 4, 9, 8, 7, 6, 5] as const;
export interface StarGardenRng { state: number }
export function fnv1a(value: string): number {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(value)) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
  return hash || 1;
}
export function nextStarGardenInteger(rng: StarGardenRng): number {
  let x = rng.state;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  rng.state = x >>> 0;
  return rng.state;
}
export const starGardenIndex = (rng: StarGardenRng, count: number) => Math.floor(nextStarGardenInteger(rng) / 4294967296 * count);
export const starGardenShuffle = <T,>(values: readonly T[], rng: StarGardenRng): T[] => shuffled(values, () => nextStarGardenInteger(rng) / 4294967296);
export const adjacentStars = (a: number, b: number): boolean => Math.abs(a % 5 - b % 5) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5)) === 1;
function requireRule(condition: boolean, message: string): asserts condition {
  if (!condition) throw new GameRuleError("INVALID_COMMAND", message);
}
export function matchStarGardenGoal(board: readonly StarKind[], goal: Pick<StarGardenGoal, "pattern">, origin: number): number[] | null {
  const rows = goal.pattern.split("/");
  const width = rows[0]!.length;
  if (!Number.isInteger(origin) || origin < 0 || origin > 9 || origin % 5 + width > 5 || Math.floor(origin / 5) + rows.length > 2) return null;
  const groups: Record<string, StarKind> = {};
  const cells: number[] = [];
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < width; c++) {
    const letter = rows[r]![c]!;
    if (letter === ".") continue;
    const cell = origin + r * 5 + c;
    const kind = board[cell];
    if (kind === undefined || (groups[letter] !== undefined && groups[letter] !== kind)) return null;
    groups[letter] = kind; cells.push(cell);
  }
  if (groups.A !== undefined && groups.B !== undefined && groups.A === groups.B) return null;
  return cells;
}
export function starGardenMatches(board: readonly StarKind[], goal: Pick<StarGardenGoal, "pattern">): number[] {
  return Array.from({ length: 10 }, (_, i) => i).filter((i) => matchStarGardenGoal(board, goal, i) !== null);
}
export function refillStars<T>(board: readonly T[], removed: readonly number[], draw: () => T): T[] {
  requireRule(board.length === 10 && new Set(removed).size === removed.length && removed.every((i) => Number.isInteger(i) && i >= 0 && i < 10), "Choose distinct board cells.");
  const survivors = STAR_GARDEN_PATH.filter((i) => !removed.includes(i)).map((i) => board[i]!);
  const result = [...board];
  for (let i = 0; i < survivors.length; i++) result[STAR_GARDEN_PATH[removed.length + i]!] = survivors[i]!;
  for (let i = removed.length - 1; i >= 0; i--) result[STAR_GARDEN_PATH[i]!] = draw();
  return result;
}
// One transform for authoritative effects and safe previews. Random providers are
// invoked only after all positional validation, and never exist in the preview.
export function transformStars<T>(board: readonly T[], raw: StarGardenEffect, draw: () => T, mutate: (old: T) => T): T[] {
  const parsed = starGardenEffectSchema.safeParse(raw);
  requireRule(parsed.success && board.length === 10, "Choose valid board targets and options.");
  const effect = parsed.data;
  const next = [...board];
  const swap = (a: number, b: number) => { [next[a], next[b]] = [board[b]!, board[a]!]; };
  const shift = (row: number, direction: "left" | "right") => {
    for (let i = 0; i < 5; i++) next[row * 5 + (i + (direction === "right" ? 1 : 4)) % 5] = board[row * 5 + i]!;
  };
  switch (effect.action) {
    case "exchange": case "blink": case "echo": {
      requireRule(effect.source !== effect.target, "Choose two distinct stars.");
      requireRule(effect.action === "blink" || adjacentStars(effect.source, effect.target), "Choose orthogonally adjacent stars (edges do not wrap).");
      if (effect.action === "echo") next[effect.target] = board[effect.source]!;
      else swap(effect.source, effect.target);
      break;
    }
    case "spin": {
      const cells = [effect.origin, effect.origin + 1, effect.origin + 6, effect.origin + 5];
      cells.forEach((cell, i) => { next[cells[(i + (effect.direction === "clockwise" ? 1 : 3)) % 4]!] = board[cell]!; });
      break;
    }
    case "collapse": return refillStars(board, [effect.target], draw);
    case "mutation": next[effect.target] = mutate(board[effect.target]!); break;
    case "scramble": {
      requireRule(effect.origin % 5 <= 2, "Choose the first of three cells within one row.");
      requireRule(new Set(effect.permutation).size === 3 && effect.permutation.some((v, i) => v !== i), "Choose a non-identity permutation of all three positions.");
      effect.permutation.forEach((source, i) => { next[effect.origin + i] = board[effect.origin + source]!; });
      break;
    }
    case "drift": shift(effect.row, effect.direction); break;
    case "mirror": for (let i = 0; i < 5; i++) next[effect.row * 5 + i] = board[effect.row * 5 + 4 - i]!; break;
    case "crosswind": shift(0, effect.direction); shift(1, effect.direction === "left" ? "right" : "left"); break;
  }
  return next;
}
export function previewStarGardenAction(board: readonly StarKind[], effect: StarGardenEffect): Array<StarKind | null> {
  return transformStars<StarKind | null>(board, effect, () => null, () => null);
}
