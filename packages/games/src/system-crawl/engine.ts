import {
  ABILITY_DEFINITIONS,
  CLASS_DEFINITIONS,
  ENEMY_DEFINITIONS,
  INCIDENT_DEFINITIONS,
  INCIDENT_IDS,
  ITEM_DEFINITIONS,
  ITEM_IDS,
  SYSTEM_CRAWL_BALANCE,
  partySizeBaseline
} from "./content";
import { ENTRY_MAPS, STANDARD_MAPS, SYSTEM_CRAWL_MAPS_BY_ID } from "./maps";
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
  type SystemCrawlIncidentId,
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
    incidentId: null,
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
    hazards: [],
    skipNextEnemyPhase: false,
    outageBoostPending: false,
    pendingTurnOrderRotations: 0,
    legendaryItemAssigned: false,
    lastDamagingAbility: null,
    abilityHistory: [],
    stats: {
      enemiesDefeated: 0,
      bossDefeated: false,
      damagePrevented: 0,
      itemsUsed: 0,
      revivals: 0,
      charactersDowned: 0,
      byCharacter: {}
    },
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
    case "continue_briefing":
      next = continueBriefing(state, actorPlayerId);
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
  next.incidentId = chooseIncident(next);
  const templates = chooseAdventureMaps(next);
  next.maps = templates.map((template, cardIndex) => createDynamicMap(next, template.id, cardIndex));
  next.characters = createCharacters(next, templates[0]?.playerEntryPositions ?? []);
  next.turnOrder = Object.values(next.characters).sort((left, right) => left.partyOrder - right.partyOrder).map((character) => character.id);
  next.stats.byCharacter = Object.fromEntries(next.turnOrder.map((characterId) => [characterId, {
    damageDealt: 0, healingPerformed: 0, damagePrevented: 0, itemsUsed: 0, revivals: 0, downs: 0
  }]));
  next.round = 0;
  next.phase = "incident_briefing";
  emit(next, "incident_selected", { incidentId: next.incidentId });
  return next;
}

function continueBriefing(state: SystemCrawlState, actorPlayerId: string): SystemCrawlState {
  if (state.phase !== "incident_briefing") wrongPhase("The incident briefing is not active.");
  if (actorPlayerId !== state.hostPlayerId) throw new SystemCrawlRuleError("not_host", "Only the host may begin the incident.");
  const next = cloneState(state);
  next.round = 1;
  emit(next, "incident_briefing_completed", { incidentId: next.incidentId });
  emit(next, "adventure_started", { characterIds: next.turnOrder, incidentId: next.incidentId });
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
  if (character.statuses.lockedAbilityId === abilityId) {
    throw new SystemCrawlRuleError("invalid_target", "That ability is temporarily locked by Strategic Realignment.");
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
    playerDisplayName: playerDisplayNameForCharacter(next, characterId),
    ...(copied ? { copiedAbilityId: copied.abilityId, copiedFromCharacterId: copied.characterId } : {})
  });
  const effectEventId = next.nextEventId;
  resolveAbilityEffect(next, characterId, resolvedAbilityId, target);
  const dealtDamage = next.events.some((event) =>
    event.id >= effectEventId &&
    event.type === "damage_dealt" &&
    event.data.sourceCharacterId === characterId &&
    typeof event.data.enemyId === "string" &&
    typeof event.data.damage === "number" &&
    event.data.damage > 0
  );
  if (ABILITY_DEFINITIONS[resolvedAbilityId].damaging && dealtDamage) {
    next.lastDamagingAbility = {
      characterId,
      abilityId: resolvedAbilityId,
      damage: abilityDamage(resolvedAbilityId),
      range: ABILITY_DEFINITIONS[resolvedAbilityId].range
    };
  }
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
  const definition = ITEM_DEFINITIONS[itemId];
  if (definition.effect === "passive") {
    throw new SystemCrawlRuleError("invalid_item_use", "Passive items cannot be activated.");
  }
  if (definition.effect === "free") {
    if (state.turn?.freeItemUsed) throw new SystemCrawlRuleError("action_already_used", "Only one free item may be used during a turn.");
    if (state.turn?.actionUsed) throw new SystemCrawlRuleError("action_already_used", "A free item must be used before the normal action.");
  } else {
    requireActionAvailable(state, actorPlayerId, characterId, `item:${itemId}`);
  }
  validateItemTarget(state, character, itemId, target);
  const next = cloneState(state);
  emit(next, "item_used", { characterId, itemId, playerDisplayName: playerDisplayNameForCharacter(next, characterId) });
  resolveItemEffect(next, characterId, itemId, target);
  const nextCharacter = next.characters[characterId] as SystemCrawlCharacter;
  nextCharacter.carriedItemId = null;
  if (definition.effect === "free") {
    if (next.turn) next.turn.freeItemUsed = true;
  } else {
    completeAction(next, characterId, `item:${itemId}`);
  }
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
    case "known-good-backup":
      throw new SystemCrawlRuleError("invalid_item_use", "Noise-Canceling Headphones are passive.");
    case "stack-overflow-answer": {
      if (!target || target.type !== "ability") throw new SystemCrawlRuleError("invalid_target", "Choose the repeated ability to unlock.");
      if (!CLASS_DEFINITIONS[character.classId].abilityIds.includes(target.abilityId)) {
        throw new SystemCrawlRuleError("invalid_target", "That ability does not belong to this character.");
      }
      if (character.lastActionKey !== `ability:${target.abilityId}`) {
        throw new SystemCrawlRuleError("invalid_item_use", "Stack Overflow Answer only unlocks the ability blocked by the repeat rule.");
      }
      return;
    }
    case "maintenance-window":
      if (target && (target.type !== "character" || target.characterId !== character.id)) {
        throw new SystemCrawlRuleError("invalid_target", "Maintenance Window does not take a target.");
      }
      return;
    case "rubber-duck-debugging": {
      const ally = requireLivingCharacterTarget(state, character, target, 2);
      if (!hasCleanseableStatus(ally) && ally.statuses.nextDamageBonus > 0) {
        throw new SystemCrawlRuleError("invalid_item_use", "The target already has a damage bonus and no negative status.");
      }
      return;
    }
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
    case "known-good-backup":
      return;
    case "stack-overflow-answer": {
      const character = state.characters[characterId] as SystemCrawlCharacter;
      character.statuses.repeatOverrideAbilityId = (target as Extract<SystemCrawlTarget, { type: "ability" }>).abilityId;
      emit(state, "status_applied", { characterId, status: "repeat_override", abilityId: character.statuses.repeatOverrideAbilityId });
      return;
    }
    case "maintenance-window":
      state.skipNextEnemyPhase = true;
      emit(state, "status_applied", { characterId, status: "maintenance_window" });
      return;
    case "rubber-duck-debugging": {
      const ally = state.characters[characterIdFrom(target)] as SystemCrawlCharacter;
      cleanseOneNegativeStatus(state, ally);
      ally.statuses.nextDamageBonus += 1;
      emit(state, "status_applied", { characterId: ally.id, status: "next_damage_bonus", amount: 1, sourceCharacterId: characterId });
      return;
    }
  }
}

