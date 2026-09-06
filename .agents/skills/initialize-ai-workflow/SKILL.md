---
name: initialize-ai-workflow
description: Package, initialize, or upgrade the portable AI issue workflow while preserving repo-specific facts, configuring the profile, retiring conflicting legacy workflow artifacts, and preserving any maintained architecture map. Use when exporting the workflow, after staging it for a new repo, or when the profile is UNINITIALIZED. Do not change application behavior or access production/external systems.
---

# Initialize / Upgrade AI Workflow

Initialize this repository's portable workflow using **read-only repository discovery plus edits only to workflow/profile/agent/map documentation and configuration**.

## Boundaries

- Do not change application/product source code, runtime configuration, infrastructure, secrets, CI behavior, deployments, providers, or production resources.
- Do not execute production commands, provider calls, migrations, deployment commands, or commands whose environment target is ambiguous.
- Do not retrieve secret values. Record configuration/binding names only when useful.
- Prefer tracked repository files, package/build configuration, CI definitions, existing docs, and current source as evidence.
- If a fact is not supported, write `UNKNOWN — VERIFY`; do not guess.

## Package and stage the portable bundle

`docs/templates/AI_PORTABLE_WORKFLOW_MANIFEST.json` is the exact archive-content contract. `docs/AI_PORTABLE_WORKFLOW_BUNDLE.md` defines its installation semantics.

When the user asks for a zip/export:

1. Read every manifest entry and reject missing sources, duplicate/unsafe targets, symlinks, absolute paths, or `..` traversal.
2. Create a staging directory outside the source and target repositories.
3. Copy each `portable-core` source to its target and stage the generic profile template at `docs/AI_REPO_PROFILE.md` for the `create-only` entry.
4. Confirm the staged tree contains no initialized repository profile, maintained app map, legacy archive, application/runtime file, secret, `.git` directory, dependency tree, or unlisted file.
5. Create and inspect the archive from that staging directory. Do not track the binary archive unless the user explicitly asks.

Never extract the archive directly over a nonempty repository. Extract to a separate staging directory, inspect it, then install from the manifest.

For a fresh target, copy all `portable-core` entries and create the active profile only when it is absent. For an upgrade:

- first snapshot and read the target's existing `AGENTS.md`, workflow/profile files, reviewer configuration, maintained map, and relevant tracked `HEAD` versions;
- preserve an existing `docs/AI_REPO_PROFILE.md` and maintained architecture map byte-for-byte during the portable-core overlay;
- install only `portable-core` entries, and skip every `create-only` target that already exists; and
- stop if the prior profile/map cannot be recovered after an accidental overlay or if a same-path conflict contains inseparable repository facts.

Do not normalize or rewrite an initialized profile merely because the portable template changed. Change repository-specific profile facts only when current repository evidence requires it, and report the exact change.

## Upgrade / legacy migration

Before finalizing the new profile, inspect existing AI workflow artifacts so repository-specific knowledge is not lost. If a portable overlay is already visible in a dirty tracked worktree, inspect the pre-overlay versions from tracked `HEAD` before any additional write.

Known legacy paths may include:

- `docs/AI_PARTNER_STANDARD_INSTALLATION.md`
- `docs/AI_PROJECT_PROFILE.md`
- `docs/AI_ISSUE_PACKET_TEMPLATE.md`
- `docs/AI_RELEASE_READY_TEMPLATE.md`
- older content at `AGENTS.md` or `docs/AI_ISSUE_WORKFLOW.md`
- older `.codex/config.toml` and `.codex/agents/terra-reviewer*.toml`

Rules:

1. Preserve unique **repository-specific facts** from prior workflow/profile documents by moving the still-relevant facts into `docs/AI_REPO_PROFILE.md` or by referencing the existing canonical app documentation.
2. The newly installed `AGENTS.md`, `docs/AI_ISSUE_WORKFLOW.md`, `.codex/config.toml`, and `.codex/agents/terra-reviewer*.toml` are the active portable core and may replace older versions at those exact paths.
3. Do **not** overwrite or discard an existing maintained architecture/system-interaction map. Point the profile to it and add an impact index only when useful and safe.
4. Once unique facts are preserved, move obsolete legacy workflow-only documents at the legacy paths above into `docs/ai-playbook/legacy-ai-workflow/` rather than deleting them. Preserve filenames with a `.legacy.md` suffix when needed to avoid collisions.
5. Archived legacy workflow documents are historical evidence only and must not remain active procedural inputs.
6. Do not archive ordinary product, architecture, runbook, ADR, security, or operational documentation merely because it mentions AI or development.

If a legacy file contains mixed workflow and important application documentation that cannot be safely separated, leave it in place, mark the conflict in the profile, and report it instead of guessing.

## Verify reviewer configuration

Confirm these project-scoped custom agents exist and parse as TOML:

- `.codex/agents/terra-reviewer.toml` with `name = "terra_reviewer"`, model `gpt-5.6-terra`, medium reasoning, read-only sandbox.
- `.codex/agents/terra-reviewer-high.toml` with `name = "terra_reviewer_high"`, model `gpt-5.6-terra`, high reasoning, read-only sandbox.

Confirm `.codex/config.toml` enables agents but does **not** pin the primary model. Do not rewrite the reviewer model policy from repository discovery; it is portable-core behavior.

## Initialize `docs/AI_REPO_PROFILE.md`

Determine and record, when repository evidence supports it:

1. repository name and protected/default branch;
2. package/build system and tracked install/test/type/lint/build/preview commands;
3. ordinary PR CI source/workflow;
4. local, preview/staging, and production environment conventions;
5. deployment mechanism and any deterministic deployment-identity evidence;
6. persistent data stores;
7. external providers/systems and external-write surfaces;
8. repository-specific HIGH-risk domains;
9. operations that must remain separately production-authorized; and
10. the canonical current architecture/interaction map, if one exists.

Retain the portable model/reviewer section intact. Set `Status: INITIALIZED` only after this pass is complete. An already initialized profile does not need wholesale regeneration during a portable-core upgrade.

## Interaction map decision

Assess repository coupling, not repository size alone.

- If a maintained architecture/interaction map already exists, preserve it and set `Map enabled: YES` with its actual path. Prefer the existing map even if its filename differs from the portable template.
- Otherwise set `Map enabled: YES` when changes can cross several routes/components/services/jobs/data stores/providers or when shared state makes local reasoning unreliable. Create a compact current-state map from `docs/templates/AI_SYSTEM_INTERACTION_MAP_TEMPLATE.md` at an appropriate repo path.
- Set `Map enabled: NO` for a genuinely small/isolated repository where direct source inspection is simpler and safer. Explain the reason in the profile.

Never replace a real map with the portable template.

## Final check

Before finishing:

- verify `AGENTS.md`, `docs/AI_ISSUE_WORKFLOW.md`, `.codex/agents/*`, and the three workflow skills remain generic and do not contain app-specific provider/product assumptions;
- verify every portable-bundle manifest source exists, targets are unique/safe, the active initialized profile is not a portable-core source, and the generic template maps to the active profile as `create-only`;
- verify the profile contains repository-specific facts rather than duplicated procedure;
- verify legacy procedural files have either been safely retired or explicitly reported as unresolved;
- verify any existing maintained interaction map was preserved;
- verify no application/runtime file changed;
- report which profile fields remain `UNKNOWN — VERIFY`;
- stop without merge or deployment.
