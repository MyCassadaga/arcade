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

Keep installed workflow files and the receipt version controlled under normal repository
policy; do not hide unrelated changes with ignore rules. Ensure the intended active
workflow is actually present in the worktree rather than copying unknown dirty files.
The installer does not commit or merge. This package does not own repository-specific
integrity or successor bindings: reconcile them through the repository's supported
successor mechanism and preserve historical bindings. Never disable checks or rehash
historical identity merely to match. If the mechanism is unknown, report integration
pending and do not claim the installation usable until applicable focused checks pass.

Inspect tracked source/configuration read-only to fill needed repository facts in
`docs/AI_REPO_PROFILE.md`. UNKNOWN is preferable to invented production facts.
Preserve an existing map; update only materially changed facts. Confirm actual model
and native delegation availability using `docs/AI_WORKFLOW_MODELS.md`, including
configuration/session overrides. Do not retrieve secrets, alter application/runtime
or CI files, change global/account settings, access production, or deploy.
