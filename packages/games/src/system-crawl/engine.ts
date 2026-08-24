import { ABILITY_DEFINITIONS, CLASS_DEFINITIONS, ENEMY_DEFINITIONS, ITEM_DEFINITIONS, ITEM_IDS } from "./content";
import { BOSS_MAPS, ENTRY_MAPS, STANDARD_MAPS, SYSTEM_CRAWL_MAPS_BY_ID } from "./maps";
import {
  canonicalShortestPath,
  hasLineOfSight,
  isCardinallyAdjacent,
  isPositionBlocked,
  isTerrainBlocked,
  manhattanDistance,
  samePosition
} from "./pathfinding";
import { randomIndex, seedToRngState, shuffleSeeded } from "./rng";
import { findCopyableAbility, getCharacterMovementAllowance } from "./selectors";
import {
  SYSTEM_CRAWL_STATE_VERSION,
  SystemCrawlRuleError,
  type JsonValue,
  type Position,
  type SystemCrawlAbilityId,
  type SystemCrawlAction,
  type SystemCrawlCharacter,
  type SystemCrawlEnemy,
  type SystemCrawlEnemyId,
  type SystemCrawlEvent,
  type SystemCrawlItemId,
  type SystemCrawlMapCard,
  type SystemCrawlPlayer,
  type SystemCrawlResult,
  type SystemCrawlState,
  type SystemCrawlTarget
} from "./types";

export const SYSTEM_CRAWL_GAME = {
  id: "system-crawl",
  name: "System Crawl",
  minPlayers: 1,
  maxPlayers: 4
} as const;

export function createSystemCrawlState(
  players: readonly Pick<SystemCrawlPlayer, "id" | "displayName">[],
  hostPlayerId: string
): SystemCrawlState {
  if (players.length < 1 || players.length > 4) {
    throw new SystemCrawlRuleError("class_selection_incomplete", "System Crawl supports one through four connected players.");
  }
  if (!players.some((player) => player.id === hostPlayerId)) {
    throw new SystemCrawlRuleError("not_host", "The host must be one of the supplied players.");
  }
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    throw new SystemCrawlRuleError("class_selection_incomplete", "Player IDs must be unique.");
  }
  return {
    version: SYSTEM_CRAWL_STATE_VERSION,
    phase: "class_selection",
    hostPlayerId,
    players: players.map((player, order) => ({ ...player, order })),
    classSelections: Object.fromEntries(players.map((player) => [player.id, []])),
    seed: null,
    rngState: 0,
    round: 0,
    maps: [],
    revealedCardCount: 0,
    characters: {},
    enemies: {},
    turnOrder: [],
    activeCharacterId: null,
    turn: null,
    pendingChoice: null,
    abilityHistory: [],
    events: [],
    nextEventId: 1,
    nextEntityId: 1
  };
}

export function reduceSystemCrawl(
  state: SystemCrawlState,
  action: SystemCrawlAction,
  actorPlayerId: string
): SystemCrawlResult {
  if (state.phase === "victory" || state.phase === "defeat") {
    throw new SystemCrawlRuleError("game_finished", "The adventure has already finished.");
  }
  if (state.pendingChoice && action.type !== "resolve_choice") {
    throw new SystemCrawlRuleError("pending_choice_required", "The pending choice must be resolved first.");
  }
  const firstEventId = state.nextEventId;
  let next: SystemCrawlState;
  switch (action.type) {
    case "select_class":
      next = selectClasses(state, actorPlayerId, action.classIds);
      break;
    case "start_adventure":
      next = startAdventure(state, actorPlayerId, action.seed);
      break;
    case "move_to":
      next = moveCharacter(state, actorPlayerId, action.characterId, action.destination);
      break;
    case "use_ability":
      next = useAbility(state, actorPlayerId, action.characterId, action.abilityId, action.target);
      break;
    case "use_item":
      next = useItem(state, actorPlayerId, action.characterId, action.target);
      break;
    case "restart_user":
      next = restartUser(state, actorPlayerId, action.characterId, action.targetCharacterId);
      break;
    case "discard_item":
      next = discardItem(state, actorPlayerId, action.characterId);
      break;
    case "end_turn":
      next = endTurn(state, actorPlayerId, action.characterId);
      break;
    case "resolve_choice":
      next = resolveChoice(state, actorPlayerId, action.choiceId, action.itemId);
      break;
  }
  return { state: next, events: next.events.filter((event) => event.id >= firstEventId) };
}

function selectClasses(state: SystemCrawlState, actorPlayerId: string, classIds: SystemCrawlCharacter["classId"][]): SystemCrawlState {
  if (state.phase !== "class_selection" && state.phase !== "ready_to_start") wrongPhase("Classes can only be selected before the adventure starts.");
  requirePlayer(state, actorPlayerId);
  const required = state.players.length === 1 ? 2 : 1;
  if (classIds.length !== required || new Set(classIds).size !== classIds.length || classIds.some((id) => !CLASS_DEFINITIONS[id])) {
    throw new SystemCrawlRuleError("class_selection_incomplete", `Select exactly ${required} different class${required === 1 ? "" : "es"}.`);
  }
  const selectedByOthers = new Set(
    Object.entries(state.classSelections).flatMap(([playerId, selected]) => playerId === actorPlayerId ? [] : selected)
  );
  if (classIds.some((classId) => selectedByOthers.has(classId))) {
    throw new SystemCrawlRuleError("class_unavailable", "One of those classes is already assigned.");
  }
  const next = cloneState(state);
  next.classSelections[actorPlayerId] = [...classIds];
  next.phase = selectionsComplete(next) ? "ready_to_start" : "class_selection";
  emit(next, "class_selected", { playerId: actorPlayerId, classIds });
  return next;
}

function startAdventure(state: SystemCrawlState, actorPlayerId: string, seed: string | number): SystemCrawlState {
  if (state.phase !== "ready_to_start") {
    if (!selectionsComplete(state)) throw new SystemCrawlRuleError("class_selection_incomplete", "Every character slot must be assigned before starting.");
    wrongPhase("The adventure is not ready to start.");
  }
  if (actorPlayerId !== state.hostPlayerId) throw new SystemCrawlRuleError("not_host", "Only the host may start the adventure.");
  const next = cloneState(state);
  next.seed = String(seed);
  next.rngState = seedToRngState(seed);
  const templates = chooseAdventureMaps(next);
  next.maps = templates.map((template, cardIndex) => createDynamicMap(next, template.id, cardIndex));
  next.characters = createCharacters(next, templates[0]?.playerEntryPositions ?? []);
  next.turnOrder = Object.values(next.characters).sort((left, right) => left.partyOrder - right.partyOrder).map((character) => character.id);
  next.round = 1;
  next.phase = "player_turn";
  emit(next, "adventure_started", { characterIds: next.turnOrder });
  revealCard(next, 0);
  beginRound(next, 1);
  return next;
}

