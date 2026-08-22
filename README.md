# Team Arcade

A browser-based real-time party-game arcade for small teams (target: 6–7 players, designed for 2–12) running entirely on Cloudflare infrastructure.

## Product concept

Players open a URL, enter a display name and room code, and immediately join a shared game lobby. No account is required. A host chooses a game and starts rounds. All gameplay happens synchronously in the browser.

Initial games:
1. **Who Said That?** — anonymous answers; players guess the author.
2. **Impostor** — everyone except one player knows a secret word; players submit clues, vote, and the impostor may attempt to steal the round by guessing the word.

The platform is intentionally an arcade: the lobby, identity, room, scoring, reconnect, and real-time infrastructure are reusable for additional games.

## Frozen architecture

- **Monorepo:** npm workspaces
- **Language:** TypeScript
- **Frontend:** React + Vite
- **API / edge runtime:** Cloudflare Workers
- **Realtime coordination:** Cloudflare Durable Objects
- **Realtime transport:** Durable Object WebSockets using the WebSocket Hibernation API
- **Room persistence:** SQLite-backed Durable Object storage
- **Optional cross-room/global persistence:** Cloudflare D1, but NOT required for MVP
- **Static assets:** deployed with the Worker via Cloudflare Workers static assets (preferred) or equivalent Wrangler-supported static asset configuration
- **Validation:** Zod
- **Testing:** Vitest + React Testing Library; Playwright for multiplayer browser flows
- **Repo hosting:** GitHub
- **CI:** GitHub Actions
- **Infrastructure config:** Wrangler committed to repo
- **Authentication:** none for MVP; room-scoped anonymous player sessions only

Do not substitute Firebase, Supabase, Socket.IO, Next.js, Express, or a separately hosted backend.

## Current implementation

The complete MVP is implemented and production-ready: the repository contains the reusable multiplayer platform, both playable games, hardened lifecycle and authorization behavior, accessibility and reconnect UX, automated multiplayer coverage, and reproducible Cloudflare deployment configuration.

- `apps/web`: responsive React/Vite entry and lobby UI, local anonymous session persistence, live presence, and exponential-backoff reconnect.
- `apps/worker`: Cloudflare Worker routing plus one SQLite-backed `RoomDurableObject` per room using the WebSocket Hibernation API.
- `packages/shared`: the single Zod-validated HTTP/WebSocket protocol and game catalog shared by browser and Worker.
- `packages/game-core`: Cloudflare-independent plug-in contract and reusable game utilities.
- `packages/games`: pure deterministic state machines for Who Said That? and Impostor, including viewer-specific public/private projections.
- `tests/e2e`: a seven-browser multiplayer journey covering a complete Who Said That? game, reconnect, return to the arcade, and an Impostor round.

Room session tokens are 256-bit random opaque values. Only a SHA-256 digest is stored in the room database, and the token is sent in the first WebSocket protocol message rather than a URL. Durable Object SQLite is the only authoritative room state; no D1 database or process-global state is used.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- npm 10+
- A Cloudflare account and Wrangler login only when deploying

No runtime environment variables or application secrets are required. Production deployment authentication is kept outside the repository.

## Install

```bash
nvm use
npm ci
```

## Local development

```bash
nvm use
npm install
npm run dev
```

`npm run dev` builds the web client, starts Wrangler, and serves the complete application at `http://localhost:8787` with local Durable Object persistence.

For Vite hot reload, use two terminals after an initial `npm run build`:

```bash
npm run dev:worker
npm run dev:web
```

Open `http://localhost:5173`; Vite proxies API and WebSocket traffic to Wrangler on port 8787.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run deploy:dry-run
```

The first E2E run may require `npx playwright install chromium`. The E2E flow creates seven isolated browser contexts and exercises synchronized gameplay, scoring, private information, refresh reconnection, replay/navigation controls, and server-authoritative phase transitions.

## Architecture

```text
React + Vite browser clients
          │
          │ HTTPS / hibernating WebSockets
          ▼
Cloudflare Worker ───────► static React assets
          │
          │ one object ID per room code
          ▼
RoomDurableObject ───────► SQLite-backed room, player, game,
          │                 score, and idempotency state
          ▼
