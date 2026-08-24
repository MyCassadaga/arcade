# System Crawl

System Crawl is Team Arcade's cooperative, server-authoritative IT dungeon crawl for one to four players. A seeded run selects one incident, one entry map, two different standard maps, and the incident's boss map. The target session length is 15–20 minutes; final balance still requires human playtesting.

## Core rules

Each living character receives one turn per round. During a turn, movement may be split around one normal action. The same non-movement action cannot be used on consecutive turns; ending a turn without acting performs a Reboot and clears that lock. After all living characters act, revealed enemies activate in stable order. Entering the frontier exit reveals the next card. A character at 0 HP is downed and may be restored by an adjacent ally's Restart User action. The party wins by defeating the incident boss on card four and loses when everyone is down with no Known Good Backup available.

The four classes are Infrastructure Architect (tank/control), Senior Systems Analyst (support/control), Application Developer (ranged damage), and IT Generalist (mobility/flexibility). Class and ability values live in `packages/games/src/system-crawl/content/classes.ts`.

## Content and balance locations

- `packages/games/src/system-crawl/content/incidents.ts`: six incident tickets, metadata, boss/map links, and map/enemy weights.
- `packages/games/src/system-crawl/content/enemies.ts`: regular enemies, minions, and bosses.
- `packages/games/src/system-crawl/content/items.ts`: item effects, rarity, and deterministic loot weights.
- `packages/games/src/system-crawl/content/balance.ts`: party-size scaling, boss bonuses, minion capacity, hazard lifetime, and other tunable release values.
- `packages/games/src/system-crawl/maps/index.ts`: eighteen fixed 9-by-7 map templates.
- `packages/games/src/system-crawl/engine.ts`: authoritative mechanics and incident/boss resolution.

The two-character baseline uses one entry enemy and two enemies on each standard card. Three characters add one standard-card threat and +3 boss HP; four characters add two threats and +6 boss HP. Normal enemy HP does not scale. Configured boss-minion capacity is 2/3/4 by party size, subject to each boss mechanic's explicit cap (for example, The Audit permits at most three Findings). Loot rarity weights are common 8, uncommon 5, rare 3, and legendary 1; only Known Good Backup is legendary, and no run receives more than one legendary cache.

## Map authoring

A map is a static `SystemCrawlMapTemplate` with a stable ID, role, seven terrain strings of nine characters, entrance/exit, four player entry markers, enemy/minion/cache markers, doors, props, and visual-theme metadata. `#` is blocking terrain; every other terrain character is floor. Required routes must remain open without Admin Credentials. Locked doors belong on optional rewards, shortcuts, or tactical spaces.

Add a template to `maps/index.ts`, keep all markers off blocking terrain and one another, and run `validateAllMapTemplates`. Boss arenas require a boss marker, at least two minion markers, and enough open floor for four characters. Do not generate arbitrary terrain at runtime: state stores template IDs plus dynamic doors, caches, hazards, characters, and enemies.

## Adding content

1. Add the stable type ID in `types.ts`.
2. Add the definition in the relevant `content` module. Enemy numeric values belong in the enemy definition; cross-cutting values belong in `balance.ts`.
3. Add the bounded reducer behavior and events in `engine.ts`.
4. Extend selectors and presentation text when the content introduces a target or player-visible status.
5. Add deterministic fixtures for two-, three-, and four-character parties where scaling applies.

For an incident, define metadata, objective, boss ID, exact boss-map ID, selection weight, and content weights. Executive Dashboard Launch intentionally has a lower incident-selection weight. For a boss, mark its enemy definition as `boss`, implement encounter/activation/half-health behavior, and verify +3/+6 HP scaling occurs once. For an item, declare action timing, rarity, and loot weight; passive and free timing must remain explicit. For an enemy, keep target choice, movement, and summons deterministic.

## Determinism, projection, and replay

The Worker supplies the seed; clients never choose it during a live run. The engine converts it to serializable RNG state, then performs incident, map, encounter, and loot draws in a stable order. Same-seed replay creates a completely fresh state, reapplies the connected frozen roster's class selections, and starts with the old seed. New-seed replay uses a new Worker-generated UUID. Neither replay carries HP, items, statuses, event history, pending choices, or departed-player ownership.

`projectSystemCrawlState` removes RNG state, future map IDs, unpicked cache contents, enemy activation bookkeeping, status expiry counters, and other reducer internals. Google It candidates are included only for their owning player. The seed appears only in victory/defeat projections for the run report.

## Validation

From the repository root:

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:worker
npm run test:e2e
npm run build
npm run deploy:dry-run
```

The release fixtures cover incident/boss selection, all authored maps, encounter and boss scaling, private choices, replay, reconnect, backup recovery, maintenance skips, repeat overrides, debt growth, summons, turn-order rotation, and hazard expiry. Passing fixtures establish deterministic correctness, not final balance; party composition, average run length, cache value, and boss difficulty should be evaluated with real groups.
