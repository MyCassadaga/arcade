import type { Position } from "@team-arcade/games";

export const ISO_TILE_WIDTH = 56;
export const ISO_TILE_HEIGHT = 28;
export const ISO_CARD_SPACING = 548;
export const ISO_CARD_ORIGIN_X = 224;
export const ISO_CARD_ORIGIN_Y = 104;
export const ISO_BOARD_WIDTH = 2_230;
export const ISO_BOARD_HEIGHT = 430;

export interface ScreenPoint {
  x: number;
  y: number;
}

export function projectLogicalPosition(position: Position): ScreenPoint {
  const originX = ISO_CARD_ORIGIN_X + position.cardIndex * ISO_CARD_SPACING;
  return {
    x: originX + (position.x - position.y) * ISO_TILE_WIDTH / 2,
    y: ISO_CARD_ORIGIN_Y + (position.x + position.y) * ISO_TILE_HEIGHT / 2
  };
}

export function tileDiamondPoints(position: Position): string {
  const center = projectLogicalPosition(position);
  return diamondPoints(center, ISO_TILE_WIDTH, ISO_TILE_HEIGHT);
}

export function diamondPoints(center: ScreenPoint, width: number, height: number): string {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  return [
    `${center.x},${center.y - halfHeight}`,
    `${center.x + halfWidth},${center.y}`,
    `${center.x},${center.y + halfHeight}`,
    `${center.x - halfWidth},${center.y}`
  ].join(" ");
}

export function cardDiamondPoints(cardIndex: number): string {
  const top = projectLogicalPosition({ cardIndex, x: 0, y: 0 });
  const right = projectLogicalPosition({ cardIndex, x: 9, y: 0 });
  const bottom = projectLogicalPosition({ cardIndex, x: 9, y: 7 });
  const left = projectLogicalPosition({ cardIndex, x: 0, y: 7 });
  return `${top.x},${top.y - 8} ${right.x + 12},${right.y} ${bottom.x},${bottom.y + 12} ${left.x - 12},${left.y}`;
}

export function clampZoom(value: number): number {
  return Math.min(2.2, Math.max(0.62, value));
}
