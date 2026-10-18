# Ghost Circuit — Technical Plan

Version and approval authority: [PRODUCT.md](PRODUCT.md). Repository integration verified at f95bd440 on 2026-10-17; five revisions and one-contract M0 are authorized.

## 1. Preferred approach

Reuse Team Arcade's existing adequate language, framework, routing, styles, storage conventions, test runner and Cloudflare deployment. No framework migration or new engine is justified for a 6×6 deterministic board. Prefer a pure simulation module plus accessible DOM/SVG board and composited raster art; if Arcade already has an adequate canvas renderer, retain it with accessible controls. Use the existing TypeScript/npm workspaces, React/Vite frontend, Zod schemas, Vitest and Playwright commands from package.json.

No live inference, multiplayer mode or new backend is required. Reuse the established solo-room HTTP/WebSocket launch, game registry and Room Durable Object; no new binding, table or storage service. The Worker validates layouts, deterministically simulates and atomically records accepted attempts/results in existing game JSON. Keep effects and rendering independent of simulation so reduced motion, replay and tests consume identical events. Do not select Cloudflare products or assert current quotas/pricing without inspection and current official evidence.

## 2. Tools and access

| Tool | Job / requirement | Access and version evidence | Operations / boundaries | Fallback |
|---|---|---|---|---|
| Existing Arcade toolchain | Required runtime/build/test | Verified tracked TypeScript/React/Vite, Node 22 and npm-workspace scripts at f95bd440 | Run focused/local checks under the authorized M0 scope | Use existing dependencies; no new installs |
| Cloudflare hosting | Existing Worker/static-assets integration verified | Account, product, versions, plan and access unverified | Reuse deployment convention; no deployment authorized here | Deliver changes through project workflow |
| Built-in image generation | M0 representative atlas; source package reports V01 generation | Native image dispatch returned the M0 atlas artifact on 2026-10-17; no model/version claim | Generate/edit assets when authorized; log prompts and source files | Reuse reference for manually authored art with approved approach |
| Local filesystem/Python standard library | Package writing and validation | Used successfully for this deliverable | Write documents, copy original image, validate links, zip | Plain file tooling |
| SVG/native browser drawing | Proposed ports and overlays | Architecture proposal; compatibility not runtime-tested | Render geometry and input states within existing framework | Existing Arcade rendering layer |
| Aseprite | Optional cleanup, not required | Skill states user owns a license; installed version/access unverified | Manual sprite cleanup only if helpful; no assumption of automation access | Existing editor or image-edit tool |
| Audio production | Optional short cues | No tool, export pipeline or license verified | Select original or licensed sounds with provenance later | Ship proof muted; no music dependency |

Planning itself does not verify tool operation in Arcade. No software installation is requested. No external documentation or pricing research was performed for the original portable draft; time-sensitive tool/rights claims remain unverified rather than assumed.

## 3. Costs and rights

New software purchases proposed: none (budget $0). Paid asset purchases proposed: none ($0). New subscriptions proposed: none ($0). Image generation/account usage and existing hosting incremental charges are unknown, not asserted free. Runtime AI/API cost: none designed. Optional Aseprite uses an owned license if available; no purchase. Verify current official service terms and any asset/font/audio licenses at production planning and record sources/date. No paid action is authorized by this spec. Reassess storage/bandwidth only after final asset sizes and actual Cloudflare plan are known.

## 4. Architecture and data ownership

