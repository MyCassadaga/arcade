# Ghost Circuit — Product

## Package control

This is the sole approval and version record for this package.

| Field | Record |
|---|---|
| Version | 0.2.0 |
| Status | APPROVED REVISIONS — M0 authorized |
| Date | 2026-10-17 |
| Approved package baseline | 0.2.0: five review revisions approved on 2026-10-17; one-contract M0 proof authorized; six-contract expansion remains gated |
| Established direction | Rewire-the-network puzzle; drawn cyberpunk art; arrange, execute, learn, improve |
| Product / design / technical decisions | Five revisions approved; remaining six-contract details are proposed and gated on M0 |
| Implementation authorization | One-contract M0 proof authorized by “Make all the changes to docs as needed and then proceed.” No release authority. |
| Repository | Team Arcade (`MyCassadaga/arcade`); inspected 2026-10-17 at f95bd440 |
| Handoff | Imported at docs/spec/ghost-circuit; bounded AGENTS pointer; M0 execution tracked in GitHub issue |

## 1. Original goal and interpretation

The user wants a puzzle game for their existing Team Arcade application, which they report is established on Cloudflare and already has single-player and multiplayer games. Fitting a particular social format is not a constraint. Their successful game Afterprint asks players to arrange action cards to recreate an outcome, execute the sequence, and share the number of attempts. They find it slightly too easy.

The user asked for a drawn cyberpunk hacking aesthetic: a tile board with paths and dangers, pieces inserted into it, multiple possible wins, and rewards for cleverness. They explicitly chose “rewire the network,” responded “Oooo I like it” to the concept image, and “Beautiful” to the Borrowed Identity walkthrough before requesting this specification.

Interpretation: preserve Afterprint's arrange → execute → diagnose → improve rhythm, but make arrangement spatial and allow different successful routes. Build a satisfying puzzle first. The visual concept is a direction reference, not an already functioning interface or solvable level.

## 2. Proposed first version

A single-player, deterministic puzzle game. A ghost courier follows the route assembled by the player through an illustrated computer network. Collect credentials, steal an archive, optionally collect additional data, and reach an exit. Visible security rules create consequences that can be anticipated. No live AI is required.

Each contract supplies a fixed board and finite inventory of cable pieces. There is no random draw during play. Rearrange freely before execution. Failures give exact, understandable feedback. Retry without a life limit. Attempts are tracked separately from the quality of the successful hack.

First usable content: six authored contracts, including two onboarding contracts and four increasingly demanding challenges. Include contract selection, board/help, execution/replay, result/share, and versioned local noncompetitive history alongside server-authoritative active play. A daily rotation is deferred. Reuse the existing solo-game launch and Worker/Durable Object transport; no new service.

## 3. Requirements

M0 portions are implemented for review; requirements spanning M1–M3 and the six-contract release remain incomplete. The five review revisions and M0 scope are approved; the complete six-contract release remains gated on M0 evaluation.

| ID | Observable behavior | Purpose | Priority | Source | Decision | Acceptance | Dependencies |
|---|---|---|---|---|---|---|---|
| REQ-001 | Place, rotate, remove and rearrange a finite inventory of route tiles in editable cells | Spatial planning | Required | User chose rewiring; interaction details proposed | Established direction / details proposed | Inventory is conserved; fixed cells cannot move; illegal placement explains why; undo restores exact state | None |
| REQ-002 | Execute one deterministic ghost route with visible step events | Make plans legible | Required | Afterprint description and discussion | Established direction / details proposed | Same contract, layout and rules version yield identical events and outcome; pause/step/replay do not alter the result | 001 |
| REQ-003 | Badge, scanner, vault, cache and exit have the explicit rules in DESIGN | Create order-dependent puzzles | Required | Borrowed Identity walkthrough | Proposed | Each rule has positive and negative fixtures; badge-before-scanner and vault-breaking-disguise are demonstrated | 002 |
| REQ-004 | Allow basic success and a higher-value route on the same board | Reward discovery beyond completion | Required | User requested multiple ways and cleverness | Established direction / details proposed | Every non-tutorial contract has a validated archive escape and a distinct higher-rated completion; no unexplained cleverness bonus | 003 |
| REQ-005 | Report failures, preserve the layout, and support immediate edits/retries | Productive experimentation | Required | Afterprint loop | Proposed | Missing connection, blocked cell, boundary exit, detection and invalid exit each identify the responsible cell and reason; cycle detection is defensive malformed-content validation; retry restores pre-run simulation state | 002,003 |
| REQ-006 | Show Basic/Full Haul rating, optional Ghost achievement and execution count; copy a spoiler-free result | Comparable achievement | Required | User's Afterprint sharing reference | Proposed | Shared text includes contract and rules version, rating and attempts, but no path; copy failure exposes selectable text | 004,005 |
| REQ-007 | Deliver six authored, validated contracts with staged teaching | Complete playable content | Required | AI scope proposal | Proposed | Two tutorials plus four challenges each have a known legal solution and an authored teaching/difficulty note; challenge claims are tested | 001–005 |
| REQ-008 | Reproduce the illustrated cyberpunk identity with clear gameplay overlays | Deliver the desired aesthetic | Required | User response to concept | Established direction / production details proposed | Runtime screenshots and motion review satisfy DESIGN acceptance on desktop and phone; no full-screen flattened screenshot used as the game | 001–003 |
| REQ-009 | Support mouse, keyboard and touch, including reduced motion and non-color cues | Accessible interaction | Required | AI proposal | Proposed | Complete a contract with each input; no hover-only action; labels distinguish security/data/routes without color | 001,002,008 |
| REQ-010 | Keep active attempts/results server-authoritative; preserve local editor state and a noncompetitive completion/best-rating summary with version checks | Resume and recover | Required | AI proposal | Proposed | Reload restores the current server session plus valid editor state. A local completion/best-rating summary survives room expiry but never authorizes play or scores. Corrupt/version-mismatched/unavailable storage offers recovery; in-memory editing remains possible. | 005,006 |
| REQ-011 | Integrate within Arcade's existing navigation and conventions | Add a game without replacing the app | Required | User named Team Arcade | M0 integration approved; full release gated | Existing games still launch; scoped styles do not leak; actual repository build and applicable checks pass | 001–010 |

