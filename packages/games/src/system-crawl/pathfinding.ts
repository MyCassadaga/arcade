import { SYSTEM_CRAWL_MAPS_BY_ID } from "./maps";
import type { Position, SystemCrawlMapTemplate, SystemCrawlState } from "./types";

const MAX_TILES = 4 * 9 * 7;

export interface PathfindingOptions {
  ignoreCharacterId?: string;
  ignoreEnemyId?: string;
  allowOccupiedDestination?: boolean;
  maximumDistance?: number;
}

export function samePosition(left: Position, right: Position): boolean {
  return left.cardIndex === right.cardIndex && left.x === right.x && left.y === right.y;
}

export function positionKey(position: Position): string {
  return `${position.cardIndex}:${position.x},${position.y}`;
}

export function isCardinallyAdjacent(state: SystemCrawlState, left: Position, right: Position): boolean {
  return getAdjacentPositions(state, left).some((position) => samePosition(position, right));
}

export function manhattanDistance(left: Position, right: Position): number {
  const leftX = left.cardIndex * 9 + left.x;
  const rightX = right.cardIndex * 9 + right.x;
  return Math.abs(leftX - rightX) + Math.abs(left.y - right.y);
}

export function getAdjacentPositions(state: SystemCrawlState, position: Position): Position[] {
  const adjacent: Position[] = [];
  const candidates = [
    { ...position, y: position.y - 1 },
    { ...position, x: position.x - 1 },
    { ...position, x: position.x + 1 },
    { ...position, y: position.y + 1 }
  ];
  for (const candidate of candidates) if (isPositionOnRevealedMap(state, candidate)) adjacent.push(candidate);

  const currentTemplate = getTemplate(state, position.cardIndex);
  if (currentTemplate?.exit && sameLocalPoint(position, currentTemplate.exit)) {
    const nextTemplate = getTemplate(state, position.cardIndex + 1);
    const nextCard = state.maps[position.cardIndex + 1];
    if (nextTemplate && nextCard?.revealed) adjacent.push({ cardIndex: position.cardIndex + 1, ...nextTemplate.entrance });
  }
  if (sameLocalPoint(position, currentTemplate?.entrance)) {
    const previousTemplate = getTemplate(state, position.cardIndex - 1);
    const previousCard = state.maps[position.cardIndex - 1];
    if (previousTemplate?.exit && previousCard?.revealed) adjacent.push({ cardIndex: position.cardIndex - 1, ...previousTemplate.exit });
  }
  return dedupePositions(adjacent);
}

export function isTerrainBlocked(state: SystemCrawlState, position: Position): boolean {
  const template = getTemplate(state, position.cardIndex);
  const card = state.maps[position.cardIndex];
  if (!template || !card?.revealed || !isWithinTemplate(template, position)) return true;
  if (template.terrain[position.y]?.[position.x] === "#") return true;
  if (template.props.some((prop) => prop.blocksMovement && sameLocalPoint(position, prop.position))) return true;
  return card.doors.some((door) => !door.open && samePosition(door.position, position));
}

export function isPositionBlocked(state: SystemCrawlState, position: Position, options: PathfindingOptions = {}): boolean {
  if (isTerrainBlocked(state, position)) return true;
  const occupiedByCharacter = Object.values(state.characters).some(
    (character) => character.id !== options.ignoreCharacterId && samePosition(character.position, position)
  );
  if (occupiedByCharacter) return true;
  return Object.values(state.enemies).some(
    (enemy) => enemy.hp > 0 && enemy.id !== options.ignoreEnemyId && samePosition(enemy.position, position)
  );
}

export function canonicalShortestPath(
  state: SystemCrawlState,
  start: Position,
  destination: Position,
  options: PathfindingOptions = {}
): Position[] | null {
  if (!isPositionOnRevealedMap(state, start) || !isPositionOnRevealedMap(state, destination)) return null;
  const destinationBlocked = isPositionBlocked(state, destination, options);
  if (destinationBlocked && !options.allowOccupiedDestination) return null;
  const startKey = positionKey(start);
  const destinationKey = positionKey(destination);
  const queue: Position[] = [start];
  const previous: Record<string, string | null> = { [startKey]: null };
  const positions: Record<string, Position> = { [startKey]: start };
  const maximumDistance = options.maximumDistance ?? MAX_TILES;

  for (let cursor = 0; cursor < queue.length && cursor < MAX_TILES; cursor += 1) {
    const current = queue[cursor] as Position;
    const currentKey = positionKey(current);
    if (currentKey === destinationKey) return reconstructPath(previous, positions, destinationKey);
    const currentDistance = reconstructDistance(previous, currentKey);
    if (currentDistance >= maximumDistance) continue;
    for (const neighbor of getAdjacentPositions(state, current)) {
      const key = positionKey(neighbor);
      if (Object.hasOwn(previous, key)) continue;
      const isDestination = key === destinationKey;
      if (isPositionBlocked(state, neighbor, options) && !(isDestination && options.allowOccupiedDestination)) continue;
      previous[key] = currentKey;
      positions[key] = neighbor;
      queue.push(neighbor);
    }
  }
  return null;
}

