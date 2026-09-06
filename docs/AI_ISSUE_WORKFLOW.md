# Portable AI Issue Workflow

This file is the **sole procedural authority** for implementation issue execution in this repository. `AGENTS.md` contains only routing and invariant boundaries. `docs/AI_REPO_PROFILE.md` supplies repository-specific facts. Any system-interaction map describes application behavior, not development orchestration.

GitHub issues are the durable product-requirement, decision, and release-evidence record. The human-selected main-session model is the primary implementer; the project-scoped independent read-only Terra reviewers in `.codex/agents/` perform required reviews.

Before using this workflow for implementation, `docs/AI_REPO_PROFILE.md` must not be `UNINITIALIZED`.

## Authorization and autonomous preparation

`Work issue X` includes the local preparation necessary to deliver that issue: in-scope edits, compatibility updates, diagnostic preparation, local validation, required independent review, staging, commits, and draft PR maintenance. Do not request separate permission for those steps merely because a file is shared, historical, a validator, or release-related. Preserve explicit user exclusions and actual tool/access restrictions; this workflow never overrides them.

Production access remains separately authorized. Preparing and reviewing an exact read-only diagnostic does not authorize executing it. Before asking for execution, finish the authorized preparation and review so the human receives one concrete request with the exact procedure, target, identity, data/output bounds, and attempt limit. Prefer an existing adequate procedure over a new tool. Do not require a new issue or bespoke diagnostic framework for a bounded in-scope investigation.

A request for analysis alone remains read-only. An existing `Work issue X` authorization continues to cover in-scope local preparation after a release refusal; it does not expire because the agent reported a checkpoint. A user stop, explicit scope exclusion, review/cost ceiling, or real access restriction still controls.

## Normal human workflow

1. Create or approve a GitHub issue that states the desired product outcome.
2. Tell the primary agent `Work issue X`.
3. Receive either one concrete blocker or a release-ready result.
4. If ready, separately authorize any merge/deployment/production action using the exact reviewed head SHA when required by this workflow.

The human owner does not need to relay reviewer output between tasks, approve routine intermediate steps, or operate a model state machine.

---

## 1. Product packet: describe the outcome, not the implementation

The initial GitHub issue should capture **product intent only**. Do not require deep repository exploration merely to create the packet, and do not speculate about routes, database tables, providers, migrations, or file paths that have not yet been verified.

Recommended issue structure:

```md
## Outcome
What should be true when this issue is complete?

## Problem / Current Behavior
What is happening now that motivates the change?

## Desired Behavior
What should the user experience instead?

## Acceptance Criteria
- AC-1: ...
- AC-2: ...
- AC-3: ...

## Non-Goals
What is intentionally outside this issue?

## Safety / Production Boundaries
Any known limits on real data, external systems, communications, migrations, or deployment.

## Open Product Questions
None, or only questions that genuinely change user-visible intent.
```

If the user already supplied enough information, create the packet without forcing technical questions. Minor unknowns may remain for repository-grounded discovery when implementation starts.

Creating or approving a packet does **not** authorize implementation.

---

## 2. Start of `Work issue X`: orient and add technical discovery

When implementation is authorized for a named issue, the primary agent first reads:

- the issue and latest comments;
- current branch/worktree and repository state;
- applicable `AGENTS.md` instructions;
- `docs/AI_REPO_PROFILE.md`;
- if enabled, the interaction-map impact index and only map sections relevant to the issue; and
- current source for every material claim that affects implementation.

The primary agent then posts one concise repository-grounded **Implementation Note** to the issue:

```md
[IMPLEMENTATION NOTE]

Risk lane: ROUTINE | STANDARD | HIGH
Relevant architecture/map sections: None | details
Affected files/systems:
Authorization/privacy effects: None | details
Data/schema/migration effects: None | details
Provider/configuration/external effects: None | details
Release-mechanics preflight: Not applicable | Complete | UNKNOWN — BLOCKS RELEASE
Acceptance-to-evidence mapping:
- AC-1 -> ...
- AC-2 -> ...
Plan:
1. ...
2. ...
Material refinements or assumptions: None | details
```

