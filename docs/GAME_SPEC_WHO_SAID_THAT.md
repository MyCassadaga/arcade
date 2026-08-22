# Game Specification — Who Said That?

## Elevator pitch

Players anonymously answer a workplace-safe prompt. Answers are revealed one at a time and everyone except the author tries to identify who wrote each answer.

## Players
- Minimum: 3
- Maximum: 12
- Best: 5–8

## Round phases

```text
INTRO -> PROMPT -> SUBMITTING -> GUESSING (repeat per answer) -> ROUND_RESULTS -> next round / GAME_RESULTS
```

## Setup

Default game length: 3 rounds.

Host may choose 3 or 5 rounds before start if trivial to implement. If this adds meaningful complexity, ship 3 only.

Each round selects one prompt from a built-in work-safe prompt deck without repeating within the same game.

Sample prompts:

- What is a completely useless skill you're weirdly good at?
- What food could you eat every week forever?
- What tiny inconvenience annoys you way more than it should?
- What job would you be hilariously bad at?
- What is your most defensible unpopular food opinion?
- If you had to teach a 10-minute class with no preparation, what could you teach?
- What fictional universe would be terrible to actually live in?
- What household object do you irrationally love?
- What is something you believed for way too long as a kid?
- What is the strangest thing you are surprisingly competitive about?

Prompt deck must be stored as editable data, not scattered in React components.

## Submission phase

Every player submits one answer.

Constraints:
- 1–160 characters after trim;
- one submission per player;
- player may edit answer until all submissions are received or host advances if a host-force-advance feature is included;
- UI shows submission progress as count only, not who has/hasn't answered if avoiding social pressure is easy; showing ready checkmarks is also acceptable.

When all active players have submitted, transition automatically to guessing.

## Guessing sequence

Shuffle submitted answers using server-side randomness.

For each answer:

1. Show anonymous answer.
2. Every player except its author selects which other player they believe wrote it.
3. Author sees the same screen but receives `You wrote this one — watch them guess.` and does not submit a guess.
4. When all eligible guesses arrive, reveal the author and guess distribution.
5. Award points.
6. Host clicks Next or server advances after a short reveal delay; host-controlled Next is preferred for social conversation.

Do not allow players to guess themselves unless product testing demonstrates confusion; preferred UX excludes player's own name from choices.

## Scoring

Per revealed answer:

- Correct guesser: +1 point
- Answer author: +1 point for each incorrect guess cast against someone else

Example: 5 eligible guessers. 2 correctly guess Kevin, 3 guess other people.
- each correct guesser earns +1;
- Kevin earns +3.

This rewards recognizable answers and deceptive answers simultaneously.

## Round results

After all answers are revealed:
- show points earned this round;
- show cumulative score;
- optionally show lightweight fun stat such as `Most Mysterious Answer` if derivable without additional rules.

Host starts next round.

## Game result

After final round:
- rank players by cumulative game score;
- ties share placement;
- celebrate top score without humiliating last place;
- offer Play Again / Back to Arcade.

## State sketch

```ts
interface WhoSaidThatState {
  phase: "prompt" | "submitting" | "guessing" | "reveal" | "roundResults" | "gameResults";
  roundNumber: number;
  totalRounds: number;
  promptId: string;
  submissions: Record<PlayerId, string>;
  answerOrder: PlayerId[];
  currentAnswerIndex: number;
  guesses: Record<PlayerId, PlayerId>;
  roundScores: Record<PlayerId, number>;
}
```

Public projection must never reveal submission-author mapping before reveal.
