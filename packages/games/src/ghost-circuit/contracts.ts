import type { GhostDirection, GhostNode, GhostPiece } from "@team-arcade/shared";

export const coordinate = (cell: number) => `${"ABCDEF"[cell % 6]}${Math.floor(cell / 6) + 1}`;
export const cellAt = (name: string) => (Number(name.slice(1)) - 1) * 6 + "ABCDEF".indexOf(name[0]!);

export const GHOST_CHAPTERS = ["Entry Routes", "Borrowed Identity", "Tight Supply", "Crossed Wires", "Glass Vault"] as const;
export interface GhostContract {
  readonly id: string;
  readonly title: string;
  readonly chapter: typeof GHOST_CHAPTERS[number] | "Archive";
  readonly number: number;
  readonly contentVersion: number;
  readonly rulesVersion: 1;
  readonly tutorial: boolean;
  readonly brief: string;
  readonly guidance?: string;
  readonly nodes: readonly GhostNode[];
  readonly sockets: readonly number[];
  readonly inventory: Readonly<Record<GhostPiece["kind"], number>>;
}

const nodeKinds = { e: "entry", x: "exit", b: "badge", s: "scanner", v: "vault", c: "cache" } as const;
type ContractSource = Omit<GhostContract, "nodes" | "sockets" | "inventory" | "rulesVersion">;
function contract(source: ContractSource, nodes: string, sockets: string, straight: number, elbow: number): GhostContract {
  return {
    ...source,
    rulesVersion: 1,
    nodes: nodes.split(" ").map(token => ({
      cell: cellAt(token.slice(0, 2)),
      kind: nodeKinds[token[2] as keyof typeof nodeKinds],
      ports: [...token.slice(3)] as GhostDirection[]
    })),
    sockets: sockets.split(" ").map(cellAt),
    inventory: { straight, elbow }
  };
}

export const LEGACY_GHOST_CONTRACT = contract(
  { id: "borrowed-identity", title: "Borrowed Identity", chapter: "Archive", number: 0, contentVersion: 1, tutorial: false,
    brief: "Steal the archive. Find your way home.", guidance: "Badge before scanner. The vault removes your disguise." },
  "A1eE C1bWE E1sWE D3vWE B2sWE D5cWE A6xE",
  "B1 D1 F1 F2 F3 E3 C3 B3 B4 B5 B6 C4 C5 E5 E6 D6 C6 C2 A2 A3 A4 A5", 8, 8
);

