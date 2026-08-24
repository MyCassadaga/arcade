import { describe, expect, it } from "vitest";
import { reduceSystemCrawl } from ".";
import { activateClass, characterByClass, firstEnemy, place, replaceEnemies, startedState } from "./test-utils";

function abilityFixture(classId: Parameters<typeof activateClass>[1]) {
  let state = activateClass(startedState(4, `ability-${classId}`), classId);
  const character = characterByClass(state, classId);
  place(character, 0, 2, 3);
  state = replaceEnemies(state, [{ definitionId: "scope-creep", position: { cardIndex: 0, x: 3, y: 3 }, hp: 20 }]);
  return { state, character: characterByClass(state, classId), enemy: firstEnemy(state) };
}

describe("System Crawl class abilities", () => {
  it("implements all Infrastructure Architect abilities", () => {
    let fixture = abilityFixture("infrastructure-architect");
    let result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "packet-drop",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.enemies[fixture.enemy.id]?.hp).toBe(18);

    fixture = abilityFixture("infrastructure-architect");
    const analyst = characterByClass(fixture.state, "senior-systems-analyst");
    place(analyst, 0, 2, 2);
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "firewall",
      target: { type: "character", characterId: analyst.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.characters[analyst.id]?.statuses.firewallShield?.amount).toBe(3);

    fixture = abilityFixture("infrastructure-architect");
    fixture.state.enemies = {};
    const movedAlly = characterByClass(fixture.state, "senior-systems-analyst");
    place(fixture.character, 0, 1, 3);
    place(movedAlly, 0, 2, 3);
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "load-balancer",
      target: { type: "load_balancer", characterId: movedAlly.id, destination: { cardIndex: 0, x: 4, y: 3 } }
    }, fixture.character.ownerPlayerId).state;
    expect(result.characters[movedAlly.id]?.position).toEqual({ cardIndex: 0, x: 4, y: 3 });
    expect(result.turn?.movementSpent).toBe(0);

    fixture = abilityFixture("infrastructure-architect");
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "escalate",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.enemies[fixture.enemy.id]?.statuses.tauntedByCharacterId).toBe(fixture.character.id);
  });

  it("implements all Senior Systems Analyst abilities", () => {
    let fixture = abilityFixture("senior-systems-analyst");
    let result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "requirements-clarification",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.enemies[fixture.enemy.id]).toMatchObject({ hp: 19, statuses: { movementReductionNextActivation: 2 } });

    fixture = abilityFixture("senior-systems-analyst");
    fixture.character.hp = 5;
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "workaround",
      target: { type: "character", characterId: fixture.character.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.characters[fixture.character.id]?.hp).toBe(8);

    fixture = abilityFixture("senior-systems-analyst");
    const developer = characterByClass(fixture.state, "application-developer");
    place(developer, 0, 2, 2);
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "process-improvement",
      target: { type: "character", characterId: developer.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.characters[developer.id]?.statuses.movementBoostNextTurn).toBe(true);

    fixture = abilityFixture("senior-systems-analyst");
    fixture.character.hp = 9;
    fixture.character.statuses.actionBlockedNextTurn = true;
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "reboot-service",
      target: { type: "character", characterId: fixture.character.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.characters[fixture.character.id]).toMatchObject({ hp: 10, statuses: { actionBlockedNextTurn: false } });
  });

  it("implements all Application Developer abilities, including push and seeded backfire", () => {
    let fixture = abilityFixture("application-developer");
    let result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "hotfix",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.enemies[fixture.enemy.id]?.hp).toBe(17);

    fixture = abilityFixture("application-developer");
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "refactor",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.enemies[fixture.enemy.id]).toMatchObject({ hp: 18, position: { cardIndex: 0, x: 4, y: 3 } });

    fixture = abilityFixture("application-developer");
    fixture.state.rngState = 1;
    const hpBefore = fixture.character.hp;
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "deploy-to-production",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.enemies[fixture.enemy.id]?.hp).toBe(16);
    expect(result.characters[fixture.character.id]?.hp).toBe(hpBefore - 1);

    fixture = abilityFixture("application-developer");
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "works-on-my-machine"
    }, fixture.character.ownerPlayerId).state;
    expect(result.characters[fixture.character.id]?.statuses.dodgeNextAttack).toBe(true);
  });

  it("implements the Generalist attacks and private Google It choice flow", () => {
    let fixture = abilityFixture("it-generalist");
    let result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "percussive-maintenance",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.enemies[fixture.enemy.id]?.hp).toBe(17);

    fixture = abilityFixture("it-generalist");
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "powershell",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(result.enemies[fixture.enemy.id]?.hp).toBe(18);

    fixture = abilityFixture("it-generalist");
    result = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "google-it"
    }, fixture.character.ownerPlayerId).state;
    expect(result.phase).toBe("resolving_choice");
    expect(() => reduceSystemCrawl(result, { type: "end_turn", characterId: fixture.character.id }, fixture.character.ownerPlayerId))
      .toThrow(expect.objectContaining({ code: "pending_choice_required" }));
    const choice = result.pendingChoice;
    if (!choice) throw new Error("Expected Google It choice");
    expect(() => reduceSystemCrawl(result, { type: "resolve_choice", choiceId: choice.id, itemId: choice.candidateItemIds[0] }, "player-1"))
      .toThrow(expect.objectContaining({ code: "unauthorized_choice" }));
    result = reduceSystemCrawl(result, {
      type: "resolve_choice", choiceId: choice.id, itemId: choice.candidateItemIds[0]
    }, fixture.character.ownerPlayerId).state;
    expect(result.characters[fixture.character.id]?.carriedItemId).toBe(choice.candidateItemIds[0]);
    expect(result.turn?.actionUsed).toBe(true);
  });

  it("copies the latest eligible ability through Other Duties while retaining its own action key", () => {
    const fixture = abilityFixture("application-developer");
    let state = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "hotfix",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    state = activateClass(state, "it-generalist");
    const generalist = characterByClass(state, "it-generalist");
    place(generalist, 0, 2, 3);
    state = reduceSystemCrawl(state, {
      type: "use_ability", characterId: generalist.id, abilityId: "other-duties-as-assigned",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, generalist.ownerPlayerId).state;
    expect(state.enemies[fixture.enemy.id]?.hp).toBe(14);
    expect(state.characters[generalist.id]?.lastActionKey).toBe("ability:other-duties-as-assigned");
  });

  it("expires Firewall and Works on My Machine at the specified next-turn boundary", () => {
    let fixture = abilityFixture("infrastructure-architect");
    fixture.state.enemies = {};
    const analyst = characterByClass(fixture.state, "senior-systems-analyst");
    place(analyst, 0, 2, 2);
    let state = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "firewall",
      target: { type: "character", characterId: analyst.id }
    }, fixture.character.ownerPlayerId).state;
    state.turnOrder = [fixture.character.id];
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: fixture.character.id }, fixture.character.ownerPlayerId).state;
    expect(state.characters[analyst.id]?.statuses.firewallShield).toBeNull();

    fixture = abilityFixture("application-developer");
    fixture.state.enemies = {};
    state = reduceSystemCrawl(fixture.state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "works-on-my-machine"
    }, fixture.character.ownerPlayerId).state;
    state.turnOrder = [fixture.character.id];
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: fixture.character.id }, fixture.character.ownerPlayerId).state;
    expect(state.characters[fixture.character.id]?.statuses.dodgeNextAttack).toBe(false);
  });
});
