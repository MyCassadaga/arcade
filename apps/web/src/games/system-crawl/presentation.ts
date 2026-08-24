import type { SystemCrawlAbilityId, SystemCrawlEvent, SystemCrawlItemId } from "@team-arcade/games";

export const ABILITY_PRESENTATION: Record<SystemCrawlAbilityId, { description: string; impact: string }> = {
  "packet-drop": { description: "Drop a hostile packet at close range.", impact: "2 damage" },
  firewall: { description: "Wrap an ally in a temporary traffic shield.", impact: "3 shield" },
  "load-balancer": { description: "Reroute an ally one or two legal tiles.", impact: "Forced move" },
  escalate: { description: "Make a hostile process prioritize you.", impact: "Taunt" },
  "requirements-clarification": { description: "Trim ambiguity and slow the target process.", impact: "1 damage + slow" },
  workaround: { description: "Apply a practical fix to a nearby teammate.", impact: "Heal 3" },
  "process-improvement": { description: "Prepare an ally for a faster next turn.", impact: "+2 movement" },
  "reboot-service": { description: "Clear an action block or restore a little health.", impact: "Cleanse + heal 1" },
  hotfix: { description: "Ship a precise ranged correction.", impact: "3 damage" },
  refactor: { description: "Rewrite the hostile process and push it away.", impact: "2 damage + push" },
  "deploy-to-production": { description: "High-impact release with a small backfire risk.", impact: "4 damage" },
  "works-on-my-machine": { description: "Become certain enough to dodge the next attack.", impact: "Dodge" },
  "percussive-maintenance": { description: "A direct, adjacent hardware intervention.", impact: "3 damage" },
  powershell: { description: "Send a remote administrative correction.", impact: "2 damage" },
  "google-it": { description: "Search for two items and keep one private result.", impact: "Find an item" },
  "other-duties-as-assigned": { description: "Repeat the latest eligible teammate ability.", impact: "Copied ability" }
};

export const ITEM_PRESENTATION: Record<SystemCrawlItemId, { description: string; rarity: "Standard" | "Rare"; timing: string }> = {
  coffee: { description: "Restore 3 HP to yourself or an adjacent teammate.", rarity: "Standard", timing: "Action" },
  "admin-credentials": { description: "Open one adjacent locked firewall gate.", rarity: "Rare", timing: "Action" },
  "approved-change-request": { description: "Stun a hostile process within three tiles.", rarity: "Rare", timing: "Action" },
  "spare-laptop": { description: "Revive a downed teammate within three tiles at 4 HP.", rarity: "Rare", timing: "Action" },
  "budget-exception": { description: "Add 2 damage to your next damaging action.", rarity: "Rare", timing: "Action" },
  "vendor-documentation": { description: "Authoritatively reveal the next system node.", rarity: "Rare", timing: "Action" },
  "ethernet-cable": { description: "Deal 2 damage to a hostile process within four tiles.", rarity: "Standard", timing: "Action" },
  "noise-canceling-headphones": { description: "Automatically prevent the next Meeting action block.", rarity: "Rare", timing: "Passive" }
};

export function eventAnnouncement(event: SystemCrawlEvent): string {
  const amount = typeof event.data.amount === "number" ? event.data.amount : typeof event.data.damage === "number" ? event.data.damage : null;
  if (event.type === "map_card_revealed") return `${typeof event.data.displayName === "string" ? event.data.displayName : "A system node"} revealed.`;
  if (event.type === "damage_dealt") return `${amount ?? 0} damage dealt.`;
  if (event.type === "healing") return `${amount ?? 0} health restored.`;
  if (event.type === "character_downed") return "A character is down.";
  if (event.type === "character_revived") return "A character was restarted.";
  if (event.type === "victory") return "Victory. Production stabilized.";
  if (event.type === "defeat") return "Defeat. The incident remains unresolved.";
  if (event.type === "round_started") return `Round ${event.round} started.`;
  if (event.type === "enemy_phase_started") return "System phase started.";
  return event.type.replaceAll("_", " ");
}

export function readableActionKey(actionKey: string | null): string {
  if (!actionKey) return "None — all actions rebooted";
  const [, id = actionKey] = actionKey.split(":");
  return id.split("-").map(capitalize).join(" ");
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
