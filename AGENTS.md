# Repository Agent Instructions

This repository uses the portable AI-assisted development workflow.

Repository-specific facts live in `docs/AI_REPO_PROFILE.md`. The procedural workflow lives in `docs/AI_ISSUE_WORKFLOW.md`. Project reviewer definitions live in `.codex/agents/`. Do not duplicate those details here.

## Workflow routing

- When the user asks to create, draft, or revise an implementation "packet" or GitHub issue from an idea, use the repo skill `create-issue-packet`. Packet creation captures product intent and does not authorize implementation.
- When the user says `Work issue X`, or gives equivalent explicit implementation approval for a named GitHub issue, use the repo skill `work-issue`.
- When the user asks to package, zip, export, install, or upgrade this portable workflow, use the repo skill `initialize-ai-workflow`.
- When this workflow has just been copied/upgraded into a repository, or the profile says `UNINITIALIZED`, use the repo skill `initialize-ai-workflow` before implementation work.
- `docs/AI_ISSUE_WORKFLOW.md` is the sole procedural authority for issue execution, risk classification, planning, validation, independent review, correction, migration controls, release readiness, and production gates.
- Legacy/archived AI workflow documents are historical only. Do not load or follow them unless this `AGENTS.md`, the active profile, or the active workflow explicitly references them.

## Authorization invariants

A request to answer, explain, diagnose, review, or plan authorizes read-only inspection and reporting only.

`Work issue X`, or equivalent explicit implementation approval for a named issue, authorizes work through **release-ready** status only: repository edits within the approved intent, non-destructive local/preview validation, issue comments, a feature branch/worktree, commits, and a draft pull request.

It does **not** authorize material product-scope expansion, production data access or mutation, production/provider writes, live configuration or secret changes, production migrations, destructive external actions, pushing directly to the protected/default branch, merging, or deployment.

Within an authorized issue, necessary local diagnostic preparation/review, compatibility edits, staging, and commits do not require repeated human approval. Follow the procedural workflow for their scope and evidence. This does not override an explicit exclusion or actual tool/access restriction, and does not authorize production execution.

Any production-affecting release authorization must be separate from ordinary issue implementation authority and must name the exact independently reviewed head SHA when the workflow requires exact-SHA authorization. The repository profile determines whether merge and deployment are separate actions or one mechanically coupled action set.

## Evidence and safety invariants

- The primary agent implements. Required independent reviewers are the project-scoped agents defined in `.codex/agents/`; reviewers remain read-only and never edit, commit, push, merge, deploy, or perform external writes.
- The portable workflow does not pin the primary model. The model selected for the main Codex session remains the primary implementer.
- Work only on the named issue and preserve unrelated work.
- Use local/preview resources by default. Treat every external system, production resource, and high-risk domain listed in `docs/AI_REPO_PROFILE.md` as separately gated.
- Do not weaken, delete, skip, or rewrite assertions merely to make validation pass.
- Model summaries are claims. Current repository state, exact diffs, deterministic commands, CI, preview evidence, and deployment identity are controlling evidence.
- If `docs/AI_REPO_PROFILE.md` identifies a system-interaction map, use its impact index to load only relevant sections, verify affected behavior against current source, and update the map in the same PR when its documented interaction footprint changes.
