# AI Repository Profile

> This is the **only file that should need meaningful customization per repository**. The portable workflow, reviewer definitions, skills, and bundle contract remain generic.

## Initialization status

- **Status:** `INITIALIZED`
- **Repository:** Team Arcade (`MyCassadaga/arcade`)
- **Default/protected branch:** `main` is the local `origin/HEAD` default, the tracked CI production-deploy branch, and the branch observed to trigger the external automatic Cloudflare deployment; GitHub branch-protection settings are `UNKNOWN — VERIFY`.
- **Human release authority:** `UNKNOWN — VERIFY` (repository owner/maintainers are not identified by tracked files).
- **Issue tracker:** GitHub repository workflow; whether GitHub Issues is enabled is `UNKNOWN — VERIFY`.

## Model and review configuration

- **Primary implementation model:** selected by the human for the main Codex session; this portable workflow does not pin or override it.
- **Routine independent reviewer:** `terra_reviewer` — project agent `.codex/agents/terra-reviewer.toml`; `gpt-5.6-terra`, medium reasoning, read-only.
- **High-risk independent reviewer:** `terra_reviewer_high` — project agent `.codex/agents/terra-reviewer-high.toml`; `gpt-5.6-terra`, high reasoning, read-only.
- **Reviewer independence requirement:** reviewer must be a spawned independent context and must remain read-only.
- **Missing reviewer behavior:** if a required configured reviewer cannot be started, stop at that review gate and report the exact problem. Do not silently substitute primary-agent self-review.

## Repository commands

| Purpose | Command / source |
|---|---|
| Install dependencies | `nvm use && npm ci` (`.nvmrc` pins Node 22) |
| Focused tests | `npm run test:unit -- <test-path>`; Worker integration: `npm run test:worker -- <test-path>`; browser: `npx playwright test <test-path>` |
| Full/broad tests | `npm test && npm run test:e2e` |
| Type check | `npm run typecheck` |
| Lint | `npm run lint` |
| Production build | `npm run build` |
| Local/preview run | Full local Worker app: `npm run dev` at `http://localhost:8787`; Vite HMR split mode: `npm run dev:worker` and `npm run dev:web` |
| Ordinary PR CI | `.github/workflows/ci.yml`: `npm ci`, lint, typecheck, unit/Worker tests, build, Wrangler dry-run, and Playwright E2E |

## Architecture / interaction map

- **Map enabled:** `YES`
- **Map path:** `docs/ARCHITECTURE.md` (canonical platform map), supplemented by `docs/PROTOCOL_AND_STATE.md` and `docs/SYSTEM_CRAWL.md`
- **Changelog path:** No separate map changelog is maintained; use Git history for the mapped documents.
- **Template if a new map is warranted:** `docs/templates/AI_SYSTEM_INTERACTION_MAP_TEMPLATE.md`

### Impact index

| If changing… | Start with current evidence in… |
|---|---|
| Browser UX, session persistence, or reconnect behavior | `docs/ARCHITECTURE.md` → React client; `apps/web/src/App.tsx`; `apps/web/src/useRoomSocket.ts`; `apps/web/src/api.ts` |
| HTTP/WebSocket envelopes or viewer projections | `docs/PROTOCOL_AND_STATE.md`; `packages/shared/src/protocol.ts`; `apps/worker/src/index.ts`; `apps/worker/src/room-do.ts` |
| Room authority, host lifecycle, persistence, idempotency, or expiry | `docs/ARCHITECTURE.md` → Room Durable Object / Durable persistence model; `apps/worker/src/room-do.ts`; Worker integration tests |
| Game rules, scoring, hidden state, RNG, or replay | `packages/game-core`; `packages/games`; the applicable game specification; `docs/SYSTEM_CRAWL.md` for System Crawl |
| Deployment, bindings, migrations, or static assets | `wrangler.jsonc`; `.github/workflows/ci.yml`; `README.md` → Cloudflare deployment |

## Environments and deployment

- **Local environment:** Wrangler local development at `http://localhost:8787` with project-local Durable Object state under `.wrangler/state`; optional Vite HMR at `http://localhost:5173` proxies to Wrangler.
- **Preview/staging environment(s):** No tracked preview/staging deployment is configured. Pull requests run validation and `wrangler deploy --dry-run`; any external preview environment is `UNKNOWN — VERIFY`.
- **Production environment:** Cloudflare Worker named `team-arcade`, with static assets and the `ROOMS` Durable Object binding; account and deployed URL/domain are `UNKNOWN — VERIFY`.
- **Deployment mechanism:** A Cloudflare-side integration automatically deploys the `team-arcade` Worker after merges/pushes to `main`, independently of the tracked GitHub Actions deploy job. The tracked job also deploys on `main` when `CLOUDFLARE_DEPLOY_ENABLED == true`, after validation/E2E; manual `npm run deploy` remains available.
- **Merge/deployment coupling:** `COUPLED` — merging or pushing to `main` triggers the external automatic Cloudflare production deployment. Treat authorization to merge to `main` and that automatic deployment consequence as one production-affecting action set.
- **Deployment identity / verification method:** Cloudflare deployment history records the resulting Wrangler version, and GitHub identifies the merge commit, but no tracked procedure deterministically maps an exact Git SHA to the Cloudflare version; `UNKNOWN — VERIFY`.
- **Post-deployment smoke-check location or runbook:** `UNKNOWN — VERIFY`; no tracked production smoke-check procedure was found.

