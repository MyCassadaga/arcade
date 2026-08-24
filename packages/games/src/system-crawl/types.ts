export const SYSTEM_CRAWL_STATE_VERSION = 2 as const;

export type SystemCrawlPhase =
  | "class_selection"
  | "ready_to_start"
  | "incident_briefing"
  | "player_turn"
  | "resolving_choice"
  | "enemy_phase"
  | "victory"
  | "defeat";

export type SystemCrawlClassId =
  | "infrastructure-architect"
  | "senior-systems-analyst"
  | "application-developer"
  | "it-generalist";

export type SystemCrawlAbilityId =
  | "packet-drop"
  | "firewall"
  | "load-balancer"
  | "escalate"
  | "requirements-clarification"
  | "workaround"
  | "process-improvement"
  | "reboot-service"
  | "hotfix"
  | "refactor"
  | "deploy-to-production"
  | "works-on-my-machine"
  | "percussive-maintenance"
  | "powershell"
  | "google-it"
  | "other-duties-as-assigned";

export type SystemCrawlItemId =
  | "coffee"
  | "admin-credentials"
  | "approved-change-request"
  | "spare-laptop"
  | "budget-exception"
  | "vendor-documentation"
  | "ethernet-cable"
  | "noise-canceling-headphones"
  | "stack-overflow-answer"
  | "maintenance-window"
  | "known-good-backup"
  | "rubber-duck-debugging";

export type SystemCrawlEnemyId =
  | "budget-reduction"
  | "scope-creep"
  | "system-requirement"
  | "meeting"
  | "project-milestone"
  | "unplanned-outage"
  | "technical-debt"
  | "stakeholder-feedback"
  | "additional-request"
  | "bug"
  | "finding"
  | "legacy-system"
  | "audit"
  | "reorg"
  | "production-incident"
  | "consultant"
  | "executive-sponsor";

export type SystemCrawlIncidentId =
  | "production-database-unavailable"
  | "erp-modernization"
  | "compliance-readiness-review"
  | "enterprise-reorganization"
  | "vendor-optimization-initiative"
  | "executive-dashboard-launch";

export type SystemCrawlIncidentModifierId =
  | "outage-velocity"
  | "forced-technical-debt"
  | "evidence-rooms"
  | "turn-order-rotation"
  | "vendor-loot"
  | "milestone-pressure";

export type MapRole = "entry" | "standard" | "boss";

export interface Position {
  cardIndex: number;
  x: number;
  y: number;
}

export interface SystemCrawlPlayer {
  id: string;
  displayName: string;
  order: number;
}

export interface FirewallShield {
  amount: number;
  sourceCharacterId: string;
  expiresAtSourceTurn: number;
}

export interface CharacterStatuses {
  firewallShield: FirewallShield | null;
  dodgeNextAttack: boolean;
  dodgeExpiresAtTurn: number | null;
  movementBoostNextTurn: boolean;
  actionBlockedNextTurn: boolean;
  immobilizedNextTurn: boolean;
  nextDamageBonus: number;
  repeatOverrideAbilityId: SystemCrawlAbilityId | null;
  lockedAbilityId: SystemCrawlAbilityId | null;
  lockedAbilityExpiresAtTurn: number | null;
  corruptionDamageKeysThisTurn: string[];
}

export interface SystemCrawlCharacter {
  id: string;
  ownerPlayerId: string;
  classId: SystemCrawlClassId;
  displayName: string;
  partyOrder: number;
  hp: number;
  maxHp: number;
  baseMovement: number;
  position: Position;
  downed: boolean;
  carriedItemId: SystemCrawlItemId | null;
  lastActionKey: string | null;
  turnsStarted: number;
  statuses: CharacterStatuses;
}

export interface EnemyStatuses {
  movementReductionNextActivation: number;
  stunnedNextActivation: boolean;
  tauntedByCharacterId: string | null;
}

export interface SystemCrawlEnemy {
  id: string;
  definitionId: SystemCrawlEnemyId;
  displayName: string;
  hp: number;
  maxHp: number;
  baseMovement: number;
  attackRange: number;
  damage: number;
  position: Position;
  spawnOrder: number;
  revealedRound: number;
  statuses: EnemyStatuses;
  backwardCompatibilityUsedThisRound: boolean;
  undocumentedDependencyTriggered: boolean;
  halfHealthTriggered: boolean;
  defeatSpawnTriggered: boolean;
  specialUsedRound: number | null;
}

