import { GameRuleError } from "@team-arcade/game-core";
import {
  createSystemCrawlState,
  projectSystemCrawlState,
  reduceSystemCrawl,
  type SystemCrawlAction,
  type SystemCrawlResult,
  type SystemCrawlState,
  type SystemCrawlViewerState
} from "@team-arcade/games";
import type { SystemCrawlCommand } from "@team-arcade/shared";
import type { StoredPlayer } from "./room-model";

export function createSystemCrawlRoomState(players: readonly StoredPlayer[]): SystemCrawlState {
  const roster = players.filter((player) => player.connected);
  if (roster.length > 4) {
    throw new GameRuleError("TOO_MANY_PLAYERS", "System Crawl supports up to four connected players.");
  }
  const host = roster.find((player) => player.isHost);
  if (!host) throw new GameRuleError("NOT_HOST", "A connected host is required to start System Crawl.");
  return createSystemCrawlState(
    roster.map(({ id, displayName }) => ({ id, displayName })),
    host.id
  );
}

export function createSystemCrawlReplayRoomState(
  players: readonly StoredPlayer[],
  previous: SystemCrawlState,
  seed: string
): SystemCrawlState {
  let next = createSystemCrawlRoomState(players);
  for (const player of next.players) {
    const classIds = previous.classSelections[player.id];
    if (!classIds) continue;
    try {
      next = reduceSystemCrawl(next, { type: "select_class", classIds }, player.id).state;
    } catch {
      return createSystemCrawlRoomState(players);
    }
  }
  if (next.phase !== "ready_to_start") return next;
  next = reduceSystemCrawl(next, { type: "start_adventure", seed }, next.hostPlayerId).state;
  return reduceSystemCrawl(next, { type: "continue_briefing" }, next.hostPlayerId).state;
}

export function handleSystemCrawlRoomCommand(
  state: SystemCrawlState,
  command: SystemCrawlCommand,
  actorPlayerId: string,
  currentHostPlayerId: string
): SystemCrawlResult {
  const currentState = state.hostPlayerId === currentHostPlayerId
    ? state
    : { ...state, hostPlayerId: currentHostPlayerId };
  const action: SystemCrawlAction = command.type === "start_adventure"
    ? { type: "start_adventure", seed: crypto.randomUUID() }
    : command as unknown as Exclude<SystemCrawlAction, { type: "start_adventure" }>;
  return reduceSystemCrawl(currentState, action, actorPlayerId);
}

export function projectSystemCrawlRoomState(
  state: SystemCrawlState,
  viewerPlayerId: string
): SystemCrawlViewerState {
  return projectSystemCrawlState(state, viewerPlayerId);
}
