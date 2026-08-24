import type { MapPoint, SystemCrawlMapTemplate } from "../types";
import { SYSTEM_CRAWL_MAPS } from ".";

export function validateMapTemplate(map: SystemCrawlMapTemplate): string[] {
  const errors: string[] = [];
  if (map.width !== 9 || map.height !== 7) errors.push(`${map.id}: dimensions must be 9 by 7`);
  if (map.terrain.length !== map.height) errors.push(`${map.id}: terrain must contain 7 rows`);
  map.terrain.forEach((row, y) => {
    if (row.length !== map.width) errors.push(`${map.id}: row ${y} must contain 9 columns`);
  });

  if (!isLegalFloor(map, map.entrance)) errors.push(`${map.id}: entrance is not on a legal tile`);
  if (map.role === "boss" && map.exit !== null) errors.push(`${map.id}: boss maps must not have an exit`);
  if (map.role !== "boss" && (map.exit === null || !isLegalFloor(map, map.exit))) errors.push(`${map.id}: exit is not on a legal tile`);
  if (map.exit && !hasRequiredRoute(map, map.entrance, map.exit)) errors.push(`${map.id}: entrance cannot reach exit without a locked door`);
  if (map.role === "boss" && map.bossSpawn && !hasRequiredRoute(map, map.entrance, map.bossSpawn)) {
    errors.push(`${map.id}: entrance cannot reach the boss without a locked door`);
  }

  const entities: Array<{ label: string; position: MapPoint }> = [
    ...map.playerEntryPositions.map((position, index) => ({ label: `player entry ${index}`, position })),
    ...map.enemySpawns.map((spawn) => ({ label: spawn.id, position: spawn.position })),
    ...map.itemCacheSpawns.map((spawn) => ({ label: spawn.id, position: spawn.position })),
    ...(map.bossSpawn ? [{ label: "boss", position: map.bossSpawn }] : []),
    ...map.minionSpawns.map((position, index) => ({ label: `minion marker ${index}`, position }))
  ];
  for (const entity of entities) {
    if (!isLegalFloor(map, entity.position)) errors.push(`${map.id}: ${entity.label} is not on a legal tile`);
  }
  for (const door of map.doors) {
    if (!isWithinBounds(map, door.position) || map.terrain[door.position.y]?.[door.position.x] === "#") {
      errors.push(`${map.id}: door ${door.id} is not on a floor tile`);
    }
  }
  for (const prop of map.props) {
    if (!isWithinBounds(map, prop.position) || map.terrain[prop.position.y]?.[prop.position.x] === "#") {
      errors.push(`${map.id}: prop ${prop.id} is not on a floor tile`);
    }
  }

  const occupied = new Map<string, string>();
  for (const entity of entities) {
    const key = pointKey(entity.position);
    const previous = occupied.get(key);
    if (previous) errors.push(`${map.id}: ${previous} and ${entity.label} overlap at ${key}`);
    occupied.set(key, entity.label);
  }

  if (map.role === "boss" && (!map.bossSpawn || map.minionSpawns.length < 2)) {
    errors.push(`${map.id}: boss maps need a boss marker and at least two minion markers`);
  }
  if (map.role !== "boss" && map.bossSpawn !== null) errors.push(`${map.id}: non-boss map has a boss marker`);
  return errors;
}

export function validateAllMapTemplates(): string[] {
  return SYSTEM_CRAWL_MAPS.flatMap(validateMapTemplate);
}

function hasRequiredRoute(map: SystemCrawlMapTemplate, start: MapPoint, goal: MapPoint): boolean {
  const queue: MapPoint[] = [start];
  const visited = new Set([pointKey(start)]);
  for (let cursor = 0; cursor < queue.length && cursor < map.width * map.height; cursor += 1) {
    const current = queue[cursor] as MapPoint;
    if (current.x === goal.x && current.y === goal.y) return true;
    for (const next of neighbors(current)) {
      const key = pointKey(next);
      if (visited.has(key) || !isLegalFloor(map, next)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return false;
}

function isLegalFloor(map: SystemCrawlMapTemplate, position: MapPoint): boolean {
  if (!isWithinBounds(map, position)) return false;
  if (map.terrain[position.y]?.[position.x] === "#") return false;
  if (map.doors.some((door) => door.locked && samePoint(door.position, position))) return false;
  return !map.props.some((prop) => prop.blocksMovement && samePoint(prop.position, position));
}

function isWithinBounds(map: SystemCrawlMapTemplate, position: MapPoint): boolean {
  return position.x >= 0 && position.x < map.width && position.y >= 0 && position.y < map.height;
}

function neighbors(position: MapPoint): MapPoint[] {
  return [point(position.x, position.y - 1), point(position.x - 1, position.y), point(position.x + 1, position.y), point(position.x, position.y + 1)];
}

function point(x: number, y: number): MapPoint {
  return { x, y };
}

function pointKey(position: MapPoint): string {
  return `${position.x},${position.y}`;
}

function samePoint(left: MapPoint, right: MapPoint): boolean {
  return left.x === right.x && left.y === right.y;
}