export interface CorruptionHazard {
  id: string;
  position: Position;
  placedRound: number;
  expiresAfterRound: number;
}

export interface DynamicDoor {
  id: string;
  position: Position;
  open: boolean;
}

export interface DynamicCache {
  id: string;
  position: Position;
  itemId: SystemCrawlItemId;
  pickedUp: boolean;
}

export interface SystemCrawlMapCard {
  cardIndex: number;
  templateId: string;
  revealed: boolean;
  doors: DynamicDoor[];
  caches: DynamicCache[];
}

export interface PlayerTurnState {
  movementAllowance: number;
  movementSpent: number;
  actionUsed: boolean;
  actionBlocked: boolean;
  freeItemUsed: boolean;
  actedCharacterIdsThisRound: string[];
}

export interface AbilityHistoryEntry {
  characterId: string;
  abilityId: SystemCrawlAbilityId;
}

export interface GoogleItChoice {
  kind: "google_it";
  id: string;
  ownerPlayerId: string;
  characterId: string;
  candidateItemIds: [SystemCrawlItemId, SystemCrawlItemId];
}

export type PendingChoice = GoogleItChoice;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface SystemCrawlEvent {
  id: number;
  type:
    | "class_selected"
    | "adventure_started"
    | "incident_selected"
    | "incident_briefing_completed"
    | "character_moved"
    | "map_card_revealed"
    | "enemy_spawned"
    | "item_cache_spawned"
    | "item_picked_up"
    | "item_discarded"
    | "ability_used"
    | "item_used"
    | "damage_dealt"
    | "damage_prevented"
    | "defense_triggered"
    | "dodge_triggered"
    | "ability_backfired"
    | "item_prevented_status"
    | "healing"
    | "status_applied"
    | "status_removed"
    | "character_downed"
    | "character_revived"
    | "enemy_defeated"
    | "enemy_moved"
    | "enemy_attacked"
    | "enemy_stunned"
    | "enemy_grew"
    | "technical_debt_grew"
    | "additional_requests_spawned"
    | "position_swapped"
    | "corruption_placed"
    | "corruption_expired"
    | "corruption_damage"
    | "boss_healed"
    | "ability_locked"
    | "enemy_phase_skipped"
    | "enemy_phase_ended"
    | "known_good_backup_restored"
    | "pending_choice_created"
    | "pending_choice_resolved"
    | "boss_phase_changed"
    | "turn_ended"
    | "enemy_phase_started"
    | "round_started"
    | "victory"
    | "defeat";
  round: number;
  data: { [key: string]: JsonValue };
}

export interface CharacterRunStats {
  damageDealt: number;
  healingPerformed: number;
  damagePrevented: number;
  itemsUsed: number;
  revivals: number;
  downs: number;
}

export interface SystemCrawlRunStats {
  enemiesDefeated: number;
  bossDefeated: boolean;
  damagePrevented: number;
  itemsUsed: number;
  revivals: number;
  charactersDowned: number;
  byCharacter: Record<string, CharacterRunStats>;
}

export interface DamagingAbilityRecord {
  characterId: string;
  abilityId: SystemCrawlAbilityId;
  damage: number;
  range: number;
}

export interface SystemCrawlState {
  version: typeof SYSTEM_CRAWL_STATE_VERSION;
  phase: SystemCrawlPhase;
  hostPlayerId: string;
  players: SystemCrawlPlayer[];
  classSelections: Record<string, SystemCrawlClassId[]>;
  incidentId: SystemCrawlIncidentId | null;
  seed: string | null;
  rngState: number;
  round: number;
  maps: SystemCrawlMapCard[];
  revealedCardCount: number;
  characters: Record<string, SystemCrawlCharacter>;
  enemies: Record<string, SystemCrawlEnemy>;
  turnOrder: string[];
  activeCharacterId: string | null;
  turn: PlayerTurnState | null;
  pendingChoice: PendingChoice | null;
  hazards: CorruptionHazard[];
  skipNextEnemyPhase: boolean;
  outageBoostPending: boolean;
  pendingTurnOrderRotations: number;
  legendaryItemAssigned: boolean;
  lastDamagingAbility: DamagingAbilityRecord | null;
  abilityHistory: AbilityHistoryEntry[];
  stats: SystemCrawlRunStats;
  events: SystemCrawlEvent[];
  nextEventId: number;
  nextEntityId: number;
}

