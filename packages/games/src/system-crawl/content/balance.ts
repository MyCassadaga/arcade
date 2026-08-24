/**
 * Initial release balance. Keep tunable combat and encounter values here so
 * human playtest adjustments do not require hunting through reducers or UI.
 */
export const SYSTEM_CRAWL_BALANCE = {
  encounter: {
    entryEnemies: 1,
    standardEnemiesByCard: { 1: 2, 2: 2 } as Readonly<Record<number, number>>,
    extraStandardEnemiesByPartySize: { 2: 0, 3: 1, 4: 2 } as Readonly<Record<number, number>>
  },
  bossHpBonusByPartySize: { 2: 0, 3: 3, 4: 6 } as Readonly<Record<number, number>>,
  bossMinionCapacityByPartySize: { 2: 2, 3: 3, 4: 4 } as Readonly<Record<number, number>>,
  corruption: { damage: 1, lifetimeRounds: 2 },
  knownGoodBackup: { hpFraction: 0.5 },
  consultant: { copyMultiplier: 0.75, changeRequestHealing: 4 }
} as const;

export function partySizeBaseline(characterCount: number): 2 | 3 | 4 {
  return Math.min(4, Math.max(2, characterCount)) as 2 | 3 | 4;
}
