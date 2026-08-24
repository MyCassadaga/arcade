import { describe, expect, it } from "vitest";
import { reduceSystemCrawl } from ".";
import type { SystemCrawlItemId, SystemCrawlState, SystemCrawlTarget } from "./types";
import { activateClass, characterByClass, firstEnemy, place, replaceEnemies, startedState } from "./test-utils";

function itemFixture(itemId: SystemCrawlItemId) {
  let state = activateClass(startedState(4, `item-${itemId}`), "infrastructure-architect");
  const character = characterByClass(state, "infrastructure-architect");
  place(character, 0, 2, 3);
  character.carriedItemId = itemId;
  state = replaceEnemies(state, [{ definitionId: "scope-creep", position: { cardIndex: 0, x: 3, y: 3 }, hp: 20 }]);
  return { state, character: characterByClass(state, "infrastructure-architect"), enemy: firstEnemy(state) };
}

function useFixtureItem(state: SystemCrawlState, characterId: string, actor: string, target?: SystemCrawlTarget) {
  return reduceSystemCrawl(state, { type: "use_item", characterId, ...(target ? { target } : {}) }, actor).state;
}

describe("System Crawl initial items", () => {
  it("uses Coffee to heal its user or an adjacent ally", () => {
    const fixture = itemFixture("coffee");
    fixture.character.hp = 8;
    const state = useFixtureItem(fixture.state, fixture.character.id, fixture.character.ownerPlayerId, {
      type: "character", characterId: fixture.character.id
    });
    expect(state.characters[fixture.character.id]).toMatchObject({ hp: 11, carriedItemId: null, lastActionKey: "item:coffee" });
  });

  it("opens a selected adjacent locked door with Admin Credentials and consumes only on success", () => {
    const fixture = itemFixture("admin-credentials");
    const door = fixture.state.maps[0]?.doors[0];
    if (!door) throw new Error("Entry map needs a door");
    door.position = { cardIndex: 0, x: 3, y: 3 };
    expect(() => useFixtureItem(fixture.state, fixture.character.id, fixture.character.ownerPlayerId, {
      type: "door", doorId: "missing"
    })).toThrow(expect.objectContaining({ code: "invalid_target" }));
    expect(fixture.character.carriedItemId).toBe("admin-credentials");
    const state = useFixtureItem(fixture.state, fixture.character.id, fixture.character.ownerPlayerId, {
      type: "door", doorId: door.id
    });
    expect(state.maps[0]?.doors[0]).toMatchObject({ open: true });
  });

  it("stuns an enemy's next activation with Approved Change Request", () => {
    const fixture = itemFixture("approved-change-request");
    const state = useFixtureItem(fixture.state, fixture.character.id, fixture.character.ownerPlayerId, {
      type: "enemy", enemyId: fixture.enemy.id
    });
    expect(state.enemies[fixture.enemy.id]?.statuses.stunnedNextActivation).toBe(true);
  });

  it("revives a ranged downed ally to four HP with Spare Laptop", () => {
    const fixture = itemFixture("spare-laptop");
    const analyst = characterByClass(fixture.state, "senior-systems-analyst");
    place(analyst, 0, 3, 3);
    analyst.hp = 0;
    analyst.downed = true;
    const state = useFixtureItem(fixture.state, fixture.character.id, fixture.character.ownerPlayerId, {
      type: "character", characterId: analyst.id
    });
    expect(state.characters[analyst.id]).toMatchObject({ hp: 4, downed: false });
  });

  it("adds Budget Exception damage to the next damaging action and then consumes the bonus", () => {
    const fixture = itemFixture("budget-exception");
    let state = useFixtureItem(fixture.state, fixture.character.id, fixture.character.ownerPlayerId);
    expect(state.characters[fixture.character.id]?.statuses.nextDamageBonus).toBe(2);
    if (!state.turn) throw new Error("Expected active turn");
    state.turn.actionUsed = false;
    state = reduceSystemCrawl(state, {
      type: "use_ability", characterId: fixture.character.id, abilityId: "packet-drop",
      target: { type: "enemy", enemyId: fixture.enemy.id }
    }, fixture.character.ownerPlayerId).state;
    expect(state.enemies[fixture.enemy.id]?.hp).toBe(16);
    expect(state.characters[fixture.character.id]?.statuses.nextDamageBonus).toBe(0);
  });

  it("reveals the next authored card with Vendor Documentation", () => {
    const fixture = itemFixture("vendor-documentation");
    const state = useFixtureItem(fixture.state, fixture.character.id, fixture.character.ownerPlayerId);
    expect(state.revealedCardCount).toBe(2);
    expect(state.maps[1]?.revealed).toBe(true);
  });

  it("deals ranged damage with Ethernet Cable", () => {
    const fixture = itemFixture("ethernet-cable");
    const state = useFixtureItem(fixture.state, fixture.character.id, fixture.character.ownerPlayerId, {
      type: "enemy", enemyId: fixture.enemy.id
    });
    expect(state.enemies[fixture.enemy.id]?.hp).toBe(18);
  });

  it("passively consumes Noise-Canceling Headphones to prevent Meeting", () => {
    let state = itemFixture("noise-canceling-headphones").state;
    const character = characterByClass(state, "infrastructure-architect");
    place(character, 0, 2, 3);
    for (const other of Object.values(state.characters)) {
      if (other.id !== character.id) {
        other.hp = 0;
        other.downed = true;
      }
    }
    state = replaceEnemies(state, [{ definitionId: "meeting", position: { cardIndex: 0, x: 3, y: 3 } }]);
    state.turnOrder = [character.id];
    state = reduceSystemCrawl(state, { type: "end_turn", characterId: character.id }, character.ownerPlayerId).state;
    expect(state.characters[character.id]?.carriedItemId).toBeNull();
    expect(state.characters[character.id]?.statuses.actionBlockedNextTurn).toBe(false);
    expect(state.events.some((event) => event.type === "item_prevented_status" && event.data.source === "noise-canceling-headphones")).toBe(true);
  });
});
