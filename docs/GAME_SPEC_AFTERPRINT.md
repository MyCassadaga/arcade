# AFTERPRINT

AFTERPRINT is a one-player daily trace puzzle. A player sees a frozen 5×5 target and five diagrammed events in a deterministic shuffled order. They may submit at most four complete event orders. There is no timer.

Puzzle #001 begins on 2026-09-09 UTC. The puzzle number advances at each UTC day boundary. The initial delivery rotates through a small frozen `v1` bank. Future frozen banks must be added as new puzzle-number epochs; published epochs must not be edited or reordered, so a historical puzzle number keeps the same target, events, and initial order.

## Rules

- **Drop:** replaces the marked square with its ink.
- **Roll:** begins without ink and traverses its fixed adjacent-cell path. When it encounters ink, that color becomes the ink it carries; the existing mark remains. It paints each later blank square with the carried ink. Encountering another marked color changes the carried color.
- **Wipe:** removes ink from every square on its fixed path.

All five events must be used exactly once. The server runs the submitted order through the same pure simulator used by puzzle validation. Any order whose final board equals the target is a win; the authored order is neither required nor projected to the browser.

## Puzzle data and validation

Puzzle definitions live separately from rendering under `packages/games/src/afterprint/puzzles.ts`. Each definition has five bounded events, an immutable initial order, an authored validation order, and an explicit frozen 25-cell target. Paths contain two to five unique, orthogonally adjacent cell indices from 0 through 24.

Candidate validation enumerates all 5! = 120 orders through the player simulator, verifies at least one mechanically valid solution, rejects a pre-solved initial order, and verifies that every authored event changes the intermediate board. The versioned bank schedule selects the same definition and initial order for every room on a given UTC date without using room randomness.

## State, attempts, and results

The existing room Durable Object remains authoritative. On start it freezes one connected active player, the daily puzzle, and an instance ID into the persisted game JSON. A strict submission includes that instance ID, puzzle number, and a five-ID permutation. Existing request-ID persistence makes each accepted submission idempotent across reconnects.

Attempt history stores only the five IDs, mismatch count, and solved flag, up to four entries. Boards are reconstructed from the frozen event data. A correct order or the fourth incorrect order atomically moves both game and room to results before broadcast. Replaying a stored attempt is a client-only inspection and consumes no attempt.

The share result contains only the puzzle number, solved/unsolved outcome, attempt count, and mismatch progression. It never includes event order, paths, or target cells.

## Presentation and accessibility

The phone layout keeps the target, replay, five-event sequence, attempt state, and Replay order action together. The room invite/player chrome is suppressed only while this solo game is active. Tapping or keyboard-activating one event and then another swaps them, so drag is never required. Both boards can be enlarged.

Ink colors also use distinct patterns and glyphs: diagonal coral, dotted blue, checked gold, and crossed plum. Incorrect replay cells receive an additional mismatch outline and marker. Reduced-motion clients jump to the final replay board; other clients see the five intermediate boards in sequence.
