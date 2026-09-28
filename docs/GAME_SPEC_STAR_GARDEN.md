# Star Garden v1

Star Garden (`star-garden`) is an original constellation puzzle for one to eight players. Rules and content versions are both `v1`. The executable catalog is [content.ts](../packages/games/src/star-garden/content.ts): exactly 30 stable G01–G30 goals and ten action types comprising 60 individually identified physical cards. Its points, patterns, names, counts and construction order are frozen by tests; this document does not maintain a second catalog. These are initial balance values, not a claim of human playtesting or legal clearance.

## Entering a game

The single catalog entry is available from both the room picker and the direct solo entry. Direct solo reuses the platform's authoritative one-seat room, stored session and room pointer without asking the player to manage a code. Opening the game presents setup. All existing room seats, including disconnected seats, are retained; rosters outside 1–8 are rejected. Setup closes new joins. The current host confirms **Begin**, choosing Daily (initial default) or Practice for one seat; 2–8 seats use Constellation Cup. Mode and roster stay frozen. Host failover uses the existing room rules. A host cannot advance or abandon active play through room controls; return is available from setup/results.

## Board and matching

The board has two rows of five, indexed `0 1 2 3 4 / 5 6 7 8 9`. Four equivalent kinds use persistent color and glyph pairs: gold circle, teal diamond, pink triangle, violet crescent. Orthogonal adjacency is physical Manhattan distance one: 4 and 5 are not adjacent.

A goal's slash-separated pattern is translated to an in-bounds top-left origin without rotation, reflection, stretch or wrapping. Every A has the same kind; every B has the same kind distinct from A. Dots are unconstrained. Other matching stars do not invalidate a pattern. One-row goals can use either row. Claims name one available goal and an origin; only its letter cells are consumed. No automatic claim or overlapping cascade occurs.

All removals use path `P = [0,1,2,3,4,9,8,7,6,5]`, ending at cell 5 without wrapping. Remove selected cells simultaneously. Read survivors in path order and pack them into the downstream suffix. For k removals, draw k kinds: first goes to `P[k-1]`, last to `P[0]`. Thus `[a,b,c,d,e,f,g,h,i,j]` minus b/e/i with draws x/y/z becomes `[z,y,x,a,c,d,f,g,h,j]`. Rows do not collapse independently. Initial boards instead draw ten kinds in row-major order.

## Cards

Each player owns a separately shuffled 60-copy deck, five-card hand, front-drawn pile/cursor and discard. Empty-pile draws shuffle only the discard; held cards are excluded. Accepted card plays move the physical copy from hand to discard and cost one action. Playing does not draw a replacement. Positionally legal colored no-ops cost the card; Scramble's positional permutation must still be non-identity.

- Exchange swaps two distinct orthogonally adjacent cells; Blink swaps any two distinct cells.
- Spin rotates an in-bounds 2×2 block exactly 90 degrees in the selected direction.
- Collapse removes one star with standard flow/refill.
- Scramble selects three consecutive positions in one row and chooses one of the five non-identity permutations. The permutation lists source offsets in destination order.
- Mutation replaces one star in place with a random different kind, selecting from the other three kinds in ascending order. It does not cause flow.
- Drift shifts one row exactly one cell left/right with row wrapping. Mirror reverses one row.
- Crosswind simultaneously shifts the top row one cell in the chosen direction and the bottom oppositely, each wrapping.
- Echo copies the selected source kind into an orthogonally adjacent target without changing the source or causing flow.

**Refresh** is not a card: discard exactly three distinct held copies in selection order, remove all ten stars and refill. It costs three actions, no points and no replacement cards. Cup requires all three allowances remaining. A claim is still possible afterward.

## Practice and Daily

Start with score zero, five cards, and one goal per independently shuffled easy/medium/hard lane. No timers or turns. A claim awards printed points, refills the matched cells, retires the goal, reveals the next goal in that same lane, then draws `min(2, 5-handSize)`. An exhausted lane stays empty. Resolve the whole claim before testing the ending condition.

All 30 claimed is success. Otherwise the run ends only when the hand is empty and no available goal matches, or after an explicit End Run confirmation. Spending the last card does not end a run with a current match; zero-card claims are legal. There is no future-solvability search.

Daily uses the server UTC date when Begin is accepted. That date stays frozen across midnight and reconnects. Practice uses a fresh server UUID. Results show score, claimed count, actions including Refresh, ending reason, mode/version and Daily date. Claims emit incremental room-score deltas; results and reconnect do not re-add totals.

Daily first/best results live only in browser storage under date/v1. A replay is clearly labeled; history never hydrates a board or gates server access. Cleared storage or another device can bypass it. No accounts, identity verification, secure one-attempt policy or global ranking is implied. Sharing is plain text without solution coordinates or deck order, with Clipboard API and manual-copy fallback.

## Constellation Cup

