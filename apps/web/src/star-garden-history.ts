import { z } from "zod";
const resultSchema = z.object({ instance: z.string(), score: z.number().int().nonnegative(), goals: z.number().int().min(0).max(30), actions: z.number().int().nonnegative() });
const historySchema = z.object({ first: resultSchema, best: resultSchema });
export type StarGardenLocalResult = z.infer<typeof resultSchema>;
export const starGardenHistoryKey = (date: string) => `team-arcade:star-garden:v1:daily:${date}`;
export function readStarGardenHistory(date: string) {
  try { const parsed = historySchema.safeParse(JSON.parse(localStorage.getItem(starGardenHistoryKey(date)) ?? "null") as unknown); return parsed.success ? parsed.data : null; } catch { return null; }
}
export function recordStarGardenResult(date: string, result: StarGardenLocalResult) {
  const previous = readStarGardenHistory(date);
  const best = !previous || result.score > previous.best.score || (result.score === previous.best.score && (result.goals > previous.best.goals || (result.goals === previous.best.goals && result.actions < previous.best.actions))) ? result : previous.best;
  const history = { first: previous?.first ?? result, best };
  try { localStorage.setItem(starGardenHistoryKey(date), JSON.stringify(history)); } catch { /* Convenience history may be unavailable. */ }
  return history;
}