function moveCharacter(
  state: SystemCrawlState,
  actorPlayerId: string,
  characterId: string,
  destination: Position
): SystemCrawlState {
  const character = requireActiveCharacter(state, actorPlayerId, characterId);
  const turn = state.turn as NonNullable<SystemCrawlState["turn"]>;
  if (samePosition(character.position, destination)) throw new SystemCrawlRuleError("invalid_target", "Choose a different destination.");
  if (isTerrainBlocked(state, destination) || isPositionBlocked(state, destination, { ignoreCharacterId: characterId })) {
    throw new SystemCrawlRuleError("tile_blocked", "The destination tile is blocked.");
  }
  const path = canonicalShortestPath(state, character.position, destination, { ignoreCharacterId: characterId });
  if (!path) throw new SystemCrawlRuleError("tile_blocked", "No legal path reaches that destination.");
  const distance = path.length - 1;
  if (distance > turn.movementAllowance - turn.movementSpent) {
    throw new SystemCrawlRuleError("movement_exceeded", "That move exceeds the character's remaining movement.");
  }
  const next = cloneState(state);
  const nextCharacter = next.characters[characterId] as SystemCrawlCharacter;
  emit(next, "character_moved", { characterId, path, movementSpent: distance });
  for (const step of path.slice(1)) {
    nextCharacter.position = step;
    handleEnteredTile(next, nextCharacter);
  }
  (next.turn as NonNullable<SystemCrawlState["turn"]>).movementSpent += distance;
  return next;
}

function discardItem(state: SystemCrawlState, actorPlayerId: string, characterId: string): SystemCrawlState {
  const character = requireActiveCharacter(state, actorPlayerId, characterId);
  if (!character.carriedItemId) throw new SystemCrawlRuleError("no_item", "The character is not carrying an item.");
  const next = cloneState(state);
  const nextCharacter = next.characters[characterId] as SystemCrawlCharacter;
  const itemId = nextCharacter.carriedItemId as SystemCrawlItemId;
  nextCharacter.carriedItemId = null;
  emit(next, "item_discarded", { characterId, itemId });
  return next;
}

function endTurn(state: SystemCrawlState, actorPlayerId: string, characterId: string): SystemCrawlState {
  requireActiveCharacter(state, actorPlayerId, characterId);
  const next = cloneState(state);
  finishCharacterTurn(next, characterId);
  return next;
}

function resolveChoice(
  state: SystemCrawlState,
  actorPlayerId: string,
  choiceId: string,
  itemId: SystemCrawlItemId
): SystemCrawlState {
  if (state.phase !== "resolving_choice" || !state.pendingChoice) wrongPhase("There is no choice to resolve.");
  const choice = state.pendingChoice;
  if (choice.ownerPlayerId !== actorPlayerId) throw new SystemCrawlRuleError("unauthorized_choice", "Only the choice owner may resolve it.");
  if (choice.id !== choiceId || !choice.candidateItemIds.includes(itemId)) {
    throw new SystemCrawlRuleError("invalid_target", "Choose one of the offered items.");
  }
  const character = state.characters[choice.characterId];
  if (!character || character.carriedItemId !== null) throw new SystemCrawlRuleError("item_slot_full", "The item slot is no longer available.");
  const next = cloneState(state);
  (next.characters[choice.characterId] as SystemCrawlCharacter).carriedItemId = itemId;
  next.pendingChoice = null;
  next.phase = "player_turn";
  emit(next, "pending_choice_resolved", { choiceId, characterId: choice.characterId, itemId });
  return next;
}

function useAbility(
  state: SystemCrawlState,
  actorPlayerId: string,
  characterId: string,
  abilityId: SystemCrawlAbilityId,
  target: SystemCrawlTarget | undefined
): SystemCrawlState {
  const character = requireActionAvailable(state, actorPlayerId, characterId, `ability:${abilityId}`);
  if (!CLASS_DEFINITIONS[character.classId].abilityIds.includes(abilityId)) {
    throw new SystemCrawlRuleError("invalid_target", "That ability does not belong to this character's class.");
  }
  const copied = abilityId === "other-duties-as-assigned" ? findCopyableAbility(state, characterId) : null;
  if (abilityId === "other-duties-as-assigned" && !copied) {
    throw new SystemCrawlRuleError("invalid_target", "No eligible class ability has been used by another character.");
  }
  const resolvedAbilityId = copied?.abilityId ?? abilityId;
  validateAbilityTarget(state, character, resolvedAbilityId, target);

  const next = cloneState(state);
  emit(next, "ability_used", {
    characterId,
    abilityId,
    ...(copied ? { copiedAbilityId: copied.abilityId, copiedFromCharacterId: copied.characterId } : {})
  });
  resolveAbilityEffect(next, characterId, resolvedAbilityId, target);
  completeAction(next, characterId, `ability:${abilityId}`);
  if (abilityId !== "other-duties-as-assigned") {
    next.abilityHistory.push({ characterId, abilityId });
    next.abilityHistory = next.abilityHistory.slice(-40);
  }
  if (next.phase !== "victory" && next.phase !== "defeat" && next.characters[characterId]?.downed) finishCharacterTurn(next, characterId);
  return next;
}

function useItem(
  state: SystemCrawlState,
  actorPlayerId: string,
  characterId: string,
  target: SystemCrawlTarget | undefined
): SystemCrawlState {
  const character = requireActiveCharacter(state, actorPlayerId, characterId);
  const itemId = character.carriedItemId;
  if (!itemId) throw new SystemCrawlRuleError("no_item", "The character is not carrying an item.");
  requireActionAvailable(state, actorPlayerId, characterId, `item:${itemId}`);
  if (ITEM_DEFINITIONS[itemId].effect !== "action") {
    throw new SystemCrawlRuleError("invalid_item_use", "Passive items cannot be activated.");
  }
  validateItemTarget(state, character, itemId, target);
  const next = cloneState(state);
  emit(next, "item_used", { characterId, itemId });
  resolveItemEffect(next, characterId, itemId, target);
  const nextCharacter = next.characters[characterId] as SystemCrawlCharacter;
  nextCharacter.carriedItemId = null;
  completeAction(next, characterId, `item:${itemId}`);
  return next;
}