export function reachableMovementTiles(
  state: SystemCrawlState,
  start: Position,
  allowance: number,
  options: PathfindingOptions = {}
): Position[] {
  const queue: Array<{ position: Position; distance: number }> = [{ position: start, distance: 0 }];
  const visited = new Set([positionKey(start)]);
  const reachable: Position[] = [];
  for (let cursor = 0; cursor < queue.length && cursor < MAX_TILES; cursor += 1) {
    const current = queue[cursor] as { position: Position; distance: number };
    if (current.distance >= allowance) continue;
    for (const neighbor of getAdjacentPositions(state, current.position)) {
      const key = positionKey(neighbor);
      if (visited.has(key) || isPositionBlocked(state, neighbor, options)) continue;
      visited.add(key);
      reachable.push(neighbor);
      queue.push({ position: neighbor, distance: current.distance + 1 });
    }
  }
  return reachable;
}

export function hasLineOfSight(state: SystemCrawlState, start: Position, end: Position): boolean {
  if (!isPositionOnRevealedMap(state, start) || !isPositionOnRevealedMap(state, end)) return false;
  const line = supercoverLine(toGlobal(start), toGlobal(end));
  for (let index = 1; index < line.length - 1; index += 1) {
    const position = fromGlobal(line[index] as { x: number; y: number });
    if (blocksLineOfSight(state, position)) return false;
  }
  return true;
}

export function isPositionOnRevealedMap(state: SystemCrawlState, position: Position): boolean {
  const template = getTemplate(state, position.cardIndex);
  return Boolean(template && state.maps[position.cardIndex]?.revealed && isWithinTemplate(template, position));
}

function blocksLineOfSight(state: SystemCrawlState, position: Position): boolean {
  const template = getTemplate(state, position.cardIndex);
  const card = state.maps[position.cardIndex];
  if (!template || !card?.revealed || !isWithinTemplate(template, position)) return true;
  if (template.terrain[position.y]?.[position.x] === "#") return true;
  if (template.props.some((prop) => prop.blocksLineOfSight && sameLocalPoint(position, prop.position))) return true;
  return card.doors.some((door) => !door.open && samePosition(door.position, position));
}

function getTemplate(state: SystemCrawlState, cardIndex: number): SystemCrawlMapTemplate | undefined {
  const map = state.maps[cardIndex];
  return map ? SYSTEM_CRAWL_MAPS_BY_ID[map.templateId] : undefined;
}

function isWithinTemplate(template: SystemCrawlMapTemplate, position: Position): boolean {
  return position.x >= 0 && position.x < template.width && position.y >= 0 && position.y < template.height;
}

function sameLocalPoint(position: Position, point: { x: number; y: number } | null | undefined): boolean {
  return Boolean(point && position.x === point.x && position.y === point.y);
}

function reconstructPath(previous: Record<string, string | null>, positions: Record<string, Position>, destinationKey: string): Position[] {
  const reverse: Position[] = [];
  let key: string | null = destinationKey;
  while (key !== null) {
    reverse.push(positions[key] as Position);
    key = previous[key] ?? null;
  }
  return reverse.reverse();
}

function reconstructDistance(previous: Record<string, string | null>, key: string): number {
  let distance = 0;
  let cursor = previous[key] ?? null;
  while (cursor !== null && distance <= MAX_TILES) {
    distance += 1;
    cursor = previous[cursor] ?? null;
  }
  return distance;
}

function dedupePositions(positions: Position[]): Position[] {
  const seen = new Set<string>();
  return positions.filter((position) => {
    const key = positionKey(position);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toGlobal(position: Position): { x: number; y: number } {
  return { x: position.cardIndex * 9 + position.x, y: position.y };
}

function fromGlobal(position: { x: number; y: number }): Position {
  return { cardIndex: Math.floor(position.x / 9), x: position.x % 9, y: position.y };
}

function supercoverLine(start: { x: number; y: number }, end: { x: number; y: number }): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const signX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
  const signY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
  let x = start.x;
  let y = start.y;
  let ix = 0;
  let iy = 0;
  points.push({ x, y });
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      if (signX !== 0) points.push({ x: x + signX, y });
      if (signY !== 0) points.push({ x, y: y + signY });
      x += signX;
      y += signY;
      ix += 1;
      iy += 1;
    } else if (decision < 0) {
      x += signX;
      ix += 1;
    } else {
      y += signY;
      iy += 1;
    }
    points.push({ x, y });
  }
  return points;
}