export interface CharacterTarget {
  type: "character";
  characterId: string;
}

export interface EnemyTarget {
  type: "enemy";
  enemyId: string;
}

export interface DoorTarget {
  type: "door";
  doorId: string;
}

export interface PositionTarget {
  type: "position";
  position: Position;
}

export interface LoadBalancerTarget {
  type: "load_balancer";
  characterId: string;
  destination: Position;
}

export interface AbilityUnlockTarget {
  type: "ability";
  abilityId: SystemCrawlAbilityId;
}

export type SystemCrawlTarget = CharacterTarget | EnemyTarget | DoorTarget | PositionTarget | LoadBalancerTarget | AbilityUnlockTarget;

export type SystemCrawlAction =
  | { type: "select_class"; classIds: SystemCrawlClassId[] }
  | { type: "start_adventure"; seed: string | number }
  | { type: "continue_briefing" }
  | { type: "move_to"; characterId: string; destination: Position }
  | { type: "use_ability"; characterId: string; abilityId: SystemCrawlAbilityId; target?: SystemCrawlTarget }
  | { type: "use_item"; characterId: string; target?: SystemCrawlTarget }
  | { type: "restart_user"; characterId: string; targetCharacterId: string }
  | { type: "discard_item"; characterId: string }
  | { type: "end_turn"; characterId: string }
  | { type: "resolve_choice"; choiceId: string; itemId: SystemCrawlItemId };

export type SystemCrawlErrorCode =
  | "wrong_phase"
  | "not_host"
  | "not_character_owner"
  | "not_current_character"
  | "class_unavailable"
  | "class_selection_incomplete"
  | "invalid_target"
  | "out_of_range"
  | "line_of_sight_blocked"
  | "movement_exceeded"
  | "tile_blocked"
  | "action_already_used"
  | "repeated_action"
  | "item_slot_full"
  | "no_item"
  | "invalid_item_use"
  | "pending_choice_required"
  | "unauthorized_choice"
  | "game_finished";

export class SystemCrawlRuleError extends Error {
  constructor(
    readonly code: SystemCrawlErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SystemCrawlRuleError";
  }
}

export interface SystemCrawlResult {
  state: SystemCrawlState;
  events: SystemCrawlEvent[];
}

export interface ClassDefinition {
  id: SystemCrawlClassId;
  displayName: string;
  maxHp: number;
  movement: number;
  abilityIds: readonly SystemCrawlAbilityId[];
}

export type AbilityTargetKind = "self" | "character" | "enemy" | "special";

export interface AbilityDefinition {
  id: SystemCrawlAbilityId;
  displayName: string;
  classId: SystemCrawlClassId;
  range: number;
  targetKind: AbilityTargetKind;
  damaging: boolean;
}

export interface EnemyDefinition {
  id: SystemCrawlEnemyId;
  displayName: string;
  maxHp: number;
  movement: number;
  attackRange: number;
  damage: number;
  kind: "regular" | "minion" | "boss";
}

export interface ItemDefinition {
  id: SystemCrawlItemId;
  displayName: string;
  effect: "action" | "free" | "passive";
  rarity: "common" | "uncommon" | "rare" | "legendary";
  lootWeight: number;
}

export interface IncidentMetadata {
  label: string;
  value: string;
}