function restartUser(
  state: SystemCrawlState,
  actorPlayerId: string,
  characterId: string,
  targetCharacterId: string
): SystemCrawlState {
  const character = requireActionAvailable(state, actorPlayerId, characterId, "system:restart-user");
  const target = state.characters[targetCharacterId];
  if (!target || target.id === character.id || !target.downed) {
    throw new SystemCrawlRuleError("invalid_target", "Restart User requires a downed ally.");
  }
  if (!isCardinallyAdjacent(state, character.position, target.position)) {
    throw new SystemCrawlRuleError("out_of_range", "Restart User requires an adjacent ally.");
  }
  const next = cloneState(state);
  reviveCharacter(next, targetCharacterId, 2, characterId);
  completeAction(next, characterId, "system:restart-user");
  emit(next, "ability_used", { characterId, abilityId: "restart-user", targetCharacterId });
  return next;
}

function validateAbilityTarget(
  state: SystemCrawlState,
  character: SystemCrawlCharacter,
  abilityId: SystemCrawlAbilityId,
  target: SystemCrawlTarget | undefined
): void {
  const definition = ABILITY_DEFINITIONS[abilityId];
  if (definition.targetKind === "enemy") {
    requireEnemyTarget(state, character, target, definition.range);
    return;
  }
  if (abilityId === "works-on-my-machine") {
    if (target && (target.type !== "character" || target.characterId !== character.id)) {
      throw new SystemCrawlRuleError("invalid_target", "Works on My Machine targets only its user.");
    }
    return;
  }
  if (abilityId === "google-it") {
    if (character.carriedItemId !== null) throw new SystemCrawlRuleError("item_slot_full", "Google It requires an empty item slot.");
    if (target && (target.type !== "character" || target.characterId !== character.id)) {
      throw new SystemCrawlRuleError("invalid_target", "Google It targets only its user.");
    }
    return;
  }
  if (abilityId === "load-balancer") {
    if (!target || target.type !== "load_balancer") throw new SystemCrawlRuleError("invalid_target", "Choose an ally and destination.");
    const ally = state.characters[target.characterId];
    if (!ally || ally.id === character.id || ally.downed) throw new SystemCrawlRuleError("invalid_target", "Load Balancer requires a living ally.");
    requireRangeAndSight(state, character.position, ally.position, definition.range);
    if (isPositionBlocked(state, target.destination, { ignoreCharacterId: ally.id })) {
      throw new SystemCrawlRuleError("tile_blocked", "The forced-movement destination is blocked.");
    }
    const path = canonicalShortestPath(state, ally.position, target.destination, {
      ignoreCharacterId: ally.id,
      maximumDistance: 2
    });
    if (!path || path.length - 1 > 2 || path.length < 2) {
      throw new SystemCrawlRuleError("out_of_range", "Load Balancer may move an ally one or two legal steps.");
    }
    return;
  }
  if (definition.targetKind === "character") {
    const ally = requireLivingCharacterTarget(state, character, target, definition.range);
    if (abilityId === "reboot-service" && ally.hp >= ally.maxHp && !ally.statuses.actionBlockedNextTurn) {
      throw new SystemCrawlRuleError("invalid_target", "Reboot Service needs damage to heal or a negative status to remove.");
    }
    return;
  }
  throw new SystemCrawlRuleError("invalid_target", "That ability has no valid target.");
}

function resolveAbilityEffect(
  state: SystemCrawlState,
  characterId: string,
  abilityId: SystemCrawlAbilityId,
  target: SystemCrawlTarget | undefined
): void {
  const character = state.characters[characterId] as SystemCrawlCharacter;
  switch (abilityId) {
    case "packet-drop":
      damageEnemyFromAction(state, characterId, enemyIdFrom(target), 2);
      return;
    case "firewall": {
      const ally = state.characters[characterIdFrom(target)] as SystemCrawlCharacter;
      ally.statuses.firewallShield = {
        amount: 3,
        sourceCharacterId: characterId,
        expiresAtSourceTurn: character.turnsStarted + 1
      };
      emit(state, "status_applied", { characterId: ally.id, status: "firewall", amount: 3, sourceCharacterId: characterId });
      return;
    }
    case "load-balancer": {
      const loadTarget = target as Extract<SystemCrawlTarget, { type: "load_balancer" }>;
      const ally = state.characters[loadTarget.characterId] as SystemCrawlCharacter;
      const path = canonicalShortestPath(state, ally.position, loadTarget.destination, {
        ignoreCharacterId: ally.id,
        maximumDistance: 2
      }) as Position[];
      emit(state, "character_moved", { characterId: ally.id, path, movementSpent: 0, forcedByCharacterId: characterId });
      for (const step of path.slice(1)) {
        ally.position = step;
        handleEnteredTile(state, ally);
      }
      return;
    }
    case "escalate": {
      const enemy = state.enemies[enemyIdFrom(target)] as SystemCrawlEnemy;
      enemy.statuses.tauntedByCharacterId = characterId;
      emit(state, "status_applied", { enemyId: enemy.id, status: "taunted", characterId });
      return;
    }
    case "requirements-clarification": {
      const enemyId = enemyIdFrom(target);
      damageEnemyFromAction(state, characterId, enemyId, 1);
      const enemy = state.enemies[enemyId];
      if (enemy?.hp && enemy.hp > 0) {
        enemy.statuses.movementReductionNextActivation = 2;
        emit(state, "status_applied", { enemyId, status: "movement_reduced", amount: 2 });
      }
      return;
    }
    case "workaround":
      healCharacter(state, characterIdFrom(target), 3, characterId);
      return;
    case "process-improvement": {
      const ally = state.characters[characterIdFrom(target)] as SystemCrawlCharacter;
      ally.statuses.movementBoostNextTurn = true;
      emit(state, "status_applied", { characterId: ally.id, status: "movement_boost", amount: 2 });
      return;
    }
    case "reboot-service": {
      const ally = state.characters[characterIdFrom(target)] as SystemCrawlCharacter;
      // Deterministic negative-status priority: action-blocked, followed by future statuses when added here.
      if (ally.statuses.actionBlockedNextTurn) {
        ally.statuses.actionBlockedNextTurn = false;
        emit(state, "status_removed", { characterId: ally.id, status: "action_blocked" });
      }
      healCharacter(state, ally.id, 1, characterId);
      return;
    }
    case "hotfix":
      damageEnemyFromAction(state, characterId, enemyIdFrom(target), 3);
      return;
    case "refactor": {
      const enemyId = enemyIdFrom(target);
      damageEnemyFromAction(state, characterId, enemyId, 2);
      const enemy = state.enemies[enemyId];
      if (enemy && enemy.hp > 0) pushEnemyDirectlyAway(state, character, enemy);
      return;
    }
    case "deploy-to-production": {
      damageEnemyFromAction(state, characterId, enemyIdFrom(target), 4);
      if (state.phase === "victory") return;
      const roll = drawRandom(state);
      if (roll < 0.25) {
        emit(state, "ability_backfired", { characterId, abilityId: "deploy-to-production", damage: 1 });
        damageCharacter(state, characterId, 1, { attack: false, unmitigated: true, sourceId: characterId });
      }
      return;
    }
    case "works-on-my-machine":
      character.statuses.dodgeNextAttack = true;
      character.statuses.dodgeExpiresAtTurn = character.turnsStarted + 1;
      emit(state, "status_applied", { characterId, status: "dodge_next_attack" });
      return;
    case "percussive-maintenance":
      damageEnemyFromAction(state, characterId, enemyIdFrom(target), 3);
      return;
    case "powershell":
      damageEnemyFromAction(state, characterId, enemyIdFrom(target), 2);
      return;
    case "google-it": {
      const draw = shuffleSeeded(state.rngState, ITEM_IDS);
      state.rngState = draw.state;
      const first = draw.values[0] as SystemCrawlItemId;
      const second = draw.values[1] as SystemCrawlItemId;
      const choiceId = allocateEntityId(state, "choice");
      state.pendingChoice = {
        kind: "google_it",
        id: choiceId,
        ownerPlayerId: character.ownerPlayerId,
        characterId,
        candidateItemIds: [first, second]
      };
      state.phase = "resolving_choice";
      emit(state, "pending_choice_created", { choiceId, characterId, ownerPlayerId: character.ownerPlayerId });
      return;
    }
    case "other-duties-as-assigned":
      throw new Error("Other Duties is resolved through its copied ability.");
  }
}

