import { GameRuleError } from "@team-arcade/game-core";
import type { GameContext, GameResult, ViewerContext } from "@team-arcade/game-core";
import {
  advanceAfterprint, advanceCategories, advanceImpostor, advanceShirtFight, advanceWhoSaidThat,
  createAfterprintState, createCategoriesState, createImpostorState, createWhoSaidThatState, createShirtFightState,
  getAfterprintPrivateView, getAfterprintPublicView,
  getCategoriesPrivateView, getCategoriesPublicView,
  getImpostorPrivateView, getImpostorPublicView,
  getWhoSaidThatPrivateView, getWhoSaidThatPublicView,
  getShirtFightPrivateView, getShirtFightPublicView,
  handleAfterprintCommand, handleCategoriesCommand, handleImpostorCommand, handleWhoSaidThatCommand, handleShirtFightCommand,
  type AfterprintState, type CategoriesState, type ImpostorState, type ShirtFightState, type WhoSaidThatState
} from "@team-arcade/games";
import {
  afterprintCommandSchema, categoriesCommandSchema, impostorCommandSchema, shirtFightCommandSchema, whoSaidThatCommandSchema,
  type GameCommand, type TypedGameViewerState
} from "@team-arcade/shared";
import type { z } from "zod";

interface PartyStates {
  "who-said-that": WhoSaidThatState;
  impostor: ImpostorState;
  categories: CategoriesState;
  afterprint: AfterprintState;
  "shirt-fight": ShirtFightState;
}
type PartyGameId = keyof PartyStates;
export type StoredPartyGame = { [K in PartyGameId]: { gameId: K; state: PartyStates[K] } }[PartyGameId];
type PartyView = Exclude<TypedGameViewerState, { gameId: "system-crawl" }>;

interface BoundAdapter {
  command(command: GameCommand, actorPlayerId: string, now: number, random: () => number): GameResult<StoredPartyGame>;
  advance(now: number, random: () => number): GameResult<StoredPartyGame>;
  project(viewer: ViewerContext): PartyView;
}

// Bind each correlated state/command pair once, so dispatch never casts one
// game's stored state or command into another game's shape.
function adapter<S, C>(definition: {
  create(context: GameContext): S;
  schema: z.ZodType<C>;
  command(state: S, command: C, actor: string, now: number, random: () => number): GameResult<S>;
  advance(state: S, random: () => number, now: number): GameResult<S>;
  store(state: S): StoredPartyGame;
  project(state: S, viewer: ViewerContext): PartyView;
}) {
  const wrap = (result: GameResult<S>): GameResult<StoredPartyGame> => ({
    state: definition.store(result.state), ...(result.scoreDelta ? { scoreDelta: result.scoreDelta } : {})
  });
  return {
    create: (context: GameContext) => definition.store(definition.create(context)),
    bind: (state: S): BoundAdapter => ({
      command(command, actor, now, random) {
        const parsed = definition.schema.safeParse(command);
        if (!parsed.success) throw new GameRuleError("INVALID_COMMAND", "That command belongs to a different game.");
        return wrap(definition.command(state, parsed.data, actor, now, random));
      },
      advance: (now, random) => wrap(definition.advance(state, random, now)),
      project: (viewer) => definition.project(state, viewer)
    })
  };
}

export const GAME_REGISTRY = {
  "who-said-that": adapter({
    create: createWhoSaidThatState, schema: whoSaidThatCommandSchema,
    command: (state, command, actor, _now, random) => handleWhoSaidThatCommand(state, command, actor, random), advance: advanceWhoSaidThat,
    store: (state) => ({ gameId: "who-said-that", state }),
    project: (state, viewer) => ({ gameId: "who-said-that", phase: state.phase,
      public: getWhoSaidThatPublicView(state), private: getWhoSaidThatPrivateView(state, viewer) })
  }),
  impostor: adapter({
    create: createImpostorState, schema: impostorCommandSchema,
    command: (state, command, actor) => handleImpostorCommand(state, command, actor), advance: advanceImpostor,
    store: (state) => ({ gameId: "impostor", state }),
    project: (state, viewer) => ({ gameId: "impostor", phase: state.phase,
      public: getImpostorPublicView(state), private: getImpostorPrivateView(state, viewer) })
  }),
  categories: adapter({
    create: (context) => createCategoriesState(context, crypto.randomUUID()), schema: categoriesCommandSchema,
    command: (state, command, actor) => handleCategoriesCommand(state, command, actor), advance: advanceCategories,
    store: (state) => ({ gameId: "categories", state }),
    project: (state, viewer) => ({ gameId: "categories", phase: state.phase,
      public: getCategoriesPublicView(state), private: getCategoriesPrivateView(state, viewer) })
  }),
  afterprint: adapter({
    create: (context) => createAfterprintState(context, crypto.randomUUID()), schema: afterprintCommandSchema,
    command: (state, command, actor) => handleAfterprintCommand(state, command, actor), advance: advanceAfterprint,
    store: (state) => ({ gameId: "afterprint", state }),
    project: (state, viewer) => ({ gameId: "afterprint", phase: state.phase,
      public: getAfterprintPublicView(state), private: getAfterprintPrivateView(state, viewer) })
  }),
  "shirt-fight": adapter({
    create: (context) => createShirtFightState(context, crypto.randomUUID()), schema: shirtFightCommandSchema,
    command: (state, command, actor, now) => handleShirtFightCommand(state, command, actor, now),
    advance: (state, _random, now) => advanceShirtFight(state, now),
    store: (state) => ({ gameId: "shirt-fight", state }),
    project: (state, viewer) => ({ gameId: "shirt-fight", phase: state.phase,
      public: getShirtFightPublicView(state), private: getShirtFightPrivateView(state, viewer) })
  })
} satisfies { [K in PartyGameId]: { create(context: GameContext): StoredPartyGame; bind(state: PartyStates[K]): BoundAdapter } };

export function isRegisteredGame(id: string): id is PartyGameId {
  return Object.hasOwn(GAME_REGISTRY, id);
}

export function bindGame(game: StoredPartyGame): BoundAdapter {
  switch (game.gameId) {
    case "who-said-that": return GAME_REGISTRY[game.gameId].bind(game.state);
    case "impostor": return GAME_REGISTRY[game.gameId].bind(game.state);
    case "categories": return GAME_REGISTRY[game.gameId].bind(game.state);
    case "afterprint": return GAME_REGISTRY[game.gameId].bind(game.state);
    case "shirt-fight": return GAME_REGISTRY[game.gameId].bind(game.state);
  }
}
