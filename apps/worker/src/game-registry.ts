import { GameRuleError } from "@team-arcade/game-core";
import type { GameContext, GameResult, ViewerContext } from "@team-arcade/game-core";
import {
  advanceCategories, advanceImpostor, advanceWhoSaidThat,
  createCategoriesState, createImpostorState, createWhoSaidThatState,
  getCategoriesPrivateView, getCategoriesPublicView,
  getImpostorPrivateView, getImpostorPublicView,
  getWhoSaidThatPrivateView, getWhoSaidThatPublicView,
  handleCategoriesCommand, handleImpostorCommand, handleWhoSaidThatCommand,
  type CategoriesState, type ImpostorState, type WhoSaidThatState
} from "@team-arcade/games";
import {
  categoriesCommandSchema, impostorCommandSchema, whoSaidThatCommandSchema,
  type GameCommand, type TypedGameViewerState
} from "@team-arcade/shared";
import type { z } from "zod";

interface PartyStates {
  "who-said-that": WhoSaidThatState;
  impostor: ImpostorState;
  categories: CategoriesState;
}
type PartyGameId = keyof PartyStates;
export type StoredPartyGame = { [K in PartyGameId]: { gameId: K; state: PartyStates[K] } }[PartyGameId];
type PartyView = Exclude<TypedGameViewerState, { gameId: "system-crawl" }>;

interface BoundAdapter {
  command(command: GameCommand, actorPlayerId: string, random: () => number): GameResult<StoredPartyGame>;
  advance(random: () => number): GameResult<StoredPartyGame>;
  project(viewer: ViewerContext): PartyView;
}

// Bind each correlated state/command pair once, so dispatch never casts one
// game's stored state or command into another game's shape.
function adapter<S, C>(definition: {
  create(context: GameContext): S;
  schema: z.ZodType<C>;
  command(state: S, command: C, actor: string, random: () => number): GameResult<S>;
  advance(state: S, random: () => number): GameResult<S>;
  store(state: S): StoredPartyGame;
  project(state: S, viewer: ViewerContext): PartyView;
}) {
  const wrap = (result: GameResult<S>): GameResult<StoredPartyGame> => ({
    state: definition.store(result.state), ...(result.scoreDelta ? { scoreDelta: result.scoreDelta } : {})
  });
  return {
    create: (context: GameContext) => definition.store(definition.create(context)),
    bind: (state: S): BoundAdapter => ({
      command(command, actor, random) {
        const parsed = definition.schema.safeParse(command);
        if (!parsed.success) throw new GameRuleError("INVALID_COMMAND", "That command belongs to a different game.");
        return wrap(definition.command(state, parsed.data, actor, random));
      },
      advance: (random) => wrap(definition.advance(state, random)),
      project: (viewer) => definition.project(state, viewer)
    })
  };
}

export const GAME_REGISTRY = {
  "who-said-that": adapter({
    create: createWhoSaidThatState, schema: whoSaidThatCommandSchema,
    command: handleWhoSaidThatCommand, advance: advanceWhoSaidThat,
    store: (state) => ({ gameId: "who-said-that", state }),
    project: (state, viewer) => ({ gameId: "who-said-that", phase: state.phase,
      public: getWhoSaidThatPublicView(state), private: getWhoSaidThatPrivateView(state, viewer) })
  }),
  impostor: adapter({
    create: createImpostorState, schema: impostorCommandSchema,
    command: handleImpostorCommand, advance: advanceImpostor,
    store: (state) => ({ gameId: "impostor", state }),
    project: (state, viewer) => ({ gameId: "impostor", phase: state.phase,
      public: getImpostorPublicView(state), private: getImpostorPrivateView(state, viewer) })
  }),
  categories: adapter({
    create: (context) => createCategoriesState(context, crypto.randomUUID()), schema: categoriesCommandSchema,
    command: handleCategoriesCommand, advance: advanceCategories,
    store: (state) => ({ gameId: "categories", state }),
    project: (state, viewer) => ({ gameId: "categories", phase: state.phase,
      public: getCategoriesPublicView(state), private: getCategoriesPrivateView(state, viewer) })
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
  }
}
