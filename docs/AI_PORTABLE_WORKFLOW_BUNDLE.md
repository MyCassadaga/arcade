# Portable AI Workflow Bundle

Revision: **2026-09-06 — bounded autonomy**. Manifest format and target paths remain unchanged.

This repository keeps one reusable workflow core and one repository-specific profile. The portable core can be packaged once, staged beside another repository, and installed there without carrying source-repository facts into the target.

## Controlling manifest

`docs/templates/AI_PORTABLE_WORKFLOW_MANIFEST.json` is the exact source-to-target archive contract.

- `portable-core` entries are generic workflow files that may replace earlier portable-core versions after existing repository facts are inspected.
- `create-only` entries are installed only when the target does not already exist. The generic profile template maps to `docs/AI_REPO_PROFILE.md` this way.
- The active initialized `docs/AI_REPO_PROFILE.md`, maintained application maps, legacy archives, runtime files, secrets, dependencies, and repository metadata are never portable-core inputs.

Do not duplicate the portable core in a second tracked package directory. The manifest points to the canonical files.

## Package

Use the `initialize-ai-workflow` skill to:

1. validate every manifest source and target;
2. stage the mapped files in a temporary directory outside any repository;
3. confirm the staged active profile is the generic `UNINITIALIZED` template;
4. confirm the staging tree contains exactly the manifest targets; and
5. create and inspect a zip from the staging root.

The generated zip is a delivery artifact, not a tracked source file unless the human explicitly requests otherwise.

## Install into a fresh repository

1. Start from a version-controlled branch or another recoverable checkpoint.
2. Extract the zip into a separate staging directory, never directly into the target.
3. Inspect the archive inventory.
4. Copy the staged manifest targets into the repository. Create `docs/AI_REPO_PROFILE.md` only when it is absent.
5. Ask Codex to run `initialize-ai-workflow` in the target repository.
6. Do not begin issue implementation until the profile says `INITIALIZED`.

## Upgrade an existing repository

Direct overlay extraction into a nonempty repository is unsupported.

Before replacing any portable-core file, the initializer must read and preserve the target's existing profile, maintained interaction map, repository-specific instructions, and relevant tracked pre-upgrade versions. The installer then replaces only `portable-core` targets and skips every existing `create-only` target. An initialized profile and maintained map remain byte-for-byte unchanged by the overlay.

If a prior profile or map was overwritten and cannot be recovered from the working tree, version control, or a backup, stop instead of guessing at production boundaries.

## Portability invariant

Only `docs/AI_REPO_PROFILE.md` should require meaningful repository customization. `AGENTS.md`, the procedural workflow, reviewer definitions, skills, templates, and this bundle contract remain provider- and product-neutral. Repository-specific commands, environments, providers, protected domains, and production boundaries belong in the active profile.

## Upgrade boundary for an active release

Install workflow revisions in a separate workflow change and start a new task after that change is accepted. Do not overlay an active implementation/release worktree or use new rules to broaden an existing exact-command authorization. Existing reviewed release/diagnostic artifacts retain their original identities and action limits. This upgrade does not authorize application, production, provider, merge, or deployment actions.

Review preserved repository-specific instructions and tooling for conflicts with the new procedure. Report any stricter explicit rule that still requires a human decision; do not silently erase it. An old validator or tool-enforced approval gate is not changed merely by installing these documentation rules.
