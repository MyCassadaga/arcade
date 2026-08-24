import type { EnemyDefinition, SystemCrawlEnemyId } from "../types";

export const ENEMY_DEFINITIONS: Readonly<Record<SystemCrawlEnemyId, EnemyDefinition>> = {
  "budget-reduction": enemy("budget-reduction", "Budget Reduction", 8, 2, 1, 2),
  "scope-creep": enemy("scope-creep", "Scope Creep", 4, 3, 1, 1),
  "system-requirement": enemy("system-requirement", "System Requirement", 4, 2, 4, 1),
  meeting: enemy("meeting", "Meeting", 3, 2, 2, 0),
  "project-milestone": enemy("project-milestone", "Project Milestone", 5, 4, 1, 1),
  "unplanned-outage": enemy("unplanned-outage", "Unplanned Outage", 3, 6, 1, 2),
  "technical-debt": enemy("technical-debt", "Technical Debt", 5, 2, 1, 1),
  "stakeholder-feedback": enemy("stakeholder-feedback", "Stakeholder Feedback", 4, 3, 3, 1),
  "additional-request": enemy("additional-request", "Additional Request", 1, 3, 1, 1, "minion"),
  bug: enemy("bug", "Bug", 2, 3, 1, 1, "minion"),
  finding: enemy("finding", "Finding", 2, 0, 3, 1, "minion"),
  "legacy-system": enemy("legacy-system", "The Legacy System", 14, 2, 1, 2, "boss"),
  audit: enemy("audit", "The Audit", 14, 2, 4, 2, "boss"),
  reorg: enemy("reorg", "The Reorg", 15, 3, 1, 2, "boss"),
  "production-incident": enemy("production-incident", "Production Incident", 14, 3, 3, 2, "boss"),
  consultant: enemy("consultant", "The Consultant", 15, 4, 4, 2, "boss"),
  "executive-sponsor": enemy("executive-sponsor", "Executive Sponsor", 18, 2, 5, 2, "boss")
};

function enemy(
  id: SystemCrawlEnemyId,
  displayName: string,
  maxHp: number,
  movement: number,
  attackRange: number,
  damage: number,
  kind: EnemyDefinition["kind"] = "regular"
): EnemyDefinition {
  return { id, displayName, maxHp, movement, attackRange, damage, kind };
}
