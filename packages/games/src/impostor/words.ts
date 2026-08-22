export interface ImpostorWord {
  id: string;
  word: string;
}

export const IMPOSTOR_WORDS: readonly ImpostorWord[] = [
  "microwave", "airport", "popcorn", "umbrella", "elevator", "refrigerator", "bicycle", "pizza",
  "library", "sunscreen", "toothbrush", "volcano", "aquarium", "snowman", "backpack", "coffee",
  "keyboard", "campfire", "telescope", "sandwich", "lighthouse", "waterfall", "pancake", "suitcase"
].map((word) => ({ id: word, word }));