function validateItemTarget(
  state: SystemCrawlState,
  character: SystemCrawlCharacter,
  itemId: SystemCrawlItemId,
  target: SystemCrawlTarget | undefined
): void {
  switch (itemId) {
    case "coffee": {
      if (!target || target.type !== "character") throw new SystemCrawlRuleError("invalid_target", "Coffee requires a character target.");
      const ally = state.characters[target.characterId];
      if (!ally || ally.downed) throw new SystemCrawlRuleError("invalid_target", "Coffee requires a living character.");
      if (ally.id !== character.id && !isCardinallyAdjacent(state, character.position, ally.position)) {
        throw new SystemCrawlRuleError("out_of_range", "Coffee targets its user or an adjacent ally.");
      }
      return;
    }
    case "admin-credentials": {
      if (!target || target.type !== "door") throw new SystemCrawlRuleError("invalid_target", "Choose a locked door.");
      const door = state.maps.flatMap((map) => map.doors).find((candidate) => candidate.id === target.doorId);
      if (!door || door.open) throw new SystemCrawlRuleError("invalid_target", "Choose a closed locked door.");
      if (!isCardinallyAdjacent(state, character.position, door.position)) throw new SystemCrawlRuleError("out_of_range", "The door must be adjacent.");
      return;
    }
    case "approved-change-request":
      requireEnemyTarget(state, character, target, 3);
      return;
    case "spare-laptop": {
      if (!target || target.type !== "character") throw new SystemCrawlRuleError("invalid_target", "Choose a downed ally.");
      const ally = state.characters[target.characterId];
      if (!ally || ally.id === character.id || !ally.downed) throw new SystemCrawlRuleError("invalid_target", "Spare Laptop requires a downed ally.");
      requireRangeAndSight(state, character.position, ally.position, 3);
      return;
    }
    case "budget-exception":
      if (target && (target.type !== "character" || target.characterId !== character.id)) {
        throw new SystemCrawlRuleError("invalid_target", "Budget Exception targets only its user.");
      }
      return;
    case "vendor-documentation":
      if (state.revealedCardCount >= state.maps.length) throw new SystemCrawlRuleError("invalid_item_use", "Every map card is already revealed.");
      if (target && (target.type !== "character" || target.characterId !== character.id)) {
        throw new SystemCrawlRuleError("invalid_target", "Vendor Documentation does not take a target.");
      }
      return;
    case "ethernet-cable":
      requireEnemyTarget(state, character, target, 4);
      return;
    case "noise-canceling-headphones":
      throw new SystemCrawlRuleError("invalid_item_use", "Noise-Canceling Headphones are passive.");
  }
}

function resolveItemEffect(
  state: SystemCrawlState,
  characterId: string,
  itemId: SystemCrawlItemId,
  target: SystemCrawlTarget | undefined
): void {
  switch (itemId) {
    case "coffee":
      healCharacter(state, characterIdFrom(target), 3, characterId);
      return;
    case "admin-credentials": {
      const doorId = (target as Extract<SystemCrawlTarget, { type: "door" }>).doorId;
      const door = state.maps.flatMap((map) => map.doors).find((candidate) => candidate.id === doorId);
      if (door) door.open = true;
      emit(state, "status_removed", { doorId, status: "locked" });
      return;
    }
    case "approved-change-request": {
      const enemy = state.enemies[enemyIdFrom(target)] as SystemCrawlEnemy;
      enemy.statuses.stunnedNextActivation = true;
      emit(state, "status_applied", { enemyId: enemy.id, status: "stunned" });
      return;
    }
    case "spare-laptop":
      reviveCharacter(state, characterIdFrom(target), 4, characterId);
      return;
    case "budget-exception": {
      const character = state.characters[characterId] as SystemCrawlCharacter;
      character.statuses.nextDamageBonus = 2;
      emit(state, "status_applied", { characterId, status: "next_damage_bonus", amount: 2 });
      return;
    }
    case "vendor-documentation":
      revealCard(state, state.revealedCardCount);
      return;
    case "ethernet-cable":
      damageEnemyFromAction(state, characterId, enemyIdFrom(target), 2);
      return;
    case "noise-canceling-headphones":
      return;
  }
}

function chooseAdventureMaps(state: SystemCrawlState) {
  const entry = takeRandom(state, ENTRY_MAPS);
  const shuffledStandards = shuffleSeeded(state.rngState, STANDARD_MAPS);
  state.rngState = shuffledStandards.state;
  const boss = takeRandom(state, BOSS_MAPS);
  return [entry, shuffledStandards.values[0], shuffledStandards.values[1], boss].filter(
    (template): template is NonNullable<typeof template> => Boolean(template)
  );
}

