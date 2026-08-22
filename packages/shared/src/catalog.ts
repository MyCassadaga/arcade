export const GAME_CATALOG = [
  {
    id: "who-said-that",
    name: "Who Said That?",
    description: "Match anonymous answers to the people who wrote them.",
    duration: "15–20 min",
    playerRange: "3–12 players",
    icon: "speech"
  },
  {
    id: "impostor",
    name: "Impostor",
    description: "Give clues, find the player who never saw the secret word.",
    duration: "15–20 min",
    playerRange: "4–12 players",
    icon: "mask"
  }
] as const;

export type GameId = (typeof GAME_CATALOG)[number]["id"];

export const GAME_IDS = GAME_CATALOG.map((game) => game.id) as [GameId, ...GameId[]];
