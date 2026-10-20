# Portable issue workflow v3.3

This is the procedural authority for issue work. The issue is the canonical intent,
decision and evidence record; the PR links to it. Do not copy the full record into
chat, a second spec or a recurring prompt. Repository facts belong in the profile
and existing architecture documents. Role dispatch is in `AI_WORKFLOW_MODELS.md`;
release mechanics are in `AI_WORKFLOW_RELEASE.md`. Load only the relevant sections.

## 1. Packet — intent before implementation

Use `templates/AI_ISSUE_TEMPLATE.md` through **Scope contract** only. Preserve the
original request as an accurate excerpt with a durable source reference, or quote
it directly when no durable link exists. Preserve qualifications and settled
choices; redact secrets without changing meaning. Identify the user's explicit
requirements separately from necessary technical implications, harmless assumptions
and optional suggestions. Optional ideas are not acceptance criteria.

Write a compact outcome, testable numbered ACs, non-goals, existing behavior to
preserve and known safety boundaries. Do not invent a page, role, provider, data
model or technical requirement to fill the packet. Packet creation needs only
light context, not repository-wide discovery. Ask only if missing information
materially changes the requested outcome. Creating a packet does not authorize
implementation; creating a GitHub issue is authorized when the user requests it.
If the tracker is unavailable, deliver the draft and say it was not posted.

## 2. Work authorization and bounded design

“Work issue X” authorizes the feature-branch/draft-PR path through release readiness,
including updating the issue/PR, in-scope corrections and non-destructive tests in
safe local/preview resources. Preserve unrelated work. Confirm ordinary PR/preview
CI does not itself deploy to production or perform unauthorized provider writes
before pushing. Use approved repository mechanisms; do not change CI to evade a gate.

Read the original request, issue plus material comments, applicable instruction
chain, working state and relevant profile/map entries. Establish one implementation
owner and confirm role availability using `AI_WORKFLOW_MODELS.md`. An uninitialized
profile is a navigation gap: discover the facts needed for this issue read-only and
record them, rather than force a whole-repository mapping exercise. Unknown release
facts block release, not independent safe work. Missing facts that affect safe
implementation block that part of work.

Compare original intent, packet and proposed behavior before editing. Correct
clerical packet errors with a short explanation. If a material mismatch exists,
do not implement the conflicting part; present the mismatch and recommended
resolution together. Faithful capture plus Work authorization needs no new approval.

Use the profile/map as an index; inspect current source, relevant callers/consumers,
permissions, storage, jobs and provider effects far enough to find plausible
regressions. Expand only on evidence of coupling. Reuse source-grounded facts until
relevant changes invalidate them. Update only affected architecture/map sections.

Record one **Execution record** below the contract. It adds a repository-grounded
approach, affected paths/invariants, risk, selected roles and AC/failure-mode evidence
plan; it does not repeat or redefine the product specification. For nontrivial or
HIGH work, request one bounded Astra design pass. Give Astra the contract, verified
source, relevant invariants and risks, and only the material questions. Astra returns
the selected approach, architecture fit, necessary storage/API/UI changes, affected
paths, invariants and failure modes, validation needs and unresolved material questions.
Astra does not own tests, Git/status loops or release bookkeeping. A trivial change
following a verified, already-approved pattern only needs the worker's concise
path/test note. Do not add a routine second plan reviewer to an Astra-designed solution.

Default to reuse of existing pages, routes, components, services, data models and
permissions. Do not create a page for a process change when an existing page can
reasonably support it. Avoid speculative abstractions, dependencies, roles, tables,
infrastructure, renamed concepts and unrelated cleanup. Smallest coherent means
fixing the actual problem across affected paths, not a brittle line-count shortcut.

Astra may select a bounded internal redesign within the approved outcome: record
why reuse/smaller change fails, the alternative, compatibility and verification.
Before coding a new page, major UI, table, service, provider, role, dependency,
background process or configuration system, perform a scope-shape check: is it needed
for the authorized outcome or safety, why is existing architecture insufficient, and
what is the smallest coherent addition? Necessary bounded technology can proceed
under technical design authority; optional technology does not ship.
Expanded product behavior, a new external service or operating cost, a consequential
new data/permission boundary or changed non-goal requires owner authority before
implementation. A covered release operation, including an enumerated migration or
necessary destructive step, follows the separate authority in `AI_WORKFLOW_RELEASE.md`;
technical necessity or Work authority alone grants no production authority.