This technical note may refine files, tests, risks, and implementation details **inside the approved product intent**. It may not silently change user-visible intent, a non-goal, or production authority. A genuine product decision returns to the human owner.

Name any known prerequisite issue and its acceptance impact during discovery. Do not silently absorb another issue or reduce acceptance to avoid a dependency. An unknown release-environment fact blocks release; it blocks local implementation only when it materially affects the safe design. Record that distinction and continue independent authorized work without speculative implementation.

Whole-issue execution is the default. Split work only for a concrete boundary such as independently testable high-risk work, materially different environments, an unreviewably large diff, or an actual execution/context limit.

---

## 3. Risk lanes

Risk controls scale with the actual change. Repository-specific additions in `docs/AI_REPO_PROFILE.md` also count.

| Lane | Typical examples | Plan review | Final code review |
|---|---|---|---|
| `ROUTINE` | Documentation, copy, styling, isolated tests, narrow presentation changes, or local pure logic with no sensitive state/effect | No independent plan review | Routine independent exact-SHA review |
| `STANDARD` | Ordinary UI/API/state work using established patterns, with bounded application-state effects and no HIGH boundary | Only when genuine technical ambiguity remains after repository inspection | Routine independent exact-SHA review |
| `HIGH` | Auth/session identity, authorization/permissions, privacy/security, money/accounting, migrations/schema changes over existing data, provider integration/effects, concurrency/idempotency/recovery, mutating jobs/automation, production config/operational controls, destructive behavior, or broad shared foundations that can affect those areas | Required | High-risk independent exact-SHA review |

The primary agent may escalate a lane whenever evidence warrants it. Do not lower an obviously applicable `HIGH` category merely because the diff is small.

If classification is genuinely borderline, choose the higher lane when failure could cause unauthorized access, materially incorrect persistent state, data loss, financial error, or an external effect.

---

## 4. Independent plan review: only when it adds value

### Required

An independent plan review is required for every `HIGH` issue.

### Conditional

For `STANDARD` work, use an independent plan review only when repository inspection leaves a material technical ambiguity, the implementation crosses several coupled systems, or acceptance cannot yet be mapped to reliable evidence.

`ROUTINE` work does not require independent plan review.

### Plan-review behavior

- Use the project-scoped reviewer named in `docs/AI_REPO_PROFILE.md` for the applicable lane. If that required reviewer cannot be spawned, report the exact problem and stop at that gate; do not silently substitute primary-agent self-review.
- Give the reviewer the product packet, Implementation Note, relevant repository location, relevant architecture/map sections, and safety boundaries.
- The reviewer must inspect repository evidence rather than approve the implementer's prose at face value.
- The reviewer returns one consolidated `PASS`, `CHANGES_REQUIRED`, or `BLOCKED` decision.
- The first review should report all material findings visible in scope rather than drip new stylistic concerns across repeated passes.
- The primary agent resolves accepted findings in one batch and records the resolution on the issue.
- A second plan-review launch is **not** routine. Use one follow-up in the same independent read-only reviewer context only when a `BLOCKER` was raised or the resolution materially changes architecture, scope, authorization, or external effects.
- If the unresolved issue is a product decision or missing authority, stop for the human owner instead of iterating models.

### HIGH release-mechanics preflight

For `HIGH` work that may require a production migration, provider/configuration action, protected-branch merge, or deployment, complete one release-mechanics preflight during planning and before asking the required plan reviewer to pass the release approach or building release tooling. If the preflight itself requires a reviewed production diagnostic, the plan reviewer first reviews that bounded diagnostic; one follow-up may incorporate its authorized results. Record each applicable fact as `VERIFIED`, `NOT APPLICABLE`, or `UNKNOWN — BLOCKS RELEASE`, with the controlling evidence:

- execution target, account/resource identity, and authenticated operator path;
- compatibility with historically reachable production state rather than only a clean bootstrap;
- current provider/runtime limits, atomicity and failure semantics, response/result semantics, and fail-closed size or scale bounds;
- concurrency, retry, partial-failure, rollback, and action-time pre/postcondition behavior;
- merge method and whether it preserves the exact reviewed SHA;
- deployment-identity evidence and bounded smoke/postcheck behavior; and
- every credential, configuration, traffic, maintenance, or cleanup action the release would actually require.