## Data stores and persistent state

- Per-room Cloudflare Durable Object SQLite is authoritative for room metadata, players, current game, scores, and processed request IDs.
- Browser `localStorage` retains the anonymous room session token plus local tutorial/audio preferences.
- React static assets are deployed with the Worker. No D1, KV, R2, external database, or process-global authoritative state is configured.
- Rooms and their server-side state expire after 12 hours of inactivity.

## External providers / systems

- Cloudflare Workers, Durable Objects, SQLite-backed Durable Object storage, static assets, observability, and Wrangler deployment.
- GitHub hosts the repository and runs CI/optional production deployment through GitHub Actions and the `production` environment.
- Browser clients communicate only with the same-origin Worker over HTTPS and WebSockets; no third-party runtime API is present in tracked source.

## Repository-specific HIGH-risk domains

- Session-token generation, hashing, browser storage, reconnect authentication, and host-only authorization.
- Viewer-specific projection of private answers, roles, choices, future content, and other hidden game state.
- Durable Object SQLite schema/persisted JSON, transactional mutation-before-broadcast behavior, alarms, room expiry, host failover, and WebSocket hibernation recovery.
- Shared HTTP/WebSocket schemas, protocol compatibility, stale-command rejection, and persisted request idempotency.
- Deterministic game rules, RNG/replay state, phase transitions, scoring, and frozen active-player rosters.
- Cloudflare bindings/migrations, production deployment configuration, secrets, custom-domain/DNS changes, and CI deployment gates.

## Production / external-write boundaries

- `Work issue X` alone authorizes no production access, mutation, provider write, live configuration/secret change, production migration, protected-branch merge, or deployment.
- Repository-specific production-affecting operations requiring explicit authorization: any production Cloudflare read/write, `wrangler` deployment/login, Durable Object data inspection or deletion, Worker migration, GitHub environment secret/variable change, custom-domain/DNS change, the coupled `main` merge/push plus automatic Cloudflare deployment, or a distinct CI/manual production deployment.
- Environment-targeting hazards or prohibited ambiguous commands: treat `npm run deploy`, `npx wrangler deploy`, `npx wrangler login`, Cloudflare dashboard/API operations, and GitHub production-environment changes as external/production actions unless an exact safe target and separate authority are established. `npm run deploy:dry-run` is the repository's non-deploying validation command. Delete `.wrangler/state` only when explicitly intending to reset project-local state.

## Release mechanics and platform constraints

- **Historically reachable production-state compatibility:** Preserve compatibility with active room SQLite/persisted game JSON and hibernating WebSocket attachments for the documented 12-hour room lifetime; `wrangler.jsonc` currently declares Durable Object SQLite migration tag `v1`.
- **Provider/runtime limits and result semantics that release tooling must verify:** Room capacity is 12; WebSocket messages are bounded to 4,096 bytes; static assets and the `ROOMS` binding ship with the Worker; deployment success/URL/version must be taken from the exact Wrangler result. Cloudflare account-specific limits are `UNKNOWN — VERIFY`.
- **Authenticated operator path and any repository-defined access gate:** Local deployment uses an external `npx wrangler login`; CI uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the GitHub `production` environment and the `CLOUDFLARE_DEPLOY_ENABLED` repository variable. Actual environment reviewers are `UNKNOWN — VERIFY`.
- **Merge method and exact reviewed-SHA preservation:** A GitHub merge commit guarded by the reviewed head SHA preserves that reviewed commit as a parent, while producing a distinct merge SHA; tracked files do not define allowed merge strategies or branch-protection rules.
- **Merge/deployment coupling and automatic-deploy trigger:** `COUPLED` — a merge/push to `main` was observed to create a Cloudflare Wrangler deployment even while the tracked GitHub Actions `deploy` job was skipped. Release authorization must cover the merge and automatic production deployment together, followed by bounded verification.
- **Deployment identity and postcheck evidence:** `UNKNOWN — VERIFY`; no tracked exact-SHA deployment receipt or production postcheck procedure exists.
- **Reusable read-only production diagnostic boundary, if any:** None defined. Any production read requires separate, bounded authorization.

## Repository-specific instructions

- Repository documentation is authoritative; preserve the frozen TypeScript/npm-workspaces, React/Vite, Cloudflare Worker/Durable Object, SQLite, Zod, Vitest, and Playwright architecture unless a documented correctness/security blocker requires a scoped decision.
- Keep the Worker and Durable Object server-authoritative. Never send another player hidden/private game state or log session tokens/hidden content.
- Do not add a separate backend, transport, or game-specific storage. `docs/MASTER_BUILD_SPEC.md` records explicit out-of-scope frameworks/providers and product non-goals.
- Use Node 22 and committed npm scripts. Do not commit Cloudflare credentials, account IDs, `.env` files, or organization domains unintentionally.
- When a change touches a mapped area, load the corresponding impact-index row, verify current source, and update the existing mapped documentation when its interaction footprint changes.
