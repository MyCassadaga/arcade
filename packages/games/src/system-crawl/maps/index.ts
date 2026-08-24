import type { MapPoint, MapRole, SystemCrawlMapTemplate } from "../types";

const ENTRY_POSITIONS = [point(1, 2), point(1, 3), point(1, 4), point(2, 3)] as const;
const REGULAR_CHOICES = [
  "budget-reduction", "scope-creep", "system-requirement", "meeting", "project-milestone",
  "unplanned-outage", "technical-debt", "stakeholder-feedback"
] as const;

const layouts = {
  accessLayer: ["#########", "#.......#", "#..#....#", "E.......X", "#....#..#", "#.......#", "#########"],
  helpDesk: ["#########", "#.......#", "#....#..#", "E.......X", "#..#....#", "#.......#", "#########"],
  securityGateway: ["#########", "#.......#", "#.#...#.#", "E.......X", "#...#...#", "#.......#", "#########"],
  serviceDesk: ["#########", "#.......#", "#...#...#", "E.......X", "#.#...#.#", "#.......#", "#########"],
  changeControl: ["#########", "#.......#", "#...#...#", "E.......X", "#...#...#", "#.......#", "#########"],
  legacyServices: ["#########", "#.......#", "#.#...#.#", "E.......X", "#.......#", "#..#....#", "#########"],
  developmentEnvironment: ["#########", "#.......#", "#..#.#..#", "E.......X", "#.#.....#", "#.......#", "#########"],
  networkOperations: ["#########", "#.......#", "#.#.#...#", "E.......X", "#....#..#", "#.......#", "#########"],
  integrationBus: ["#########", "#.......#", "#...#.#.#", "E.......X", "#..#....#", "#.......#", "#########"],
  dataWarehouse: ["#########", "#.......#", "#.#..#..#", "E.......X", "#.....#.#", "#..#....#", "#########"],
  vendorPortal: ["#########", "#.......#", "#..#..#.#", "E.......X", "#.#..#..#", "#.......#", "#########"],
  theCloud: ["#########", "#.......#", "#.##....#", "E.......X", "#...#.#.#", "#.......#", "#########"],
  productionCore: ["#########", "#.......#", "#.#...#.#", "E........", "#.#...#.#", "#.......#", "#########"],
  auditVault: ["#########", "#.......#", "#...#...#", "E........", "#...#...#", "#.......#", "#########"],
  orgChartNexus: ["#########", "#.......#", "#..#.#..#", "E........", "#.#...#.#", "#.......#", "#########"],
  incidentCommand: ["#########", "#.......#", "#.#.#.#.#", "E........", "#..#.#..#", "#.......#", "#########"],
  consultingSuite: ["#########", "#.......#", "#..#....#", "E........", "#....#..#", "#.#.....#", "#########"],
  executiveDashboard: ["#########", "#.......#", "#....#..#", "E........", "#..#....#", "#..#....#", "#########"]
} as const;

