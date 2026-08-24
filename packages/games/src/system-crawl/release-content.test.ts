import { describe, expect, it } from "vitest";
import {
  CLASS_DEFINITIONS,
  ENEMY_DEFINITIONS,
  INCIDENT_DEFINITIONS,
  INCIDENT_IDS,
  ITEM_DEFINITIONS,
  SYSTEM_CRAWL_MAPS,
  getValidAbilityTargets,
  reduceSystemCrawl,
  validateAllMapTemplates
} from ".";
import type { SystemCrawlIncidentId, SystemCrawlState } from "./types";
import { activateClass, characterByClass, firstEnemy, place, replaceEnemies, startedState } from "./test-utils";

describe("System Crawl release content and balance", () => {
  it("ships six incidents, eighteen valid authored maps, twelve items, and six bosses", () => {
    expect(INCIDENT_IDS).toHaveLength(6);
    expect(SYSTEM_CRAWL_MAPS).toHaveLength(18);
    expect(new Set(SYSTEM_CRAWL_MAPS.map((map) => map.displayName))).toEqual(new Set([
      "Access Layer", "Help Desk", "Security Gateway", "Service Desk", "Change Control", "Legacy Services",
      "Development Environment", "Network Operations", "Integration Bus", "Data Warehouse", "Vendor Portal",
      "The Cloud", "Production Core", "Audit Vault", "Org Chart Nexus", "Incident Command", "Consulting Suite", "Executive Dashboard"
    ]));
    expect(validateAllMapTemplates()).toEqual([]);
    expect(new Set(SYSTEM_CRAWL_MAPS.map((map) => map.terrain.join("\n"))).size).toBe(18);
    expect(Object.keys(ITEM_DEFINITIONS)).toHaveLength(12);
    expect(Object.values(ENEMY_DEFINITIONS).filter((enemy) => enemy.kind === "boss")).toHaveLength(6);
    expect(Object.values(INCIDENT_DEFINITIONS).every((incident) => incident.modifierId !== null)).toBe(true);
  });

  it("selects every incident deterministically and assigns its matching boss map", () => {
    const fixtures = incidentFixtures();
    expect([...fixtures.keys()].sort()).toEqual([...INCIDENT_IDS].sort());
    for (const [incidentId, state] of fixtures) {
      const incident = INCIDENT_DEFINITIONS[incidentId];
      expect(state.maps[3]?.templateId).toBe(incident.bossMapId);
      if (incident.modifierId === "evidence-rooms") {
        expect(state.maps.slice(1, 3).every((map) => map?.doors.every((door) => !door.open))).toBe(true);
      }
      expect(startedState(2, state.seed ?? "")).toEqual(state);
    }
  });

  it("adds standard-card threats instead of inflating regular enemy HP", () => {
    const seed = nonExecutiveSeed();
    const counts = [2, 3, 4].map((partySize) => {
      let state = startedState(partySize, seed);
      const active = state.characters[state.activeCharacterId ?? ""];
      if (!active || !state.turn) throw new Error("Expected active character");
      state.enemies = {};
      active.carriedItemId = "vendor-documentation";
      state = reduceSystemCrawl(state, { type: "use_item", characterId: active.id }, active.ownerPlayerId).state;
      return Object.values(state.enemies).filter((enemy) => enemy.position.cardIndex === 1).length;
    });
    expect(counts).toEqual([2, 3, 4]);
  });

  it("scales each incident boss by +3/+6 HP and applies encounter-start minions once", () => {
    for (const [incidentId, fixture] of incidentFixtures()) {
      const two = revealAllCards(startedState(2, fixture.seed ?? ""));
      const four = revealAllCards(startedState(4, fixture.seed ?? ""));
      const bossId = INCIDENT_DEFINITIONS[incidentId].bossId;
      const twoBoss = Object.values(two.enemies).find((enemy) => enemy.definitionId === bossId);
      const fourBoss = Object.values(four.enemies).find((enemy) => enemy.definitionId === bossId);
      expect(twoBoss?.maxHp).toBe(ENEMY_DEFINITIONS[bossId].maxHp);
      expect(fourBoss?.maxHp).toBe(ENEMY_DEFINITIONS[bossId].maxHp + 6);
      if (bossId === "audit") expect(Object.values(two.enemies).filter((enemy) => enemy.definitionId === "finding").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("Known Good Backup prevents total defeat exactly once", () => {
    let state = activateClass(startedState(1, "backup"), "infrastructure-architect");
    const active = characterByClass(state, "infrastructure-architect");
    const ally = characterByClass(state, "senior-systems-analyst");
    active.hp = 1;
    ally.hp = 0;
    ally.downed = true;
    ally.carriedItemId = "known-good-backup";
    place(active, 0, 2, 3);
    state = replaceEnemies(state, [{ definitionId: "budget-reduction", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state.rngState = 12_345;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: active.id }, active.ownerPlayerId).state;
    expect(state.phase).toBe("player_turn");
    expect(Object.values(state.characters).every((character) => !character.downed && character.hp === Math.ceil(character.maxHp / 2))).toBe(true);
    expect(state.events.filter((event) => event.type === "known_good_backup_restored")).toHaveLength(1);
    expect(state.characters[ally.id]?.carriedItemId).toBeNull();

    const recoveredActive = state.activeCharacterId ? state.characters[state.activeCharacterId] : null;
    if (!recoveredActive) throw new Error("Expected a recovered active character");
    for (const character of Object.values(state.characters)) {
      character.hp = character.id === recoveredActive.id ? 1 : 0;
      character.downed = character.id !== recoveredActive.id;
    }
    place(recoveredActive, 0, 2, 3);
    state = replaceEnemies(state, [{ definitionId: "budget-reduction", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state.rngState = 12_345;
    state = reduceSystemCrawl(
      state,
      { type: "end_turn", characterId: recoveredActive.id },
      recoveredActive.ownerPlayerId
    ).state;
    expect(state.phase).toBe("defeat");
    expect(state.events.filter((event) => event.type === "known_good_backup_restored")).toHaveLength(1);
    expect(Object.values(state.characters).some((character) => character.carriedItemId === "known-good-backup")).toBe(false);
  });

  it("Maintenance Window skips exactly one enemy phase", () => {
    let state = activateClass(startedState(1, "maintenance"), "infrastructure-architect");
    const active = characterByClass(state, "infrastructure-architect");
    const ally = characterByClass(state, "senior-systems-analyst");
    ally.hp = 0; ally.downed = true;
    active.carriedItemId = "maintenance-window";
    place(active, 0, 2, 3);
    state = replaceEnemies(state, [{ definitionId: "budget-reduction", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state = reduceSystemCrawl(state, { type: "use_item", characterId: active.id, target: { type: "character", characterId: active.id } }, active.ownerPlayerId).state;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: active.id }, active.ownerPlayerId).state;
    expect(state.events.filter((event) => event.type === "enemy_phase_skipped")).toHaveLength(1);
    const hp = state.characters[active.id]?.hp;
    state.rngState = 12_345;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: active.id }, active.ownerPlayerId).state;
    expect(state.events.filter((event) => event.type === "enemy_phase_skipped")).toHaveLength(1);
    expect(state.characters[active.id]?.hp).toBeLessThan(hp ?? 0);
  });

  it("Stack Overflow Answer bypasses only the intended repeat lock", () => {
    let state = activateClass(startedState(1, "stack-answer"), "infrastructure-architect");
    const active = characterByClass(state, "infrastructure-architect");
    active.lastActionKey = "ability:packet-drop";
    active.carriedItemId = "stack-overflow-answer";
    place(active, 0, 2, 3);
    state = replaceEnemies(state, [{ definitionId: "scope-creep", position: { cardIndex: 0, x: 3, y: 3 }, hp: 10 }]);
    const enemy = firstEnemy(state);
    state = reduceSystemCrawl(state, { type: "use_item", characterId: active.id, target: { type: "ability", abilityId: "packet-drop" } }, active.ownerPlayerId).state;
    expect(state.turn?.actionUsed).toBe(false);
    state = reduceSystemCrawl(state, { type: "use_ability", characterId: active.id, abilityId: "packet-drop", target: { type: "enemy", enemyId: enemy.id } }, active.ownerPlayerId).state;
    expect(state.enemies[enemy.id]?.hp).toBe(8);
    expect(state.characters[active.id]?.statuses.repeatOverrideAbilityId).toBeNull();

    let expiring = activateClass(startedState(1, "stack-expiry"), "infrastructure-architect");
    const expiringActive = characterByClass(expiring, "infrastructure-architect");
    expiringActive.lastActionKey = "ability:packet-drop";
    expiringActive.carriedItemId = "stack-overflow-answer";
    expiring.enemies = {};
    expiring = reduceSystemCrawl(expiring, {
      type: "use_item", characterId: expiringActive.id, target: { type: "ability", abilityId: "packet-drop" }
    }, expiringActive.ownerPlayerId).state;
    expiring = reduceSystemCrawl(expiring, { type: "end_turn", characterId: expiringActive.id }, expiringActive.ownerPlayerId).state;
    expect(expiring.characters[expiringActive.id]?.statuses.repeatOverrideAbilityId).toBeNull();

    let late = activateClass(startedState(1, "stack-late"), "infrastructure-architect");
    const lateActive = characterByClass(late, "infrastructure-architect");
    lateActive.carriedItemId = "stack-overflow-answer";
    late = reduceSystemCrawl(late, {
      type: "use_ability", characterId: lateActive.id, abilityId: "firewall",
      target: { type: "character", characterId: lateActive.id }
    }, lateActive.ownerPlayerId).state;
    expect(() => reduceSystemCrawl(late, {
      type: "use_item", characterId: lateActive.id, target: { type: "ability", abilityId: "firewall" }
    }, lateActive.ownerPlayerId)).toThrow(expect.objectContaining({ code: "action_already_used" }));
  });

  it("Rubber Duck Debugging cleanses by priority and grants the next damage bonus", () => {
    let state = activateClass(startedState(1, "rubber-duck"), "infrastructure-architect");
    const active = characterByClass(state, "infrastructure-architect");
    const ally = characterByClass(state, "senior-systems-analyst");
    active.carriedItemId = "rubber-duck-debugging";
    ally.statuses.actionBlockedNextTurn = true;
    ally.statuses.immobilizedNextTurn = true;
    state = reduceSystemCrawl(state, {
      type: "use_item", characterId: active.id, target: { type: "character", characterId: ally.id }
    }, active.ownerPlayerId).state;
    expect(state.characters[ally.id]?.statuses).toMatchObject({
      actionBlockedNextTurn: false,
      immobilizedNextTurn: true,
      nextDamageBonus: 1
    });
  });

  it("applies Project Milestone immobilization without blocking the following action", () => {
    let state = activateClass(startedState(1, "milestone"), "infrastructure-architect");
    const active = characterByClass(state, "infrastructure-architect");
    const ally = characterByClass(state, "senior-systems-analyst");
    ally.hp = 0; ally.downed = true;
    place(active, 0, 2, 3);
    state = replaceEnemies(state, [{ definitionId: "project-milestone", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state.rngState = 12_345;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: active.id }, active.ownerPlayerId).state;
    expect(state.turn).toMatchObject({ movementAllowance: 0, actionBlocked: false, actionUsed: false });
    expect(state.events.some((event) => event.type === "status_applied" && event.data.status === "immobilized")).toBe(true);
  });

  it("implements the Audit shield and only records successful damaging abilities", () => {
    let blocked = activateClass(startedState(1, "audit-shield"), "senior-systems-analyst");
    const analyst = characterByClass(blocked, "senior-systems-analyst");
    place(analyst, 0, 2, 3);
    blocked = replaceEnemies(blocked, [
      { definitionId: "audit", position: { cardIndex: 0, x: 3, y: 3 } },
      { definitionId: "finding", position: { cardIndex: 0, x: 7, y: 5 } }
    ]);
    const audit = firstEnemy(blocked);
    blocked = reduceSystemCrawl(blocked, {
      type: "use_ability", characterId: analyst.id, abilityId: "requirements-clarification",
      target: { type: "enemy", enemyId: audit.id }
    }, analyst.ownerPlayerId).state;
    expect(blocked.enemies[audit.id]?.hp).toBe(14);
    expect(blocked.lastDamagingAbility).toBeNull();
    expect(blocked.events.some((event) => event.type === "damage_prevented" && event.data.source === "outstanding-findings")).toBe(true);
  });

  it("lets The Consultant copy damage and Executive Sponsor leave other actions available", () => {
    let consultant = activateClass(startedState(3, "consultant-copy"), "application-developer");
    const developer = characterByClass(consultant, "application-developer");
    for (const character of Object.values(consultant.characters)) {
      if (character.id !== developer.id) { character.hp = 0; character.downed = true; }
    }
    place(developer, 0, 2, 3);
    consultant = replaceEnemies(consultant, [{ definitionId: "consultant", position: { cardIndex: 0, x: 5, y: 3 } }]);
    const consultantBoss = firstEnemy(consultant);
    consultant = reduceSystemCrawl(consultant, {
      type: "use_ability", characterId: developer.id, abilityId: "hotfix",
      target: { type: "enemy", enemyId: consultantBoss.id }
    }, developer.ownerPlayerId).state;
    expect(consultant.lastDamagingAbility).toMatchObject({ abilityId: "hotfix", damage: 3, range: 5 });
    const hpBeforeCopy = consultant.characters[developer.id]?.hp ?? 0;
    consultant = reduceSystemCrawl(consultant, { type: "end_turn", characterId: developer.id }, developer.ownerPlayerId).state;
    expect(consultant.characters[developer.id]?.hp).toBe(hpBeforeCopy - 3);
    expect(consultant.events.some((event) => event.type === "enemy_attacked" && event.data.source === "leverage-best-practices")).toBe(true);

    let executive = activateClass(startedState(1, "executive-lock"), "infrastructure-architect");
    const architect = characterByClass(executive, "infrastructure-architect");
    const executiveAlly = characterByClass(executive, "senior-systems-analyst");
    executiveAlly.hp = 0; executiveAlly.downed = true;
    place(architect, 0, 2, 3);
    executive = replaceEnemies(executive, [{ definitionId: "executive-sponsor", position: { cardIndex: 0, x: 6, y: 3 } }]);
    executive = reduceSystemCrawl(executive, { type: "end_turn", characterId: architect.id }, architect.ownerPlayerId).state;
    const locked = executive.characters[architect.id]?.statuses.lockedAbilityId;
    expect(locked).not.toBeNull();
    expect(getValidAbilityTargets(executive, architect.id, locked!)).toEqual([]);
    expect(CLASS_DEFINITIONS[architect.classId].abilityIds.filter((abilityId) => abilityId !== locked)
      .some((abilityId) => getValidAbilityTargets(executive, architect.id, abilityId).length > 0)).toBe(true);
    expect(executive.turn?.actionBlocked).toBe(false);
  });

  it("performs The Reorg's seeded legal position swap", () => {
    let state = activateClass(startedState(3, "reorg-swap"), "infrastructure-architect");
    const first = characterByClass(state, "infrastructure-architect");
    const second = characterByClass(state, "senior-systems-analyst");
    const third = characterByClass(state, "application-developer");
    third.hp = 0; third.downed = true;
    place(first, 0, 2, 3);
    place(second, 0, 1, 4);
    const firstPosition = { ...first.position };
    const secondPosition = { ...second.position };
    state = replaceEnemies(state, [{ definitionId: "reorg", position: { cardIndex: 0, x: 7, y: 3 } }]);
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: first.id }, first.ownerPlayerId).state;
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: second.id }, second.ownerPlayerId).state;
    expect(state.characters[first.id]?.position).toEqual(secondPosition);
    expect(state.characters[second.id]?.position).toEqual(firstPosition);
    expect(state.events.some((event) => event.type === "position_swapped")).toBe(true);
  });

  it("grows Technical Debt only when a later card is revealed and caps Additional Requests at two", () => {
    let debtState = activateClass(startedState(1, "debt-growth"), "infrastructure-architect");
    debtState = replaceEnemies(debtState, [{ definitionId: "technical-debt", position: { cardIndex: 0, x: 5, y: 1 } }]);
    const debt = firstEnemy(debtState);
    const debtActive = characterByClass(debtState, "infrastructure-architect");
    debtActive.carriedItemId = "vendor-documentation";
    debtState = reduceSystemCrawl(debtState, { type: "use_item", characterId: debtActive.id }, debtActive.ownerPlayerId).state;
    expect(debtState.enemies[debt.id]).toMatchObject({ hp: 7, maxHp: 7, damage: 2 });

    let feedbackState = activateClass(startedState(1, "feedback"), "infrastructure-architect");
    const attacker = characterByClass(feedbackState, "infrastructure-architect");
    place(attacker, 0, 2, 3);
    feedbackState = replaceEnemies(feedbackState, [{ definitionId: "stakeholder-feedback", position: { cardIndex: 0, x: 3, y: 3 }, hp: 1 }]);
    const feedback = firstEnemy(feedbackState);
    feedbackState = reduceSystemCrawl(feedbackState, { type: "use_ability", characterId: attacker.id, abilityId: "packet-drop", target: { type: "enemy", enemyId: feedback.id } }, attacker.ownerPlayerId).state;
    expect(Object.values(feedbackState.enemies).filter((enemy) => enemy.definitionId === "additional-request")).toHaveLength(2);
  });

  it("rotates turn order without duplicates and expires Production Incident hazards", () => {
    let reorg = startedState(3, "reorg-order");
    const original = [...reorg.turnOrder];
    reorg.pendingTurnOrderRotations = 1;
    reorg.enemies = {};
    for (let index = 0; index < original.length; index += 1) {
      const activeId = reorg.activeCharacterId;
      if (!activeId) throw new Error("Expected active character");
      reorg = reduceSystemCrawl(reorg, { type: "end_turn", characterId: activeId }, reorg.characters[activeId]?.ownerPlayerId ?? "").state;
    }
    expect(new Set(reorg.turnOrder)).toEqual(new Set(original));
    expect(reorg.turnOrder).toHaveLength(original.length);

    let hazards = activateClass(startedState(1, "hazards"), "infrastructure-architect");
    const active = characterByClass(hazards, "infrastructure-architect");
    const ally = characterByClass(hazards, "senior-systems-analyst");
    ally.hp = 0; ally.downed = true;
    place(active, 0, 2, 3);
    hazards = replaceEnemies(hazards, [{ definitionId: "production-incident", position: { cardIndex: 0, x: 4, y: 3 }, hp: 30 }]);
    for (let round = 0; round < 3; round += 1) {
      const boss = firstEnemy(hazards); boss.statuses.stunnedNextActivation = true;
      hazards = reduceSystemCrawl(hazards, { type: "end_turn", characterId: active.id }, active.ownerPlayerId).state;
    }
    expect(hazards.events.some((event) => event.type === "corruption_expired")).toBe(true);
  });
});

function incidentFixtures(): Map<SystemCrawlIncidentId, SystemCrawlState> {
  const found = new Map<SystemCrawlIncidentId, SystemCrawlState>();
  for (let index = 0; index < 500 && found.size < INCIDENT_IDS.length; index += 1) {
    const state = startedState(2, `incident-fixture-${index}`);
    if (state.incidentId && !found.has(state.incidentId)) found.set(state.incidentId, state);
  }
  return found;
}

function nonExecutiveSeed(): string {
  for (let index = 0; index < 50; index += 1) {
    const seed = `scaling-${index}`;
    if (startedState(2, seed).incidentId !== "executive-dashboard-launch") return seed;
  }
  throw new Error("Expected a non-executive seed");
}

function revealAllCards(input: SystemCrawlState): SystemCrawlState {
  let state = activateClass(input, Object.values(input.characters)[0]?.classId ?? "infrastructure-architect");
  const activeId = state.activeCharacterId;
  if (!activeId) throw new Error("Expected active character");
  while (state.revealedCardCount < 4) {
    const active = state.characters[activeId];
    if (!active || !state.turn) throw new Error("Expected active turn");
    active.carriedItemId = "vendor-documentation";
    active.lastActionKey = null;
    state.turn.actionUsed = false;
    state = reduceSystemCrawl(state, { type: "use_item", characterId: active.id }, active.ownerPlayerId).state;
  }
  return state;
}