### Included, excluded and deferred

Included: 6×6 boards, straight and elbow pieces, fixed objective/security nodes, one signal, authored puzzles, server-authoritative active play, local noncompetitive completion history and text sharing, optional sound effects.

Deferred: forks/multiple signals, spoof/scrub command tiles, moving patrols, timed scanners, procedural daily generation, takeover/erase contracts, global leaderboards, accounts beyond existing Arcade behavior, multiplayer and custom level editor. These are expansion ideas, not implicit first-version requirements. In particular the FORK, SPOOF and SCRUB tiles in the concept are illustrative and do not expand this scope.

Excluded: realistic hacking, live AI inference, real external computer targets, purchases, new monetization or hosting changes.

## 4. Flow and outcomes

Select contract → brief and optional tutorial → arrange → execute → success or specific failure → replay/edit → improve result or continue. Editing is disabled during execution; Return to edit restores the original planning layout and resets simulation-only state. Reset layout restores the starting board but does not erase the attempt count. Provide undo/redo in planning. Restarting/reloading cannot erase active server attempts silently. Room expiry starts a clearly labeled new session; surviving local history does not restore expired authority.

Count one execution when the server accepts a fresh simulation command. Replaying a recorded run, stepping it, or validation refusing malformed content does not count. Aborting a run already started still counts. Failed paths are legitimate executions. No penalty for thinking time or editing.

End of first version: six completable contracts with distinct solutions, clear rules, final art for the shipped content, tested persistence and input, and integration through the actual Arcade workflow.

## 5. Success and quality targets — proposed

- New players can explain why their first attempt failed from the replay without developer help.
- At least four of five representative testers complete onboarding without verbal coaching; revise instructions if not.
- After onboarding, players can identify the tradeoff between a basic escape and a full haul. Challenge difficulty is a human playtest outcome, not established by a solver.
- Target immediate placement feedback (under 100 ms on the agreed test devices), smooth replay, and no input lost during state transitions. Verify device list and measurements in Arcade.
- No timer pressures the player. Reduced motion offers immediate state updates with explicit event text.
- Support reference desktop 1440×900 and phone 390×844; smaller widths down to 320 CSS px remain operable.
- No new personal data collection. Local summaries are not trusted leaderboard evidence; active attempts/results use the established server authority.

## 6. Assumptions, unknowns and risks

| ID | Type | Statement / next action | Blocks |
|---|---|---|---|
| A1 | Verified | Verified React/Vite + TypeScript workspaces and Cloudflare Worker/Durable Object architecture; docs/ARCHITECTURE.md and package.json inspected at f95bd440 | Stack choice and integration |
| A2 | Proposed | Finite straight/elbow inventory and single signal are enough for the first six puzzles | Test in authorized M0 before expansion |
| U1 | Unresolved | Borrowed Identity illustration and textual sketch are not proven boards; author exact ports/inventory and validate | Shipping this contract |
| U2 | Unresolved | Five revisions and one-contract M0 authorized 2026-10-17; six-contract expansion and production release remain separate | Implementation |
| U3 | Unresolved | Asset-production tooling, rights, hosting impact and target devices require verification | Production assets/release |
| R1 | Risk | Routing alone may become routine; test scarcity plus order-dependent state before adding mechanics | M0 progression |
| R2 | Risk | Ink texture may muddy ports at phone size; use separate crisp path overlays | Visual proof |
| R3 | Risk | Fixed inventory can yield a single solution; validate multiple completions for each challenge | Content acceptance |

## 7. Original authoring record (0.1.0-draft; historical)

2026-10-17: user selected rewiring, expressed positive feedback on the actual concept, endorsed the example discussion, and requested use of the design spec skill. This supports the concept direction and authoring this package. It is not approval of the subsequently drafted six-contract scope, precise mechanics, costs, architecture, implementation, or release. The later 0.2.0 approval is recorded in section 8. No implementation was performed during the original authoring conversation.

## 8. Approved review revision — 2026-10-17

Authority: in this chat the owner agreed individually with revisions #1–#5, then instructed “Make all the changes to docs as needed and then proceed.” Version 0.2.0 records those decisions without granting production authority.

1. Reuse Arcade solo-room launch and authoritative Worker simulation/attempts/results; client editing/replay plus versioned noncompetitive local completion/best-rating history survives the 12-hour room expiry.
2. Basic → Full Haul is the quality ladder. Ghost (no scanners crossed) is a separate optional achievement, only on designated contracts.
3. M0 proves one contract with distinct Basic and Full Haul routes, a meaningful inventory/routing tradeoff, and a scanner-after-vault failure plus corrected route. Stop before bulk content/art and the remaining five contracts pending human evaluation.
4. Explain constructible failures; cycle detection is defensive content validation rather than an ordinary playable failure acceptance case.
5. Challenges require distinct Basic/Full Haul completions; teach Ghost before enabling it on designated contracts. Tutorials may omit untaught ratings/achievements.

First authorized milestone: M0 only, delivered for local/preview evaluation through the native issue/review workflow. The concept image is art direction; FORK/SPOOF/SCRUB, trace accumulation and neighboring scanner hazards remain deferred.
