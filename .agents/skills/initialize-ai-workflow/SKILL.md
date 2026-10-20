---
name: initialize-ai-workflow
description: Initialize repository facts after installing this workflow, or reconcile an explicitly requested workflow upgrade without changing application behavior.
---

Read the applicable instruction chain, existing profile and maintained map before
changing workflow files. For package installation use its external `README.md` and
`install.py`; never overlay-extract into a repository. Reconcile staged conflicts
within the installation request; preserve unique facts, custom instructions and
configuration. Report a genuine ambiguity instead of silently discarding it.

An explicit owner request may bundle installation with a repository-specific standing
release grant once. Record that supplied grant by canonical durable reference in the
profile as described by `docs/AI_WORKFLOW_RELEASE.md`; verify actual target facts, never
invent broad or cross-repository authority, and store no secret values. Reconcile an old
workflow-only per-release-owner rule within that explicit scope. Installation without
explicit delegation creates no authority and leaves existing release authority untouched.

## Installation lifecycle and Git delivery

1. Keep the extracted package and recovery stage outside **every Git worktree**, including
   other repositories and linked worktrees. Install only payload files, the receipt and
   minimally reconciled project config; never install the source ZIP, installer, tests,
   reports, stage snapshots or versioned package directories. Stable active paths upgrade
   in place. Inspect current branch, index and unrelated changes before writes. Reuse an
   appropriate workflow feature branch or an isolated worktree; preserve unrelated work.
2. Reconcile owned non-Astra model/effort fields to `gpt-6.1-sol` / `medium` while preserving
   custom role instructions. Set the project default from the worker policy; preserve
   unrelated settings, profiles, sandbox, approvals, MCP/tools and release authority.
   Inspect named profiles/session overrides for contradictory effective coding policy and
   reconcile relevant owned overrides deliberately. Do not claim the current chat switched;
   use the client selector when its override still controls the session.
3. Inspect obsolete workflow docs, agents, archives, versioned directories and backups for
   ownership, provenance and active references. Migrate unique useful facts/instructions,
   then remove proven redundant tracked copies in this reviewed workflow commit; Git
   history is the normal history. Keep referenced immutable migration, successor, audit
   and authority evidence, maintained facts/maps, and unresolved recovery material with a
   concrete retention reason. Verify ownership and exact redundancy before deleting an
   untracked copy. Never glob-delete unknown folders or widen installer deletion rules.
4. Reconcile repository-native integrity/successor bindings through the supported successor
   mechanism; preserve historical bindings. Include only necessary binding/test changes.
   Never disable checks or rehash historical identity merely to match. If the mechanism is
   unknown, report integration pending. Run applicable focused checks and obtain required
   independent review under the active repository workflow before claiming readiness.
5. Inspect the selected diff and staged config for secrets or recovery copies. Explicitly
   stage only installed workflow paths, receipt/profile/project config, approved retirements
   and necessary repository-native bindings/tests. Never `git add .` or blanket-reset.
   Commit the workflow-only change, run `install.py check-repo --repo ROOT` from the external
   package and require PASS before claiming it committed. Push the workflow feature branch
   and create a draft PR when remote/native GitHub capabilities are available; attach the
   created PR in Codex. The installing agent finishes this delivery; raw `apply` only writes
   files. Missing remote, Git identity, permission or checks means preserve safe files and
   report **applied locally; Git integration pending**, naming the exact missing step.
6. Leave the installation PR for the user to merge, including when a standing Patch grant
   exists. Do not auto-merge or deploy for installation. After an actual authorized merge,
   verify the default branch contains the workflow commit and new worktrees load its active
   files; a feature commit alone proves neither. Retain one useful outside-repository
   recovery stage until verification/merge and recoverable old state is in Git. Then clean
   the stage and extracted ZIP rather than archive every release forever. Retain unique
   history outside active workflow only with a concrete reason.

Inspect tracked source/configuration read-only to fill needed repository facts in
`docs/AI_REPO_PROFILE.md`. UNKNOWN is preferable to invented production facts.
Preserve an existing map; update only materially changed facts. Confirm actual model
and native delegation availability using `docs/AI_WORKFLOW_MODELS.md`, including
configuration/session overrides. Do not retrieve secrets, alter application/runtime
or CI files, change global/account settings, access production, or deploy.
