import type { IncidentDefinition, SystemCrawlIncidentId, SystemCrawlIncidentModifierId } from "../types";

const standardMapWeights = (favored: readonly string[] = []): Readonly<Record<string, number>> => Object.fromEntries([
  "change-control", "legacy-services", "development-environment", "network-operations",
  "integration-bus", "data-warehouse", "vendor-portal", "the-cloud"
].map((id) => [id, favored.includes(id) ? 4 : 1]));

export const INCIDENT_DEFINITIONS: Readonly<Record<SystemCrawlIncidentId, IncidentDefinition>> = {
  "production-database-unavailable": incident(
    "production-database-unavailable", "P1: Production Database Unavailable",
    "The database has stopped responding, while leadership has become extremely responsive.",
    "Reach the Production Core and restore service.", "production-incident", "production-core", "Live-service instability", 3, "outage-velocity",
    [["Severity", "P1"], ["Users Impacted", "Everyone, apparently"], ["Root Cause", "Unknown"], ["Management Visibility", "Extremely High"]],
    ["data-warehouse", "network-operations"], { "unplanned-outage": 5, "scope-creep": 2 }
  ),
  "erp-modernization": incident(
    "erp-modernization", "ERP Modernization",
    "A strategic platform renewal has encountered several decades of undocumented strategic decisions.",
    "Reach the core platform before Technical Debt becomes unmanageable.", "legacy-system", "incident-command", "Legacy platform", 3, "forced-technical-debt",
    [["Budget", "Insufficient"], ["Timeline", "Q3"], ["Requirements", "TBD"], ["Executive Confidence", "High"]],
    ["legacy-services", "integration-bus"], { "technical-debt": 6, bug: 1 }
  ),
  "compliance-readiness-review": incident(
    "compliance-readiness-review", "Compliance Readiness Review",
    "The audit is routine, provided every missing artifact can be produced yesterday.",
    "Reach the Audit Vault and resolve all findings.", "audit", "audit-vault", "Control assurance", 3, "evidence-rooms",
    [["Evidence Requested", "All of it"], ["Due Date", "Yesterday"], ["Findings Expected", "None, officially"], ["Spreadsheet Status", "Final_v7_REAL"]],
    ["change-control", "data-warehouse"], { "system-requirement": 7, meeting: 2 }
  ),
  "enterprise-reorganization": incident(
    "enterprise-reorganization", "Enterprise Reorganization",
    "The org chart has been optimized into a shape no diagramming tool can render.",
    "Navigate the new organization and defeat The Reorg.", "reorg", "org-chart-nexus", "Organizational change", 3, "turn-order-rotation",
    [["Effective Date", "Immediately"], ["New Reporting Lines", "Pending"], ["Synergies", "Significant"], ["Roles Impacted", "Yours"]],
    ["service-desk", "the-cloud"], { meeting: 5, "stakeholder-feedback": 4 }
  ),
  "vendor-optimization-initiative": incident(
    "vendor-optimization-initiative", "Vendor Optimization Initiative",
    "A partner has arrived to transfer knowledge, starting with yours.",
    "Reach the Consulting Suite and recover control of the project.", "consultant", "consulting-suite", "External expertise", 3, "vendor-loot",
    [["Contract Value", "Confidential"], ["Deliverables", "In Discovery"], ["Change Requests", "Billable"], ["Knowledge Transfer", "Scheduled"]],
    ["vendor-portal", "integration-bus"], { "stakeholder-feedback": 5, "additional-request": 2 }
  ),
  "executive-dashboard-launch": incident(
    "executive-dashboard-launch", "Executive Dashboard Launch",
    "The dashboard is green. The systems supplying it have raised several objections.",
    "Reach the Executive Dashboard before every milestone turns red.", "executive-sponsor", "executive-dashboard", "Executive visibility", 1, "milestone-pressure",
    [["Data Quality", "Green"], ["Actual Data Quality", "Red"], ["Go-Live", "Friday"], ["Audience", "Leadership"]],
    ["data-warehouse", "the-cloud"], { "project-milestone": 6, "stakeholder-feedback": 3 }
  )
};

export const INCIDENT_IDS = Object.keys(INCIDENT_DEFINITIONS) as SystemCrawlIncidentId[];

function incident(
  id: SystemCrawlIncidentId,
  displayTitle: string,
  premise: string,
  objective: string,
  bossId: IncidentDefinition["bossId"],
  bossMapId: string,
  threatCategory: string,
  selectionWeight: number,
  modifierId: SystemCrawlIncidentModifierId | null,
  metadata: readonly (readonly [string, string])[],
  favoredMaps: readonly string[],
  enemyWeights: IncidentDefinition["enemyWeights"]
): IncidentDefinition {
  return {
    id, displayTitle, premise, objective, bossId, bossMapId, threatCategory, selectionWeight, modifierId,
    metadata: metadata.map(([label, value]) => ({ label, value })),
    mapWeights: standardMapWeights(favoredMaps),
    enemyWeights
  };
}
