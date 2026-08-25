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

export const ITEM_PRESENTATION: Record<SystemCrawlItemId, { description: string; rarity: "Common" | "Uncommon" | "Rare" | "Legendary"; timing: string }> = {
  coffee: { description: "Restore 3 HP to yourself or an adjacent teammate.", rarity: "Common", timing: "Action" },
  "admin-credentials": { description: "Open one adjacent locked firewall gate.", rarity: "Uncommon", timing: "Action" },
  "approved-change-request": { description: "Stun a hostile process within three tiles.", rarity: "Uncommon", timing: "Action" },
  "spare-laptop": { description: "Revive a downed teammate within three tiles at 4 HP.", rarity: "Rare", timing: "Action" },
  "budget-exception": { description: "Add 2 damage to your next damaging action.", rarity: "Uncommon", timing: "Action" },
  "vendor-documentation": { description: "Authoritatively reveal the next system node.", rarity: "Uncommon", timing: "Action" },
  "ethernet-cable": { description: "Deal 2 damage to a hostile process within four tiles.", rarity: "Common", timing: "Action" },
  "noise-canceling-headphones": { description: "Automatically prevent the next Meeting action block.", rarity: "Uncommon", timing: "Passive" },
  "stack-overflow-answer": { description: "Unlock the class ability blocked only by the repeat rule.", rarity: "Rare", timing: "Free · before action" },
  "maintenance-window": { description: "Skip the next enemy phase for the entire party.", rarity: "Rare", timing: "Action" },
  "known-good-backup": { description: "Automatically restore the whole party at half HP when everyone is down.", rarity: "Legendary", timing: "Passive" },
  "rubber-duck-debugging": { description: "Cleanse one negative status and grant +1 damage within range 2.", rarity: "Uncommon", timing: "Action" }
};

export function eventAnnouncement(event: SystemCrawlEvent): string {
  const amount = typeof event.data.amount === "number" ? event.data.amount : typeof event.data.damage === "number" ? event.data.damage : null;
  const player = typeof event.data.playerDisplayName === "string" ? event.data.playerDisplayName : "A player";
  if (event.type === "map_card_revealed") return `${typeof event.data.displayName === "string" ? event.data.displayName : "A system node"} revealed.`;
  if (event.type === "damage_dealt") return `${amount ?? 0} damage dealt.`;
  if (event.type === "healing") return `${amount ?? 0} health restored.`;
  if (event.type === "character_downed") return "A character is down.";
  if (event.type === "character_revived") return "A character was restarted.";
  if (event.type === "victory") return "Victory. Production stabilized.";
  if (event.type === "defeat") return "Defeat. The incident remains unresolved.";
  if (event.type === "round_started") return `Round ${event.round} started.`;
  if (event.type === "enemy_phase_started") return "System phase started.";
  if (event.type === "character_attacked") return `${player} attacked a hostile process.`;
  if (event.type === "enemy_phase_skipped") return "The Maintenance Window was approved. Hostile processes paused.";
  if (event.type === "technical_debt_grew") return "Technical Debt increased.";
  if (event.type === "additional_requests_spawned") return "Stakeholder Feedback generated additional requests.";
  if (event.type === "position_swapped") return "The Reorg updated two reporting locations.";
  if (event.type === "corruption_placed") return "Production corruption spread.";
  if (event.type === "boss_healed") return "The Consultant submitted a Change Request.";
  if (event.type === "ability_locked") return "Strategic Realignment locked an ability.";
  if (event.type === "known_good_backup_restored") return "The party restored from a known-good backup.";
  if (event.type === "enemy_grew") return "Scope Creep expanded.";
  if (event.type === "ability_backfired") return "The deployment behaved unexpectedly.";
  if (event.type === "ability_used" && event.data.abilityId === "deploy-to-production") return `${player} deployed directly to production.`;
  if (event.type === "item_used" && event.data.itemId === "admin-credentials") return "Admin Credentials accepted.";
  if (event.type === "item_prevented_status") return "The meeting could have been an email.";
  return event.type.replaceAll("_", " ");
}

export function readableActionKey(actionKey: string | null): string {
  if (!actionKey) return "None — all actions rebooted";
  if (actionKey === "system:attack") return "Attack";
  const [, id = actionKey] = actionKey.split(":");
  return id.split("-").map(capitalize).join(" ");
}

function capitalize(value: string): string {
  return `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}
