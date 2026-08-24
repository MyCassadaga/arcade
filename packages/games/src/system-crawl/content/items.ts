import type { ItemDefinition, SystemCrawlItemId } from "../types";

export const ITEM_DEFINITIONS: Readonly<Record<SystemCrawlItemId, ItemDefinition>> = {
  coffee: item("coffee", "Coffee", "action"),
  "admin-credentials": item("admin-credentials", "Admin Credentials", "action"),
  "approved-change-request": item("approved-change-request", "Approved Change Request", "action"),
  "spare-laptop": item("spare-laptop", "Spare Laptop", "action"),
  "budget-exception": item("budget-exception", "Budget Exception", "action"),
  "vendor-documentation": item("vendor-documentation", "Vendor Documentation", "action"),
  "ethernet-cable": item("ethernet-cable", "Ethernet Cable", "action"),
  "noise-canceling-headphones": item("noise-canceling-headphones", "Noise-Canceling Headphones", "passive")
};

export const ITEM_IDS = Object.keys(ITEM_DEFINITIONS) as SystemCrawlItemId[];

function item(id: SystemCrawlItemId, displayName: string, effect: ItemDefinition["effect"]): ItemDefinition {
  return { id, displayName, effect };
}
