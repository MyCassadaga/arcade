# Codex Prompt 2 — Implement Both Games

Continue from the completed Team Arcade platform. Read the repository documentation again, especially:

- `GAME_SPEC_WHO_SAID_THAT.md`
- `GAME_SPEC_IMPOSTOR.md`
- `PROTOCOL_AND_STATE.md`
- `MASTER_BUILD_SPEC.md`

Do not redesign the platform created in Prompt 1 unless there is a correctness/security blocker. Extend the existing pluggable game architecture.

Implement **Who Said That?** completely:

- prompt deck;
- round setup;
- anonymous submissions;
- answer randomization;
- viewer-safe author hiding;
- sequential answer reveal;
- guesses;
- reveal distribution;
- scoring;
- round results;
- multi-round game results;
- Play Again / Back to Arcade.

Implement **Impostor** completely:

- word deck;
- server-side random impostor assignment;
- private role views;
- private secret word only for non-impostors;
- clue submission validation;
- clue reveal;
- discussion phase;
- voting;
- runoff voting;
- second-tie escape rule;
- impostor final word guess when caught;
- scoring;
- round results;
- multi-round game results;
- Play Again / Back to Arcade.

UX requirements:

- one obvious primary action per phase;
- large readable phase title;
- player/submission progress;
- clear distinction between `waiting for others` and an actionable state;
- tasteful playful transitions;
- reduced-motion support;
- useful mobile layout;
- do not reproduce Jackbox visual assets or branding.

Security/correctness rules:

- secret data may NEVER be included in another player's payload and merely hidden in UI;
- all scoring occurs server-side;
- all phase transitions are server-validated;
- duplicate/stale commands are harmless/rejected;
- reconnect returns exact correct viewer-specific state for the current phase.

Testing:

- comprehensive pure game-engine tests from the security/testing spec;
- integration coverage for private projections;
- Playwright multiplayer flow covering both games;
- explicit regression test proving the Impostor client's pre-reveal messages do not expose the secret word;
- explicit regression test proving Who Said That public pre-reveal state does not map answers to authors.

At completion, run all checks, fix failures, and provide implementation summary + deviations. Do not begin unrelated future games.