Use tracked repository evidence and current primary provider documentation first. This preflight authorizes no production read, write, configuration change, or provider action.

If a production read is genuinely needed to resolve a blocking fact, prepare and independently review one immutable diagnostic artifact or exact read-only procedure under the existing issue authorization, then request execution early. Scope review to the diagnostic, reachable dependencies, read-only behavior, bounds, identity, and output handling; do not reopen unaffected application review. An existing exact reviewed procedure can be reused after verifying identity and applicability. Its authorization must name:

- the reviewed diagnostic SHA or exact command/procedure;
- the exact environment, account, resource/database, and authenticated identity;
- the allowed query and data boundary;
- the output and redaction contract; and
- explicit prohibitions on writes, configuration changes, broader queries, and unreviewed retries.

When release prechecks can predictably refuse, prefer a reviewed precheck that returns a bounded, redacted mismatch explanation rather than only a broad failure label. Alternatively include one exact read-only fallback diagnostic in the release action set. The request must explicitly list the fallback's trigger, reviewed identity, target, read/output bounds, and maximum execution count. The human may authorize or omit it. A generic "deploy" or "diagnose" instruction is not authorization for unspecified production reads. If approved, the fallback may execute on refusal without another permission prompt; it cannot retry the write, repair state, broaden the read, or relax a precondition. An unavailable or ambiguous fallback stops with evidence already obtained.

An unchanged immutable diagnostic artifact may remain authorized across later application commits because those commits do not alter the diagnostic. Any diagnostic change requires fresh review and authorization. Observations are timestamped facts, not permanent truth; action-time preconditions must still revalidate mutable production state.

Do not introduce a new access proxy, identity gate, credential class, maintenance window, traffic block, temporary token, provider configuration, or other operational control merely because it might feel safer. Require concrete evidence of the failure mode it closes or explicit product intent from the human owner. Any live control change remains separately authorized. Record a relevant owner-supplied usage or traffic fact once and reuse it unless contrary evidence appears; such a fact may bound operational risk but never replaces data, authorization, or state-integrity invariants.

---

## 5. Implement

After any required plan review is satisfied, the primary agent:

- works in an isolated feature branch/worktree;
- preserves unrelated changes;
- implements the whole approved issue unless a documented split is necessary;
- records only material design/requirement decisions on the GitHub issue; and
- does not post repetitive progress narration merely to create an audit trail.

### Necessary compatibility edits

In-scope support edits are part of implementation, not a new product authorization. For example, a migration may require a successor registry and historical inventory validators to recognize the new exact migration identity/checksum. The agent may stage and commit those edits when they preserve the historical checks and are covered by applicable review and focused evidence.

Do not modify historical migration SQL/receipts, substitute checksums for changed historical bytes, broadly allow unknown successors, suppress drift failures, or weaken ordering/integrity assertions to get green checks. A change to what state is accepted must be justified in the reviewed plan; a material scope or authority change requires the human. Verify rejection of an unknown successor and a changed historical identity where relevant. Preserve explicitly frozen release artifacts and user-excluded files. If a tool blocks staging, identify the actual rule and scope; do not bypass it or manufacture an approval requirement solely from a filename.

No production/provider/external-write action is part of implementation authority.

---

## 6. Validation matrix

Use **focused evidence first**, then the smallest broader evidence justified by the changed surface. Commands and CI sources come from `docs/AI_REPO_PROFILE.md` and current tracked repository configuration. Do not repeatedly run every available command merely because it exists.

