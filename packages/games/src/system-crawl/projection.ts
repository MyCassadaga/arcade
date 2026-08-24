import { SYSTEM_CRAWL_MAPS_BY_ID } from "./maps";
import type { PublicCharacter, PublicEnemy, PublicMapCard, SystemCrawlState, SystemCrawlViewerState } from "./types";

export function projectSystemCrawlState(state: SystemCrawlState, viewerPlayerId: string): SystemCrawlViewerState {
  const maps: PublicMapCard[] = state.maps.map((card) => {
    if (!card.revealed) return { cardIndex: card.cardIndex, revealed: false };
    const template = SYSTEM_CRAWL_MAPS_BY_ID[card.templateId];
    if (!template) throw new Error(`Unknown map template: ${card.templateId}`);
    return {
      cardIndex: card.cardIndex,
      revealed: true,
      templateId: template.id,
      displayName: template.displayName,
      role: template.role,
      terrain: [...template.terrain],
      entrance: { ...template.entrance },
      exit: template.exit ? { ...template.exit } : null,
      doors: clone(card.doors),
      caches: card.caches.map((cache) => ({
        id: cache.id,
        position: { ...cache.position },
        pickedUp: cache.pickedUp,
        ...(cache.pickedUp ? { itemId: cache.itemId } : {})
      })),
      props: clone(template.props),
      visualTheme: { ...template.visualTheme }
    };
  });
  const enemies: Record<string, PublicEnemy> = Object.fromEntries(Object.values(state.enemies).map((enemy) => [enemy.id, {
    id: enemy.id,
    definitionId: enemy.definitionId,
    displayName: enemy.displayName,
    hp: enemy.hp,
    maxHp: enemy.maxHp,
    baseMovement: enemy.baseMovement,
    attackRange: enemy.attackRange,
    damage: enemy.damage,
    position: { ...enemy.position },
    statuses: clone(enemy.statuses)
  }]));
  const characters: Record<string, PublicCharacter> = Object.fromEntries(Object.values(state.characters).map((character) => [character.id, {
    id: character.id,
    ownerPlayerId: character.ownerPlayerId,
    classId: character.classId,
    displayName: character.displayName,
    partyOrder: character.partyOrder,
    hp: character.hp,
    maxHp: character.maxHp,
    baseMovement: character.baseMovement,
    position: { ...character.position },
    downed: character.downed,
    carriedItemId: character.carriedItemId,
    lastActionKey: character.lastActionKey,
    statuses: {
      firewallShield: character.statuses.firewallShield ? {
        amount: character.statuses.firewallShield.amount,
        sourceCharacterId: character.statuses.firewallShield.sourceCharacterId
      } : null,
      dodgeNextAttack: character.statuses.dodgeNextAttack,
      movementBoostNextTurn: character.statuses.movementBoostNextTurn,
      actionBlockedNextTurn: character.statuses.actionBlockedNextTurn,
      immobilizedNextTurn: character.statuses.immobilizedNextTurn,
      nextDamageBonus: character.statuses.nextDamageBonus,
      repeatOverrideAbilityId: character.statuses.repeatOverrideAbilityId,
      lockedAbilityId: character.statuses.lockedAbilityId
    }
  }]));
  const pendingChoice = state.pendingChoice ? {
    kind: state.pendingChoice.kind,
    id: state.pendingChoice.id,
    ownerPlayerId: state.pendingChoice.ownerPlayerId,
    characterId: state.pendingChoice.characterId,
    ...(state.pendingChoice.ownerPlayerId === viewerPlayerId
      ? { candidateItemIds: [...state.pendingChoice.candidateItemIds] as [typeof state.pendingChoice.candidateItemIds[0], typeof state.pendingChoice.candidateItemIds[1]] }
      : {})
  } : null;

  return {
    version: state.version,
    phase: state.phase,
    hostPlayerId: state.hostPlayerId,
    players: clone(state.players),
    classSelections: clone(state.classSelections),
    incidentId: state.incidentId,
    ...(state.phase === "victory" || state.phase === "defeat" ? { seed: state.seed } : {}),
    round: state.round,
    maps,
    revealedCardCount: state.revealedCardCount,
    characters,
    enemies,
    turnOrder: [...state.turnOrder],
    activeCharacterId: state.activeCharacterId,
    turn: state.turn ? {
      movementAllowance: state.turn.movementAllowance,
      movementSpent: state.turn.movementSpent,
      actionUsed: state.turn.actionUsed,
      actionBlocked: state.turn.actionBlocked,
      freeItemUsed: state.turn.freeItemUsed
    } : null,
    pendingChoice,
    hazards: clone(state.hazards),
    stats: clone(state.stats),
    events: clone(state.events)
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
