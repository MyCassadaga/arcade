import { createSystemCrawlState, reduceSystemCrawl, SYSTEM_CRAWL_GAME } from "./engine";
import { projectSystemCrawlState } from "./projection";
import type { SystemCrawlAction, SystemCrawlPlayer, SystemCrawlState } from "./types";

/**
 * Standalone definition matching the repository's create/reduce/project engine
 * pattern without registering System Crawl in the frozen room protocol.
 */
export const systemCrawlDefinition = {
  ...SYSTEM_CRAWL_GAME,
  createInitialState(players: readonly Pick<SystemCrawlPlayer, "id" | "displayName">[], hostPlayerId: string) {
    return createSystemCrawlState(players, hostPlayerId);
  },
  handleAction(state: SystemCrawlState, action: SystemCrawlAction, actorPlayerId: string) {
    return reduceSystemCrawl(state, action, actorPlayerId);
  },
  getViewerState(state: SystemCrawlState, viewerPlayerId: string) {
    return projectSystemCrawlState(state, viewerPlayerId);
  }
} as const;
