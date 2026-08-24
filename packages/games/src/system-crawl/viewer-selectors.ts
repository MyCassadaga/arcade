import { isCardinallyAdjacent } from "./pathfinding";
import {
  getReachableMovementTiles,
  getValidAbilityTargets,
  getValidItemTargets
} from "./selectors";
import type {
  AbilityHistoryEntry,
  Position,
  SystemCrawlAbilityId,
  SystemCrawlState,
  SystemCrawlTarget,
  SystemCrawlViewerState
} from "./types";

export function getViewerReachableMovementTiles(
  view: SystemCrawlViewerState,
  characterId: string
): Position[] {
  return getReachableMovementTiles(hydrateViewerState(view), characterId);
}

export function getViewerValidAbilityTargets(
  view: SystemCrawlViewerState,
  characterId: string,
  abilityId: SystemCrawlAbilityId
): SystemCrawlTarget[] {
  return getValidAbilityTargets(hydrateViewerState(view), characterId, abilityId);
}

export function getViewerValidItemTargets(
  view: SystemCrawlViewerState,
  characterId: string
): SystemCrawlTarget[] {
  return getValidItemTargets(hydrateViewerState(view), characterId);
}

export function getViewerRestartTargets(
  view: SystemCrawlViewerState,
  characterId: string
): string[] {
  const state = hydrateViewerState(view);
  const character = state.characters[characterId];
  if (!character) return [];
  return Object.values(state.characters)
    .filter((candidate) => candidate.id !== character.id && candidate.downed)
    .filter((candidate) => isCardinallyAdjacent(state, character.position, candidate.position))
    .map((candidate) => candidate.id);
}

function hydrateViewerState(view: SystemCrawlViewerState): SystemCrawlState {
  return {
    version: view.version,
    phase: view.phase,
    hostPlayerId: view.hostPlayerId,
    players: clone(view.players),
    classSelections: clone(view.classSelections),
    seed: null,
    rngState: 0,
    round: view.round,
    maps: view.maps.map((map) => map.revealed
      ? {
          cardIndex: map.cardIndex,
          templateId: map.templateId ?? "",
          revealed: true,
          doors: clone(map.doors ?? []),
          caches: (map.caches ?? []).map((cache) => ({
            id: cache.id,
            position: clone(cache.position),
            itemId: cache.itemId ?? "coffee",
            pickedUp: cache.pickedUp
          }))
        }
      : { cardIndex: map.cardIndex, templateId: "", revealed: false, doors: [], caches: [] }),
    revealedCardCount: view.revealedCardCount,
    characters: Object.fromEntries(Object.values(view.characters).map((character) => [character.id, {
      ...clone(character),
      turnsStarted: 0,
      statuses: {
        ...clone(character.statuses),
        firewallShield: character.statuses.firewallShield
          ? { ...clone(character.statuses.firewallShield), expiresAtSourceTurn: Number.MAX_SAFE_INTEGER }
          : null,
        dodgeExpiresAtTurn: character.statuses.dodgeNextAttack ? Number.MAX_SAFE_INTEGER : null
      }
    }])),
    enemies: Object.fromEntries(Object.values(view.enemies).map((enemy, spawnOrder) => [enemy.id, {
      ...clone(enemy),
      spawnOrder,
      revealedRound: view.round,
      backwardCompatibilityUsedThisRound: false,
      undocumentedDependencyTriggered: false
    }])),
    turnOrder: [...view.turnOrder],
    activeCharacterId: view.activeCharacterId,
    turn: view.turn ? { ...clone(view.turn), actedCharacterIdsThisRound: [] } : null,
    pendingChoice: null,
    abilityHistory: abilityHistoryFromEvents(view),
    events: clone(view.events),
    nextEventId: (view.events.at(-1)?.id ?? 0) + 1,
    nextEntityId: 1
  };
}

function abilityHistoryFromEvents(view: SystemCrawlViewerState): AbilityHistoryEntry[] {
  const abilityIds = new Set<SystemCrawlAbilityId>([
    "packet-drop", "firewall", "load-balancer", "escalate",
    "requirements-clarification", "workaround", "process-improvement", "reboot-service",
    "hotfix", "refactor", "deploy-to-production", "works-on-my-machine",
    "percussive-maintenance", "powershell", "google-it", "other-duties-as-assigned"
  ]);
  return view.events.flatMap((event) => {
    const characterId = event.data.characterId;
    const abilityId = event.data.abilityId;
    return event.type === "ability_used"
      && typeof characterId === "string"
      && typeof abilityId === "string"
      && abilityIds.has(abilityId as SystemCrawlAbilityId)
      && abilityId !== "other-duties-as-assigned"
      ? [{ characterId, abilityId: abilityId as SystemCrawlAbilityId }]
      : [];
  }).slice(-40);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
