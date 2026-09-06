# Categories / Duplicate Answers Cancel

Categories supports 2–12 connected players and always runs for five rounds. The roster freezes at game start. Each round presents a different workplace-safe category from the source-editable deck in `packages/games/src/categories/deck.ts`. Keep at least five distinct entries; each game's five-category sequence is frozen in persisted state.

Everyone submits one answer of 1–40 trimmed characters (UTF-16 code units, matching the shared protocol and textarea). A player may revise their answer until the last submission arrives. Before reveal, each player sees only their own submitted answer, the category and submission count, plus round and score metadata. Future categories, other answers, and answer-to-author mappings are never projected during submission.

The server compares answers using pinned [Unicode 17.0.0 default full case folding](https://www.unicode.org/Public/17.0.0/ucd/CaseFolding.txt), trimming, repeated-whitespace collapse, and removal of surrounding Unicode punctuation. Internal punctuation remains meaningful. There is no fuzzy matching, accent removal, or category-validity adjudication. Examples:

| Answers | Result |
|---|---|
| `Coffee mug`, ` COFFEE   MUG! ` | Both cancel |
| `Straße`, `STRASSE` | Both cancel (Unicode full case folding) |
| `résumé`, `resume` | Distinct; each scores |
| `ice-cream`, `ice cream` | Distinct; each scores |
| `!!!`, `—` | Both normalize to empty and cancel |

The checked-in `case-fold.json` contains the C/F mappings, with the Unicode license alongside it. Runtime normalization uses no network access, locale-specific casing, or external service. Whitespace-only inputs are rejected; punctuation-only inputs satisfy the text rule and compare as empty normalized values.

An answer submitted by exactly one player earns +1. Every member of a duplicate group earns 0. Reveal shows each original trimmed answer with its author, grouped under textual **Unique** and **Cancelled** headings, and explains why matching answers cancel. Answers are plain React text, including any HTML-looking input.

Phases: `submitting → reveal → roundResults → submitting` (next round), or `gameResults` after round five. The last submission automatically reveals and scores. Only the host advances after reveal and round results. Final scores rank players by points; tied players share their displayed placement and champion announcement.

Play Again retains room membership and cumulative room scores while starting a new game instance with fresh game scores. Back to Arcade retains room membership and cumulative scores. Refresh/reconnect restores the viewer's exact current phase and own answer. A submission includes its game instance ID and round number, so a delayed prior-round or prior-game request is rejected. Persisted request IDs prevent duplicate processing and double scoring.

Verification: pure engine/protocol tests cover normalization, bounds, 2–12-player rosters, edits/privacy, grouping, transitions and rankings; local Durable Object tests cover authorization, eviction, projections, request idempotency and retained scores. The isolated two-browser Playwright journey covers five rounds and replay, refresh during submission/reveal/results, keyboard controls, a 390px viewport, reduced motion, plain-text rendering and non-color result labels.
