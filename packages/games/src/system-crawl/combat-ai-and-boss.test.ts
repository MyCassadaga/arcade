import { describe, expect, it } from "vitest";
import { SYSTEM_CRAWL_MAPS_BY_ID, hasLineOfSight, reduceSystemCrawl } from ".";
import { activateClass, characterByClass, cloneState, firstEnemy, place, replaceEnemies, startedState } from "./test-utils";

function keepOnlyLiving(state: ReturnType<typeof startedState>, characterId: string): void {
  for (const character of Object.values(state.characters)) {
    if (character.id !== characterId) {
      character.hp = 0;
      character.downed = true;
      place(character, 0, 7, character.partyOrder + 1);
    }
  }
  state.turnOrder = [characterId];
}

function revealBossCard() {
  let state = activateClass(startedState(4, "boss-fixture"), "infrastructure-architect");
  state.incidentId = "erp-modernization";
  const bossCard = state.maps[3];
  if (bossCard) bossCard.templateId = "incident-command";
  const character = characterByClass(state, "infrastructure-architect");
  while (state.revealedCardCount < 4) {
    characterByClass(state, "infrastructure-architect").carriedItemId = "vendor-documentation";
    characterByClass(state, "infrastructure-architect").lastActionKey = null;
    if (!state.turn) throw new Error("Expected active turn");
    state.turn.actionUsed = false;
    state = reduceSystemCrawl(state, { type: "use_item", characterId: character.id }, character.ownerPlayerId).state;
  }
  return state;
}