Pure game engines in packages/games
```

The Worker validates HTTP routing and supplies security headers. Each room Durable Object is the sole authority for sessions, presence, host controls, game state, scoring, persistence, and viewer-specific projections. The game packages contain no Cloudflare or React dependencies.

## Cloudflare deployment

The committed `wrangler.jsonc` deploys the Worker, React static assets, and the `RoomDurableObject` SQLite migration as one Cloudflare Worker application.

### First local deployment

```bash
nvm use
npm ci
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run deploy:dry-run
npx wrangler login
npm run deploy
```

Wrangler provisions the Worker, static assets, Durable Object binding, and the committed SQLite class migration from `wrangler.jsonc`. The deployment output provides the resulting `workers.dev` URL.

### CI production deployment

The CI workflow always validates pull requests and `main`. To enable its gated production job:

1. Create a least-privilege Cloudflare API token with permission to deploy Workers, scoped to the target account.
2. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub `production` environment secrets.
3. Add the GitHub repository variable `CLOUDFLARE_DEPLOY_ENABLED` with value `true`.
4. Protect the GitHub `production` environment if deployment approval is desired.
5. Push a validated change to `main`; deployment runs only after validation and E2E jobs pass.

Do not commit the token, account ID, or `.env` files.

### Optional custom domain

The default deployment needs no domain configuration. To make a Cloudflare-managed hostname the Worker origin, add this to `wrangler.jsonc` using a zone you own, then run `npm run deploy`:

```jsonc
"routes": [
  {
    "pattern": "arcade.example.com",
    "custom_domain": true
  }
]
```

Replace the example hostname; do not commit a real organization domain unless it is intentionally part of the deployment configuration. The hostname must be in an active Cloudflare zone and must not already have a conflicting CNAME. Cloudflare creates the DNS record and certificate. See Cloudflare's [Custom Domains documentation](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

### Manual Cloudflare setup summary

1. Authenticate locally with `npx wrangler login`, or configure the two GitHub production secrets for CI.
2. Confirm that the target Cloudflare account is correct and that the Worker name `team-arcade` is available.
3. Optionally configure a custom domain as above.

No D1 database, KV namespace, application secret, or dashboard-created storage resource is required. Simple cross-room create/join rate limiting is intentionally deferred until a production zone/rate-limiting policy is selected; the application enforces room capacity, schema constraints, and request-envelope bounds server-side.

## Architecture notes

- Room codes are collision-checked against the candidate Durable Object before allocation.
- Display names are trimmed and unique case-insensitively; rooms are capped at 12 players.
- Session identity and host authorization are resolved from persisted server records, never from display names or client claims.
- Socket attachments survive hibernation; complete room state is reconstructed from SQLite after object eviction.
- A disconnected host retains ownership for 60 seconds, then an alarm promotes the longest-connected active player.
- Mutating commands carry request IDs and a bounded persisted deduplication set.
- Room inactivity schedules expiry after 12 hours; heartbeat activity renews the room.
- Who Said That? runs for three rounds. Players may revise an answer until everyone submits; guesses never expose the author map before reveal.
- Impostor runs for four rounds with a non-repeating impostor and secret word, one tie runoff, an optional steal guess, and the documented accurate-voter bonus.
- The active player roster is frozen when a game starts. Reconnecting participants recover their exact private view; new joins are rejected until the room returns to the arcade because spectator mode is outside the MVP.
- Scores accumulate for the life of the room and are retained when the host returns everyone to the arcade.

## Adding a new game

1. Add catalog metadata and a stable ID in `packages/shared/src/catalog.ts`.
2. Add strict Zod command schemas and typed viewer projections in `packages/shared/src/protocol.ts`.
3. Implement a pure engine under `packages/games/src/<game>` using the shared game-core contract. Keep secrets only in authoritative state and expose them through viewer-specific projections.
4. Route creation, commands, advancement, and projections through `RoomDurableObject`; persist before broadcasting.
5. Add phase UI to `apps/web/src/GameScreen.tsx`.
6. Add engine tests, Durable Object authorization/privacy tests, and a multiplayer Playwright journey.

Do not add game-specific Cloudflare storage or a separate transport.

## Troubleshooting

- **Wrangler cannot authenticate:** run `npx wrangler logout`, then `npx wrangler login`; in CI verify both Cloudflare secrets are set on the `production` environment.
- **WebSocket stays reconnecting locally:** use the Worker URL at `http://localhost:8787`, or run both `npm run dev:worker` and `npm run dev:web`; confirm ports 8787 and 5173 are free and that a proxy/VPN is not blocking local WebSockets.
- **Session ended after clearing browser storage:** anonymous session tokens cannot be recovered. Rejoin with a new unique display name, or create a new room if the old game is active.
- **Room no longer exists:** rooms expire after 12 hours without activity and are intentionally unrecoverable.
- **A disconnected host is still shown as host:** the 60-second reconnect grace period must elapse before the longest-connected active player is promoted.
- **Local Durable Object state is surprising:** stop Wrangler and remove only the project-local `.wrangler/state` directory when a clean local room database is intentionally needed.
- **Playwright has no browser:** run `npx playwright install chromium` and retry `npm run test:e2e`.

## Known MVP limitations

- Rooms and anonymous session identities are ephemeral and expire after 12 hours of inactivity.
- Joining an in-progress game and spectator mode are intentionally unsupported.
- If an active participant permanently leaves during a submission or voting phase, the game waits for that participant to reconnect; there is no host removal/skip control in MVP.
- Cross-room create/join rate limiting depends on the production Cloudflare zone policy and is not encoded in this repository.
- Prompt and word decks are built into deployments; there is no administration UI or custom content pack support.

## Documentation

Read in this order:

1. `docs/MASTER_BUILD_SPEC.md`
2. `docs/REQUIREMENTS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/GAME_SPEC_WHO_SAID_THAT.md`
5. `docs/GAME_SPEC_IMPOSTOR.md`
6. `docs/PROTOCOL_AND_STATE.md`
7. `docs/SECURITY_TESTING_OPERATIONS.md`
8. `codex-prompts/01-bootstrap-and-platform.md`
9. `codex-prompts/02-build-games.md`
10. `codex-prompts/03-hardening-and-deploy.md`

## Repository operating rule

The documentation in this repository is authoritative. Do not redesign the system while implementing it. If a requirement is ambiguous, choose the smallest implementation consistent with the documented architecture and record the assumption in the PR description.
