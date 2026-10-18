// Development/test fixtures; never imported by the player interface.
import { cellAt, GHOST_NODES, piecePorts } from "./index";
import type { GhostDirection, GhostLayout } from "@team-arcade/shared";
const prefix = "A1 B1 C1 D1 E1 F1 F2 F3 E3 D3 ";
export const GHOST_WITNESS_PATHS = {
  basic: prefix + "C3 B3 B4 B5 B6 A6",
  full: prefix + "C3 C4 C5 D5 E5 E6 D6 C6 B6 A6",
  detected: prefix + "C3 C2 B2 A2 A3 A4 A5 B5 B6 A6"
};
export function layoutForPath(path: string): GhostLayout {
  const cells = path.split(" ").map(cellAt);
  return cells.flatMap((cell, i) => {
    if (GHOST_NODES.some(n => n.cell === cell)) return [];
    const direction = (other: number): GhostDirection => other === cell - 6 ? "N" : other === cell + 6 ? "S" : other === cell + 1 ? "E" : "W";
    const ports = [direction(cells[i - 1]!), direction(cells[i + 1]!)];
    for (const kind of ["straight", "elbow"] as const) for (let rotation = 0; rotation < 4; rotation++) if (piecePorts(kind, rotation).every(p => ports.includes(p))) return [{ cell, kind, rotation }];
    throw Error(`No piece for ${cell}`);
  });
}
