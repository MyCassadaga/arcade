import type { ItemDefinition, SystemCrawlItemId } from "../types";

export const ITEM_DEFINITIONS: Readonly<Record<SystemCrawlItemId, ItemDefinition>> = {
  coffee: item("coffee", "Coffee", "action", "common", 8),
  "admin-credentials": item("admin-credentials", "Admin Credentials", "action", "uncommon", 5),
  "approved-change-request": item("approved-change-request", "Approved Change Request", "action", "uncommon", 5),
  "spare-laptop": item("spare-laptop", "Spare Laptop", "action", "rare", 3),
  "budget-exception": item("budget-exception", "Budget Exception", "action", "uncommon", 5),
  "vendor-documentation": item("vendor-documentation", "Vendor Documentation", "action", "uncommon", 5),
  "ethernet-cable": item("ethernet-cable", "Ethernet Cable", "action", "common", 8),
  "noise-canceling-headphones": item("noise-canceling-headphones", "Noise-Canceling Headphones", "passive", "uncommon", 5),
  "stack-overflow-answer": item("stack-overflow-answer", "Stack Overflow Answer", "free", "rare", 3),
  "maintenance-window": item("maintenance-window", "Maintenance Window", "action", "rare", 3),
  "known-good-backup": item("known-good-backup", "Known Good Backup", "passive", "legendary", 1),
  "rubber-duck-debugging": item("rubber-duck-debugging", "Rubber Duck Debugging", "action", "uncommon", 5)
};

export const ITEM_IDS = Object.keys(ITEM_DEFINITIONS) as SystemCrawlItemId[];

function item(
  id: SystemCrawlItemId,
  displayName: string,
  effect: ItemDefinition["effect"],
  rarity: ItemDefinition["rarity"],
  lootWeight: number
): ItemDefinition {
  return { id, displayName, effect, rarity, lootWeight };
}