export const SYSTEM_CRAWL_MAPS: readonly SystemCrawlMapTemplate[] = [
  authored("access-layer", "Access Layer", "entry", layouts.accessLayer, "network-switch", "raised-floor", "cool-gray", "cyan", "networking"),
  authored("help-desk", "Help Desk", "entry", layouts.helpDesk, "cubicle", "office-carpet", "beige", "orange", "support-desks"),
  authored("security-gateway", "Security Gateway", "entry", layouts.securityGateway, "badge-reader", "slate-tile", "graphite", "red", "security"),
  authored("service-desk", "Service Desk", "entry", layouts.serviceDesk, "ticket-kiosk", "blue-carpet", "navy", "lime", "service-desk"),
  authored("change-control", "Change Control", "standard", layouts.changeControl, "approval-table", "tile", "charcoal", "yellow", "approval-workflow"),
  authored("legacy-services", "Legacy Services", "standard", layouts.legacyServices, "mainframe", "linoleum", "olive", "amber", "vintage-computing", true),
  authored("development-environment", "Development Environment", "standard", layouts.developmentEnvironment, "whiteboard", "concrete", "white", "magenta", "workstations"),
  authored("network-operations", "Network Operations", "standard", layouts.networkOperations, "display-wall", "dark-raised-floor", "navy", "green", "monitoring"),
  authored("integration-bus", "Integration Bus", "standard", layouts.integrationBus, "message-broker", "rubber-tile", "steel", "purple", "integration"),
  authored("data-warehouse", "Data Warehouse", "standard", layouts.dataWarehouse, "storage-array", "sealed-floor", "blue-gray", "teal", "data-platform", true),
  authored("vendor-portal", "Vendor Portal", "standard", layouts.vendorPortal, "contract-desk", "hotel-carpet", "cream", "gold", "vendor-suite"),
  authored("the-cloud", "The Cloud", "standard", layouts.theCloud, "cloud-console", "glass-floor", "midnight", "sky", "cloud-platform", true),
  authored("production-core", "Production Core", "boss", layouts.productionCore, "server-rack", "sealed-concrete", "black", "red", "production-racks"),
  authored("audit-vault", "Audit Vault", "boss", layouts.auditVault, "evidence-cabinet", "stone-tile", "gray", "gold", "records-vault"),
  authored("org-chart-nexus", "Org Chart Nexus", "boss", layouts.orgChartNexus, "org-chart", "executive-carpet", "plum", "pink", "reporting-lines"),
  authored("incident-command", "Incident Command", "boss", layouts.incidentCommand, "war-room-table", "dark-carpet", "charcoal", "orange", "incident-response"),
  authored("consulting-suite", "Consulting Suite", "boss", layouts.consultingSuite, "slide-screen", "premium-carpet", "cream", "violet", "consulting"),
  authored("executive-dashboard", "Executive Dashboard", "boss", layouts.executiveDashboard, "dashboard-wall", "marble", "black", "cyan", "executive-analytics")
] as const;

export const SYSTEM_CRAWL_MAPS_BY_ID: Readonly<Record<string, SystemCrawlMapTemplate>> = Object.fromEntries(
  SYSTEM_CRAWL_MAPS.map((map) => [map.id, map])
);
export const ENTRY_MAPS = SYSTEM_CRAWL_MAPS.filter((map) => map.role === "entry");
export const STANDARD_MAPS = SYSTEM_CRAWL_MAPS.filter((map) => map.role === "standard");
export const BOSS_MAPS = SYSTEM_CRAWL_MAPS.filter((map) => map.role === "boss");

function authored(
  id: string,
  displayName: string,
  role: MapRole,
  terrain: readonly string[],
  propKind: string,
  floor: string,
  walls: string,
  accent: string,
  props: string,
  secondCache = false
): SystemCrawlMapTemplate {
  const boss = role === "boss";
  const enemyPoints = role === "standard"
    ? [point(4, 1), point(6, 1), point(5, 5), point(7, 5), point(1, 5)]
    : role === "entry" ? [point(5, 1), point(6, 5)] : [];
  return {
    id, displayName, role, width: 9, height: 7, terrain,
    entrance: point(0, 3),
    exit: boss ? null : point(8, 3),
    playerEntryPositions: ENTRY_POSITIONS,
    enemySpawns: enemyPoints.map((position, index) => ({ id: `${id}-enemy-${index + 1}`, position, choices: REGULAR_CHOICES })),
    bossSpawn: boss ? point(7, 3) : null,
    minionSpawns: boss ? [point(4, 1), point(6, 1), point(1, 5), point(4, 5)] : [],
    itemCacheSpawns: [
      { id: `${id}-cache-1`, position: point(7, 2) },
      ...(secondCache ? [{ id: `${id}-cache-2`, position: point(7, 1) }] : [])
    ],
    doors: [{ id: `${id}-optional-door`, position: point(role === "entry" ? 7 : 1, 1), locked: true }],
    props: [{ id: `${id}-prop`, kind: propKind, position: point(3, 1), blocksMovement: true, blocksLineOfSight: true }],
    visualTheme: { floor, walls, accent, props }
  };
}

function point(x: number, y: number): MapPoint {
  return { x, y };
}