Six simultaneous rounds; each play phase lasts at most 75 seconds. Rounds 1–5 have a six-second reveal; round 6 ends directly in results. All seats receive identical boards, hands, deck order and independent copies of streams. Seat/room/instance identity never alters starting randomness. Choices can subsequently diverge them.

Round r exposes entry r of each shuffled tier lane, six distinct entries per tier in total. Each seat may spend three action allowances and claim at most one objective. A claim awards the printed points to that player at closure, refills only their board, and marks them Done. Another player can claim the same unchanged common goal for equal points. Done without a claim or timeout awards zero. No cards are drawn on Cup claims. Zero remaining actions still permits claim or Done. Later rounds retain boards/unused cards, draw to five, and reset allowances.

During play, others see only readiness and completed-round standings, including completed-round action totals. Done does not disclose claim versus pass. Board, hand, moves, pending goal and pending points remain private. Closure publishes each seat's goal ID or no-claim and points, never coordinates or hands. Room score deltas are applied once with the state transition transaction. Final ranking is points, then more goals, then fewer actions; equal tuples share a rank/win without an ID tiebreak.

A command is timely only if server `now < playEndsAt`. All-Done closure uses the last accepted claim/Done time; otherwise closure uses the scheduled deadline. Reveal ends six seconds later and the next play deadline is 75 seconds after that scheduled reveal end. A bounded reducer catches up all overdue transitions without extending slept-through rounds. Disconnected seats remain and time out normally. Client countdowns are display-only; no server intervals, polling or per-second writes/broadcasts are added.

## Determinism, state and transport

Roots are `star-garden:v1:daily:YYYY-MM-DD`, `star-garden:v1:practice:<server UUID>`, or `star-garden:v1:cup:<server UUID>`. Append `:stars`, `:actions`, or `:goals:easy|medium|hard`. FNV-1a over UTF-8 starts at 2166136261, XORs each byte, multiplies with `Math.imul(...,16777619)` unsigned; zero maps to one. Xorshift32 applies left 13, unsigned right 17, left 5, retaining unsigned state. Divide by 4294967296 for [0,1), floor times n for selection, descending Fisher–Yates for shuffle. Tier lists begin in ascending ID order. Stream states, decks and cursors persist in server-owned JSON. Projection, failed commands, selection, preview and accepted-request replay consume no gameplay RNG.

The pure engine injects time and UUID seed material through the adapter and shares matching/action transforms with safe browser previews. Deterministic previews show exact visible effects; random arrivals/mutations show unknowns. Versions are persisted; published v1 content must not be edited in place. Future revisions need a new explicit version/date policy.

Strict Zod commands are `starGarden.begin`, `playCard`, `claimGoal`, `refresh`, `doneRound`, and `endRun`. Every command carries UUID instance, expected per-player revision, and round number (0 for setup/solo; 1–6 for Cup). The authenticated persisted seat supplies actor identity. Host Begin uses the live persisted host. Accepted mutations and round transitions increment relevant revisions; another seat's ordinary move does not invalidate your revision.

Existing request envelopes and SQLite transactions remain authoritative. Star Garden adds bounded per-seat payload receipts in the existing `room_state` table, atomically with game, score deltas and generic request IDs. Receipt identity is checked before stale revision; changed payload reuse rejects. A stale selection gets the current private snapshot. Deadline reconciliation persists before a late command can reject and also runs before both reconnect paths. The one room alarm still takes the earliest game deadline, inactivity, host failover, expiry and existing asset cleanup. No table, binding, service or infrastructure migration is added. Existing room expiry still applies.

## Interaction and evidence

All actions support tap/native keyboard controls, select → preview → confirm, and free cancellation. Matching origins are individually selectable; Refresh card ordering is explicit. Glyphs accompany colors; targets remain at least 44×44 at 320px. Reduced motion and forced-colors styles are included. Optional setup tutorial uses isolated scripted Exchange, match, claim and flow state, consuming no real cards/randomness/deadline. No audio, external assets or runtime solver/AI is used.

Acceptance coverage resides in the Star Garden engine tests, shared catalog/schema tests, React tests, Worker integration tests and Playwright journeys. Browser journeys distinguish real local Durable Object sessions from a controlled visible-state fixture for multiple matching origins and claim/Refresh/reload interactions. The fixture uses the same production engine and is only test code.

The 200 seeded legal-action simulation uses the highest-point currently matching goal/earliest origin; otherwise it plays the first card at fixed legal targets, without future search. Scores: min 0, median 2, p90 10, max 24, mean 3.415. Actions: min 5, median 5, p90 9, max 17, mean 6.315. Goals: min 0, median 1, p90 3, max 7, mean 1.225. Every run terminated within the 200-step bound and preserved board/card invariants. This intentionally simple policy suggests short runs; it is simulation, not human playtesting, and does not justify silently changing frozen v1 balance.