Freeze the behavior and chosen approach in the execution record, noting the Work
authorization and design decision. Workers can make ordinary implementation choices
inside it. A material amendment records changed boundary, evidence/reason, authority
(user message or Astra's in-scope engineering decision), affected AC/design/evidence,
and continuation point. Only meaningful amendments need recording. Review preferences
and agent ideas do not become approved requirements.

## 3. Risk and implementation

| Lane | Trigger | Design / final review | Evidence depth |
|---|---|---|---|
| ROUTINE | Copy, docs, bounded styling, pure isolated logic without sensitive effects | Existing pattern can skip Astra; independent Sol review | Relevant checks; UI preview when behavior/layout changes |
| STANDARD | Ordinary UI/API/state using established patterns | Astra unless genuinely trivial pattern; independent Sol review | Focused tests, affected integration and configured CI |
| HIGH | Auth/permissions/privacy/security, money, existing-data/schema mutation, provider effects, concurrency/idempotency, mutating jobs, destructive or sensitive shared foundations | Astra design and fresh independent Astra final reviewer | Failure/negative paths, compatibility/recovery, affected suites and required CI |

Apply repository-specific additional risks. Small diffs can be HIGH; do not downgrade
to save cost. Trace only applicable risks. For auth, test unauthorized actors and
cross-boundary access; for money, relevant precision, replay and persistent invariants;
for migrations, historical state, deterministic pre/postconditions and failure bounds.
Do not expand product scope because the risk is higher.

Implement the frozen approach with one owner. Sol owns ordinary implementation detail
after design freeze. If a material design assumption actually fails, pause affected
work and send Astra one focused escalation: evidence, violated assumption, smallest
alternatives and recommended resolution. Do not request a fresh whole design or restart
whole-repository discovery. Record unrelated improvements in one brief deferred note;
do not automatically create issues. Return consolidated findings through the primary,
not through the user as a relay.

## 4. Validation and evidence reuse

Map each AC and important failure mode to evidence. Use the repository's existing
commands and test infrastructure, confirmed from tracked configuration. During edits,
run focused tests and affected integration. On the first stable candidate, run useful
local rapid feedback such as an affected build, type or schema check, then push and use
required CI as the normal broad-suite authority. Do not weaken meaningful assertions,
suppress failures, bypass required checks, or add a new test stack merely for the issue.

For each correction, make a compact validation-impact determination across only the
categories that could be affected: docs/workflow, UI/rendering, client state,
API/business logic, auth/access, persistence/schema, provider construction,
concurrency/retry, and build/config/dependencies. Run the defect regression and affected
integration. Repeat local build/type/schema checks only when realistically affected or
when CI leaves a gap. A full local duplicate needs a concrete recorded reason, such as
unavailable/incomplete CI, an instrumental concurrency reproduction, or a one-time
diagnostic baseline. For example, a backend retry correction can reuse UI observations
when rendering, client state, consumed API shape and access are unchanged; docs changes
do not invalidate provider mocks; retry logic does not invalidate schema/migration
evidence when its code, dependencies, state and behavior are unchanged.

For affected real UI behavior, exercise the preview/local interaction, including
relevant loading/error/permission states and mobile/desktop where affected. Screenshots
alone do not prove saving, routing or persistence. Provider-safe mocks/fixtures are
the default. Real production/provider acceptance needs release authority under
`AI_WORKFLOW_RELEASE.md`.

Each evidence item identifies:

- AC/invariant; source SHA or file/tree hashes and affected dependency footprint;
- relevant lockfile, generated output, build/config and runtime dependencies;
- environment/preview build and relevant data/provider state with timestamp;
- exact command or procedure, result and concise log/artifact reference;
- invalidation conditions and, if reused, why they do not apply to the new candidate.

A SHA alone does not freeze mutable external data/configuration. Recheck mutable
preconditions at action time. Invalidate evidence when its code, dependencies,
configuration, environment or relevant state changes. UI evidence is affected by
rendering, styles/assets, routing, client state, consumed response data and access
rules; an unrelated docs correction need not repeat a walkthrough. Unknown impact
requires targeted verification, not an unsupported reuse claim.

A new candidate commit always needs applicable new independent review and current-SHA
required CI. It does not erase every unaffected impact-based observation. Never relabel an old test run as
executed at the new SHA. Record its original identity and the reason it still applies.
Use a one-sentence reuse rationale for each unchanged observation.
Base changes require inspection of the new combined diff and affected evidence.

## 5. Independent review and corrections

Stabilize a commit, expose the base-to-head diff in the draft PR, obtain checks and
applicable UI evidence, then start a separate read-only reviewer context for the lane.
Supply contract/original reference, frozen design/amendments, base/head identities,
source locations and evidence index. The reviewer independently reads the actual full
relevant base-to-head diff and affected paths; implementer summaries are leads, not proof. The reviewer
must not edit or perform external writes. No self-review substitute.

Return one consolidated `PASS`, `CHANGES_REQUIRED` or `BLOCKED` with exact reviewed
base/head and inspection scope. The first review consolidates all reasonably visible
material defects; do not deliberately drip-feed findings across rounds. Findings must cite a path, realistic trigger,
incorrect result/impact and evidence with a bounded correction:

- BLOCKER: acceptance failure or credible severe/irreversible safety failure.
- SHOULD_FIX: material realistic in-scope defect caused or worsened by this change.
- DEFER: unrelated/pre-existing debt or optional improvement; does not block.
- IGNORE: unsupported speculation or style preference; does not block.

An actual acceptance failure blocks even if inherited from earlier code. Low
probability does not excuse credible catastrophic consequences. Preferences are not
scope amendments. If no blocking defect remains, return PASS without invented polish.

The worker accepts or contests findings with evidence and batches accepted corrections.
Re-run affected evidence, create the new candidate, obtain required CI and re-review.
Normally retain the same independent reviewer for the correction diff, original
findings, directly affected callers/invariants and newly exposed defects. Start fresh
only for compromised independence, unreliable context, material redesign or a
significant base change. Do not perform routine rediscovery, reopen settled design,
search unrelated debt, or rotate reviewers merely because the SHA changed.

## 6. Convergence, continuation and stopping

Work authority covers as many bounded in-scope corrections as reasonably needed while
distinct defects are steadily eliminated. Track each defect plus attempted approach,
evidence and outcome; do not use a total review-round count as a kill switch. By default,
try the same failed approach at most three times, and never repeat it without new
evidence. Materially new evidence may justify one recorded bounded extension; handoffs
never reset attempt history automatically.

Escalate or stop when the same invariant repeatedly fails, the design is unstable, a
material dispute remains, a required capability is unavailable, or scope/safety
authority is reached. One focused Astra escalation may resolve an actual in-scope
assumption failure. Do not stop merely because the SHA changed, CI must rerun, an
ordinary implementation choice is needed, or a contract-preserving test needs an
intentional update; never weaken meaningful assertions. Report a blocker with current
state/identity, proven facts, exact failure, attempts, smallest options and recommendation.

Create a continuation entry only for a genuine interruption, handoff or blocker. Include
repository plus issue/PR, branch/worktree/base/head, contract/design version, owner/
designer/reviewer IDs, valid and invalid evidence, remaining work, defect/approach
attempt evidence, exact permitted next action and authority boundary. The successor
re-verifies actual state and resumes the established lane without automatic rediscovery.
Keep one contract, one execution-design record, meaningful amendments only, compact
evidence/review, and one final release record. Do not require extra comments or a new
spec for every impact decision, poll, test or correction; update the concise existing section.

Positive stop: contract satisfied, required checks pass, independent review approves
the current candidate, and applicable release prerequisites are documented. Publish
one release record and stop polishing. Under a valid standing grant, route through
Patch authorization, release and bounded postchecks without a mandatory owner pause;
otherwise await direct owner authorization. Missing release prerequisites yield
“implementation reviewed; release blocked,” not “release ready.” Report only links,
candidate identity, review result, release authority/grant reference, blockers if any,
and production actions performed.

Append a small run-cost line to the canonical record: role invocations and observed
model/effort evidence, review/correction counts, repeated expensive commands + reason,
human interruptions + reason, tokens/cost only when actually exposed. Use existing run
metadata; absence means unmeasured, not zero. Never infer task cost from account-wide
quota percentages or promise savings from model names alone.