- Contract data owns board cells, fixed-node ports, inventory, objectives, tutorial steps, supported ratings, content version and rules version. Validate before loading.
- Client editor owns placed piece type/rotation, displayed inventory counts, selection, undo/redo and accessibility state; the server independently validates submitted inventory/layout. It cannot mutate fixed nodes.
- Pure simulator consumes validated contract and layout; returns ordered events plus terminal outcome. Logical state: position, arrival edge, disguise, archive flag, collected cache IDs, scanner visits, visited route states.
- Replay controller owns time, playback position and presentation; never owns game truth. Animations cannot change outcomes.
- Result evaluator maps successful final state to explicit ratings in DESIGN. Attempt accounting belongs to authoritative Room Durable Object state, not replay. Stable request IDs use existing deduplication; rejected content/layout validation does not increment attempts, and retries cannot double-count.
- Existing server persistence owns active attempts/results. A client storage adapter owns only schema-versioned editor drafts and noncompetitive completion/best-rating summaries. It cannot write authoritative scores or restore an expired session. UI consumes readable status/recovery paths.
- Arcade adapter owns navigation, existing identity/share conventions if appropriate, and scoped integration. Global leaderboard writes are outside v1.

Proposed interface, language adapted to repository: simulate(contract, layout) → {events, outcome}; validateContract(contract) → errors; rate(outcome, contract) → rating. Events include move, badge acquired, scanner passed, archive acquired/disguise lost, cache acquired, exit, and fail with cell/reason. The simulator terminates at success/failure or a detected repeated route state; include a defensive bounded-step assertion consistent with board size.

Suggested contract schema: id, contentVersion, rulesVersion, width=6, height=6, cells[{coordinate, kind, ports}], inventory{straight, elbow}, supportedRatings, instructions, witnessSolutions. Witness solutions belong in test/development fixtures and are not exposed by normal UI. Client assets are inspectable; do not claim anti-cheat protection.

Server record: contract/rules/content versions, accepted executions, first-success execution, current result and best rating. Local draft record: schema/content/rules versions and editor layout. Local noncompetitive summary: versioned contract identity, completed state, best rating and optional achievement; any displayed cached attempts are explicitly historical, never authority. The server increments executions atomically when accepting a fresh run; preserve the pre-run layout. Interrupted playback resumes in edit mode after authoritative state restoration and keeps the accepted attempt. Retain client history after the 12-hour room expiry; show a new-session notice and start a new room rather than silently restoring expired authority. Version mismatch isolates stale state and offers starting fresh without crashing. Unavailable storage shows a brief “Progress won't be saved on this device” message and continues in memory. Results sharing uses plain text and a manual copy fallback.

## 5. Milestones

M0 is authorized by the owner; M1–M3 remain proposed future stages gated on M0 evaluation and further authority. Repository-native review/risk/exact-SHA policies take precedence.

| Stage | Demonstrable outcome | Requirements | Evidence and stop |
|---|---|---|---|
| Handoff | Read actual repo instructions, reconcile package path and framework, obtain baseline approval and explicit build request | All | Record exact files/workflow/commands; stop at missing required approval or reviewer |
| M0 — Rules and visual proof | One complete small contract, deterministic simulation, finite inventory, key rule failures, representative art in motion on desktop/phone | 001–005,008,009 | Known routes and event fixtures; screenshots plus observed replay; human check that alternative route is interesting. Stop before bulk art/content if proof fails |
| M1 — Complete core | All controls, recovery, outcomes, local persistence and sharing; Borrowed Identity authored and validated | 001–006,009,010 | End-to-end run, failed run, correction, reload and share; no unverified solution claims |
| M2 — First usable game | Six contracts, final intended art, tutorial, multiple validated challenge routes | 004,007,008,009 | Witness solution verification, playtest difficulty notes, asset manifest, responsive visual evidence |
| M3 — Arcade delivery | Scoped integration and project checks, required independent review through active repo workflow | 011 and regression of all | Exact required evidence under repo policy; release only when separately authorized |

## 6. Verification plan — M0 evidence summarized in section 11

