# AI Repository Profile

> This is the **only file that should need meaningful customization per repository**. The portable workflow, reviewer definitions, skills, and bundle contract remain generic.

## Initialization status

- **Status:** `UNINITIALIZED`
- **Repository:** `UNKNOWN — VERIFY`
- **Default/protected branch:** `UNKNOWN — VERIFY`
- **Human release authority:** `UNKNOWN — VERIFY`
- **Issue tracker:** `UNKNOWN — VERIFY`

## Model and review configuration

- **Primary implementation model:** selected by the human for the main Codex session; this portable workflow does not pin or override it.
- **Routine independent reviewer:** `terra_reviewer` — project agent `.codex/agents/terra-reviewer.toml`; `gpt-5.6-terra`, medium reasoning, read-only.
- **High-risk independent reviewer:** `terra_reviewer_high` — project agent `.codex/agents/terra-reviewer-high.toml`; `gpt-5.6-terra`, high reasoning, read-only.
- **Reviewer independence requirement:** reviewer must be a spawned independent context and must remain read-only.
- **Missing reviewer behavior:** if a required configured reviewer cannot be started, stop at that review gate and report the exact problem. Do not silently substitute primary-agent self-review.

## Repository commands

| Purpose | Command / source |
|---|---|
| Install dependencies | `UNKNOWN — VERIFY` |
| Focused tests | `UNKNOWN — VERIFY` |
| Full/broad tests | `UNKNOWN — VERIFY` |
| Type check | `UNKNOWN — VERIFY` |
| Lint | `UNKNOWN — VERIFY` |
| Production build | `UNKNOWN — VERIFY` |
| Local/preview run | `UNKNOWN — VERIFY` |
| Ordinary PR CI | `UNKNOWN — VERIFY` |

## Architecture / interaction map

- **Map enabled:** `UNKNOWN — VERIFY`
- **Map path:** `UNKNOWN — VERIFY`
- **Changelog path:** `UNKNOWN — VERIFY`
- **Template if a new map is warranted:** `docs/templates/AI_SYSTEM_INTERACTION_MAP_TEMPLATE.md`

## Environments and deployment

- **Local environment:** `UNKNOWN — VERIFY`
- **Preview/staging environment(s):** `UNKNOWN — VERIFY`
- **Production environment:** `UNKNOWN — VERIFY`
- **Deployment mechanism:** `UNKNOWN — VERIFY`
- **Merge/deployment coupling:** `UNKNOWN — VERIFY` — record `COUPLED` when a merge/push automatically triggers production deployment, `SEPARATE` when deployment requires a distinct action, and the exact triggering branch/event when known.
- **Deployment identity / verification method:** `UNKNOWN — VERIFY`
- **Post-deployment smoke-check location or runbook:** `UNKNOWN — VERIFY`

## Data stores and persistent state

- `UNKNOWN — VERIFY`

## External providers / systems

- `UNKNOWN — VERIFY`

## Repository-specific HIGH-risk domains

- `UNKNOWN — VERIFY`

## Production / external-write boundaries

- `Work issue X` alone authorizes no production access, mutation, provider write, live configuration/secret change, production migration, protected-branch merge, or deployment.
- Repository-specific separately authorized operations: `UNKNOWN — VERIFY`
- Environment-targeting hazards or prohibited ambiguous commands: `UNKNOWN — VERIFY`

## Release mechanics and platform constraints

- **Historically reachable production-state compatibility:** `UNKNOWN — VERIFY`
- **Provider/runtime limits and result semantics that release tooling must verify:** `UNKNOWN — VERIFY`
- **Authenticated operator path and any repository-defined access gate:** `UNKNOWN — VERIFY`
- **Merge method and exact reviewed-SHA preservation:** `UNKNOWN — VERIFY`
- **Merge/deployment coupling and automatic-deploy trigger:** `UNKNOWN — VERIFY`
- **Deployment identity and postcheck evidence:** `UNKNOWN — VERIFY`
- **Reusable read-only production diagnostic boundary, if any:** `UNKNOWN — VERIFY`

## Repository-specific instructions

- `UNKNOWN — VERIFY`
