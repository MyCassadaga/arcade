import { expect, it } from "vitest";
import type { GhostDirection, GhostRating } from "@team-arcade/shared";
import { cellAt, coordinate, getGhostContract, GHOST_CAMPAIGN, GHOST_CHAPTERS, LEGACY_GHOST_CONTRACT, simulateGhostCircuit, type GhostContract } from "./index";
import { CAMPAIGN_WITNESSES } from "./campaign-witnesses";
import { layoutForPath } from "./witnesses";

const directions: Record<GhostDirection, readonly [dx: number, dy: number]> = {
  N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0]
};
const opposite: Record<GhostDirection, GhostDirection> = { N: "S", S: "N", E: "W", W: "E" };
const portNames = Object.keys(directions) as GhostDirection[];

function routeStats(contract: GhostContract) {
  const nodes = new Map(contract.nodes.map(node => [node.cell, node]));
  const sockets = new Set(contract.sockets);
  const entry = contract.nodes.find(node => node.kind === "entry")!;
  const stats = {
    Basic: { count: 0, shortest: Infinity }, "Full Haul": { count: 0, shortest: Infinity },
    overspent: 0, detected: 0, routeCells: new Set<number>()
  };
  const path = [entry.cell];
  let visits = 0;

  // Fixed two-port nodes and a single courier make entry-to-exit routes simple.
  // Enumerate geometric paths independent of placements, then apply production
  // rules to each. Off-path filler and equivalent straight rotations add no routes.
  const search = (cell: number, arrival?: GhostDirection) => {
    if (++visits > 100_000) throw Error(`Route diagnostic bound exceeded for ${contract.id}`);
    const node = nodes.get(cell);
    if (node?.kind === "exit") {
      for (const pathCell of path) stats.routeCells.add(pathCell);
      const layout = layoutForPath(path.map(coordinate).join(" "), contract);
      const overspent = (["straight", "elbow"] as const).some(kind => layout.filter(piece => piece.kind === kind).length > contract.inventory[kind]);
      if (overspent) { stats.overspent++; return; }
      const result = simulateGhostCircuit(layout, contract);
      if (result.rating) {
        stats[result.rating].count++;
        stats[result.rating].shortest = Math.min(path.length, stats[result.rating].shortest);
      } else if (result.failure?.includes("Detected")) {
        stats.detected++;
      }
      return;
    }
    for (const out of node?.ports ?? portNames) {
      if (out === arrival) continue;
      const [dx, dy] = directions[out], x = cell % 6 + dx, y = Math.floor(cell / 6) + dy;
      if (x < 0 || x > 5 || y < 0 || y > 5) continue;
      const next = y * 6 + x, nextNode = nodes.get(next);
      if (path.includes(next) || (nextNode ? !nextNode.ports.includes(opposite[out]) : !sockets.has(next))) continue;
      path.push(next);
      search(next, opposite[out]);
      path.pop();
    }
  };
  search(entry.cell);
  return stats;
}

function signature(contract: GhostContract) {
  const signatures: string[] = [];
  const { routeCells } = routeStats(contract);
  for (const reflected of [false, true]) {
    for (let rotation = 0; rotation < 4; rotation++) {
      const transform = (x: number, y: number, extent: number) => {
        if (reflected) x = extent - x;
        for (let i = 0; i < rotation; i++) [x, y] = [extent - y, x];
        return [x, y];
      };
      const transformCell = (cell: number) => transform(cell % 6, Math.floor(cell / 6), 5).join("");
      const transformPort = (port: GhostDirection) => transform(...directions[port], 0).join(",");
      signatures.push([
        ...contract.nodes.map(node => `${transformCell(node.cell)}:${node.kind}:${node.ports.map(transformPort).sort().join("/")}`),
        ...contract.sockets.filter(cell => routeCells.has(cell)).map(cell => `${transformCell(cell)}:socket`)
      ].sort().join("|"));
    }
  }
  return signatures.sort()[0];
}