| Change type | Before stable SHA | Exact-SHA / release evidence |
|---|---|---|
| Docs/instructions only | Relevant format/link checks if available; inspect diff | Ordinary CI if applicable; no browser QA unless docs are rendered behavior |
| Isolated pure logic | Focused unit tests; relevant type/lint check if project defines one | Ordinary CI |
| UI presentation/interaction | Focused tests when available; relevant type/build check | Ordinary CI + preview visual verification tied to SHA |
| Ordinary API/business logic | Focused route/unit tests; relevant type/build check | Ordinary CI |
| Shared client state or cross-feature utility | Focused tests plus affected broader suite; relevant build/type check | Ordinary CI; preview if user-visible behavior changes |
| Auth/privacy/financial/provider/concurrency/high-risk logic | Focused regression tests + relevant affected suite + build/type checks | Ordinary CI + required preview/evidence + high-risk reviewer |
| Migration/schema | Isolated migration/schema checks, deterministic pre/postconditions, affected tests | Ordinary CI + reviewed migration evidence; **no production apply** |
| External integration behavior | Mock/provider-free tests and preview-safe evidence | Real-provider acceptance only with separate explicit authority |

### Validation rules

- A focused deterministic test is preferred for pure logic.
- Browser/preview QA is preferred for real browser behavior, redirects, iframes, timing, or visual acceptance.
- CI may perform broad baseline checks once for the exact SHA instead of the primary agent repeatedly duplicating the entire suite locally.
- If a correction changes only one bounded area, rerun the affected focused evidence plus any baseline check needed for confidence; do not rerun unrelated expensive evidence.
- Do not create a test harness larger than the production change or install a new test stack without issue authorization.
- Never weaken an assertion simply to obtain green validation.
- If the repository profile lists a command as `UNKNOWN`, discover the correct tracked command from the repository before running it; do not invent one.

---

## 7. Stabilize, CI, and visual verification before final review

When implementation is complete:

1. Stop editing and create a stable commit/head SHA.
2. Create/update the draft PR so the exact base-to-head diff is visible.
3. Run or obtain ordinary credential-free CI for that SHA when the repository defines it.
4. For UI changes, perform preview visual verification tied to that SHA **before** the final code review when safely possible.
5. Record concise validation evidence for the reviewer.

Use public/non-mutating routes when possible. Authenticated or write-path acceptance must remain local/preview and within explicit authority.

Visual evidence is invalidated only when a later correction changes rendered UI, client state/routing, response data used by the UI, styles/assets, permissions affecting the view, or preview configuration. A non-visual correction does not automatically require another browser walkthrough.

---

## 8. Final independent exact-SHA code review

Every implementation issue receives a final independent review of the stable exact SHA.

- Use a **new read-only** project-scoped reviewer configured for the applicable risk lane in `docs/AI_REPO_PROFILE.md`. If it cannot be spawned, release readiness is blocked; do not substitute self-review.
- Give the reviewer the product packet, Implementation Note/amendments, base SHA, head SHA, validation/CI evidence, and visual evidence when applicable.
- The reviewer must inspect the actual base-to-head diff and materially affected code paths.
- The reviewer returns one consolidated `PASS`, `CHANGES_REQUIRED`, or `BLOCKED` decision.

### Finding classifications

| Classification | Release effect | Standard |
|---|---|---|
| `BLOCKER` | Blocks | Acceptance failure or credible catastrophic/irreversible security, privacy, authorization, financial, data-loss, or external-effect risk. |
| `SHOULD_FIX` | Blocks | Realistic material failure with a bounded in-scope correction. |
| `BACKLOG` | Does not block | Real but unlikely, recoverable, outside approved scope, or disproportionate to fix in this issue. |
| `IGNORE` | Does not block | Theoretical, unsupported, non-reproducible, stylistic-only, or immaterial. |

A blocking finding must identify:

- the changed or materially affected code path;
- a realistic triggering input/state/sequence;
- the incorrect result or credible risk;
- repository evidence; and
- a bounded required correction.

A pre-existing issue that the diff neither causes nor materially worsens is `BACKLOG`, not a release blocker for the current issue. Alternative architectures, speculative defensive coding, unrelated cleanup, and personal style preferences are not blocking findings.

Default concise finding format:

```md
[SHOULD_FIX] path/file.ext:123
Failure:
Trigger / evidence:
Impact:
Required correction:
```

For `BLOCKER`, disputed findings, or consequential high-risk findings, also state likelihood, recovery/irreversibility, and fix complexity.

`PASS` is permitted only when no `BLOCKER` or `SHOULD_FIX` remains.

---

## 9. Corrections and bounded re-review

If code review returns `CHANGES_REQUIRED`:

1. The primary agent accepts or explicitly contests each finding.
2. Resolve all accepted findings in **one correction batch whenever feasible**.
3. Create a new commit/head SHA.
4. Rerun validation affected by the correction and obtain required exact-SHA CI.
5. Re-review the corrected SHA.

Any code commit invalidates the prior **code-review PASS**.

It does not automatically invalidate every immutable evidence item. When the corrected head descends from the previously reviewed head, the re-review must verify that ancestry and the exact correction diff. It may reuse recorded evidence for byte-identical, unaffected scope while inspecting the correction, every materially affected path/invariant, and any evidence the correction invalidated. A fresh reviewer context does not mean restarting unrelated exploration from zero.

For correction review:

- `ROUTINE` and `STANDARD`: the same independent reviewer context may verify the previous findings, correction diff, and materially affected paths. A brand-new full reviewer context is not required merely because the SHA changed.
- `HIGH`: use a fresh high-risk reviewer for the corrected exact SHA.
- Re-review must not introduce unrelated style/refactor/pre-existing findings unless the correction exposed or materially worsened a real defect.
- Maximum two failed correction passes on the same finding or approved scope.

A contested finding is labeled `CONTEST` and supported by a focused test, reproducible command, or specific code path. If the dispute cannot be resolved within the correction limit, stop with one concrete blocker rather than spin.

---

## 10. Attempts and blockers

- Maximum three attempts at the same command, selector, mock, or implementation approach.
- Maximum two failed correction passes on the same finding or approved scope.
- Repeated command/selector changes without new evidence are not progress.
- Preserve a clean checkpoint before prolonged debugging.
- Stop the affected action when requirements are irreconcilable, a material product decision is missing, authority is insufficient, a merge conflict prevents safe continuation, an unsafe external-effect boundary is reached, or the correction limit is exhausted. Resolve routine conflicts within authorized scope when intent is clear; preserve unrelated work. Continue other authorized work only when it is independent of the blocker and within the review/cost limits. Do not equate permission to prepare with permission to execute.

Required blocker format:

```md
[AGENT BLOCKER]

Issue:
Branch / current SHA:
Completed work and evidence:
Exact blocker:
Attempts already made:
Files currently changed:
Last command and result:
Decision or authority needed:
Safety confirmation:
```

### Refusal and diagnosis

After a production precheck refuses, stop mutation and report the refusal promptly. State only what the evidence establishes: zero writes by this attempt does not establish that all production state is unchanged or healthy, and a broad drift label is not proof of corruption.

If an exact fallback read was reviewed and authorized, execute only within its trigger, scope, and attempt limit, then report its result. If no read was authorized, prepare and obtain the required bounded diagnostic review within the existing issue scope and review budget before asking for execution. Do not spend another turn asking permission merely to prepare it. If preparation is itself blocked by missing facts, authority, access, or the cost ceiling, report that concrete blocker.

The resulting checkpoint contains the precise mismatch when known, otherwise the exact reviewed read request. Do not retry or repair because the diagnostic suggests an explanation. Write/recovery procedures remain subject to independent review and separate exact-SHA, action-scoped authorization. The local three-attempt ceiling never grants production retries.

### Workflow cost checkpoint

The normal independent-review budget is one initial plan review plus at most one plan follow-up, and one initial final review plus at most one correction review. Before exceeding that budget, before adding new operational infrastructure or credential requirements, or when a production refusal cannot be resolved by an already-reviewed and authorized read, give the human owner one concise checkpoint. For a refusal, first complete the bounded authorized local preparation described above when it fits the existing review budget; exceeding that budget still requires a checkpoint before more review. A prompt progress report is not a separate permission gate. Use:

```md
[WORKFLOW CHECKPOINT]

Issue / current SHA:
Review and production-attempt count:
What is already proven:
New fact or failure:
Smallest safe options:
Risk, time, and token/cost tradeoff:
Recommended option:
Decision or authority needed:
Production state: unchanged | stable | partial/unsafe
```