function createDynamicMap(state: SystemCrawlState, templateId: string, cardIndex: number): SystemCrawlMapCard {
  const template = SYSTEM_CRAWL_MAPS_BY_ID[templateId];
  if (!template) throw new Error(`Unknown map template: ${templateId}`);
  return {
    cardIndex,
    templateId,
    revealed: false,
    doors: template.doors.map((door) => ({
      id: `${cardIndex}:${door.id}`,
      position: { cardIndex, ...door.position },
      open: !door.locked
    })),
    caches: template.itemCacheSpawns.map((cache) => ({
      id: `${cardIndex}:${cache.id}`,
      position: { cardIndex, ...cache.position },
      itemId: takeRandom(state, ITEM_IDS),
      pickedUp: false
    }))
  };
}

function createCharacters(state: SystemCrawlState, entryPositions: readonly { x: number; y: number }[]) {
  const characters: Record<string, SystemCrawlCharacter> = {};
  let partyOrder = 0;
  for (const player of state.players) {
    for (const classId of state.classSelections[player.id] ?? []) {
      const definition = CLASS_DEFINITIONS[classId];
      const entry = entryPositions[partyOrder];
      if (!entry) throw new Error("The selected entry map does not have enough player positions.");
      const id = `character:${classId}`;
      characters[id] = {
        id,
        ownerPlayerId: player.id,
        classId,
        displayName: definition.displayName,
        partyOrder,
        hp: definition.maxHp,
        maxHp: definition.maxHp,
        baseMovement: definition.movement,
        position: { cardIndex: 0, ...entry },
        downed: false,
        carriedItemId: null,
        lastActionKey: null,
        turnsStarted: 0,
        statuses: {
          firewallShield: null,
          dodgeNextAttack: false,
          dodgeExpiresAtTurn: null,
          movementBoostNextTurn: false,
          actionBlockedNextTurn: false,
          nextDamageBonus: 0
        }
      };
      partyOrder += 1;
    }
  }
  return characters;
}

function revealCard(state: SystemCrawlState, cardIndex: number): void {
  const card = state.maps[cardIndex];
  if (!card || card.revealed) return;
  if (cardIndex > state.revealedCardCount) throw new Error("Map cards must be revealed in order.");
  const template = SYSTEM_CRAWL_MAPS_BY_ID[card.templateId];
  if (!template) throw new Error(`Unknown map template: ${card.templateId}`);
  card.revealed = true;
  state.revealedCardCount = Math.max(state.revealedCardCount, cardIndex + 1);
  emit(state, "map_card_revealed", { cardIndex, templateId: template.id, displayName: template.displayName });

  for (const spawn of template.enemySpawns) {
    const definitionId = takeRandom(state, spawn.choices);
    spawnEnemy(state, definitionId, { cardIndex, ...spawn.position });
  }
  if (template.role === "boss" && template.bossSpawn) {
    spawnEnemy(state, "legacy-system", { cardIndex, ...template.bossSpawn });
  }
  for (const cache of card.caches) emit(state, "item_cache_spawned", { cacheId: cache.id, position: cache.position });
}

function spawnEnemy(state: SystemCrawlState, definitionId: SystemCrawlEnemyId, position: Position): SystemCrawlEnemy {
  const definition = ENEMY_DEFINITIONS[definitionId];
  const characterCount = state.turnOrder.length || Object.keys(state.characters).length;
  const bossBonus = definitionId === "legacy-system" ? Math.max(0, characterCount - 2) * 3 : 0;
  const id = allocateEntityId(state, "enemy");
  const enemy: SystemCrawlEnemy = {
    id,
    definitionId,
    displayName: definition.displayName,
    hp: definition.maxHp + bossBonus,
    maxHp: definition.maxHp + bossBonus,
    baseMovement: definition.movement,
    attackRange: definition.attackRange,
    damage: definition.damage,
    position,
    spawnOrder: state.nextEntityId,
    revealedRound: state.round,
    statuses: {
      movementReductionNextActivation: 0,
      stunnedNextActivation: false,
      tauntedByCharacterId: null
    },
    backwardCompatibilityUsedThisRound: false,
    undocumentedDependencyTriggered: false
  };
  state.enemies[id] = enemy;
  emit(state, "enemy_spawned", { enemyId: id, definitionId, position, hp: enemy.hp });
  return enemy;
}

function handleEnteredTile(state: SystemCrawlState, character: SystemCrawlCharacter): void {
  const frontierIndex = state.revealedCardCount - 1;
  const frontierCard = state.maps[frontierIndex];
  const frontierTemplate = frontierCard ? SYSTEM_CRAWL_MAPS_BY_ID[frontierCard.templateId] : undefined;
  if (
    frontierTemplate?.exit &&
    character.position.cardIndex === frontierIndex &&
    character.position.x === frontierTemplate.exit.x &&
    character.position.y === frontierTemplate.exit.y &&
    state.revealedCardCount < state.maps.length
  ) {
    revealCard(state, state.revealedCardCount);
  }
  const card = state.maps[character.position.cardIndex];
  const cache = card?.caches.find((candidate) => !candidate.pickedUp && samePosition(candidate.position, character.position));
  if (cache && character.carriedItemId === null) {
    cache.pickedUp = true;
    character.carriedItemId = cache.itemId;
    emit(state, "item_picked_up", { characterId: character.id, cacheId: cache.id, itemId: cache.itemId });
  }
}

function beginRound(state: SystemCrawlState, round: number): void {
  state.round = round;
  for (const enemy of Object.values(state.enemies)) {
    if (enemy.definitionId === "legacy-system") enemy.backwardCompatibilityUsedThisRound = false;
  }
  emit(state, "round_started", { round });
  const first = state.turnOrder.map((id) => state.characters[id]).find((character) => character && !character.downed);
  if (!first) {
    finishDefeat(state);
    return;
  }
  state.phase = "player_turn";
  state.activeCharacterId = first.id;
  startCharacterTurn(state, first.id, []);
}

