# Security, Testing, CI, and Operations

## Security requirements

### Input validation
Runtime-validate every HTTP and WebSocket payload with Zod or equivalent already in frozen stack.

### Injection / XSS
Player names, clues, answers, and guesses are plain text. Never use `dangerouslySetInnerHTML` for player content.

### Session security
- use cryptographically secure random session tokens;
- transmit only over HTTPS/WSS;
- never log tokens;
- prefer storing a digest server-side;
- localStorage is acceptable for this low-risk anonymous MVP, recognizing it is accessible to same-origin JavaScript;
- no sensitive personal information should exist in the app.

### Abuse bounds
Apply server-side limits:
- max players per room: 12;
- max display name: 24 chars;
- Who Said That answer: 160 chars;
- Impostor clue: 32 chars;
- room create/join rate limiting if simple using Cloudflare facilities; otherwise document as post-MVP.

### Secrets
No Cloudflare API token or production secret committed to Git. CI secrets live in GitHub repository/environment secrets.

## Testing pyramid

### Unit tests
Test pure game engines heavily.

Who Said That tests:
- prompt selection no duplicate within game;
- submission validation;
- author does not guess own answer;
- reveal order;
- scoring;
- complete round transition;
- hidden author mapping not exposed in public projection.

Impostor tests:
- impostor selection;
- role projection;
- clue cannot equal word;
- voting;
- tie -> runoff;
- second tie -> escape;
- successful/failed steal;
- scoring;
- secret word absent from impostor state before final reveal.

Room tests:
- name uniqueness;
- host-only authorization;
- reconnect identity;
- host failover;
- score persistence across games;
- invalid/stale command rejected.

### Integration tests
Test Durable Object behavior using current Cloudflare-recommended test tooling compatible with Vitest.

Cover:
- room create/join;
- persisted state surviving object re-instantiation;
- WebSocket message routing;
- viewer-specific projections;
- disconnect/reconnect.

### E2E Playwright
Create a helper that launches multiple isolated browser contexts representing players.

Required smoke flow:
1. Player A creates room.
2. Players B–G join.
3. all contexts see seven players.
4. launch Who Said That.
5. submit one answer from each context.
6. complete at least one answer guess/reveal cycle.
7. refresh Player C and confirm identity/state restored.
8. return to arcade.
9. launch Impostor.
10. verify exactly one browser is shown impostor role and others see same word.

Do not assert hidden information by scraping a universal DOM state that should not exist. Prefer testing network messages/server projections where feasible.

## CI

GitHub Actions on pull request and main:

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e   # may be separate job
wrangler deploy --dry-run
```

Use the Node version pinned in repo, preferably `.nvmrc` and/or `engines`.

## Branch / PR workflow

Suggested:
- `main` protected;
- feature branches `feat/...`, `fix/...`;
- Codex should work in issue-scoped branches;
- each implementation prompt results in one reviewable PR or a small logical series if necessary.

## Deployment environments

Minimum:
- local
- production

Preferred if easy:
- preview/staging via GitHub/Cloudflare deployment workflow.

Production should deploy from `main` after CI.

## Observability

Log structured events for:
- room created;
- player join/reconnect/disconnect;
- game start/end;
- unexpected errors.

Do not log:
- session tokens;
- hidden roles/secret words as normal production telemetry;
- full free-text answers unless temporarily debugging locally.

## Definition of done

A feature is not complete until:
- implementation matches spec;
- server authorization is enforced;
- runtime payload validation exists;
- happy-path tests exist;
- important invalid-state tests exist;
- typecheck passes;
- lint passes;
- no secrets are committed;
- README/docs are updated if behavior or setup changed.