it("ships forty numbered contracts in chapter order and no rotated or reflected duplicates", () => {
  expect(GHOST_CAMPAIGN.map(item => item.number)).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  expect(GHOST_CAMPAIGN.map(item => item.chapter)).toEqual(GHOST_CHAPTERS.flatMap(chapter => Array.from({ length: 8 }, () => chapter)));
  expect(GHOST_CAMPAIGN.filter(item => item.tutorial).map(item => item.number)).toEqual([1, 2]);
  expect(GHOST_CAMPAIGN.map(item => item.id)).toEqual(CAMPAIGN_WITNESSES.map(item => item.contractId));
  expect(new Set([LEGACY_GHOST_CONTRACT, ...GHOST_CAMPAIGN].map(item => item.id)).size).toBe(41);
  expect(new Set([LEGACY_GHOST_CONTRACT, ...GHOST_CAMPAIGN].map(signature)).size).toBe(41);
});

it.each(CAMPAIGN_WITNESSES)("$contractId has legal, distinct witnesses and an explained false lead", ({ contractId, basic, full, trap, failure, design }) => {
  const contract = getGhostContract(contractId);
  const cells = [...contract.sockets, ...contract.nodes.map(node => node.cell)];
  expect(cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 36)).toBe(true);
  expect(new Set(cells).size).toBe(cells.length);
  for (const kind of ["entry", "vault", "exit"]) expect(contract.nodes.filter(node => node.kind === kind)).toHaveLength(1);
  for (const node of contract.nodes) {
    expect(node.ports).toHaveLength(node.kind === "entry" || node.kind === "exit" ? 1 : 2);
    expect(new Set(node.ports).size).toBe(node.ports.length);
    expect(node.ports.every(port => Object.hasOwn(directions, port))).toBe(true);
  }

  function ratedWitness(path: string, rating: GhostRating) {
    const layout = layoutForPath(path, contract), result = simulateGhostCircuit(layout, contract);
    expect(result.rating).toBe(rating);
    expect(result.events.filter(event => event.kind === "move").map(event => event.cell)).toEqual(path.split(" ").map(cellAt));
    return layout;
  }
  const basicLayout = ratedWitness(basic, "Basic");
  if (full) expect(ratedWitness(full, "Full Haul")).not.toEqual(basicLayout);
  else expect(contract.tutorial).toBe(true);
  expect(design.length).toBeGreaterThan(25);
  expect(trap).not.toBe(basic);
  expect(trap).not.toBe(full);
  const runTrap = () => simulateGhostCircuit(layoutForPath(trap, contract), contract);
  if (failure.startsWith("Only")) expect(runTrap).toThrow(failure);
  else expect(runTrap().failure).toContain(failure);

  const stats = routeStats(contract);
  if (!contract.tutorial) {
    // Catch an accidentally easy Basic exit as well as a shortcut to the full haul.
    // Thresholds are chapter design diagnostics, not a human difficulty measurement.
    const chapter = Math.floor((contract.number - 1) / 8);
    expect(stats.Basic.shortest).toBeGreaterThanOrEqual([8, 10, 11, 11, 13][chapter]!);
    expect(stats["Full Haul"].shortest).toBeGreaterThan(stats.Basic.shortest);
    expect(stats.overspent + stats.detected).toBeGreaterThan(0);
  }
});

it("opens with a real fork and closes with delayed security and supply decisions", () => {
  const opener = routeStats(getGhostContract("first-contact"));
  expect(opener).toMatchObject({ Basic: { shortest: 8 }, "Full Haul": { shortest: 8 }, overspent: 2 });

  const finale = getGhostContract("the-glass-vault");
  expect(routeStats(finale)).toMatchObject({ Basic: { count: 1, shortest: 23 }, "Full Haul": { count: 2, shortest: 25 } });
  const path = "C1 D1 E1 F1 F2 F3 F4 E4 D4 C4 C5 D5 E5 F5 F6 E6 D6 C6 B6 B5 B4 A4 A3 A2 B2";
  expect(() => simulateGhostCircuit(layoutForPath(path, finale), finale)).toThrow("Only 8 straight");
  const trap = CAMPAIGN_WITNESSES.at(-1)!.trap;
  const result = simulateGhostCircuit(layoutForPath(trap, finale), finale);
  expect(result.events.find(event => event.cell === cellAt("F6") && event.kind === "effect")).toMatchObject({ archive: false, disguise: true });
  expect(result.events.at(-1)).toMatchObject({ cell: cellAt("B5"), kind: "fail", archive: true, disguise: false });
});