function startCharacterTurn(state: SystemCrawlState, characterId: string, actedCharacterIdsThisRound: string[]): void {
  const character = state.characters[characterId] as SystemCrawlCharacter;
  character.turnsStarted += 1;

  for (const ally of Object.values(state.characters)) {
    const shield = ally.statuses.firewallShield;
    if (shield?.sourceCharacterId === characterId && shield.expiresAtSourceTurn <= character.turnsStarted) {
      ally.statuses.firewallShield = null;
      emit(state, "status_removed", { characterId: ally.id, status: "firewall", reason: "expired" });
    }
  }
  if (character.statuses.dodgeExpiresAtTurn !== null && character.statuses.dodgeExpiresAtTurn <= character.turnsStarted) {
    if (character.statuses.dodgeNextAttack) emit(state, "status_removed", { characterId, status: "dodge_next_attack", reason: "expired" });
    character.statuses.dodgeNextAttack = false;
    character.statuses.dodgeExpiresAtTurn = null;
  }

  const movementAllowance = getCharacterMovementAllowance(state, characterId);
  character.statuses.movementBoostNextTurn = false;
  const actionBlocked = character.statuses.actionBlockedNextTurn;
  character.statuses.actionBlockedNextTurn = false;
  state.turn = {
    movementAllowance,
    movementSpent: 0,
    actionUsed: false,
    actionBlocked,
    actedCharacterIdsThisRound: [...actedCharacterIdsThisRound]
  };
  state.activeCharacterId = characterId;
}

function finishCharacterTurn(state: SystemCrawlState, characterId: string): void {
  const character = state.characters[characterId] as SystemCrawlCharacter;
  const turn = state.turn as NonNullable<SystemCrawlState["turn"]>;
  const rebooted = !turn.actionUsed;
  if (rebooted) character.lastActionKey = null;
  const acted = [...turn.actedCharacterIdsThisRound, characterId];
  emit(state, "turn_ended", { characterId, rebooted });
  const nextCharacter = state.turnOrder
    .map((id) => state.characters[id])
    .find((candidate) => candidate && !candidate.downed && !acted.includes(candidate.id));
  if (nextCharacter) {
    startCharacterTurn(state, nextCharacter.id, acted);
    return;
  }
  runEnemyPhase(state);
}

function runEnemyPhase(state: SystemCrawlState): void {
  state.phase = "enemy_phase";
  state.activeCharacterId = null;
  state.turn = null;
  emit(state, "enemy_phase_started", { round: state.round });
  const activationIds = Object.values(state.enemies)
    .filter((enemy) => enemy.hp > 0)
    .sort((left, right) => left.spawnOrder - right.spawnOrder || left.id.localeCompare(right.id))
    .map((enemy) => enemy.id);
  for (const enemyId of activationIds) {
    if (isFinished(state)) return;
    const enemy = state.enemies[enemyId];
    if (enemy?.hp && enemy.hp > 0) activateEnemy(state, enemy);
  }
  for (const enemy of Object.values(state.enemies)) {
    if (enemy.hp > 0 && enemy.definitionId === "scope-creep") {
      enemy.maxHp += 1;
      enemy.hp += 1;
      emit(state, "enemy_grew", { enemyId: enemy.id, hp: enemy.hp, maxHp: enemy.maxHp });
    }
  }
  if (allCharactersDown(state)) {
    finishDefeat(state);
    return;
  }
  beginRound(state, state.round + 1);
}

function activateEnemy(state: SystemCrawlState, enemy: SystemCrawlEnemy): void {
  const movementReduction = enemy.statuses.movementReductionNextActivation;
  if (enemy.statuses.stunnedNextActivation) {
    enemy.statuses.stunnedNextActivation = false;
    enemy.statuses.movementReductionNextActivation = 0;
    enemy.statuses.tauntedByCharacterId = null;
    emit(state, "enemy_stunned", { enemyId: enemy.id });
    return;
  }
  const target = selectEnemyTarget(state, enemy);
  if (!target) {
    clearActivationStatuses(enemy);
    return;
  }
  if (canEnemyAttack(state, enemy, target)) {
    enemyAttack(state, enemy, target);
    clearActivationStatuses(enemy);
    return;
  }

  const movement = Math.max(0, enemy.baseMovement - movementReduction);
  if (movement > 0) {
    const path = canonicalShortestPath(state, enemy.position, target.position, {
      ignoreEnemyId: enemy.id,
      allowOccupiedDestination: true
    });
    if (path) {
      const walkable = path.slice(1, -1);
      const steps = walkable.slice(0, movement);
      if (steps.length > 0) {
        enemy.position = steps[steps.length - 1] as Position;
        emit(state, "enemy_moved", { enemyId: enemy.id, path: [path[0] as Position, ...steps] });
      }
    }
  }
  if (canEnemyAttack(state, enemy, target)) enemyAttack(state, enemy, target);
  clearActivationStatuses(enemy);
}

function selectEnemyTarget(state: SystemCrawlState, enemy: SystemCrawlEnemy): SystemCrawlCharacter | null {
  const living = Object.values(state.characters).filter((character) => !character.downed);
  const tauntTarget = enemy.statuses.tauntedByCharacterId
    ? living.find((character) => character.id === enemy.statuses.tauntedByCharacterId)
    : undefined;
  if (tauntTarget && isLegallyReachableOrAttackable(state, enemy, tauntTarget)) return tauntTarget;

  const candidates = living.map((character) => ({
    character,
    path: canonicalShortestPath(state, enemy.position, character.position, {
      ignoreEnemyId: enemy.id,
      allowOccupiedDestination: true
    })
  })).filter((candidate) => candidate.path !== null);
  candidates.sort((left, right) =>
    ((left.path?.length ?? Number.MAX_SAFE_INTEGER) - (right.path?.length ?? Number.MAX_SAFE_INTEGER)) ||
    left.character.hp - right.character.hp ||
    left.character.partyOrder - right.character.partyOrder
  );
  return candidates[0]?.character ?? null;
}

function isLegallyReachableOrAttackable(
  state: SystemCrawlState,
  enemy: SystemCrawlEnemy,
  character: SystemCrawlCharacter
): boolean {
  return canEnemyAttack(state, enemy, character) || canonicalShortestPath(state, enemy.position, character.position, {
    ignoreEnemyId: enemy.id,
    allowOccupiedDestination: true
  }) !== null;
}

function canEnemyAttack(state: SystemCrawlState, enemy: SystemCrawlEnemy, character: SystemCrawlCharacter): boolean {
  return !character.downed &&
    manhattanDistance(enemy.position, character.position) <= enemy.attackRange &&
    hasLineOfSight(state, enemy.position, character.position);
}

