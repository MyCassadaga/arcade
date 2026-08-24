export const SYSTEM_CRAWL_STATE_VERSION = 1 as const;

export type SystemCrawlPhase =
  | "class_selection"
  | "ready_to_start"
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
  | "noise-canceling-headphones";

export type SystemCrawlEnemyId =
  | "budget-reduction"
  | "scope-creep"
  | "system-requirement"
  | "meeting"
  | "bug"
  | "legacy-system";

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
  nextDamageBonus: number;
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

export interface SystemCrawlState {
  version: typeof SYSTEM_CRAWL_STATE_VERSION;
  phase: SystemCrawlPhase;
  hostPlayerId: string;
  players: SystemCrawlPlayer[];
  classSelections: Record<string, SystemCrawlClassId[]>;
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
  abilityHistory: AbilityHistoryEntry[];
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

export type SystemCrawlTarget = CharacterTarget | EnemyTarget | DoorTarget | PositionTarget | LoadBalancerTarget;

export type SystemCrawlAction =
  | { type: "select_class"; classIds: SystemCrawlClassId[] }
  | { type: "start_adventure"; seed: string | number }
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
}

export interface ItemDefinition {
  id: SystemCrawlItemId;
  displayName: string;
  effect: "action" | "passive";
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapEnemySpawn {
  id: string;
  position: MapPoint;
  choices: readonly Exclude<SystemCrawlEnemyId, "bug" | "legacy-system">[];
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
  "spawnOrder" | "revealedRound" | "backwardCompatibilityUsedThisRound" | "undocumentedDependencyTriggered"
>;

export interface PublicCharacterStatuses {
  firewallShield: Omit<FirewallShield, "expiresAtSourceTurn"> | null;
  dodgeNextAttack: boolean;
  movementBoostNextTurn: boolean;
  actionBlockedNextTurn: boolean;
  nextDamageBonus: number;
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
  round: number;
  maps: PublicMapCard[];
  revealedCardCount: number;
  characters: Record<string, PublicCharacter>;
  enemies: Record<string, PublicEnemy>;
  turnOrder: string[];
  activeCharacterId: string | null;
  turn: PublicPlayerTurn | null;
  pendingChoice: ProjectedPendingChoice | null;
  events: SystemCrawlEvent[];
}