| Coverage | Method / expected outcome |
|---|---|
| REQ-001 | Inventory conservation, rotations, invalid cells, undo/redo; touch and keyboard placement behave like mouse |
| REQ-002 | Repeat identical runs and compare complete event streams; pause/step/replay cannot change outcomes or attempts |
| REQ-003 | Badge before scanner passes; unbadged fails; vault clears disguise; cache unique; exit without archive fails |
| REQ-004/007 | Validate every witness layout against inventory/ports; enumerate or search feasible routes to confirm claimed distinct completions and ratings; human difficulty evaluation remains separate |
| REQ-005 | Broken connection, blocked cell, boundary, re-entry and detection failures identify exact cause; repeated-state rejection is defensive malformed-content validation; edit restores initial simulation state |
| REQ-006 | Fresh execution/abort increments once; replay does not; spoiler-free share, clipboard rejection fallback |
| REQ-008 | Screenshot comparison plus actual motion at stated viewports; route overlays remain legible over ink textures |
| REQ-009 | Full keyboard and touch walkthrough, focus visibility, assistive labels, non-color cues, reduced motion |
| REQ-010 | Reload, interrupted run, corrupt data, schema mismatch, unavailable storage and reset preserve documented semantics |
| REQ-011 | Use actual repo build/lint/tests and existing-game smoke checks; no global style/event leakage |

Save evidence in the Arcade repository's existing evidence convention, not an invented global folder. Automated checks can verify logic and assets; they cannot establish fun, art quality or animation feel.

## 7. Setup and delivery

Verified from tracked package.json/profile at f95bd440: Node 22 (`.nvmrc`); `npm run test:unit -- <path>`, `npm run test:worker -- <path>`, `npx playwright test <path>`, `npm run typecheck`, `npm run lint`, `npm run build`. `npm run dev` serves the local Worker at localhost:8787; optional split HMR is available. CI runs broad validation and browser tests for PRs; deployment is only on main.

M0 uses existing catalog, `apps/web/src/App.tsx` solo launch, `apps/worker/src/game-registry.ts`, shared protocol and a pure `packages/games` module. Existing games, room authorization, idempotency, storage shapes and expiry remain compatible. No global leaderboard, new provider, binding, database or runtime dependency. Accepted local history is explicitly nonauthoritative.

Deliver one playable representative contract, deterministic witnesses/regressions, illustrated runtime proof, keyboard/touch/reduced-motion controls and required focused/CI/preview evidence. Stop before the remaining five contracts and bulk asset production for human M0 evaluation.

## 8. Repository handoff status

Imported to docs/spec/ghost-circuit with original concept image, revised Product/Design/Technical Plan, and a bounded root instruction pointer. Existing workflow retained. Version 0.2.0 records user approval of five revisions and M0 implementation authority; no production authority or six-contract expansion approval. Current-session files will be reread; fresh-context designer/reviewer readback follows the native workflow.

## 9. M0 acceptance additions

Prove a valid Basic escape and a materially different Full Haul route with an actual inventory/routing tradeoff. Demonstrate a failed scanner crossing after the vault clears disguise and a corrected successful route. Test server rejection of invalid inventory/ports and unauthorized actors, duplicate-command attempt accounting, reload/reconnect and expiry-safe local history. Ghost is optional and enabled only with a validated explained bypass. Human evaluation of fun/difficulty remains pending until the proof is played.

## 10. Frozen M0 engineering design — issue #39

Designer: native `pw_designer`, run `/root/ghost_m0_design`, configured Astra/medium; native dispatch accepted. This is a fresh read-only design pass, separate from implementation and final review. No source changes or validation were performed by the designer.

Reuse the existing typed game registry, additive stored-game discriminant and Room DO transaction. Keep phase playing after success for improvement, latest bounded replay plus aggregates, and no room score delta. Execute carries immutable request ID, game/contract/content/rules identities, expected execution count and at most 36 placements. Validate before counting. Bounded private canonical-payload receipts plus the execution precondition prevent duplicates, changed payloads and stale retries even after receipt eviction; duplicate/stale responses refresh current authority. Preserve Star Garden/legacy receipt behavior.

