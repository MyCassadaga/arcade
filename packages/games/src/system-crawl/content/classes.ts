import type { AbilityDefinition, ClassDefinition, SystemCrawlAbilityId, SystemCrawlClassId } from "../types";

export const CLASS_DEFINITIONS: Readonly<Record<SystemCrawlClassId, ClassDefinition>> = {
  "infrastructure-architect": {
    id: "infrastructure-architect",
    displayName: "Infrastructure Architect",
    maxHp: 14,
    movement: 3,
    abilityIds: ["packet-drop", "firewall", "load-balancer", "escalate"]
  },
  "senior-systems-analyst": {
    id: "senior-systems-analyst",
    displayName: "Senior Systems Analyst",
    maxHp: 10,
    movement: 4,
    abilityIds: ["requirements-clarification", "workaround", "process-improvement", "reboot-service"]
  },
  "application-developer": {
    id: "application-developer",
    displayName: "Application Developer",
    maxHp: 8,
    movement: 4,
    abilityIds: ["hotfix", "refactor", "deploy-to-production", "works-on-my-machine"]
  },
  "it-generalist": {
    id: "it-generalist",
    displayName: "IT Generalist",
    maxHp: 11,
    movement: 5,
    abilityIds: ["percussive-maintenance", "powershell", "google-it", "other-duties-as-assigned"]
  }
};

export const ABILITY_DEFINITIONS: Readonly<Record<SystemCrawlAbilityId, AbilityDefinition>> = {
  "packet-drop": ability("packet-drop", "Packet Drop", "infrastructure-architect", 1, "enemy", true),
  firewall: ability("firewall", "Firewall", "infrastructure-architect", 2, "character", false),
  "load-balancer": ability("load-balancer", "Load Balancer", "infrastructure-architect", 3, "special", false),
  escalate: ability("escalate", "Escalate", "infrastructure-architect", 4, "enemy", false),
  "requirements-clarification": ability("requirements-clarification", "Requirements Clarification", "senior-systems-analyst", 4, "enemy", true),
  workaround: ability("workaround", "Workaround", "senior-systems-analyst", 3, "character", false),
  "process-improvement": ability("process-improvement", "Process Improvement", "senior-systems-analyst", 3, "character", false),
  "reboot-service": ability("reboot-service", "Reboot Service", "senior-systems-analyst", 3, "character", false),
  hotfix: ability("hotfix", "Hotfix", "application-developer", 5, "enemy", true),
  refactor: ability("refactor", "Refactor", "application-developer", 3, "enemy", true),
  "deploy-to-production": ability("deploy-to-production", "Deploy to Production", "application-developer", 5, "enemy", true),
  "works-on-my-machine": ability("works-on-my-machine", "Works on My Machine", "application-developer", 0, "self", false),
  "percussive-maintenance": ability("percussive-maintenance", "Percussive Maintenance", "it-generalist", 1, "enemy", true),
  powershell: ability("powershell", "PowerShell", "it-generalist", 4, "enemy", true),
  "google-it": ability("google-it", "Google It", "it-generalist", 0, "self", false),
  "other-duties-as-assigned": ability("other-duties-as-assigned", "Other Duties as Assigned", "it-generalist", 0, "special", false)
};

function ability(
  id: SystemCrawlAbilityId,
  displayName: string,
  classId: SystemCrawlClassId,
  range: number,
  targetKind: AbilityDefinition["targetKind"],
  damaging: boolean
): AbilityDefinition {
  return { id, displayName, classId, range, targetKind, damaging };
}