// Authored boards use absolute coordinates. Each fixed-node token is
// coordinate, node kind (e/x/b/s/v/c), then its printed ports.
export const GHOST_CAMPAIGN: readonly GhostContract[] = [
  contract({ id: "first-contact", title: "First Contact", chapter: "Entry Routes", number: 1, contentVersion: 1, tutorial: true,
    brief: "The straight shot to the vault needs three straight cables. You have two.",
    guidance: "Try an elbow when the route changes direction. Rotate it until both ends meet." },
    "A3eE E3vWE D2cSW F3xW", "B2 C2 B3 C3 D3 C4 D4", 2, 4),
  contract({ id: "borrowed-pass", title: "Borrowed Pass", chapter: "Entry Routes", number: 2, contentVersion: 1, tutorial: true,
    brief: "Get a pass before you approach the checkpoint.", guidance: "The badge disguises you. The scanner checks you on its own tile." },
    "A2eE C2bWE E2sWE F4vNS F6xN", "B2 D2 F2 B3 C3 D3 F3 F5", 4, 5),
  contract({ id: "switchback-mail", title: "Switchback Mail", chapter: "Entry Routes", number: 3, contentVersion: 1, tutorial: false,
    brief: "Pull a lost message from the relay stacks." },
    "E5eE C1cEW B4vNE C3xN", "B1 D1 B2 C2 D2 B3 C4 D4 C5 D5 F5 D6 E6 F6", 6, 8),
  contract({ id: "lantern-loop", title: "Lantern Loop", chapter: "Entry Routes", number: 4, contentVersion: 1, tutorial: false,
    brief: "Follow the lower service lights to a misplaced archive." },
    "D6eW D5cNW C6vNE A2xE", "B1 C1 B2 C2 B3 C3 B4 C4 D4 C5", 4, 5),
  contract({ id: "antenna-row", title: "Antenna Row", chapter: "Entry Routes", number: 5, contentVersion: 1, tutorial: false,
    brief: "Recover the night broadcast from the rooftop relays." },
    "A2eN B1vSW D1cES F3xW", "A1 E1 B2 C2 D2 E2 B3 C3 D3 E3", 3, 5),
  contract({ id: "cold-storage", title: "Cold Storage", chapter: "Entry Routes", number: 6, contentVersion: 1, tutorial: false,
    brief: "Thaw the archive and decide whether to visit the upper backup bank." },
    "E6eW C1cEW C6vNE E1xW", "A1 B1 D1 A2 B2 D2 A3 B3 C3 D3 B4 B5 C5 D6", 4, 8),
  contract({ id: "the-side-door", title: "The Side Door", chapter: "Entry Routes", number: 7, contentVersion: 1, tutorial: false,
    brief: "Retrieve the archive through a row of shuttered terminals." },
    "D5eW B4cNE C5vNE F1xW", "C1 D1 E1 B2 C2 D2 E2 B3 C3 C4", 4, 5),
  contract({ id: "broken-causeway", title: "Broken Causeway", chapter: "Entry Routes", number: 8, contentVersion: 1, tutorial: false,
    brief: "Two banks of hardware leave only a few good ways across." },
    "F4eS B2vES C6cNE C2xW", "A3 B3 D3 E3 A4 B4 C4 D4 E4 C5 D5 E5 F5 D6", 3, 9),
  contract({ id: "false-green", title: "False Green", chapter: "Borrowed Identity", number: 9, contentVersion: 1, tutorial: false,
    brief: "The first checkpoint looks friendly. Save a plan for the second." },
    "F2eN D1vES E1sEW F1bSW B4cNE E5sSW C6xE", "C2 D2 B3 C3 D3 C4 D4 D5 D6 E6", 5, 6),
  contract({ id: "night-shift", title: "Night Shift", chapter: "Borrowed Identity", number: 10, contentVersion: 1, tutorial: false,
    brief: "Slip past the night guard and lift the shift archive." },
    "F1eS E2sES F2bNW C3cES E3vNW C5sNE D6xE", "D3 C4 D4 E4 F4 D5 E5 F5 E6 F6", 5, 5),
  contract({ id: "turnstile", title: "Turnstile", chapter: "Borrowed Identity", number: 11, contentVersion: 1, tutorial: false,
    brief: "A badge opens the turnstile, but the return leg has its own security." },
    "C2eE D2bSW B3vES D3sNW A6sNE C6cEW E6xN", "C3 A4 B4 C4 A5 B5 C5 D5 E5 B6 D6", 5, 8),
  contract({ id: "after-the-vault", title: "After the Vault", chapter: "Borrowed Identity", number: 12, contentVersion: 1, tutorial: false,
    brief: "The archive clears your disguise. Plot the rest of the trip before going in." },
    "A5eN D1cEW E3sNE A4bES C4sEW D5vNE C3xN", "C1 E1 F1 C2 D2 E2 F2 F3 B4 D4 F4 E5 F5 E6 F6", 6, 9),
  contract({ id: "second-identity", title: "Second Identity", chapter: "Borrowed Identity", number: 13, contentVersion: 1, tutorial: false,
    brief: "The badge can be more useful on the way out." },
    "C5eE E1sSW C4cNW E6vEW F6bNW C1xE", "D1 E2 F2 A3 B3 C3 D3 E3 F3 A4 B4 E4 F4 B5 D5 E5 F5 B6 C6 D6", 10, 7),
  contract({ id: "blind-corner", title: "Blind Corner", chapter: "Borrowed Identity", number: 14, contentVersion: 1, tutorial: false,
    brief: "Take an extra look at the scanner hidden on the return leg." },
    "A5eE A4vNE B4sSW C4sNE F4cNS B5bNW D6xN", "A1 B1 C1 D1 A2 C2 D2 A3 C3 D3 E3 F3 D4 D5 E5 F5", 7, 7),
  contract({ id: "staff-only", title: "Staff Only", chapter: "Borrowed Identity", number: 15, contentVersion: 1, tutorial: false,
    brief: "The staff pass gets you inside. Find a different way out." },
    "F2eS B3sES E3sES F3bNW C4cNW E4vNS C1xS", "C2 D2 C3 D3 B4 D4 B5 C5 D5 E5 C6 D6 E6", 5, 9),
  contract({ id: "last-checkpoint", title: "Last Checkpoint", chapter: "Borrowed Identity", number: 16, contentVersion: 1, tutorial: false,
    brief: "Recover the outgoing manifest before the final security sweep." },
    "A2eE B2bSW E3sNW B4sNS A6cNE D6vNW F1xW", "D1 E1 D2 E2 B3 C3 D3 D4 A5 B5 C5 D5 B6 C6", 8, 7),
  contract({ id: "short-rations", title: "Short Rations", chapter: "Tight Supply", number: 17, contentVersion: 1, tutorial: false,
    brief: "Carry the dispatch out with a tightly packed cable kit." },
    "B1eS A2vES E4cES E6xE", "B2 A3 A4 B4 C4 D4 F4 B5 C5 D5 E5 F5 F6", 4, 7),
  contract({ id: "bent-out-of-shape", title: "Bent Out of Shape", chapter: "Tight Supply", number: 18, contentVersion: 1, tutorial: false,
    brief: "Save enough corners for the long run to the exit." },
    "F2eN C2vSW E4cSW A1xS", "D1 E1 F1 A2 B2 D2 E2 C3 D3 B4 C4 D4 B5 C5 D5 E5 B6 C6 D6 E6", 7, 8),
  contract({ id: "last-elbow", title: "Last Elbow", chapter: "Tight Supply", number: 19, contentVersion: 1, tutorial: false,
    brief: "A narrow east-side loop holds a forgotten backup." },
    "A2eS C4vNS F4cNS E1xS", "D2 E2 A3 B3 C3 D3 E3 F3 B4 B5 C5 D5 E5 F5 C6 D6", 4, 8),
  contract({ id: "no-spares", title: "No Spares", chapter: "Tight Supply", number: 20, contentVersion: 1, tutorial: false,
    brief: "The bottom cache looks close. Count the approach as well as the exit." },
    "B1eW F5vNS C6cEW F6xN", "A1 A2 A3 B3 C3 E3 F3 A4 C4 D4 E4 F4 A5 B5 D5 B6 D6", 5, 7),
  contract({ id: "relay-debt", title: "Relay Debt", chapter: "Tight Supply", number: 21, contentVersion: 1, tutorial: false,
    brief: "Each bend you spend on the way in is one fewer for the way back." },
    "A1eS F2cSW C3vNW E6xN", "B1 C1 D1 A2 B2 C2 D2 E2 B3 E3 F3 B4 C4 D4 E4 F4 D5 E5", 2, 10),
  contract({ id: "thin-copper", title: "Thin Copper", chapter: "Tight Supply", number: 22, contentVersion: 1, tutorial: false,
    brief: "The eastern backup line trades distance for scarce cable shapes." },
    "A2eE E2cNS E5vES B5xS", "E1 F1 B2 F2 B3 D3 E3 F3 B4 C4 D4 E4 F4 D5 F5 B6 C6 D6 E6", 7, 10),
  contract({ id: "inventory-audit", title: "Inventory Audit", chapter: "Tight Supply", number: 23, contentVersion: 1, tutorial: false,
    brief: "Get out with the audit record. The cache changes how you spend the kit." },
    "F2eW A3vNS C5cNW B1xW", "A1 D1 E1 A2 C2 D2 E2 B3 C3 D3 A4 B4 C4 B5", 3, 7),
  contract({ id: "three-way-split", title: "Three-Way Split", chapter: "Tight Supply", number: 24, contentVersion: 1, tutorial: false,
    brief: "The middle looks open until you account for the last few bends." },
    "A4eN C3cNE B6vNE D1xS", "A1 B1 A2 B2 C2 D2 A3 B3 D3 B4 D4 B5 C5 D5 C6", 7, 8),
  contract({ id: "pressure-door", title: "Pressure Door", chapter: "Crossed Wires", number: 25, contentVersion: 1, tutorial: false,
    brief: "The vault sits beside a scanner. Its open port is a poor guarantee." },
    "C4eE C2sNS D4bSW A5cNS C5vEW D5sNW D1xW", "A1 B1 C1 A2 A3 B3 C3 A4 B4 B5 A6 B6", 5, 4),
  contract({ id: "twin-dispatch", title: "Twin Dispatch", chapter: "Crossed Wires", number: 26, contentVersion: 1, tutorial: false,
    brief: "Recover both halves of a split dispatch from opposite banks." },
    "E3eW B1cES D4vEW B5cNE F6xN", "C1 D1 B2 C2 D2 A3 B3 D3 A4 B4 C4 E4 F4 C5 F5", 7, 7),
  contract({ id: "north-by-east", title: "North by East", chapter: "Crossed Wires", number: 27, contentVersion: 1, tutorial: false,
    brief: "Plan the approach to the eastern backup and the return to the top edge." },
    "A3eN B1vEW F4cNS D1xE", "A1 C1 E1 F1 A2 C2 D2 F2 D3 E3 F3 D4 E4 D5 E5 F5", 7, 9),
  contract({ id: "two-locks", title: "Two Locks", chapter: "Crossed Wires", number: 28, contentVersion: 1, tutorial: false,
    brief: "The two backups sit together, with security waiting on their exits." },
    "E6eW A2sES D2vEW E2sSW F3cSW F4cNW D6bNE C4xW", "B2 C2 A3 B3 C3 D3 E3 A4 B4 D4 E4 D5 E5", 4, 6),
  contract({ id: "long-way-home", title: "Long Way Home", chapter: "Crossed Wires", number: 29, contentVersion: 1, tutorial: false,
    brief: "Read the approach to the vault before threading the long route home." },
    "D4eW B3cNE D5vSW A1xE", "B1 C1 B2 C2 D2 E2 F2 C3 D3 F3 C4 F4 C5 F5 D6 E6 F6", 7, 8),
  contract({ id: "paired-signals", title: "Paired Signals", chapter: "Crossed Wires", number: 30, contentVersion: 1, tutorial: false,
    brief: "The two caches face different ways. A route through one may cut off the other." },
    "D2eS C2vNW A3cES D4cNE B5xN", "C1 D1 E1 F1 B2 E2 F2 B3 D3 E3 A4 B4 E4", 4, 7),
  contract({ id: "security-weave", title: "Security Weave", chapter: "Crossed Wires", number: 31, contentVersion: 1, tutorial: false,
    brief: "Weave between two checkpoints while keeping a valid approach to the vault." },
    "A6eN E1vSW B3sNS D3sNE A5bES B6cNE D4xE", "B1 C1 D1 B2 C2 D2 E2 E3 B4 C4 E4 B5 C5 C6", 4, 8),
  contract({ id: "split-horizon", title: "Split Horizon", chapter: "Crossed Wires", number: 32, contentVersion: 1, tutorial: false,
    brief: "Both eastern backups fit on one route, but only from the right approach." },
    "A1eS C3vEW F3cSW F4cNS B6xW", "C1 D1 A2 B2 C2 D2 E2 B3 D3 E3 A4 B4 D4 A5 B5 D5 E5 F5 A6 D6 E6 F6", 6, 12),
  contract({ id: "mirror-district", title: "Mirror District", chapter: "Glass Vault", number: 33, contentVersion: 1, tutorial: false,
    brief: "Lift the district archive and recover the paired records through the security net." },
    "A5eE D1bEW F3sSW F4vNS C5cNS C6cNW F6sNW D4xS", "B1 C1 E1 B2 C2 E2 B3 E3 B4 C4 B5 D5 E5 F5 B6 D6 E6", 5, 10),
  contract({ id: "two-way-toll", title: "Two-Way Toll", chapter: "Glass Vault", number: 34, contentVersion: 1, tutorial: false,
    brief: "The closest scanner is easy to enter. Getting past it after the vault is harder." },
    "D4eS B2vES E2cNS C3sES E3cNW B4sNW C4bNS A5xN", "C1 D1 E1 C2 D2 A3 B3 D3 A4 C5 D5 C6 D6", 4, 8),
  contract({ id: "the-last-train", title: "The Last Train", chapter: "Glass Vault", number: 35, contentVersion: 1, tutorial: false,
    brief: "Use the cross-town relays to reach the vault and catch the final exit." },
    "F3eN D1vEW E1sSW C2cNW F2bSW A5sNE C6cNW D6xE", "A1 B1 C1 A2 B2 E2 A3 A4 B4 C4 D4 E4 B5 C5 E5 B6 E6", 8, 9),
  contract({ id: "downstream", title: "Downstream", chapter: "Glass Vault", number: 36, contentVersion: 1, tutorial: false,
    brief: "The cable budget tightens as the route moves from one security zone to the next." },
    "D5eE C1sES D3cNW F3vNS F4sNS E5bEW A6cNE A4xE", "D1 E1 F1 C2 D2 E2 F2 C3 B4 C4 A5 B5 C5 F5 B6 C6", 4, 10),
  contract({ id: "badge-on-the-way-out", title: "Badge on the Way Out", chapter: "Glass Vault", number: 37, contentVersion: 1, tutorial: false,
    brief: "Time the disguise for the scanner on the way back." },
    "C3eE D1cES E1cSW B2vES C2bEW C6sEW B6xE", "D2 E2 A3 B3 D3 E3 F3 A4 B4 C4 D4 F4 C5 D5 E5 F5 D6 E6 F6", 7, 11),
  contract({ id: "deep-archive", title: "Deep Archive", chapter: "Glass Vault", number: 38, contentVersion: 1, tutorial: false,
    brief: "The archive sits behind the lower checkpoint. Route for the whole haul before laying cable." },
    "A5eE A1sES D3cSW C5bSW C6sNE D6vEW F6cNW F3xN", "B1 C1 D1 E1 A2 B2 E2 F2 A3 B3 C3 C4 D4 E4 B5 E5 F5 E6", 6, 11),
  contract({ id: "glass-antechamber", title: "Glass Antechamber", chapter: "Glass Vault", number: 39, contentVersion: 1, tutorial: false,
    brief: "Two backups crowd the center of the board. Leave enough wire to get out." },
    "F6eW C1sSW B4cES C4cSW A5vNS A6sNE D6bEW D4xN", "A1 B1 A2 B2 C2 D2 A3 C3 D3 A4 B5 C5 B6 C6 E6", 8, 8),
  contract({ id: "the-glass-vault", title: "The Glass Vault", chapter: "Glass Vault", number: 40, contentVersion: 1, tutorial: false,
    brief: "Bring home the city archive and its two missing fragments." },
    "C1eE F3cNS C4vES F6bNW B5sSN A3cSN B2xW A5sEW",
    "A1 D1 E1 F1 A2 C2 D2 E2 F2 B3 E3 A4 B4 D4 E4 F4 C5 D5 E5 F5 A6 B6 C6 D6 E6", 8, 10)
];

const contracts = new Map([...GHOST_CAMPAIGN, LEGACY_GHOST_CONTRACT].map(contract => [contract.id, contract]));
export function getGhostContract(id: string): GhostContract {
  const contract = contracts.get(id);
  if (!contract) throw new Error(`Unknown Ghost Circuit contract: ${id}`);
  return contract;
}
export function findGhostContract(id: string): GhostContract | undefined {
  return contracts.get(id);
}