function enemyAttack(state: SystemCrawlState, enemy: SystemCrawlEnemy, character: SystemCrawlCharacter): void {
  emit(state, "enemy_attacked", { enemyId: enemy.id, characterId: character.id, damage: enemy.damage });
  if (enemy.definitionId === "meeting") {
    if (character.carriedItemId === "noise-canceling-headphones") {
      character.carriedItemId = null;
      emit(state, "item_prevented_status", {
        characterId: character.id,
        source: "noise-canceling-headphones",
        preventedStatus: "action_blocked"
      });
      return;
    }
    character.statuses.actionBlockedNextTurn = true;
    emit(state, "status_applied", { characterId: character.id, status: "action_blocked", enemyId: enemy.id });
    return;
  }
  damageCharacter(state, character.id, enemy.damage, { attack: true, unmitigated: false, sourceId: enemy.id });
}

function clearActivationStatuses(enemy: SystemCrawlEnemy): void {
  enemy.statuses.movementReductionNextActivation = 0;
  enemy.statuses.tauntedByCharacterId = null;
}

function damageEnemyFromAction(state: SystemCrawlState, characterId: string, enemyId: string, baseDamage: number): void {
  const character = state.characters[characterId] as SystemCrawlCharacter;
  const bonus = character.statuses.nextDamageBonus;
  character.statuses.nextDamageBonus = 0;
  damageEnemy(state, enemyId, baseDamage + bonus, characterId);
  if (bonus > 0) emit(state, "status_removed", { characterId, status: "next_damage_bonus", reason: "consumed" });
}

function damageEnemy(state: SystemCrawlState, enemyId: string, requestedDamage: number, sourceCharacterId: string): void {
  const enemy = state.enemies[enemyId];
  if (!enemy || enemy.hp <= 0) return;
  let damage = requestedDamage;
  if (enemy.definitionId === "legacy-system" && !enemy.backwardCompatibilityUsedThisRound) {
    const prevented = Math.min(2, damage);
    damage -= prevented;
    enemy.backwardCompatibilityUsedThisRound = true;
    emit(state, "damage_prevented", { enemyId, source: "backward-compatibility", prevented });
  }
  enemy.hp = Math.max(0, enemy.hp - damage);
  emit(state, "damage_dealt", {
    sourceCharacterId,
    enemyId,
    requestedDamage,
    damage,
    remainingHp: enemy.hp
  });
  if (enemy.hp <= 0) {
    emit(state, "enemy_defeated", { enemyId, definitionId: enemy.definitionId, sourceCharacterId });
    if (enemy.definitionId === "legacy-system") finishVictory(state);
    return;
  }
  if (
    enemy.definitionId === "legacy-system" &&
    !enemy.undocumentedDependencyTriggered &&
    enemy.hp <= enemy.maxHp / 2
  ) {
    enemy.undocumentedDependencyTriggered = true;
    spawnBossMinions(state, enemy);
  }
}

function spawnBossMinions(state: SystemCrawlState, boss: SystemCrawlEnemy): void {
  const card = state.maps[boss.position.cardIndex];
  const template = card ? SYSTEM_CRAWL_MAPS_BY_ID[card.templateId] : undefined;
  if (!template) return;
  const candidates = template.minionSpawns
    .map((point, order) => ({ position: { cardIndex: boss.position.cardIndex, ...point }, order }))
    .filter(({ position }) => !isPositionBlocked(state, position))
    .sort((left, right) =>
      manhattanDistance(boss.position, left.position) - manhattanDistance(boss.position, right.position) || left.order - right.order
    )
    .slice(0, 2);
  const spawnedIds = candidates.map(({ position }) => spawnEnemy(state, "bug", position).id);
  emit(state, "boss_phase_changed", { enemyId: boss.id, phase: "undocumented-dependency", spawnedIds });
}

function damageCharacter(
  state: SystemCrawlState,
  characterId: string,
  requestedDamage: number,
  options: { attack: boolean; unmitigated: boolean; sourceId: string }
): void {
  const character = state.characters[characterId];
  if (!character || character.downed) return;
  let damage = requestedDamage;
  if (options.attack && damage > 0 && character.statuses.dodgeNextAttack) {
    character.statuses.dodgeNextAttack = false;
    character.statuses.dodgeExpiresAtTurn = null;
    emit(state, "damage_prevented", { characterId, source: "works-on-my-machine", prevented: damage });
    emit(state, "dodge_triggered", { characterId, source: "works-on-my-machine" });
    return;
  }
  if (options.attack && !options.unmitigated && character.classId === "infrastructure-architect" && drawRandom(state) < 0.3) {
    const prevented = Math.min(2, damage);
    damage -= prevented;
    emit(state, "damage_prevented", { characterId, source: "redundancy", prevented });
    emit(state, "defense_triggered", { characterId, source: "redundancy", prevented });
  }
  if (!options.unmitigated && damage > 0 && character.statuses.firewallShield) {
    const prevented = Math.min(character.statuses.firewallShield.amount, damage);
    character.statuses.firewallShield.amount -= prevented;
    damage -= prevented;
    emit(state, "damage_prevented", { characterId, source: "firewall", prevented });
    if (character.statuses.firewallShield.amount <= 0) character.statuses.firewallShield = null;
  }
  character.hp = Math.max(0, character.hp - damage);
  emit(state, "damage_dealt", {
    sourceId: options.sourceId,
    characterId,
    requestedDamage,
    damage,
    remainingHp: character.hp
  });
  if (character.hp <= 0) {
    character.downed = true;
    emit(state, "character_downed", { characterId, sourceId: options.sourceId });
    if (allCharactersDown(state)) finishDefeat(state);
  }
}

function healCharacter(state: SystemCrawlState, characterId: string, amount: number, sourceCharacterId: string): void {
  const character = state.characters[characterId];
  if (!character || character.downed) return;
  const previousHp = character.hp;
  character.hp = Math.min(character.maxHp, character.hp + amount);
  emit(state, "healing", { characterId, sourceCharacterId, amount: character.hp - previousHp, hp: character.hp });
}

function reviveCharacter(state: SystemCrawlState, characterId: string, hp: number, sourceCharacterId: string): void {
  const character = state.characters[characterId];
  if (!character?.downed) return;
  character.downed = false;
  character.hp = Math.min(character.maxHp, hp);
  emit(state, "character_revived", { characterId, sourceCharacterId, hp: character.hp });
}

function pushEnemyDirectlyAway(state: SystemCrawlState, character: SystemCrawlCharacter, enemy: SystemCrawlEnemy): void {
  const characterGlobalX = character.position.cardIndex * 9 + character.position.x;
  const enemyGlobalX = enemy.position.cardIndex * 9 + enemy.position.x;
  const dx = enemyGlobalX - characterGlobalX;
  const dy = enemy.position.y - character.position.y;
  if ((dx === 0) === (dy === 0)) return;
  const globalX = enemyGlobalX + Math.sign(dx);
  const destination: Position = dx === 0
    ? { ...enemy.position, y: enemy.position.y + Math.sign(dy) }
    : { cardIndex: Math.floor(globalX / 9), x: globalX % 9, y: enemy.position.y };
  if (isPositionBlocked(state, destination, { ignoreEnemyId: enemy.id })) return;
  const origin = enemy.position;
  enemy.position = destination;
  emit(state, "enemy_moved", { enemyId: enemy.id, path: [origin, destination], forcedByCharacterId: character.id });
}

