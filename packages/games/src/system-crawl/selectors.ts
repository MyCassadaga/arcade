import { ABILITY_DEFINITIONS, CLASS_DEFINITIONS, ITEM_DEFINITIONS } from "./content";
import {
  canonicalShortestPath,
  hasLineOfSight,
  isCardinallyAdjacent,
  manhattanDistance,
  reachableMovementTiles
} from "./pathfinding";
import type {
  SystemCrawlAbilityId,
  SystemCrawlCharacter,
  SystemCrawlItemId,
  SystemCrawlState,
  SystemCrawlTarget
} from "./types";

export function getActiveCharacter(state: SystemCrawlState): SystemCrawlCharacter | null {
  return state.activeCharacterId ? state.characters[state.activeCharacterId] ?? null : null;
}

export function getCharacterMovementAllowance(state: SystemCrawlState, characterId: string): number {
  const character = state.characters[characterId];
  if (!character) return 0;
  const improvement = character.statuses.movementBoostNextTurn ? 2 : 0;
  const budgetAura = Object.values(state.enemies).some(
    (enemy) => enemy.hp > 0 && enemy.definitionId === "budget-reduction" && isCardinallyAdjacent(state, enemy.position, character.position)
  );
  return Math.max(1, character.baseMovement + improvement - (budgetAura ? 1 : 0));
}

export function getReachableMovementTiles(state: SystemCrawlState, characterId: string) {
  const character = state.characters[characterId];
  if (!character || character.downed) return [];
  const remaining = state.activeCharacterId === characterId && state.turn
    ? state.turn.movementAllowance - state.turn.movementSpent
    : getCharacterMovementAllowance(state, characterId);
  return reachableMovementTiles(state, character.position, Math.max(0, remaining), { ignoreCharacterId: characterId });
}

export function getValidAbilityTargets(
  state: SystemCrawlState,
  characterId: string,
  abilityId: SystemCrawlAbilityId
): SystemCrawlTarget[] {
  const character = state.characters[characterId];
  if (!character || character.downed) return [];
  const definition = ABILITY_DEFINITIONS[abilityId];
  if (!CLASS_DEFINITIONS[character.classId].abilityIds.includes(abilityId)) return [];

  if (abilityId === "google-it") {
    return character.carriedItemId === null ? [{ type: "character", characterId }] : [];
  }
  if (abilityId === "other-duties-as-assigned") {
    const copied = findCopyableAbility(state, characterId);
    return copied ? getTargetsForDefinition(state, character, copied.abilityId) : [];
  }
  return getTargetsForDefinition(state, character, definition.id);
}

export function getValidItemTargets(state: SystemCrawlState, characterId: string): SystemCrawlTarget[] {
  const character = state.characters[characterId];
  const itemId = character?.carriedItemId;
  if (!character || !itemId) return [];
  return targetsForItem(state, character, itemId);
}

export function findCopyableAbility(state: SystemCrawlState, generalistCharacterId: string) {
  return [...state.abilityHistory].reverse().find(
    (entry) => entry.characterId !== generalistCharacterId && entry.abilityId !== "other-duties-as-assigned"
  ) ?? null;
}

function getTargetsForDefinition(
  state: SystemCrawlState,
  character: SystemCrawlCharacter,
  abilityId: SystemCrawlAbilityId
): SystemCrawlTarget[] {
  const definition = ABILITY_DEFINITIONS[abilityId];
  if (abilityId === "works-on-my-machine") return [{ type: "character", characterId: character.id }];
  if (abilityId === "load-balancer") {
    const targets: SystemCrawlTarget[] = [];
    for (const ally of Object.values(state.characters)) {
      if (ally.id === character.id || ally.downed || !inRangeAndSight(state, character, ally.position, definition.range)) continue;
      const destinations = reachableMovementTiles(state, ally.position, 2, { ignoreCharacterId: ally.id });
      for (const destination of destinations) targets.push({ type: "load_balancer", characterId: ally.id, destination });
    }
    return targets;
  }
  if (definition.targetKind === "enemy") {
    return Object.values(state.enemies)
      .filter((enemy) => enemy.hp > 0 && inRangeAndSight(state, character, enemy.position, definition.range))
      .map((enemy) => ({ type: "enemy" as const, enemyId: enemy.id }));
  }
  if (definition.targetKind === "character") {
    return Object.values(state.characters)
      .filter((ally) => !ally.downed && inRangeAndSight(state, character, ally.position, definition.range))
      .filter((ally) => abilityId !== "reboot-service" || ally.hp < ally.maxHp || ally.statuses.actionBlockedNextTurn)
      .map((ally) => ({ type: "character" as const, characterId: ally.id }));
  }
  return [];
}

function targetsForItem(state: SystemCrawlState, character: SystemCrawlCharacter, itemId: SystemCrawlItemId): SystemCrawlTarget[] {
  if (ITEM_DEFINITIONS[itemId].effect === "passive") return [];
  if (itemId === "coffee") {
    return Object.values(state.characters)
      .filter((ally) => !ally.downed && (ally.id === character.id || isCardinallyAdjacent(state, character.position, ally.position)))
      .map((ally) => ({ type: "character" as const, characterId: ally.id }));
  }
  if (itemId === "admin-credentials") {
    return state.maps.flatMap((map) => map.doors)
      .filter((door) => !door.open && isCardinallyAdjacent(state, character.position, door.position))
      .map((door) => ({ type: "door" as const, doorId: door.id }));
  }
  if (itemId === "approved-change-request" || itemId === "ethernet-cable") {
    const range = itemId === "approved-change-request" ? 3 : 4;
    return Object.values(state.enemies)
      .filter((enemy) => enemy.hp > 0 && inRangeAndSight(state, character, enemy.position, range))
      .map((enemy) => ({ type: "enemy" as const, enemyId: enemy.id }));
  }
  if (itemId === "spare-laptop") {
    return Object.values(state.characters)
      .filter((ally) => ally.id !== character.id && ally.downed && inRangeAndSight(state, character, ally.position, 3))
      .map((ally) => ({ type: "character" as const, characterId: ally.id }));
  }
  if (itemId === "budget-exception") return [{ type: "character", characterId: character.id }];
  if (itemId === "vendor-documentation") {
    return state.revealedCardCount < state.maps.length ? [{ type: "character", characterId: character.id }] : [];
  }
  return [];
}

function inRangeAndSight(
  state: SystemCrawlState,
  character: SystemCrawlCharacter,
  targetPosition: SystemCrawlCharacter["position"],
  range: number
): boolean {
  return manhattanDistance(character.position, targetPosition) <= range && hasLineOfSight(state, character.position, targetPosition);
}

export function getCanonicalMovePath(state: SystemCrawlState, characterId: string, destination: SystemCrawlCharacter["position"]) {
  const character = state.characters[characterId];
  return character
    ? canonicalShortestPath(state, character.position, destination, { ignoreCharacterId: character.id })
    : null;
}
