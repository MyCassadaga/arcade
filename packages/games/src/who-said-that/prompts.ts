export interface WhoSaidThatPrompt {
  id: string;
  text: string;
}

export const WHO_SAID_THAT_PROMPTS: readonly WhoSaidThatPrompt[] = [
  { id: "useless-skill", text: "What is a completely useless skill you're weirdly good at?" },
  { id: "weekly-food", text: "What food could you eat every week forever?" },
  { id: "tiny-inconvenience", text: "What tiny inconvenience annoys you way more than it should?" },
  { id: "bad-job", text: "What job would you be hilariously bad at?" },
  { id: "food-opinion", text: "What is your most defensible unpopular food opinion?" },
  { id: "instant-class", text: "What 10-minute class could you teach with no preparation?" },
  { id: "fictional-universe", text: "What fictional universe would be terrible to actually live in?" },
  { id: "household-object", text: "What household object do you irrationally love?" },
  { id: "childhood-belief", text: "What is something you believed for way too long as a kid?" },
  { id: "competitive", text: "What strange thing are you surprisingly competitive about?" },
  { id: "tiny-luxury", text: "What tiny luxury instantly improves your day?" },
  { id: "meeting-snack", text: "What snack should be mandatory at every long meeting?" }
] as const;