Client editing and playback consume authority without incrementing attempts. Bound undo/redo to 100 operations. Pending requests retain their exact ID/payload; reconcile after the server snapshot, never automatically mint another execution. Storage denial must permit in-memory play through Ghost launch/resume/cleanup; local history stays explicitly noncompetitive and survives expired session cleanup.

Representative contract: fixed A1 ENTRY(E), C1 BADGE(W/E), E1 SCANNER(W/E), D3 VAULT(W/E), B2 SCANNER(W/E), D5 CACHE(W/E), A6 EXIT(E). Inventory 8 straight and 8 elbow; editable sockets are the union of the witness routes, all other cells blocked. Ghost is disabled for this proof.

Common prefix: A1 → B1 → C1 → D1 → E1 → F1 → F2 → F3 → E3 → D3.
- Basic suffix: C3 → B3 → B4 → B5 → B6 → A6 (7 straight / 4 elbow total).
- Full Haul suffix: C3 → C4 → C5 → D5 → E5 → E6 → D6 → C6 → B6 → A6 (8 straight / 6 elbow total).
- Post-vault detection suffix: C3 → C2 → B2 → A2 → A3 → A4 → A5 → B5 → B6 → A6 (6 straight / 8 elbow total); execution must stop at B2.

These are design witnesses until executed by tests. Human difficulty/fun evaluation remains pending. The representative atlas is in apps/web/public/ghost-circuit/atlas.png with its generation provenance manifest; crisp connectors/ports remain separately rendered. Final independent HIGH review follows focused checks, CI and runtime interaction/visual evidence.

## 11. M0 implementation evidence (local/preview; 2026-10-17)

The representative contract, pure rules, existing solo-room integration, bounded authoritative attempt/receipt handling, client editor/replay, versioned draft/history recovery and illustrated runtime are implemented for independent review. M1–M3 and the remaining five contracts remain gated; no release/production action was performed.

- Focused rules and React editor/storage/retry/replay checks: 11 passed.
- Focused Worker authorization, idempotency/altered-payload/staleness, concurrent tabs, Durable Object reload and receipt-eviction checks: 3 passed.
- Focused browser checks: 4 passed, covering failure → Basic → Full Haul, keyboard/touch, free pause/step/replay, reload, denied storage, expiry/history and reduced motion. After narrow layout corrections, the affected viewport/touch checks passed 2/2; unrelated authority/storage evidence was reused because only CSS and viewport assertions changed.
- Type checking and lint passed; final web build passed. Current-head broad CI and independent HIGH review are tracked on issue #39 rather than duplicated here.
- Primary manually assembled a Basic route with normal UI controls, executed it, observed a facing-port failure while improving it, corrected to Full Haul, paused/stepped replay without another attempt, and reloaded with execution count and best result preserved.
- Desktop QA found the original 550px board pushed controls off screen; the compact correction keeps board/inventory/objective/Execute within 1440×900. The 320px correction reserves 48px cells without horizontal page overflow. Screenshots and observed playback are local runtime evidence, not proof of human-rated difficulty/fun.

Human M0 evaluation is still pending. The next content expansion is not authorized by automated tests or independent code review.

### Independent-review correction

The initial HIGH review found that Replay latest combined accepted events with the current edited draft geometry. The correction renders accepted geometry and its inventory during playback while preserving the separate editable draft and undo/redo. A new React regression and affected browser flow passed: remove B1 after a successful run → replay shows recorded B1 and inventory → Return to edit restores empty B1 → Undo/Redo remains intact, with zero new execution command. Primary repeated this through visible browser controls and the execution count stayed at 3. Focused screen7 + protocol11 checks passed, alongside the affected browser test and rebuilt web app.

The same correction batch updates the existing exact public/solo catalog expectations to include Ghost Circuit while preserving hidden-game and play-mode assertions; this fixes the first CI validation failure without weakening filtering. Runtime rules/DO/storage and non-replay layout evidence are unchanged. Previous replay observations are superseded by the corrected regression/QA evidence; current-candidate CI and correction review remain canonical on issue #39.