describe("System Crawl combat, enemy AI, and boss", () => {
  it("uses seeded Infrastructure Architect defense and lets shields absorb attack damage", () => {
    let state = activateClass(startedState(4), "infrastructure-architect");
    const architect = characterByClass(state, "infrastructure-architect");
    place(architect, 0, 2, 3);
    keepOnlyLiving(state, architect.id);
    state = replaceEnemies(state, [{ definitionId: "budget-reduction", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state.rngState = 1;
    const hp = architect.hp;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: architect.id }, architect.ownerPlayerId).state;
    expect(state.characters[architect.id]?.hp).toBe(hp);
    expect(state.events.some((event) => event.type === "damage_prevented" && event.data.source === "redundancy")).toBe(true);

    state = activateClass(startedState(4), "infrastructure-architect");
    const shielded = characterByClass(state, "infrastructure-architect");
    place(shielded, 0, 2, 3);
    shielded.statuses.firewallShield = { amount: 3, sourceCharacterId: shielded.id, expiresAtSourceTurn: 99 };
    keepOnlyLiving(state, shielded.id);
    state = replaceEnemies(state, [{ definitionId: "budget-reduction", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state.rngState = 12345;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: shielded.id }, shielded.ownerPlayerId).state;
    expect(state.characters[shielded.id]?.hp).toBe(shielded.hp);
    expect(state.characters[shielded.id]?.statuses.firewallShield?.amount).toBe(1);
  });

  it("selects targets by path, HP, and party order and honors taunt", () => {
    let state = activateClass(startedState(4), "infrastructure-architect");
    const architect = characterByClass(state, "infrastructure-architect");
    const developer = characterByClass(state, "application-developer");
    const generalist = characterByClass(state, "it-generalist");
    const analyst = characterByClass(state, "senior-systems-analyst");
    place(architect, 0, 1, 3);
    place(developer, 0, 2, 3);
    place(generalist, 0, 4, 3);
    place(analyst, 0, 7, 5);
    developer.hp = 5;
    generalist.hp = 5;
    state.turnOrder = [architect.id];
    state = replaceEnemies(state, [{ definitionId: "budget-reduction", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: architect.id }, architect.ownerPlayerId).state;
    const attack = state.events.filter((event) => event.type === "enemy_attacked").at(-1);
    expect(attack?.data.characterId).toBe(developer.id);

    state = activateClass(startedState(4), "infrastructure-architect");
    const tauntArchitect = characterByClass(state, "infrastructure-architect");
    const closeDeveloper = characterByClass(state, "application-developer");
    place(tauntArchitect, 0, 1, 3);
    place(closeDeveloper, 0, 4, 3);
    for (const character of Object.values(state.characters)) {
      if (character.id !== tauntArchitect.id && character.id !== closeDeveloper.id) {
        character.hp = 0;
        character.downed = true;
        place(character, 0, 7, character.partyOrder + 1);
      }
    }
    state.turnOrder = [tauntArchitect.id];
    state = replaceEnemies(state, [{ definitionId: "budget-reduction", position: { cardIndex: 0, x: 3, y: 3 } }]);
    firstEnemy(state).statuses.tauntedByCharacterId = tauntArchitect.id;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: tauntArchitect.id }, tauntArchitect.ownerPlayerId).state;
    expect(state.events.filter((event) => event.type === "enemy_attacked").at(-1)?.data.characterId).toBe(tauntArchitect.id);
  });

  it("has ranged enemies attack before moving and respects blocking line of sight", () => {
    let state = activateClass(startedState(4), "infrastructure-architect");
    state.maps[0] = { ...(state.maps[0] as NonNullable<typeof state.maps[0]>), templateId: "development-environment", doors: [] };
    const architect = characterByClass(state, "infrastructure-architect");
    place(architect, 0, 6, 3);
    keepOnlyLiving(state, architect.id);
    state = replaceEnemies(state, [{ definitionId: "system-requirement", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: architect.id }, architect.ownerPlayerId).state;
    expect(state.events.some((event) => event.type === "enemy_attacked")).toBe(true);
    expect(state.events.some((event) => event.type === "enemy_moved")).toBe(false);

    const losState = cloneState(state);
    const enemy = firstEnemy(losState);
    enemy.position = { cardIndex: 0, x: 2, y: 2 };
    const target = losState.characters[architect.id];
    if (!target) throw new Error("Missing target");
    target.position = { cardIndex: 0, x: 6, y: 2 };
    expect(hasLineOfSight(losState, enemy.position, target.position)).toBe(false);
  });

  it("consumes stun and movement reduction deterministically and grows Scope Creep", () => {
    let state = activateClass(startedState(4), "infrastructure-architect");
    const architect = characterByClass(state, "infrastructure-architect");
    place(architect, 0, 1, 3);
    keepOnlyLiving(state, architect.id);
    state = replaceEnemies(state, [{ definitionId: "scope-creep", position: { cardIndex: 0, x: 6, y: 3 } }]);
    let enemy = firstEnemy(state);
    enemy.statuses.stunnedNextActivation = true;
    const origin = { ...enemy.position };
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: architect.id }, architect.ownerPlayerId).state;
    enemy = state.enemies[enemy.id] as typeof enemy;
    expect(enemy.position).toEqual(origin);
    expect(enemy.statuses.stunnedNextActivation).toBe(false);
    expect(enemy).toMatchObject({ hp: 5, maxHp: 5 });

    state = activateClass(startedState(4), "infrastructure-architect");
    const target = characterByClass(state, "infrastructure-architect");
    place(target, 0, 1, 3);
    keepOnlyLiving(state, target.id);
    state = replaceEnemies(state, [{ definitionId: "scope-creep", position: { cardIndex: 0, x: 6, y: 3 } }]);
    enemy = firstEnemy(state);
    enemy.statuses.movementReductionNextActivation = 2;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: target.id }, target.ownerPlayerId).state;
    const move = state.events.filter((event) => event.type === "enemy_moved").at(-1);
    expect(move?.data.path).toHaveLength(2);
    expect(state.enemies[enemy.id]?.statuses.movementReductionNextActivation).toBe(0);
  });

  it("applies and consumes Meeting action-blocked status on the next character turn", () => {
    let state = activateClass(startedState(4), "infrastructure-architect");
    const architect = characterByClass(state, "infrastructure-architect");
    architect.lastActionKey = "ability:packet-drop";
    place(architect, 0, 2, 3);
    keepOnlyLiving(state, architect.id);
    state = replaceEnemies(state, [{ definitionId: "meeting", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: architect.id }, architect.ownerPlayerId).state;
    expect(state.turn?.actionBlocked).toBe(true);
    expect(state.characters[architect.id]?.statuses.actionBlockedNextTurn).toBe(false);
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: architect.id }, architect.ownerPlayerId).state;
    expect(state.characters[architect.id]?.lastActionKey).toBeNull();
  });

  it("revives adjacent allies with Restart User, skips downed turns, and detects all-party defeat", () => {
    let state = activateClass(startedState(4), "infrastructure-architect");
    const architect = characterByClass(state, "infrastructure-architect");
    const analyst = characterByClass(state, "senior-systems-analyst");
    place(architect, 0, 2, 3);
    place(analyst, 0, 3, 3);
    analyst.hp = 0;
    analyst.downed = true;
    state = reduceSystemCrawl(state, {
      type: "restart_user", characterId: architect.id, targetCharacterId: analyst.id
    }, architect.ownerPlayerId).state;
    expect(state.characters[analyst.id]).toMatchObject({ hp: 2, downed: false });
    expect(state.characters[architect.id]?.lastActionKey).toBe("system:restart-user");

    state = activateClass(startedState(4), "infrastructure-architect");
    const lastLiving = characterByClass(state, "infrastructure-architect");
    lastLiving.hp = 1;
    place(lastLiving, 0, 2, 3);
    keepOnlyLiving(state, lastLiving.id);
    state = replaceEnemies(state, [{ definitionId: "budget-reduction", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state.rngState = 12345;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: lastLiving.id }, lastLiving.ownerPlayerId).state;
    expect(state.phase).toBe("defeat");
    expect(state.events.at(-1)?.type).toBe("defeat");
  });

  it("scales the Legacy System, triggers its one-time minion phase, and wins on boss defeat", () => {
    let state = revealBossCard();
    let boss = Object.values(state.enemies).find((enemy) => enemy.definitionId === "legacy-system");
    expect(boss).toMatchObject({ hp: 20, maxHp: 20 });
    state = activateClass(state, "application-developer");
    const developer = characterByClass(state, "application-developer");
    boss = Object.values(state.enemies).find((enemy) => enemy.definitionId === "legacy-system");
    if (!boss) throw new Error("Expected boss");
    developer.position = { cardIndex: boss.position.cardIndex, x: boss.position.x - 2, y: boss.position.y };
    boss.hp = 11;
    state = reduceSystemCrawl(state, {
      type: "use_ability", characterId: developer.id, abilityId: "hotfix",
      target: { type: "enemy", enemyId: boss.id }
    }, developer.ownerPlayerId).state;
    expect(state.enemies[boss.id]).toMatchObject({ hp: 10, undocumentedDependencyTriggered: true });
    expect(Object.values(state.enemies).filter((enemy) => enemy.definitionId === "bug")).toHaveLength(2);
    expect(state.events.some((event) => event.type === "boss_phase_changed")).toBe(true);

    state = activateClass(state, "application-developer");
    const finishingDeveloper = characterByClass(state, "application-developer");
    boss = state.enemies[boss.id];
    if (!boss) throw new Error("Expected boss");
    finishingDeveloper.position = { cardIndex: boss.position.cardIndex, x: boss.position.x - 2, y: boss.position.y };
    boss.hp = 3;
    boss.backwardCompatibilityUsedThisRound = true;
    state = reduceSystemCrawl(state, {
      type: "use_ability", characterId: finishingDeveloper.id, abilityId: "deploy-to-production",
      target: { type: "enemy", enemyId: boss.id }
    }, finishingDeveloper.ownerPlayerId).state;
    expect(state.phase).toBe("victory");
    expect(state.events.at(-1)?.type).toBe("victory");
    expect(state.events.some((event) => event.type === "victory")).toBe(true);
  });

  it("supports a deterministic scripted traversal through all four connected cards", () => {
    let state = cloneState(startedState(3, "full-traversal"));
    const architect = characterByClass(state, "infrastructure-architect");
    state.enemies = {};
    if (!state.turn) throw new Error("Expected turn");
    state.turn.movementAllowance = 200;
    for (let cardIndex = 0; cardIndex < 3; cardIndex += 1) {
      const template = SYSTEM_CRAWL_MAPS_BY_ID[state.maps[cardIndex]?.templateId ?? ""];
      if (!template?.exit) throw new Error("Traversal card needs an exit");
      state = reduceSystemCrawl(state, {
        type: "move_to", characterId: architect.id, destination: { cardIndex, ...template.exit }
      }, architect.ownerPlayerId).state;
      if (cardIndex < 2) state.enemies = {};
      const nextTemplate = SYSTEM_CRAWL_MAPS_BY_ID[state.maps[cardIndex + 1]?.templateId ?? ""];
      state = reduceSystemCrawl(state, {
        type: "move_to", characterId: architect.id, destination: { cardIndex: cardIndex + 1, ...nextTemplate?.entrance ?? { x: 0, y: 3 } }
      }, architect.ownerPlayerId).state;
    }
    expect(state.revealedCardCount).toBe(4);
    expect(state.characters[architect.id]?.position.cardIndex).toBe(3);
    expect(Object.values(state.enemies).some((enemy) => enemy.position.cardIndex === 3 && enemy.hp > 0)).toBe(true);
  });
});