function requirePlayer(state: SystemCrawlState, playerId: string): void {
  if (!state.players.some((player) => player.id === playerId)) {
    throw new SystemCrawlRuleError("not_character_owner", "That player is not part of this adventure.");
  }
}

function requireActiveCharacter(
  state: SystemCrawlState,
  actorPlayerId: string,
  characterId: string
): SystemCrawlCharacter {
  if (state.phase !== "player_turn") wrongPhase("A character command requires the player-turn phase.");
  const character = state.characters[characterId];
  if (!character || character.ownerPlayerId !== actorPlayerId) {
    throw new SystemCrawlRuleError("not_character_owner", "The actor does not own that character.");
  }
  if (state.activeCharacterId !== characterId) {
    throw new SystemCrawlRuleError("not_current_character", "That character is not currently active.");
  }
  if (character.downed) throw new SystemCrawlRuleError("not_current_character", "Downed characters do not take turns.");
  return character;
}

function requireActionAvailable(
  state: SystemCrawlState,
  actorPlayerId: string,
  characterId: string,
  actionKey: string
): SystemCrawlCharacter {
  const character = requireActiveCharacter(state, actorPlayerId, characterId);
  const turn = state.turn as NonNullable<SystemCrawlState["turn"]>;
  if (turn.actionBlocked || turn.actionUsed) {
    throw new SystemCrawlRuleError("action_already_used", turn.actionBlocked ? "This character's action is blocked." : "This character already used an action.");
  }
  if (character.lastActionKey === actionKey) {
    throw new SystemCrawlRuleError("repeated_action", "A character cannot repeat its previous non-movement action.");
  }
  return character;
}

function requireEnemyTarget(
  state: SystemCrawlState,
  character: SystemCrawlCharacter,
  target: SystemCrawlTarget | undefined,
  range: number
): SystemCrawlEnemy {
  if (!target || target.type !== "enemy") throw new SystemCrawlRuleError("invalid_target", "Choose a living enemy.");
  const enemy = state.enemies[target.enemyId];
  if (!enemy || enemy.hp <= 0) throw new SystemCrawlRuleError("invalid_target", "Choose a living enemy.");
  requireRangeAndSight(state, character.position, enemy.position, range);
  return enemy;
}

function requireLivingCharacterTarget(
  state: SystemCrawlState,
  character: SystemCrawlCharacter,
  target: SystemCrawlTarget | undefined,
  range: number
): SystemCrawlCharacter {
  if (!target || target.type !== "character") throw new SystemCrawlRuleError("invalid_target", "Choose a living character.");
  const ally = state.characters[target.characterId];
  if (!ally || ally.downed) throw new SystemCrawlRuleError("invalid_target", "Choose a living character.");
  requireRangeAndSight(state, character.position, ally.position, range);
  return ally;
}

function requireRangeAndSight(state: SystemCrawlState, origin: Position, target: Position, range: number): void {
  if (manhattanDistance(origin, target) > range) throw new SystemCrawlRuleError("out_of_range", "The target is out of range.");
  if (!hasLineOfSight(state, origin, target)) throw new SystemCrawlRuleError("line_of_sight_blocked", "Line of sight is blocked.");
}

function completeAction(state: SystemCrawlState, characterId: string, actionKey: string): void {
  const turn = state.turn;
  const character = state.characters[characterId];
  if (turn) turn.actionUsed = true;
  if (character) character.lastActionKey = actionKey;
}

function finishVictory(state: SystemCrawlState): void {
  state.phase = "victory";
  state.activeCharacterId = null;
  state.turn = null;
  state.pendingChoice = null;
  emit(state, "victory", { round: state.round });
}

function finishDefeat(state: SystemCrawlState): void {
  if (state.phase === "defeat") return;
  state.phase = "defeat";
  state.activeCharacterId = null;
  state.turn = null;
  state.pendingChoice = null;
  emit(state, "defeat", { round: state.round });
}

function allCharactersDown(state: SystemCrawlState): boolean {
  const characters = Object.values(state.characters);
  return characters.length > 0 && characters.every((character) => character.downed);
}

function selectionsComplete(state: SystemCrawlState): boolean {
  const required = state.players.length === 1 ? 2 : 1;
  const selected = state.players.flatMap((player) => state.classSelections[player.id] ?? []);
  return state.players.every((player) => state.classSelections[player.id]?.length === required) && new Set(selected).size === selected.length;
}

function takeRandom<T>(state: SystemCrawlState, values: readonly T[]): T {
  const selected = randomIndex(state.rngState, values.length);
  state.rngState = selected.state;
  return values[selected.index] as T;
}

function drawRandom(state: SystemCrawlState): number {
  const selected = randomIndex(state.rngState, 0x1_0000);
  state.rngState = selected.state;
  return selected.index / 0x1_0000;
}

function allocateEntityId(state: SystemCrawlState, prefix: string): string {
  const id = `${prefix}:${state.nextEntityId}`;
  state.nextEntityId += 1;
  return id;
}

function emit(state: SystemCrawlState, type: SystemCrawlEvent["type"], data: Record<string, unknown>): void {
  state.events.push({ id: state.nextEventId, type, round: state.round, data: data as Record<string, JsonValue> });
  state.nextEventId += 1;
  if (state.events.length > 100) state.events = state.events.slice(-100);
}

function isFinished(state: SystemCrawlState): boolean {
  return state.phase === "victory" || state.phase === "defeat";
}

function enemyIdFrom(target: SystemCrawlTarget | undefined): string {
  if (!target || target.type !== "enemy") throw new Error("Validated enemy target is missing.");
  return target.enemyId;
}

function characterIdFrom(target: SystemCrawlTarget | undefined): string {
  if (!target || target.type !== "character") throw new Error("Validated character target is missing.");
  return target.characterId;
}

function cloneState(state: SystemCrawlState): SystemCrawlState {
  return JSON.parse(JSON.stringify(state)) as SystemCrawlState;
}

function wrongPhase(message: string): never {
  throw new SystemCrawlRuleError("wrong_phase", message);
}