function chooseAdventureMaps(state: SystemCrawlState) {
  const incident = state.incidentId ? INCIDENT_DEFINITIONS[state.incidentId] : undefined;
  if (!incident) throw new Error("An incident must be selected before choosing maps.");
  const entry = takeRandom(state, ENTRY_MAPS);
  const firstStandard = weightedTake(state, STANDARD_MAPS, (map) => incident.mapWeights[map.id] ?? 1);
  const remaining = STANDARD_MAPS.filter((map) => map.id !== firstStandard.id);
  const secondStandard = weightedTake(state, remaining, (map) => (incident.mapWeights[map.id] ?? 1) * (map.id === "the-cloud" ? 2 : 1));
  const boss = SYSTEM_CRAWL_MAPS_BY_ID[incident.bossMapId];
  return [entry, firstStandard, secondStandard, boss].filter(
    (template): template is NonNullable<typeof template> => Boolean(template)
  );
}

function createDynamicMap(state: SystemCrawlState, templateId: string, cardIndex: number): SystemCrawlMapCard {
  const template = SYSTEM_CRAWL_MAPS_BY_ID[templateId];
  if (!template) throw new Error(`Unknown map template: ${templateId}`);
  const modifierId = state.incidentId ? INCIDENT_DEFINITIONS[state.incidentId].modifierId : null;
  const evidenceRoom = modifierId === "evidence-rooms" && template.role === "standard";
  return {
    cardIndex,
    templateId,
    revealed: false,
    doors: template.doors.map((door) => ({
      id: `${cardIndex}:${door.id}`,
      position: { cardIndex, ...door.position },
      open: !door.locked || (!evidenceRoom && cardIndex % 2 === 0)
    })),
    caches: template.itemCacheSpawns.map((cache) => ({
      id: `${cardIndex}:${cache.id}`,
      position: { cardIndex, ...cache.position },
      itemId: drawLoot(state, template.role),
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
          immobilizedNextTurn: false,
          nextDamageBonus: 0,
          repeatOverrideAbilityId: null,
          lockedAbilityId: null,
          lockedAbilityExpiresAtTurn: null,
          corruptionDamageKeysThisTurn: []
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
  growTechnicalDebt(state, cardIndex);
  const partySize = partySizeBaseline(Object.keys(state.characters).length);
  const standardExtra = SYSTEM_CRAWL_BALANCE.encounter.extraStandardEnemiesByPartySize[partySize] ?? 0;
  const configuredCount = template.role === "entry"
    ? SYSTEM_CRAWL_BALANCE.encounter.entryEnemies
    : template.role === "standard"
      ? (SYSTEM_CRAWL_BALANCE.encounter.standardEnemiesByCard[cardIndex] ?? 2) + standardExtra
      : 0;
  const spawns = template.enemySpawns.slice(0, configuredCount);
  const modifierId = state.incidentId ? INCIDENT_DEFINITIONS[state.incidentId].modifierId : null;
  for (const [spawnIndex, spawn] of spawns.entries()) {
    const forcedDebt = modifierId === "forced-technical-debt" && (cardIndex === 1 || cardIndex === 2) && spawnIndex === 0;
    const definitionId = forcedDebt ? "technical-debt" : drawIncidentEnemy(state, spawn.choices, cardIndex);
    spawnEnemy(state, definitionId, { cardIndex, ...spawn.position });
  }
  if (template.role === "boss" && template.bossSpawn) {
    const incident = state.incidentId ? INCIDENT_DEFINITIONS[state.incidentId] : undefined;
    if (!incident) throw new Error("Boss reveal requires an incident.");
    const boss = spawnEnemy(state, incident.bossId, { cardIndex, ...template.bossSpawn });
    spawnEncounterMinions(state, boss, template.minionSpawns);
  }
  if (modifierId === "milestone-pressure") {
    const marker = [...template.enemySpawns.map((spawn) => spawn.position), ...template.minionSpawns]
      .map((point) => ({ cardIndex, ...point }))
      .find((position) => !isPositionBlocked(state, position));
    if (marker) spawnEnemy(state, "project-milestone", marker);
  }
  if (modifierId === "outage-velocity") state.outageBoostPending = true;
  if (modifierId === "turn-order-rotation") state.pendingTurnOrderRotations += 1;
  for (const cache of card.caches) emit(state, "item_cache_spawned", { cacheId: cache.id, position: cache.position });
}

function spawnEnemy(state: SystemCrawlState, definitionId: SystemCrawlEnemyId, position: Position): SystemCrawlEnemy {
  const definition = ENEMY_DEFINITIONS[definitionId];
  const characterCount = state.turnOrder.length || Object.keys(state.characters).length;
  const bossBonus = definition.kind === "boss"
    ? (SYSTEM_CRAWL_BALANCE.bossHpBonusByPartySize[partySizeBaseline(characterCount)] ?? 0)
    : 0;
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
    undocumentedDependencyTriggered: false,
    halfHealthTriggered: false,
    defeatSpawnTriggered: false,
    specialUsedRound: null
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
  applyCorruptionDamage(state, character, "entered");
}

function beginRound(state: SystemCrawlState, round: number): void {
  state.round = round;
  expireCorruption(state, round);
  while (state.pendingTurnOrderRotations > 0) {
    rotateLivingTurnOrder(state);
    state.pendingTurnOrderRotations -= 1;
  }
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
  character.statuses.corruptionDamageKeysThisTurn = [];
  if (
    character.statuses.lockedAbilityExpiresAtTurn !== null &&
    character.turnsStarted > character.statuses.lockedAbilityExpiresAtTurn
  ) {
    emit(state, "status_removed", { characterId, status: "ability_locked", abilityId: character.statuses.lockedAbilityId });
    character.statuses.lockedAbilityId = null;
    character.statuses.lockedAbilityExpiresAtTurn = null;
  }

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

  const movementAllowance = character.statuses.immobilizedNextTurn ? 0 : getCharacterMovementAllowance(state, characterId);
  if (character.statuses.immobilizedNextTurn) {
    character.statuses.immobilizedNextTurn = false;
    emit(state, "status_removed", { characterId, status: "immobilized", reason: "consumed" });
  }
  character.statuses.movementBoostNextTurn = false;
  const actionBlocked = character.statuses.actionBlockedNextTurn;
  character.statuses.actionBlockedNextTurn = false;
  state.turn = {
    movementAllowance,
    movementSpent: 0,
    actionUsed: false,
    actionBlocked,
    freeItemUsed: false,
    actedCharacterIdsThisRound: [...actedCharacterIdsThisRound]
  };
  state.activeCharacterId = characterId;
}

function finishCharacterTurn(state: SystemCrawlState, characterId: string): void {
  const character = state.characters[characterId] as SystemCrawlCharacter;
  const turn = state.turn as NonNullable<SystemCrawlState["turn"]>;
  const rebooted = !turn.actionUsed;
  applyCorruptionDamage(state, character, "turn-end");
  if (isFinished(state)) return;
  if (character.statuses.repeatOverrideAbilityId) {
    emit(state, "status_removed", { characterId, status: "repeat_override", reason: "turn-ended" });
    character.statuses.repeatOverrideAbilityId = null;
  }
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
  if (state.skipNextEnemyPhase) {
    state.skipNextEnemyPhase = false;
    emit(state, "enemy_phase_skipped", { round: state.round, source: "maintenance-window" });
    emit(state, "enemy_phase_ended", { round: state.round, skipped: true });
    beginRound(state, state.round + 1);
    return;
  }
  const outageBoost = state.outageBoostPending;
  state.outageBoostPending = false;
  const activationIds = Object.values(state.enemies)
    .filter((enemy) => enemy.hp > 0)
    .sort((left, right) => left.spawnOrder - right.spawnOrder || left.id.localeCompare(right.id))
    .map((enemy) => enemy.id);
  for (const enemyId of activationIds) {
    if (isFinished(state)) return;
    const enemy = state.enemies[enemyId];
    if (enemy?.hp && enemy.hp > 0) activateEnemy(state, enemy, outageBoost && enemy.definitionId === "unplanned-outage" ? 1 : 0);
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
  emit(state, "enemy_phase_ended", { round: state.round, skipped: false });
  beginRound(state, state.round + 1);
}

function activateEnemy(state: SystemCrawlState, enemy: SystemCrawlEnemy, movementBonus = 0): void {
  if (enemy.definitionId === "reorg") attemptReorgSwap(state, enemy);
  if (enemy.definitionId === "executive-sponsor" && enemy.specialUsedRound !== state.round) lockExecutiveAbilities(state, enemy);
  const movementReduction = enemy.statuses.movementReductionNextActivation;
  if (enemy.statuses.stunnedNextActivation) {
    enemy.statuses.stunnedNextActivation = false;
    enemy.statuses.movementReductionNextActivation = 0;
    enemy.statuses.tauntedByCharacterId = null;
    emit(state, "enemy_stunned", { enemyId: enemy.id });
    finishBossActivation(state, enemy);
    return;
  }
  const target = selectEnemyTarget(state, enemy);
  if (!target) {
    clearActivationStatuses(enemy);
    finishBossActivation(state, enemy);
    return;
  }
  if (canEnemyAttack(state, enemy, target)) {
    specialOrNormalEnemyAttack(state, enemy, target);
    clearActivationStatuses(enemy);
    finishBossActivation(state, enemy);
    return;
  }

  const movement = Math.max(0, enemy.baseMovement + movementBonus - movementReduction);
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
  if (canEnemyAttack(state, enemy, target)) specialOrNormalEnemyAttack(state, enemy, target);
  clearActivationStatuses(enemy);
  finishBossActivation(state, enemy);
}

function selectEnemyTarget(state: SystemCrawlState, enemy: SystemCrawlEnemy): SystemCrawlCharacter | null {
  const living = Object.values(state.characters).filter((character) => !character.downed);
  if (enemy.definitionId === "audit" && enemy.specialUsedRound !== state.round) {
    const carrying = living.filter((character) => character.carriedItemId !== null && isLegallyReachableOrAttackable(state, enemy, character));
    if (carrying.length > 0) {
      enemy.specialUsedRound = state.round;
      return closestEnemyTarget(state, enemy, carrying);
    }
  }
  const tauntTarget = enemy.statuses.tauntedByCharacterId
    ? living.find((character) => character.id === enemy.statuses.tauntedByCharacterId)
    : undefined;
  if (tauntTarget && isLegallyReachableOrAttackable(state, enemy, tauntTarget)) return tauntTarget;

  return closestEnemyTarget(state, enemy, living);
}

function closestEnemyTarget(state: SystemCrawlState, enemy: SystemCrawlEnemy, characters: SystemCrawlCharacter[]): SystemCrawlCharacter | null {
  const candidates = characters.map((character) => ({
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
  const dealt = damageCharacter(state, character.id, enemy.damage, { attack: true, unmitigated: false, sourceId: enemy.id });
  if (enemy.definitionId === "project-milestone" && dealt > 0 && !character.downed) {
    character.statuses.immobilizedNextTurn = true;
    emit(state, "status_applied", { characterId: character.id, status: "immobilized", enemyId: enemy.id });
  }
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
  if (enemy.definitionId === "audit" && livingEnemyCount(state, "finding") > 0) {
    const prevented = Math.min(1, damage);
    damage -= prevented;
    emit(state, "damage_prevented", { enemyId, sourceCharacterId, source: "outstanding-findings", prevented });
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
    if (enemy.definitionId === "stakeholder-feedback" && !enemy.defeatSpawnTriggered) {
      enemy.defeatSpawnTriggered = true;
      spawnAdjacentMinions(state, enemy, "additional-request", 2);
    }
    if (ENEMY_DEFINITIONS[enemy.definitionId].kind === "boss") finishVictory(state);
    return;
  }
  if (!enemy.halfHealthTriggered && enemy.hp <= enemy.maxHp / 2) triggerBossHalfHealth(state, enemy);
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
): number {
  const character = state.characters[characterId];
  if (!character || character.downed) return 0;
  let damage = requestedDamage;
  if (options.attack && damage > 0 && character.statuses.dodgeNextAttack) {
    character.statuses.dodgeNextAttack = false;
    character.statuses.dodgeExpiresAtTurn = null;
    emit(state, "damage_prevented", { characterId, source: "works-on-my-machine", prevented: damage });
    emit(state, "dodge_triggered", { characterId, source: "works-on-my-machine" });
    return 0;
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
    if (allCharactersDown(state) && !restoreKnownGoodBackup(state)) finishDefeat(state);
  }
  return damage;
}

function restoreKnownGoodBackup(state: SystemCrawlState): boolean {
  const carrier = Object.values(state.characters).find((character) => character.carriedItemId === "known-good-backup");
  if (!carrier) return false;
  carrier.carriedItemId = null;
  for (const character of Object.values(state.characters)) {
    character.downed = false;
    character.hp = Math.ceil(character.maxHp * SYSTEM_CRAWL_BALANCE.knownGoodBackup.hpFraction);
    clearTemporaryNegativeStatuses(character);
    emit(state, "character_revived", { characterId: character.id, sourceCharacterId: carrier.id, hp: character.hp });
  }
  emit(state, "known_good_backup_restored", { carrierCharacterId: carrier.id, characterIds: Object.keys(state.characters) });
  return true;
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

function chooseIncident(state: SystemCrawlState): SystemCrawlIncidentId {
  return weightedTake(state, INCIDENT_IDS, (id) => INCIDENT_DEFINITIONS[id].selectionWeight);
}

function drawIncidentEnemy(
  state: SystemCrawlState,
  choices: readonly Exclude<SystemCrawlEnemyId, "bug" | "finding" | "additional-request" | "legacy-system" | "audit" | "reorg" | "production-incident" | "consultant" | "executive-sponsor">[],
  cardIndex: number
): SystemCrawlEnemyId {
  const incident = state.incidentId ? INCIDENT_DEFINITIONS[state.incidentId] : null;
  return weightedTake(state, choices, (id) => {
    const incidentWeight = incident?.enemyWeights[id] ?? 1;
    const cardWeight = cardIndex === 0 && (id === "budget-reduction" || id === "technical-debt") ? 0.25
      : cardIndex === 2 && (id === "technical-debt" || id === "stakeholder-feedback") ? 2
        : 1;
    return Math.max(1, Math.round(incidentWeight * cardWeight * 4));
  });
}

function drawLoot(state: SystemCrawlState, mapRole: "entry" | "standard" | "boss"): SystemCrawlItemId {
  const candidates = ITEM_IDS.filter((id) => !state.legendaryItemAssigned || ITEM_DEFINITIONS[id].rarity !== "legendary");
  const selected = weightedTake(state, candidates, (id) => {
    const modifierId = state.incidentId ? INCIDENT_DEFINITIONS[state.incidentId].modifierId : null;
    const vendorBonus = modifierId === "vendor-loot" && mapRole === "standard" && id === "vendor-documentation" ? 4 : 1;
    return ITEM_DEFINITIONS[id].lootWeight * vendorBonus;
  });
  if (ITEM_DEFINITIONS[selected].rarity === "legendary") state.legendaryItemAssigned = true;
  return selected;
}

function weightedTake<T>(state: SystemCrawlState, values: readonly T[], weightFor: (value: T) => number): T {
  if (values.length === 0) throw new Error("Cannot draw from an empty weighted list.");
  const weighted = values.map((value) => ({ value, weight: Math.max(0, Math.round(weightFor(value))) }));
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return takeRandom(state, values);
  const selected = randomIndex(state.rngState, total);
  state.rngState = selected.state;
  let cursor = selected.index;
  for (const entry of weighted) {
    cursor -= entry.weight;
    if (cursor < 0) return entry.value;
  }
  return weighted[weighted.length - 1]!.value;
}

function growTechnicalDebt(state: SystemCrawlState, revealedCardIndex: number): void {
  for (const debt of Object.values(state.enemies).filter((enemy) => enemy.hp > 0 && enemy.definitionId === "technical-debt" && enemy.position.cardIndex < revealedCardIndex)) {
    debt.maxHp += 2;
    debt.hp += 2;
    debt.damage += 1;
    emit(state, "technical_debt_grew", { enemyId: debt.id, hp: debt.hp, maxHp: debt.maxHp, damage: debt.damage });
  }
}

function spawnEncounterMinions(state: SystemCrawlState, boss: SystemCrawlEnemy, markers: readonly { x: number; y: number }[]): void {
  if (boss.definitionId !== "audit") return;
  const capacity = Math.min(3, SYSTEM_CRAWL_BALANCE.bossMinionCapacityByPartySize[partySizeBaseline(Object.keys(state.characters).length)] ?? 2);
  for (const marker of markers.slice(0, capacity)) {
    const position = { cardIndex: boss.position.cardIndex, ...marker };
    if (!isPositionBlocked(state, position)) spawnEnemy(state, "finding", position);
  }
  emit(state, "boss_phase_changed", { enemyId: boss.id, phase: "outstanding-findings" });
}

function triggerBossHalfHealth(state: SystemCrawlState, boss: SystemCrawlEnemy): void {
  if (ENEMY_DEFINITIONS[boss.definitionId].kind !== "boss") return;
  boss.halfHealthTriggered = true;
  if (boss.definitionId === "legacy-system") {
    boss.undocumentedDependencyTriggered = true;
    spawnBossMinions(state, boss);
    return;
  }
  if (boss.definitionId === "reorg") {
    state.pendingTurnOrderRotations += 1;
    emit(state, "boss_phase_changed", { enemyId: boss.id, phase: "priority-realignment" });
    return;
  }
  if (boss.definitionId === "production-incident") {
    placeCorruption(state, boss, 2);
    emit(state, "boss_phase_changed", { enemyId: boss.id, phase: "incident-escalation" });
    return;
  }
  if (boss.definitionId === "consultant") {
    const previousHp = boss.hp;
    boss.hp = Math.min(boss.maxHp, boss.hp + SYSTEM_CRAWL_BALANCE.consultant.changeRequestHealing);
    emit(state, "boss_healed", { enemyId: boss.id, source: "change-request", amount: boss.hp - previousHp, hp: boss.hp });
    return;
  }
  if (boss.definitionId === "executive-sponsor") {
    const card = state.maps[boss.position.cardIndex];
    const template = card ? SYSTEM_CRAWL_MAPS_BY_ID[card.templateId] : undefined;
    const spawnedIds = (template?.minionSpawns ?? []).map((point) => ({ cardIndex: boss.position.cardIndex, ...point }))
      .filter((position) => !isPositionBlocked(state, position))
      .slice(0, 2)
      .map((position) => spawnEnemy(state, "project-milestone", position).id);
    emit(state, "boss_phase_changed", { enemyId: boss.id, phase: "priority-shift", spawnedIds });
  }
}

function spawnAdjacentMinions(state: SystemCrawlState, source: SystemCrawlEnemy, definitionId: SystemCrawlEnemyId, limit: number): void {
  const candidates = adjacentPositions(source.position).filter((position) => !isPositionBlocked(state, position));
  const spawnedIds = candidates.slice(0, limit).map((position) => spawnEnemy(state, definitionId, position).id);
  emit(state, "additional_requests_spawned", { enemyId: source.id, spawnedIds });
}

function livingEnemyCount(state: SystemCrawlState, definitionId: SystemCrawlEnemyId): number {
  return Object.values(state.enemies).filter((enemy) => enemy.hp > 0 && enemy.definitionId === definitionId).length;
}

function attemptReorgSwap(state: SystemCrawlState, boss: SystemCrawlEnemy): void {
  const living = Object.values(state.characters).filter((character) => !character.downed);
  if (living.length < 2) return;
  const shuffled = shuffleSeeded(state.rngState, living);
  state.rngState = shuffled.state;
  const first = shuffled.values[0];
  const second = shuffled.values[1];
  if (!first || !second || isTerrainBlocked(state, first.position) || isTerrainBlocked(state, second.position)) return;
  const enemyOccupies = Object.values(state.enemies).some((enemy) => enemy.hp > 0 && enemy.id !== boss.id && (samePosition(enemy.position, first.position) || samePosition(enemy.position, second.position)));
  if (enemyOccupies) return;
  const firstPosition = first.position;
  first.position = second.position;
  second.position = firstPosition;
  emit(state, "position_swapped", { enemyId: boss.id, characterIds: [first.id, second.id], positions: [first.position, second.position] });
  applyCorruptionDamage(state, first, "org-chart-shuffle");
  applyCorruptionDamage(state, second, "org-chart-shuffle");
}

function lockExecutiveAbilities(state: SystemCrawlState, boss: SystemCrawlEnemy): void {
  boss.specialUsedRound = state.round;
  for (const character of Object.values(state.characters).filter((candidate) => !candidate.downed)) {
    const abilities = CLASS_DEFINITIONS[character.classId].abilityIds;
    const abilityId = takeRandom(state, abilities);
    character.statuses.lockedAbilityId = abilityId;
    character.statuses.lockedAbilityExpiresAtTurn = character.turnsStarted + 1;
    emit(state, "ability_locked", { enemyId: boss.id, characterId: character.id, abilityId });
  }
}

function specialOrNormalEnemyAttack(state: SystemCrawlState, enemy: SystemCrawlEnemy, normalTarget: SystemCrawlCharacter): void {
  const copied = enemy.definitionId === "consultant" ? state.lastDamagingAbility : null;
  if (copied) {
    const range = Math.max(1, Math.ceil(copied.range * SYSTEM_CRAWL_BALANCE.consultant.copyMultiplier));
    const damage = Math.max(1, Math.ceil(copied.damage * SYSTEM_CRAWL_BALANCE.consultant.copyMultiplier));
    const candidates = Object.values(state.characters).filter((character) => !character.downed && manhattanDistance(enemy.position, character.position) <= range && hasLineOfSight(state, enemy.position, character.position));
    const target = closestEnemyTarget(state, enemy, candidates);
    if (target) {
      emit(state, "enemy_attacked", { enemyId: enemy.id, characterId: target.id, damage, copiedAbilityId: copied.abilityId, source: "leverage-best-practices" });
      damageCharacter(state, target.id, damage, { attack: true, unmitigated: false, sourceId: enemy.id });
      return;
    }
  }
  enemyAttack(state, enemy, normalTarget);
}

function finishBossActivation(state: SystemCrawlState, enemy: SystemCrawlEnemy): void {
  if (enemy.hp > 0 && enemy.definitionId === "production-incident") placeCorruption(state, enemy, 1);
}

function placeCorruption(state: SystemCrawlState, boss: SystemCrawlEnemy, count: number): void {
  const candidates = adjacentPositions(boss.position).filter((position) => canPlaceCorruption(state, position));
  const shuffled = shuffleSeeded(state.rngState, candidates);
  state.rngState = shuffled.state;
  for (const position of shuffled.values.slice(0, count)) {
    const hazard = {
      id: allocateEntityId(state, "corruption"),
      position,
      placedRound: state.round,
      expiresAfterRound: state.round + SYSTEM_CRAWL_BALANCE.corruption.lifetimeRounds
    };
    state.hazards.push(hazard);
    emit(state, "corruption_placed", { hazardId: hazard.id, position, expiresAfterRound: hazard.expiresAfterRound });
  }
}

function canPlaceCorruption(state: SystemCrawlState, position: Position): boolean {
  if (isPositionBlocked(state, position) || state.hazards.some((hazard) => samePosition(hazard.position, position))) return false;
  const card = state.maps[position.cardIndex];
  const template = card ? SYSTEM_CRAWL_MAPS_BY_ID[card.templateId] : undefined;
  if (!card || !template) return false;
  if (template.exit && samePosition({ cardIndex: position.cardIndex, ...template.exit }, position)) return false;
  if (card.doors.some((door) => samePosition(door.position, position))) return false;
  return !card.caches.some((cache) => samePosition(cache.position, position));
}

function applyCorruptionDamage(state: SystemCrawlState, character: SystemCrawlCharacter, reason: string): void {
  const hazard = state.hazards.find((candidate) => samePosition(candidate.position, character.position));
  if (!hazard || character.statuses.corruptionDamageKeysThisTurn.includes(hazard.id) || character.downed) return;
  character.statuses.corruptionDamageKeysThisTurn.push(hazard.id);
  emit(state, "corruption_damage", { hazardId: hazard.id, characterId: character.id, damage: SYSTEM_CRAWL_BALANCE.corruption.damage, reason });
  damageCharacter(state, character.id, SYSTEM_CRAWL_BALANCE.corruption.damage, { attack: false, unmitigated: true, sourceId: hazard.id });
}

function expireCorruption(state: SystemCrawlState, round: number): void {
  const expired = state.hazards.filter((hazard) => hazard.expiresAfterRound < round);
  state.hazards = state.hazards.filter((hazard) => hazard.expiresAfterRound >= round);
  for (const hazard of expired) emit(state, "corruption_expired", { hazardId: hazard.id, position: hazard.position });
}

function rotateLivingTurnOrder(state: SystemCrawlState): void {
  const living = state.turnOrder.filter((id) => !state.characters[id]?.downed);
  if (living.length < 2) return;
  const first = living.shift();
  if (first) living.push(first);
  const downed = state.turnOrder.filter((id) => state.characters[id]?.downed);
  state.turnOrder = [...living, ...downed];
  emit(state, "boss_phase_changed", { phase: "turn-order-rotated", turnOrder: state.turnOrder });
}

function hasCleanseableStatus(character: SystemCrawlCharacter): boolean {
  return character.statuses.actionBlockedNextTurn || character.statuses.immobilizedNextTurn || character.statuses.lockedAbilityId !== null;
}

function cleanseOneNegativeStatus(state: SystemCrawlState, character: SystemCrawlCharacter): void {
  if (character.statuses.actionBlockedNextTurn) {
    character.statuses.actionBlockedNextTurn = false;
    emit(state, "status_removed", { characterId: character.id, status: "action_blocked", source: "rubber-duck-debugging" });
  } else if (character.statuses.immobilizedNextTurn) {
    character.statuses.immobilizedNextTurn = false;
    emit(state, "status_removed", { characterId: character.id, status: "immobilized", source: "rubber-duck-debugging" });
  } else if (character.statuses.lockedAbilityId) {
    const abilityId = character.statuses.lockedAbilityId;
    character.statuses.lockedAbilityId = null;
    character.statuses.lockedAbilityExpiresAtTurn = null;
    emit(state, "status_removed", { characterId: character.id, status: "ability_locked", abilityId, source: "rubber-duck-debugging" });
  }
}

function clearTemporaryNegativeStatuses(character: SystemCrawlCharacter): void {
  character.statuses.actionBlockedNextTurn = false;
  character.statuses.immobilizedNextTurn = false;
  character.statuses.lockedAbilityId = null;
  character.statuses.lockedAbilityExpiresAtTurn = null;
}

function adjacentPositions(position: Position): Position[] {
  return [
    { ...position, y: position.y - 1 },
    { ...position, x: position.x - 1 },
    { ...position, x: position.x + 1 },
    { ...position, y: position.y + 1 }
  ];
}

function abilityDamage(abilityId: SystemCrawlAbilityId): number {
  const damage: Partial<Record<SystemCrawlAbilityId, number>> = {
    "packet-drop": 2,
    "requirements-clarification": 1,
    hotfix: 3,
    refactor: 2,
    "deploy-to-production": 4,
    "percussive-maintenance": 3,
    powershell: 2
  };
  return damage[abilityId] ?? 0;
}

function playerDisplayNameForCharacter(state: SystemCrawlState, characterId: string): string {
  const ownerId = state.characters[characterId]?.ownerPlayerId;
  return state.players.find((player) => player.id === ownerId)?.displayName ?? "A player";
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
    const abilityId = actionKey.startsWith("ability:") ? actionKey.slice("ability:".length) : null;
    if (character.statuses.repeatOverrideAbilityId !== abilityId) {
      throw new SystemCrawlRuleError("repeated_action", "A character cannot repeat its previous non-movement action.");
    }
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
  if (character && actionKey.startsWith("ability:") && character.statuses.repeatOverrideAbilityId === actionKey.slice("ability:".length)) {
    character.statuses.repeatOverrideAbilityId = null;
    emit(state, "status_removed", { characterId, status: "repeat_override", reason: "consumed" });
  }
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
  const event = { id: state.nextEventId, type, round: state.round, data: data as Record<string, JsonValue> } satisfies SystemCrawlEvent;
  state.events.push(event);
  trackRunStats(state, event);
  state.nextEventId += 1;
  if (state.events.length > 100) state.events = state.events.slice(-100);
}

function trackRunStats(state: SystemCrawlState, event: SystemCrawlEvent): void {
  const characterStats = (characterId: unknown) => typeof characterId === "string" ? state.stats.byCharacter[characterId] : undefined;
  if (event.type === "damage_dealt" && typeof event.data.enemyId === "string" && typeof event.data.damage === "number") {
    const stats = characterStats(event.data.sourceCharacterId);
    if (stats) stats.damageDealt += event.data.damage;
  } else if (event.type === "healing" && typeof event.data.amount === "number") {
    const stats = characterStats(event.data.sourceCharacterId);
    if (stats) stats.healingPerformed += event.data.amount;
  } else if (event.type === "damage_prevented" && typeof event.data.prevented === "number") {
    state.stats.damagePrevented += event.data.prevented;
    const stats = characterStats(event.data.characterId ?? event.data.sourceCharacterId);
    if (stats) stats.damagePrevented += event.data.prevented;
  } else if (event.type === "item_used") {
    state.stats.itemsUsed += 1;
    const stats = characterStats(event.data.characterId);
    if (stats) stats.itemsUsed += 1;
  } else if (event.type === "character_revived") {
    state.stats.revivals += 1;
    const stats = characterStats(event.data.sourceCharacterId);
    if (stats) stats.revivals += 1;
  } else if (event.type === "character_downed") {
    state.stats.charactersDowned += 1;
    const stats = characterStats(event.data.characterId);
    if (stats) stats.downs += 1;
  } else if (event.type === "enemy_defeated") {
    state.stats.enemiesDefeated += 1;
    const definitionId = event.data.definitionId;
    if (typeof definitionId === "string" && ENEMY_DEFINITIONS[definitionId as SystemCrawlEnemyId]?.kind === "boss") {
      state.stats.bossDefeated = true;
    }
  }
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
