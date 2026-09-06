---
name: work-issue
description: Execute an approved GitHub implementation issue through a reviewed draft PR and release-ready state. Use when the user says "Work issue X" or gives equivalent explicit implementation approval for a named issue. Do not use for read-only questions, packet creation, production execution, merge, or deployment.
---

# Work Issue

Use `docs/AI_ISSUE_WORKFLOW.md` as the **sole procedural authority** for this task.

1. Read `docs/AI_REPO_PROFILE.md`. If it is `UNINITIALIZED`, stop implementation and use `initialize-ai-workflow` first.
2. Resolve the named GitHub issue and read its latest comments.
3. Read the repository-root `AGENTS.md` invariants.
4. Confirm the project-scoped reviewers named by the profile are available when the issue's risk lane requires them.
5. Follow `docs/AI_ISSUE_WORKFLOW.md` from orientation through release-ready handoff.
6. If the repository profile enables a system-interaction map, use its impact index to load only relevant architecture sections, then verify material claims against current source.
7. Keep the GitHub issue as the canonical product/decision/release record.
8. Stop before any production/external write, production migration, protected-branch merge, or deployment unless explicitly authorized for the exact reviewed SHA as required by the workflow. If the repository profile says a merge/push automatically deploys, treat that merge and its deployment consequence as one coupled production-affecting action set rather than requesting an impossible merge-without-deploy checkpoint.

Do not invent a parallel workflow, restore retired mandatory review loops from historical documents, or substitute primary-agent self-review when an independent reviewer is required.
