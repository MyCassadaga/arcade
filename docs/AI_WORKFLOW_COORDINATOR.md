# Coordinator routing

This file governs coordination only. Issue execution remains in
`AI_ISSUE_WORKFLOW.md`, role/model dispatch in `AI_WORKFLOW_MODELS.md`, and release in
`AI_WORKFLOW_RELEASE.md`. Use the platform's existing native dispatch and notification
tools; this workflow creates no scheduler, database, label-driven model execution or
new orchestration service.

## Authority and repository access

Coordination is opt-in per repository; no repository is preauthorized. Work authority
is per issue and must come from the owner's Work instruction or explicit owner-approved
queue semantics/durable equivalent. An open issue, priority or label alone is not
authority. Verify the trusted grant and any current revocation before dispatch. Platform
tool approval does not create workflow authority, and workflow authority does not bypass
platform limits. Repository permission allows read-only coordination by default; durable
writes, packet creation and dispatch require their applicable authority. Work authority
may cover canonical issue/PR updates, but repository inspection permission never implies
live/production/secrets access.

Release authority is separate and lives only in `AI_WORKFLOW_RELEASE.md`. A trusted
standing owner grant may designate Patch to approve and execute a bounded reviewed release
or dispatch its exact authorized actions to the sole worker. A queue state, PASS or
release-ready record alone does not grant that authority. Verify the canonical grant,
designated Patch identity/source and current revocation rather than trusting a role claim.

Optional existing metadata may describe `PROPOSED`, `READY_FOR_AUTHORIZATION`,
`AUTHORIZED`, `IN_PROGRESS`, `REVIEW`, `BLOCKED`, `RELEASE_READY` and `DONE`.
`PROPOSED` and `READY_FOR_AUTHORIZATION` permit no implementation. `AUTHORIZED` must
mean equivalent Work authority; `IN_PROGRESS` has one owner; `RELEASE_READY` means the
candidate can enter the release guide's authority routing but grants no production action;
`REVIEW` means a candidate is in independent inspection; `BLOCKED` means a real unresolved
gate; `DONE` means completed release postchecks or a defined non-release completion.
Metadata alone never authorizes work or release or executes models; trusted entry into
explicitly owner-authorized queue semantics may carry only its defined Work authority.

## Ownership and dispatch

Before dispatch, inspect actual current repository state and the issue/PR, existing
worker, branch/worktree, continuation, frozen design and reviewer identities. Resume an
established lane; an idle worker does not abandon ownership. Resolve ambiguous or
conflicting owners before work and never create a parallel implementation lane. A
coordinator is not an implementer, designer or reviewer, and never uses Astra merely
for coordination. Patch normally coordinates; it may assume the single-worker role
only after an explicit reassignment made under the issue policy, with no overlapping lane.

Repository facts never carry across repositories. When offline or after interruption,
actual current state controls over cached queue state. Do not require a new design,
review or test solely because of handoff. Send a short handoff that references the
canonical contract, frozen design, identities, valid evidence, remaining work,
permitted next action and authority boundary.

## Queue and notification

Use existing queue metadata only when useful. Surface real authorization decisions,
blockers and readiness; avoid routine progress notifications. At positive stop, follow
the canonical release guide: route through Patch approval, release and bounded postchecks
when a valid standing grant applies; otherwise notify the owner that exact release
authorization is needed. Notify the owner on completion, failure or required action.
Do not duplicate the release guide's eligibility, invalidation or execution rules here.
