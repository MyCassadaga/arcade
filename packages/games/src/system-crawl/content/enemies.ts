import type { EnemyDefinition, SystemCrawlEnemyId } from "../types";

export const ENEMY_DEFINITIONS: Readonly<Record<SystemCrawlEnemyId, EnemyDefinition>> = {
  "budget-reduction": enemy("budget-reduction", "Budget Reduction", 8, 2, 1, 2),
  "scope-creep": enemy("scope-creep", "Scope Creep", 4, 3, 1, 1),
  "system-requirement": enemy("system-requirement", "System Requirement", 4, 2, 4, 1),
  meeting: enemy("meeting", "Meeting", 3, 2, 2, 0),
  bug: enemy("bug", "Bug", 2, 3, 1, 1),
  "legacy-system": enemy("legacy-system", "The Legacy System", 14, 2, 1, 2)
};

function enemy(
  id: SystemCrawlEnemyId,
  displayName: string,
  maxHp: number,
  movement: number,
  attackRange: number,
  damage: number
): EnemyDefinition {
  return { id, displayName, maxHp, movement, attackRange, damage };
}
