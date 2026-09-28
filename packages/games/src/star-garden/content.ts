import type { StarGardenActionId, StarGardenCard, StarGardenGoal, StarGardenTier } from "@team-arcade/shared";

export const STAR_GARDEN_VERSION = "v1" as const;
export const STAR_GARDEN_TIERS: readonly StarGardenTier[] = ["easy", "medium", "hard"];
// Published v1 data is immutable. A balance revision must introduce a new version.
const GOAL_ROWS: readonly [string, StarGardenTier, number, string, string][] = [
  ["G01", "easy", 2, "Ember", "AAA"], ["G02", "easy", 2, "Sprig", "AA/A."],
  ["G03", "easy", 2, "Hook", "AA/.A"], ["G04", "easy", 3, "Arrow", "A.A/.A."],
  ["G05", "easy", 3, "Kite", ".A./A.A"], ["G06", "easy", 1, "Rhythm", "ABA"],
  ["G07", "easy", 3, "Pairlight", "AA/BB"], ["G08", "easy", 3, "Offset", "AA./.BB"],
  ["G09", "easy", 3, "Braids", "AB/AB"], ["G10", "easy", 3, "Switchback", "AB/BA"],
  ["G11", "medium", 4, "Flare", "AAAA"], ["G12", "medium", 4, "Hearth", "AA/AA"],
  ["G13", "medium", 5, "Shelter", "AAA/.A."], ["G14", "medium", 5, "Chalice", "A.A/AA."],
  ["G15", "medium", 6, "Ribbon", "AA../..AA"], ["G16", "medium", 6, "Duet", "AAABB"],
  ["G17", "medium", 5, "Signal", "AAB/BB."], ["G18", "medium", 5, "Portal", "A.A/BBB"],
  ["G19", "medium", 5, "Pennant", "ABB/AA."], ["G20", "medium", 5, "Stepstone", "ABA/.BB"],
  ["G21", "hard", 7, "Horizon", "AAAAA"], ["G22", "hard", 7, "Lantern", "AAA/AA."],
  ["G23", "hard", 7, "Crown", "A.A/AAA"], ["G24", "hard", 7, "Sail", "AA../.AAA"],
  ["G25", "hard", 8, "Bridge", "A...A/.AAA."], ["G26", "hard", 7, "Weave", "ABA/BAB"],
  ["G27", "hard", 9, "Sunroom", "AAA/AAA"], ["G28", "hard", 9, "Fireflies", "AA.A/A.AA"],
  ["G29", "hard", 8, "Starfall", "A.A.A/.A.A."], ["G30", "hard", 10, "Starhouse", "AAAA/A.AA"]
];
export const STAR_GARDEN_GOALS: readonly StarGardenGoal[] = GOAL_ROWS.map(([id, tier, points, name, pattern]) => ({ id, tier, points, name, pattern }));

export const STAR_GARDEN_ACTIONS: readonly { id: StarGardenActionId; name: string; copies: number; description: string }[] = [
  { id: "exchange", name: "Exchange", copies: 10, description: "Swap two orthogonally adjacent stars." },
  { id: "spin", name: "Spin", copies: 8, description: "Rotate a 2×2 block 90° clockwise or counterclockwise." },
  { id: "blink", name: "Blink", copies: 4, description: "Swap any two distinct stars." },
  { id: "collapse", name: "Collapse", copies: 8, description: "Remove one star. Survivors flow downstream; one new star arrives." },
  { id: "scramble", name: "Scramble", copies: 6, description: "Reorder three consecutive stars in a row with a non-identity permutation." },
  { id: "mutation", name: "Mutation", copies: 6, description: "Replace one star with a random different kind, without flow." },
  { id: "drift", name: "Drift", copies: 6, description: "Shift one row one space left or right, wrapping within that row." },
  { id: "mirror", name: "Mirror", copies: 4, description: "Reverse one row." },
  { id: "crosswind", name: "Crosswind", copies: 4, description: "Shift the top row one space in your chosen direction and the bottom in the opposite direction." },
  { id: "echo", name: "Echo", copies: 4, description: "Copy a star's kind to an orthogonally adjacent target, without flow." }
];
export function starGardenDeck(): StarGardenCard[] {
  return STAR_GARDEN_ACTIONS.flatMap(({ id, copies }) => Array.from({ length: copies }, (_, index) => ({ id: `${id}-${index + 1}`, action: id })));
}