This checkpoint never authorizes weakened validation, release with an unresolved blocker, or broader production action. If an already-authorized action created a partial or unsafe state and delay itself would worsen it, stabilization within the existing reviewed recovery plan may defer only the cost checkpoint. It never waives independent review, exact-SHA/action-scoped authorization, or explicit write authority. Existing attempt/correction ceilings still apply unless the owner explicitly authorizes a new recovery scope. Report the checkpoint immediately after the state is stable.

---

## 11. Proportionate production-migration controls

Migration controls derive from the migration's actual behavior, affected scale, deployment compatibility, concurrency, and external interactions. Incident-specific controls are historical evidence, not automatic templates for every later migration.

Every production migration retains:

- exact-SHA independent review;
- separate explicit production authorization;
- deterministic source/target validation;
- explicit preconditions and postconditions;
- no blind retry; and
- recoverable evidence.

An additive, backward-compatible migration with no existing-row mutation or external effects does not require a maintenance window by default. Existing-table indexes or rewrites require reviewed scale/availability evidence and a fail-closed bound. Add maintenance or cross-system coordination only for demonstrated destructive/incompatible DDL, large or unbounded rewrite/backfill, credible lock/unavailability behavior, incompatible code/schema sequencing, concurrent-write inconsistency, or non-atomic external effects. Add provider, traffic, scheduler, or notification controls only when the migration actually interacts with those systems.

Checking in or reviewing a migration never authorizes its production execution.

---

## 12. GitHub use

GitHub remains deliberately simple:

- the issue holds product intent, the Implementation Note, material decisions, review findings/resolutions, accepted backlog, and the canonical release-ready record;
- branches/commits establish recoverable checkpoints;
- draft PRs expose the stable base-to-head diff;
- ordinary credential-free CI validates normal PRs when configured;
- exact SHAs bind review and later production authorization; and
- the deployment-identity mechanism named in `docs/AI_REPO_PROFILE.md`, if any, verifies what actually reached production after an authorized release.

No issue label is required to advance the AI workflow unless repository-specific policy explicitly says otherwise.

---

## 13. Release-ready handoff

After exact-SHA independent `PASS`, the primary agent posts **one canonical release-ready record to the GitHub issue**:

```md
[RELEASE READY]

Issue / PR:
Risk lane:
Branch / base SHA / reviewed head SHA:
Independent review decision:
Validation / CI:
Visual verification: None | evidence
UI changes:
Code/backend changes:
Data/schema/migration changes:
Provider/configuration/secret/external effects:
Release mechanics / reviewed-SHA preservation:
Proposed authorized action set: None | migration / merge method / deploy / postchecks / cleanup
Optional refusal diagnostic: None | exact reviewed identity, trigger, target, read/output bounds, execution limit
Deferred risks / accepted BACKLOG / follow-up issues:
Immediate production impact:
Rollback:
Post-deployment smoke checks:
Production actions performed: None
Next action: human release authority may separately authorize the next production step for exact SHA <sha>.
```

The task response should not duplicate the whole packet. Report issue/PR, risk lane, reviewed head SHA, independent decision, production actions performed, and the canonical record link. When the release sequence is concrete and ready for authorization, include the concise exact-SHA action request in this same response. Do not make the human ask a second time to see the proposed release steps. If an action remains unresolved, state the exact blocker rather than requesting blanket authority. Then stop before any unapproved action.

When the complete release sequence is already known, request one concise exact-SHA authorization that enumerates the action-scoped set: migration or provider action, exact merge method, deployment target, bounded postchecks, and reviewed cleanup as applicable. The human may authorize all or only a subset. Do not serialize separate permission prompts merely because the actions occur sequentially.

Determine exact-SHA-preserving merge mechanics before release readiness. If the ordinary merge method would create a different commit, either review that resulting commit or include the reviewed exact-SHA-preserving method in the authorization request. Authorization binds both the exact reviewed SHA and the listed actions; a code/procedure change requires fresh exact-SHA review and authorization.

`Ready`, `authorized`, `merged`, `deployed`, and `verified` are distinct states. Independent `PASS` establishes release readiness only. Separate exact-SHA authorization permits the next production step. Deployment identity and bounded smoke evidence establish deployment and verification according to `docs/AI_REPO_PROFILE.md`.
