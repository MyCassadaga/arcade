import { reduceSystemCrawl, createSystemCrawlState } from "./engine";
import type {
  Position,
  SystemCrawlCharacter,
  SystemCrawlClassId,
  SystemCrawlEnemy,
  SystemCrawlEnemyId,
  SystemCrawlState
} from "./types";
import { ENEMY_DEFINITIONS } from "./content";

export const TEST_CLASS_IDS: SystemCrawlClassId[] = [
  "infrastructure-architect",
  "senior-systems-analyst",
  "application-developer",
  "it-generalist"
];

export function testPlayers(count: number) {
  return Array.from({ length: count }, (_, index) => ({ id: `player-${index + 1}`, displayName: `Player ${index + 1}` }));
}

export function startedState(count = 4, seed: string | number = "system-crawl-test"): SystemCrawlState {
  const players = testPlayers(count);
  let state = createSystemCrawlState(players, players[0]?.id ?? "player-1");
  if (count === 1) {
    state = reduceSystemCrawl(state, { type: "select_class", classIds: TEST_CLASS_IDS.slice(0, 2) }, players[0]?.id ?? "").state;
  } else {
    players.forEach((player, index) => {
      state = reduceSystemCrawl(state, { type: "select_class", classIds: [TEST_CLASS_IDS[index] as SystemCrawlClassId] }, player.id).state;
    });
  }
  return reduceSystemCrawl(state, { type: "start_adventure", seed }, players[0]?.id ?? "").state;
}

export function cloneState(state: SystemCrawlState): SystemCrawlState {
  return JSON.parse(JSON.stringify(state)) as SystemCrawlState;
}

export function characterByClass(state: SystemCrawlState, classId: SystemCrawlClassId): SystemCrawlCharacter {
  const character = Object.values(state.characters).find((candidate) => candidate.classId === classId);
  if (!character) throw new Error(`Missing test character ${classId}`);
  return character;
}

export function activateClass(state: SystemCrawlState, classId: SystemCrawlClassId): SystemCrawlState {
  const next = cloneState(state);
  const character = characterByClass(next, classId);
  next.phase = "player_turn";
  next.pendingChoice = null;
  next.activeCharacterId = character.id;
  next.turn = {
    movementAllowance: 20,
    movementSpent: 0,
    actionUsed: false,
    actionBlocked: false,
    actedCharacterIdsThisRound: []
  };
  return next;
}

export function replaceEnemies(
  state: SystemCrawlState,
  definitions: Array<{ definitionId: SystemCrawlEnemyId; position: Position; hp?: number }>
): SystemCrawlState {
  const next = cloneState(state);
  next.enemies = {};
  definitions.forEach((fixture, index) => {
    const definition = ENEMY_DEFINITIONS[fixture.definitionId];
    const id = `fixture-enemy-${index + 1}`;
    const hp = fixture.hp ?? definition.maxHp;
    const enemy: SystemCrawlEnemy = {
      id,
      definitionId: fixture.definitionId,
      displayName: definition.displayName,
      hp,
      maxHp: definition.maxHp,
      baseMovement: definition.movement,
      attackRange: definition.attackRange,
      damage: definition.damage,
      position: fixture.position,
      spawnOrder: index,
      revealedRound: next.round,
      statuses: { movementReductionNextActivation: 0, stunnedNextActivation: false, tauntedByCharacterId: null },
      backwardCompatibilityUsedThisRound: false,
      undocumentedDependencyTriggered: false
    };
    next.enemies[id] = enemy;
  });
  return next;
}

export function firstEnemy(state: SystemCrawlState): SystemCrawlEnemy {
  const enemy = Object.values(state.enemies)[0];
  if (!enemy) throw new Error("Missing test enemy");
  return enemy;
}

export function place(character: SystemCrawlCharacter, cardIndex: number, x: number, y: number): void {
  character.position = { cardIndex, x, y };
}
