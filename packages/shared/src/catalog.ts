export const GAME_CATALOG = [
  {
    id: "who-said-that",
    name: "Who Said That?",
    description: "Match anonymous answers to the people who wrote them.",
    duration: "15–20 min",
    playerRange: "3–12 players",
    icon: "speech",
    availability: "public"
  },
  {
    id: "impostor",
    name: "Impostor",
    description: "Give clues, find the player who never saw the secret word.",
    duration: "15–20 min",
    playerRange: "4–12 players",
    icon: "mask",
    availability: "public"
  },
  {
    id: "system-crawl",
    name: "System Crawl",
    description: "A cooperative IT dungeon crawl through scope creep, meetings, and production incidents.",
    duration: "15–20 min",
    playerRange: "1–4 players",
    icon: "terminal",
    availability: "hidden"
  }
] as const;

export type GameId = (typeof GAME_CATALOG)[number]["id"];

export const PUBLIC_GAME_CATALOG: readonly (typeof GAME_CATALOG)[number][] = GAME_CATALOG.filter(
  (game) => game.availability === "public"
);

export const GAME_IDS = GAME_CATALOG.map((game) => game.id) as [GameId, ...GameId[]];
