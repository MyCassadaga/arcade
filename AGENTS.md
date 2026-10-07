<!-- portable-codex-workflow:begin -->
## Portable Codex workflow v3.2

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