export interface IncidentDefinition {
  id: SystemCrawlIncidentId;
  displayTitle: string;
  premise: string;
  objective: string;
  bossId: Extract<SystemCrawlEnemyId, "legacy-system" | "audit" | "reorg" | "production-incident" | "consultant" | "executive-sponsor">;
  bossMapId: string;
  threatCategory: string;
  selectionWeight: number;
  modifierId: SystemCrawlIncidentModifierId | null;
  metadata: readonly IncidentMetadata[];
  mapWeights: Readonly<Record<string, number>>;
  enemyWeights: Readonly<Partial<Record<SystemCrawlEnemyId, number>>>;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapEnemySpawn {
  id: string;
  position: MapPoint;
  choices: readonly Exclude<SystemCrawlEnemyId, "bug" | "finding" | "additional-request" | "legacy-system" | "audit" | "reorg" | "production-incident" | "consultant" | "executive-sponsor">[];
}

export interface MapCacheSpawn {
  id: string;
  position: MapPoint;
}

export interface MapDoorDefinition {
  id: string;
  position: MapPoint;
  locked: boolean;
}

export interface MapPropDefinition {
  id: string;
  kind: string;
  position: MapPoint;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
}

export interface MapVisualTheme {
  floor: string;
  walls: string;
  accent: string;
  props: string;
}

export interface SystemCrawlMapTemplate {
  id: string;
  displayName: string;
  role: MapRole;
  width: 9;
  height: 7;
  terrain: readonly string[];
  entrance: MapPoint;
  exit: MapPoint | null;
  playerEntryPositions: readonly MapPoint[];
  enemySpawns: readonly MapEnemySpawn[];
  bossSpawn: MapPoint | null;
  minionSpawns: readonly MapPoint[];
  itemCacheSpawns: readonly MapCacheSpawn[];
  doors: readonly MapDoorDefinition[];
  props: readonly MapPropDefinition[];
  visualTheme: MapVisualTheme;
}

export interface PublicMapCard {
  cardIndex: number;
  revealed: boolean;
  templateId?: string;
  displayName?: string;
  role?: MapRole;
  terrain?: readonly string[];
  entrance?: MapPoint;
  exit?: MapPoint | null;
  doors?: DynamicDoor[];
  caches?: Array<Omit<DynamicCache, "itemId"> & { itemId?: SystemCrawlItemId }>;
  props?: readonly MapPropDefinition[];
  visualTheme?: MapVisualTheme;
}

export interface ProjectedPendingChoice {
  kind: "google_it";
  id: string;
  ownerPlayerId: string;
  characterId: string;
  candidateItemIds?: [SystemCrawlItemId, SystemCrawlItemId];
}

export type PublicEnemy = Omit<
  SystemCrawlEnemy,
  "spawnOrder" | "revealedRound" | "backwardCompatibilityUsedThisRound" | "undocumentedDependencyTriggered" | "halfHealthTriggered" | "defeatSpawnTriggered" | "specialUsedRound"
>;

export interface PublicCharacterStatuses {
  firewallShield: Omit<FirewallShield, "expiresAtSourceTurn"> | null;
  dodgeNextAttack: boolean;
  movementBoostNextTurn: boolean;
  actionBlockedNextTurn: boolean;
  immobilizedNextTurn: boolean;
  nextDamageBonus: number;
  repeatOverrideAbilityId: SystemCrawlAbilityId | null;
  lockedAbilityId: SystemCrawlAbilityId | null;
}

export type PublicCharacter = Omit<SystemCrawlCharacter, "turnsStarted" | "statuses"> & {
  statuses: PublicCharacterStatuses;
};

export type PublicPlayerTurn = Omit<PlayerTurnState, "actedCharacterIdsThisRound">;

export interface SystemCrawlViewerState {
  version: typeof SYSTEM_CRAWL_STATE_VERSION;
  phase: SystemCrawlPhase;
  hostPlayerId: string;
  players: SystemCrawlPlayer[];
  classSelections: Record<string, SystemCrawlClassId[]>;
  incidentId: SystemCrawlIncidentId | null;
  seed?: string | null;
  round: number;
  maps: PublicMapCard[];
  revealedCardCount: number;
  characters: Record<string, PublicCharacter>;
  enemies: Record<string, PublicEnemy>;
  turnOrder: string[];
  activeCharacterId: string | null;
  turn: PublicPlayerTurn | null;
  pendingChoice: ProjectedPendingChoice | null;
  hazards: CorruptionHazard[];
  stats: SystemCrawlRunStats;
  events: SystemCrawlEvent[];
}
