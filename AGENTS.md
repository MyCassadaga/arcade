<!-- portable-codex-workflow:begin -->
## Portable Codex workflow v3.3

For issue packets use `create-issue-packet`; for “Work issue X” use `work-issue`,
including work delegated by the configured coordinator under verified issue authority.
For Patch coordination, read `docs/AI_WORKFLOW_COORDINATOR.md`; it routes authorized
work and does not replace the canonical issue, model or release procedures.
Read `docs/AI_ISSUE_WORKFLOW.md` only for issue work; read its linked release guide
only when planning or executing release. Repository facts live in
`docs/AI_REPO_PROFILE.md`; verify relevant facts against source. Existing local
instructions still apply. Report a material conflict instead of silently choosing
weaker controls. Archived workflow files are historical, not active procedure.

Preserve the original request and the compact issue contract. Installed workflow
files and their receipt normally remain version controlled. Work authorization
covers in-scope edits, safe local/preview validation, ordinary corrections, a
feature branch and draft PR. It does not itself authorize product expansion or
release actions. `AI_WORKFLOW_RELEASE.md` defines direct owner authorization and
standing owner-to-Patch delegation for reviewed merge, deployment, production,
provider, configuration, migration and recovery actions. Respect platform permissions
and separately authorized action boundaries.

Use one implementation owner. Explicitly delegate substantive design to the
configured Astra designer and final review to a separate read-only reviewer,
as routed by `docs/AI_WORKFLOW_MODELS.md`. Never claim a model switch or independent
review merely from a role label. Reviewer summaries do not replace actual diff
inspection. HIGH risk increases verification depth, not product scope.

After handoff/compaction, reconfirm this instruction chain and resume the canonical
issue's continuation record. Reuse valid evidence and settled decisions. When the
contract, required checks and current-candidate independent review are complete, follow
the release guide: route through Patch automatically under a valid standing grant, or
await direct owner authority when no grant applies. Release-ready requires known
applicable prerequisites; otherwise report implementation reviewed and release blocked.
<!-- portable-codex-workflow:end -->

<!-- BEGIN DEVELOPMENT-SPEC:MANAGED -->
## Ghost Circuit development specification

Paths below are relative to the repository root, not the current subdirectory.
Before planning, implementing, or reviewing Ghost Circuit changes, read:

1. `docs/spec/ghost-circuit/PRODUCT.md` — goal, scope, requirements, and the authoritative
   package version and approval/change record.
2. `docs/spec/ghost-circuit/DESIGN.md` — interaction rules, visual direction, components,
   asset production, and the referenced concept files under `docs/spec/ghost-circuit/visuals/`.
3. `docs/spec/ghost-circuit/TECHNICAL_PLAN.md` — stack, tool access, architecture, milestones,
   validation, delivery, and handoff status.

Read the actual files; do not rely on earlier chat summaries. For implementation,
identify the approved baseline, applicable requirement IDs, milestone, and
acceptance checks before coding. If files, approval, or needed capabilities are
missing or conflicting, report the specific blocker; do not invent a substitute.
Draft requirements can be discussed but are not an approved implementation scope.

Keep approved choices fixed. Do not expand scope, substitute the stack or asset
pipeline, or redesign for preference. Raise a specific correctness, security,
reliability, or explicit requirement issue before a change; record authorized
changes in PRODUCT.md. Keep optional improvements deferred.

This block supplements existing repository instructions; it does not override
their authority, ownership, security, review, implementation, or release rules.
Spec approval is not permission to purchase, deploy, or start implementation.
Surface conflicts for resolution rather than silently choosing one policy.

Verify behavior, visuals, and interaction using the specified evidence; label
untested work honestly. Do not treat a concept image or a successful build as
proof that the product is complete. Report the requirement IDs and actual tests
or reviews behind each completion claim.
<!-- END DEVELOPMENT-SPEC:MANAGED -->
