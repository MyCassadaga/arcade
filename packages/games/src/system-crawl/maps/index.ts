import type { MapPoint, SystemCrawlMapTemplate } from "../types";

const ENTRY_POSITIONS = [point(1, 2), point(1, 3), point(1, 4), point(2, 3)] as const;
const REGULAR_CHOICES = ["budget-reduction", "scope-creep", "system-requirement", "meeting"] as const;

export const SYSTEM_CRAWL_MAPS: readonly SystemCrawlMapTemplate[] = [
  {
    id: "access-layer",
    displayName: "Access Layer",
    role: "entry",
    width: 9,
    height: 7,
    terrain: ["#########", "#.......#", "#..#....#", "E.......X", "#....#..#", "#.......#", "#########"],
    entrance: point(0, 3),
    exit: point(8, 3),
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: [spawn("access-enemy-1", 5, 2), spawn("access-enemy-2", 6, 4)],
    bossSpawn: null,
    minionSpawns: [],
    itemCacheSpawns: [{ id: "access-cache-1", position: point(3, 5) }],
    doors: [{ id: "access-door-1", position: point(6, 1), locked: true }],
    props: [{ id: "access-switch", kind: "network-switch", position: point(3, 1), blocksMovement: true, blocksLineOfSight: true }],
    visualTheme: { floor: "raised-floor", walls: "cool-gray", accent: "cyan", props: "networking" }
  },
  {
    id: "help-desk",
    displayName: "Help Desk",
    role: "entry",
    width: 9,
    height: 7,
    terrain: ["#########", "#.......#", "#....#..#", "E.......X", "#..#....#", "#.......#", "#########"],
    entrance: point(0, 3),
    exit: point(8, 3),
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: [spawn("help-enemy-1", 5, 1), spawn("help-enemy-2", 6, 5)],
    bossSpawn: null,
    minionSpawns: [],
    itemCacheSpawns: [{ id: "help-cache-1", position: point(4, 4) }],
    doors: [{ id: "help-door-1", position: point(2, 5), locked: true }],
    props: [{ id: "help-cubicle", kind: "cubicle", position: point(3, 2), blocksMovement: true, blocksLineOfSight: false }],
    visualTheme: { floor: "office-carpet", walls: "beige", accent: "orange", props: "support-desks" }
  },
  {
    id: "change-control",
    displayName: "Change Control",
    role: "standard",
    width: 9,
    height: 7,
    terrain: ["#########", "#.......#", "#.#.....#", "E.......X", "#.....#.#", "#.......#", "#########"],
    entrance: point(0, 3),
    exit: point(8, 3),
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: [spawn("change-enemy-1", 4, 1), spawn("change-enemy-2", 6, 5), spawn("change-enemy-3", 5, 5)],
    bossSpawn: null,
    minionSpawns: [],
    itemCacheSpawns: [{ id: "change-cache-1", position: point(2, 5) }],
    doors: [{ id: "change-door-1", position: point(6, 1), locked: true }],
    props: [{ id: "change-table", kind: "approval-table", position: point(3, 4), blocksMovement: true, blocksLineOfSight: false }],
    visualTheme: { floor: "tile", walls: "charcoal", accent: "yellow", props: "approval-workflow" }
  },
  {
    id: "legacy-services",
    displayName: "Legacy Services",
    role: "standard",
    width: 9,
    height: 7,
    terrain: ["#########", "#.......#", "#....##.#", "E.......X", "#.#.....#", "#.......#", "#########"],
    entrance: point(0, 3),
    exit: point(8, 3),
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: [spawn("legacy-enemy-1", 4, 2), spawn("legacy-enemy-2", 6, 5)],
    bossSpawn: null,
    minionSpawns: [],
    itemCacheSpawns: [{ id: "legacy-cache-1", position: point(3, 1) }, { id: "legacy-cache-2", position: point(5, 4) }],
    doors: [{ id: "legacy-door-1", position: point(1, 5), locked: true }],
    props: [{ id: "legacy-mainframe", kind: "mainframe", position: point(6, 1), blocksMovement: true, blocksLineOfSight: true }],
    visualTheme: { floor: "linoleum", walls: "olive", accent: "amber", props: "vintage-computing" }
  },
  {
    id: "development-environment",
    displayName: "Development Environment",
    role: "standard",
    width: 9,
    height: 7,
    terrain: ["#########", "#.......#", "#...#...#", "E.......X", "#...#...#", "#.......#", "#########"],
    entrance: point(0, 3),
    exit: point(8, 3),
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: [spawn("dev-enemy-1", 5, 2), spawn("dev-enemy-2", 6, 4)],
    bossSpawn: null,
    minionSpawns: [],
    itemCacheSpawns: [{ id: "dev-cache-1", position: point(3, 5) }],
    doors: [{ id: "dev-door-1", position: point(6, 1), locked: true }],
    props: [{ id: "dev-whiteboard", kind: "whiteboard", position: point(2, 1), blocksMovement: true, blocksLineOfSight: false }],
    visualTheme: { floor: "concrete", walls: "white", accent: "magenta", props: "workstations" }
  },
  {
    id: "network-operations",
    displayName: "Network Operations",
    role: "standard",
    width: 9,
    height: 7,
    terrain: ["#########", "#.......#", "#.#...#.#", "E.......X", "#.......#", "#..#....#", "#########"],
    entrance: point(0, 3),
    exit: point(8, 3),
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: [spawn("noc-enemy-1", 4, 1), spawn("noc-enemy-2", 5, 2), spawn("noc-enemy-3", 5, 5)],
    bossSpawn: null,
    minionSpawns: [],
    itemCacheSpawns: [{ id: "noc-cache-1", position: point(2, 4) }],
    doors: [{ id: "noc-door-1", position: point(7, 5), locked: true }],
    props: [{ id: "noc-display", kind: "display-wall", position: point(4, 4), blocksMovement: true, blocksLineOfSight: true }],
    visualTheme: { floor: "dark-raised-floor", walls: "navy", accent: "green", props: "monitoring" }
  },
  {
    id: "production-core",
    displayName: "Production Core",
    role: "boss",
    width: 9,
    height: 7,
    terrain: ["#########", "#.......#", "#.#...#.#", "E........", "#.......#", "#.#...#.#", "#########"],
    entrance: point(0, 3),
    exit: null,
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: [spawn("prod-enemy-1", 4, 1)],
    bossSpawn: point(7, 3),
    minionSpawns: [point(5, 2), point(6, 4), point(5, 1), point(5, 5)],
    itemCacheSpawns: [{ id: "prod-cache-1", position: point(3, 5) }],
    doors: [{ id: "prod-door-1", position: point(7, 1), locked: true }],
    props: [{ id: "prod-rack", kind: "server-rack", position: point(4, 5), blocksMovement: true, blocksLineOfSight: true }],
    visualTheme: { floor: "sealed-concrete", walls: "black", accent: "red", props: "production-racks" }
  },
  {
    id: "data-center-nexus",
    displayName: "Data Center Nexus",
    role: "boss",
    width: 9,
    height: 7,
    terrain: ["#########", "#.......#", "#...#...#", "E........", "#...#...#", "#.......#", "#########"],
    entrance: point(0, 3),
    exit: null,
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: [spawn("nexus-enemy-1", 5, 1)],
    bossSpawn: point(7, 3),
    minionSpawns: [point(6, 2), point(6, 4), point(5, 2), point(5, 4)],
    itemCacheSpawns: [{ id: "nexus-cache-1", position: point(2, 5) }],
    doors: [{ id: "nexus-door-1", position: point(7, 5), locked: true }],
    props: [{ id: "nexus-cooling", kind: "cooling-unit", position: point(3, 1), blocksMovement: true, blocksLineOfSight: false }],
    visualTheme: { floor: "blue-raised-floor", walls: "steel", accent: "violet", props: "data-center" }
  }
] as const;

export const SYSTEM_CRAWL_MAPS_BY_ID: Readonly<Record<string, SystemCrawlMapTemplate>> = Object.fromEntries(
  SYSTEM_CRAWL_MAPS.map((map) => [map.id, map])
);

export const ENTRY_MAPS = SYSTEM_CRAWL_MAPS.filter((map) => map.role === "entry");
export const STANDARD_MAPS = SYSTEM_CRAWL_MAPS.filter((map) => map.role === "standard");
export const BOSS_MAPS = SYSTEM_CRAWL_MAPS.filter((map) => map.role === "boss");

function point(x: number, y: number): MapPoint {
  return { x, y };
}

function spawn(id: string, x: number, y: number) {
  return { id, position: point(x, y), choices: REGULAR_CHOICES };
}
