# Game Specification — Impostor

## Elevator pitch

Everyone except one player receives the same secret word. Each player gives a short clue. Players discuss and vote for the impostor. If discovered, the impostor can still steal the round by guessing the secret word.

## Players
- Minimum: 4
- Maximum: 12
- Best: 5–8

## Round phases

```text
INTRO -> ROLE_REVEAL -> CLUE_SUBMISSION -> CLUE_REVEAL -> DISCUSSION -> VOTING -> VOTE_REVEAL -> IMPOSTOR_GUESS? -> ROUND_RESULTS
```

## Setup

Default: 4 rounds or one round per player capped at a reasonable length. For MVP, use 4 rounds.

At start of each round:
- server picks one active player as impostor;
- avoid selecting same impostor twice until everyone has had a turn where possible;
- server picks a secret word from built-in deck;
- non-impostors privately receive secret word;
- impostor privately receives `You are the Impostor` with no word.

## Word deck

Use familiar concrete concepts that permit varied clues and are workplace safe.

Examples:
- microwave
- airport
- popcorn
- umbrella
- elevator
- refrigerator
- bicycle
- pizza
- library
- sunscreen
- toothbrush
- volcano
- aquarium
- snowman
- backpack
- coffee
- keyboard
- campfire
- telescope
- sandwich

Store deck as editable data.

## Clue submission

Each player submits one clue.

Constraints:
- 1–32 characters;
- cannot exactly equal the secret word, case-insensitive, for non-impostors;
- one clue per player;
- no author identity hidden: once reveal begins, clue is shown with player name;
- server randomizes starting order each round.

Preferred reveal: show clues one at a time in chosen order with host-controlled `Next Clue`, allowing discussion.

## Discussion

After clues revealed, show all player names + clues in one view.

Display a lightweight instruction: `Discuss. Who sounds suspicious?`

Host clicks `Start Vote`.

## Voting

Each active player votes for one other player.

Rules:
- cannot vote for self;
- one vote each;
- votes hidden until everyone submits;
- if tie for highest votes, run one runoff vote among tied players;
- if runoff ties again, impostor escapes and is treated as not caught.

## Outcome

If impostor is not the unique highest-vote player:
- impostor wins round immediately.

If impostor is caught:
- reveal impostor identity;
- impostor gets one text input to guess secret word;
- exact normalized match wins the steal;
- otherwise team wins.

Normalization for final guess:
- trim;
- case-insensitive;
- collapse repeated spaces;
- no fuzzy matching in MVP.

## Scoring

If impostor escapes vote:
- impostor +3

If impostor is caught but correctly guesses word:
- impostor +2

If impostor is caught and fails word guess:
- each non-impostor +1

Additionally, any non-impostor who voted for the impostor may receive +1. Include this bonus in MVP unless it makes scoring feel too swingy during testing; default implementation SHOULD include it.

## Round results

Show:
- secret word;
- impostor;
- vote totals;
- whether steal succeeded;
- points earned this round;
- cumulative score.

## State sketch

```ts
interface ImpostorState {
  phase: "roleReveal" | "clueSubmission" | "clueReveal" | "discussion" | "voting" | "voteReveal" | "impostorGuess" | "roundResults" | "gameResults";
  roundNumber: number;
  totalRounds: number;
  secretWord: string;
  impostorPlayerId: PlayerId;
  clues: Record<PlayerId, string>;
  clueOrder: PlayerId[];
  currentClueIndex: number;
  votes: Record<PlayerId, PlayerId>;
  runoffCandidates?: PlayerId[];
  finalGuess?: string;
  roundScores: Record<PlayerId, number>;
}
```

`secretWord` and `impostorPlayerId` are authoritative server state. Their exposure must be viewer-specific during active play.
