export const GAME_CATALOG = [
  {
    id: "who-said-that",
    name: "Who Said That?",
    description: "Match anonymous answers to the people who wrote them.",
    duration: "15–20 min",
    playerRange: "3–12 players",
    icon: "speech",
    playMode: "room",
    availability: "public"
  },
  {
    id: "impostor",
    name: "Impostor",
    description: "Give clues, find the player who never saw the secret word.",
    duration: "15–20 min",
    playerRange: "4–12 players",
    icon: "mask",
    playMode: "room",
    availability: "public"
  },
  {
    id: "categories",
    name: "Categories",
    description: "Think of an original answer. Matching answers cancel; unique answers score.",
    duration: "5–10 min",
    playerRange: "2–12 players",
    icon: "categories",
    playMode: "room",
    availability: "public"
  },
  {
    id: "afterprint",
    name: "AFTERPRINT",
    description: "Reconstruct five events from the trace they left behind.",
    duration: "2–4 min",
    playerRange: "1 player",
    icon: "afterprint",
    playMode: "single-player",
    availability: "public"
  },
  {
    id: "shirt-fight",
    name: "Shirt Fight",
    description: "Draw, write, remix, and vote for the room's funniest shirt.",
    duration: "12–18 min",
    playerRange: "3–8 players",
    icon: "shirt",
    playMode: "room",
    availability: "public"
  },
  {
    id: "system-crawl",
    name: "System Crawl",
    description: "A cooperative IT dungeon crawl through scope creep, meetings, and production incidents.",
    duration: "15–20 min",
    playerRange: "1–4 players",
    icon: "terminal",
    playMode: "room",
    availability: "hidden"
  }
] as const;

export type GameId = (typeof GAME_CATALOG)[number]["id"];

export const PUBLIC_GAME_CATALOG: readonly (typeof GAME_CATALOG)[number][] = GAME_CATALOG.filter(
  (game) => game.availability === "public"
);

export const SINGLE_PLAYER_GAME_CATALOG = PUBLIC_GAME_CATALOG.filter(
  (game) => game.playMode === "single-player"
);

export const GAME_IDS = GAME_CATALOG.map((game) => game.id) as [GameId, ...GameId[]];
