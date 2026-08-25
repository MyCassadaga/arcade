import { describe, expect, it } from "vitest";
import {
  SYSTEM_CRAWL_MAPS_BY_ID,
  getReachableMovementTiles,
  getValidAttackTargets,
  getValidAbilityTargets,
  getValidItemTargets,
  hasLineOfSight,
  reduceSystemCrawl
} from ".";
import { activateClass, characterByClass, cloneState, firstEnemy, place, replaceEnemies, startedState } from "./test-utils";

describe("System Crawl movement, caches, and turn rules", () => {
  it("uses canonical paths, permits split movement, and enforces the allowance", () => {
    let state = startedState(1);
    const character = characterByClass(state, "infrastructure-architect");
    state = reduceSystemCrawl(state, {
      type: "move_to",
      characterId: character.id,
      destination: { cardIndex: 0, x: 2, y: 2 }
    }, character.ownerPlayerId).state;
    state = reduceSystemCrawl(state, {
      type: "move_to",
      characterId: character.id,
      destination: { cardIndex: 0, x: 2, y: 1 }
    }, character.ownerPlayerId).state;
    expect(state.turn?.movementSpent).toBe(2);
    expect(state.events.filter((event) => event.type === "character_moved").at(-1)?.data.path).toEqual([
      { cardIndex: 0, x: 2, y: 2 },
      { cardIndex: 0, x: 2, y: 1 }
    ]);
    expect(() => reduceSystemCrawl(state, {
      type: "move_to",
      characterId: character.id,
      destination: { cardIndex: 0, x: 7, y: 3 }
    }, character.ownerPlayerId)).toThrow(expect.objectContaining({ code: "movement_exceeded" }));
  });

  it("blocks walls, configured furniture, closed doors, enemies, and characters", () => {
    const state = startedState(1);
    const character = characterByClass(state, "infrastructure-architect");
    const template = SYSTEM_CRAWL_MAPS_BY_ID[state.maps[0]?.templateId ?? ""];
    expect(template).toBeDefined();
    const configuredDoor = state.maps[0]?.doors[0];
    if (configuredDoor) configuredDoor.open = false;
    const targets = [
      { cardIndex: 0, x: 0, y: 0 },
      { cardIndex: 0, ...(template?.props[0]?.position ?? { x: 0, y: 0 }) },
      state.maps[0]?.doors[0]?.position,
      firstEnemy(state).position,
      characterByClass(state, "senior-systems-analyst").position
    ].filter((position): position is { cardIndex: number; x: number; y: number } => Boolean(position));
    for (const destination of targets) {
      expect(() => reduceSystemCrawl(state, { type: "move_to", characterId: character.id, destination }, character.ownerPlayerId))
        .toThrow(expect.objectContaining({ code: "tile_blocked" }));
    }
  });

  it("reveals and connects the next card on frontier entry without activating its enemies immediately", () => {
    let state = startedState(1, "reveal-path");
    state = cloneState(state);
    state.enemies = {};
    const character = characterByClass(state, "infrastructure-architect");
    if (state.turn) state.turn.movementAllowance = 50;
    const firstTemplate = SYSTEM_CRAWL_MAPS_BY_ID[state.maps[0]?.templateId ?? ""];
    const exit = firstTemplate?.exit;
    if (!exit) throw new Error("Entry test map needs an exit");
    const reveal = reduceSystemCrawl(state, {
      type: "move_to",
      characterId: character.id,
      destination: { cardIndex: 0, ...exit }
    }, character.ownerPlayerId);
    expect(reveal.state.revealedCardCount).toBe(2);
    expect(reveal.events.some((event) => event.type === "map_card_revealed")).toBe(true);
    expect(reveal.events.some((event) => event.type === "enemy_attacked" || event.type === "enemy_moved")).toBe(false);

    const secondTemplate = SYSTEM_CRAWL_MAPS_BY_ID[reveal.state.maps[1]?.templateId ?? ""];
    const crossed = reduceSystemCrawl(reveal.state, {
      type: "move_to",
      characterId: character.id,
      destination: { cardIndex: 1, ...secondTemplate?.entrance ?? { x: 0, y: 3 } }
    }, character.ownerPlayerId).state;
    expect(crossed.characters[character.id]?.position.cardIndex).toBe(1);
  });

  it("automatically picks up caches only into an empty slot and allows free discard", () => {
    let state = cloneState(startedState(1));
    state.enemies = {};
    const character = characterByClass(state, "infrastructure-architect");
    const cache = state.maps[0]?.caches[0];
    if (!cache) throw new Error("Entry map needs a cache");
    cache.position = { cardIndex: 0, x: 2, y: 2 };
    cache.itemId = "coffee";
    state = reduceSystemCrawl(state, {
      type: "move_to",
      characterId: character.id,
      destination: cache.position
    }, character.ownerPlayerId).state;
    expect(state.characters[character.id]?.carriedItemId).toBe("coffee");
    expect(state.events.some((event) => event.type === "item_picked_up")).toBe(true);

    const occupiedCache = state.maps[0]?.caches[0];
    if (!occupiedCache) throw new Error("Entry map needs a cache");
    occupiedCache.pickedUp = false;
    occupiedCache.itemId = "ethernet-cable";
    occupiedCache.position = { cardIndex: 0, x: 2, y: 1 };
    state = reduceSystemCrawl(state, {
      type: "move_to",
      characterId: character.id,
      destination: occupiedCache.position
    }, character.ownerPlayerId).state;
    expect(state.characters[character.id]?.carriedItemId).toBe("coffee");
    expect(state.maps[0]?.caches[0]?.pickedUp).toBe(false);

    const beforeAction = state.turn?.actionUsed;
    state = reduceSystemCrawl(state, { type: "discard_item", characterId: character.id }, character.ownerPlayerId).state;
    expect(state.characters[character.id]?.carriedItemId).toBeNull();
    expect(state.turn?.actionUsed).toBe(beforeAction);
    expect(state.characters[character.id]?.lastActionKey).toBeNull();
  });

  it("enforces action alternation while Reboot and an action-blocked turn clear the prior key", () => {
    let state = activateClass(startedState(1), "infrastructure-architect");
    const character = characterByClass(state, "infrastructure-architect");
    place(character, 0, 2, 3);
    state = replaceEnemies(state, [{ definitionId: "scope-creep", position: { cardIndex: 0, x: 3, y: 3 }, hp: 20 }]);
    const enemy = firstEnemy(state);
    state = reduceSystemCrawl(state, {
      type: "use_ability",
      characterId: character.id,
      abilityId: "packet-drop",
      target: { type: "enemy", enemyId: enemy.id }
    }, character.ownerPlayerId).state;
    state.turn = { movementAllowance: 3, movementSpent: 0, actionUsed: false, actionBlocked: false, freeItemUsed: false, actedCharacterIdsThisRound: [] };
    expect(() => reduceSystemCrawl(state, {
      type: "use_ability",
      characterId: character.id,
      abilityId: "packet-drop",
      target: { type: "enemy", enemyId: enemy.id }
    }, character.ownerPlayerId)).toThrow(expect.objectContaining({ code: "repeated_action" }));

    state.turn.actionBlocked = true;
    expect(() => reduceSystemCrawl(state, {
      type: "use_ability",
      characterId: character.id,
      abilityId: "firewall",
      target: { type: "character", characterId: character.id }
    }, character.ownerPlayerId)).toThrow(expect.objectContaining({ code: "action_already_used" }));
    state.turn.actedCharacterIdsThisRound = [];
    const rebooted = reduceSystemCrawl(state, { type: "end_turn", characterId: character.id }, character.ownerPlayerId).state;
    expect(rebooted.characters[character.id]?.lastActionKey).toBeNull();
  });

  it("gives every class a one-damage adjacent Attack and alternates it like other actions", () => {
    let state = activateClass(startedState(1), "infrastructure-architect");
    const character = characterByClass(state, "infrastructure-architect");
    place(character, 0, 2, 3);
    state = replaceEnemies(state, [
      { definitionId: "scope-creep", position: { cardIndex: 0, x: 3, y: 3 }, hp: 5 },
      { definitionId: "meeting", position: { cardIndex: 0, x: 5, y: 3 }, hp: 5 }
    ]);
    const [adjacent, distant] = Object.values(state.enemies);
    if (!adjacent || !distant) throw new Error("Expected attack targets");
    expect(getValidAttackTargets(state, character.id)).toEqual([{ type: "enemy", enemyId: adjacent.id }]);

    state = reduceSystemCrawl(state, {
      type: "attack",
      characterId: character.id,
      target: { type: "enemy", enemyId: adjacent.id }
    }, character.ownerPlayerId).state;
    expect(state.enemies[adjacent.id]?.hp).toBe(4);
    expect(state.turn?.actionUsed).toBe(true);
    expect(state.characters[character.id]?.lastActionKey).toBe("system:attack");
    expect(state.events.some((event) => event.type === "character_attacked" && event.data.enemyId === adjacent.id)).toBe(true);

    state.turn = { movementAllowance: 3, movementSpent: 0, actionUsed: false, actionBlocked: false, freeItemUsed: false, actedCharacterIdsThisRound: [] };
    expect(() => reduceSystemCrawl(state, {
      type: "attack",
      characterId: character.id,
      target: { type: "enemy", enemyId: adjacent.id }
    }, character.ownerPlayerId)).toThrow(expect.objectContaining({ code: "repeated_action" }));
    expect(() => reduceSystemCrawl(state, {
      type: "attack",
      characterId: character.id,
      target: { type: "enemy", enemyId: distant.id }
    }, character.ownerPlayerId)).toThrow(expect.objectContaining({ code: "repeated_action" }));
  });

  it("exports authoritative presentation selectors and applies door and prop line-of-sight metadata", () => {
    let state = activateClass(startedState(1), "infrastructure-architect");
    const character = characterByClass(state, "infrastructure-architect");
    place(character, 0, 2, 3);
    state = replaceEnemies(state, [{ definitionId: "scope-creep", position: { cardIndex: 0, x: 3, y: 3 } }]);
    const enemy = firstEnemy(state);
    expect(getValidAbilityTargets(state, character.id, "packet-drop")).toContainEqual({ type: "enemy", enemyId: enemy.id });
    characterByClass(state, "infrastructure-architect").carriedItemId = "ethernet-cable";
    expect(getValidItemTargets(state, character.id)).toContainEqual({ type: "enemy", enemyId: enemy.id });
    expect(getReachableMovementTiles(state, character.id)).not.toContainEqual(enemy.position);

    state.maps[0] = {
      ...(state.maps[0] as NonNullable<typeof state.maps[0]>),
      templateId: "access-layer",
      doors: [{ id: "los-door", position: { cardIndex: 0, x: 3, y: 3 }, open: false }]
    };
    expect(hasLineOfSight(state, { cardIndex: 0, x: 2, y: 3 }, { cardIndex: 0, x: 4, y: 3 })).toBe(false);
    const door = state.maps[0]?.doors[0];
    if (!door) throw new Error("Expected LOS door");
    door.open = true;
    expect(hasLineOfSight(state, { cardIndex: 0, x: 2, y: 3 }, { cardIndex: 0, x: 4, y: 3 })).toBe(true);
    expect(hasLineOfSight(state, { cardIndex: 0, x: 2, y: 1 }, { cardIndex: 0, x: 4, y: 1 })).toBe(false);
  });
});
