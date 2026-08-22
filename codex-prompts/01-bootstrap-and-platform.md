# Codex Prompt 1 — Bootstrap the Platform

You are implementing Team Arcade from this repository's design documents.

Before coding, read ALL files under `docs/` and `README.md`. Treat them as authoritative. Do not redesign or substitute the frozen stack.

Your objective for this task is to build the complete reusable multiplayer platform, but NOT the full rules/UI of the two games yet.

Implement:

1. npm-workspaces TypeScript monorepo;
2. React + Vite web client;
3. Cloudflare Worker;
4. SQLite-backed Room Durable Object;
5. WebSocket Hibernation API;
6. typed shared protocol + Zod runtime validation;
7. create-room flow;
8. join-room flow using display name + room code;
9. cryptographically random room-scoped player session token;
10. lobby/presence updates in real time;
11. local session persistence and refresh reconnection;
12. host designation and 60-second failover;
13. game catalog UI containing disabled/placeholder cards for `Who Said That?` and `Impostor`;
14. cumulative room score structure;
15. shared game engine interface for pluggable games;
16. friendly loading/offline/reconnecting/error states;
17. responsive original arcade-like UI shell;
18. unit/integration tests for room/session behavior;
19. GitHub Actions for lint/typecheck/test/build/dry-run deploy;
20. README local development and deployment instructions.

Important implementation rules:

- Server is authoritative.
- Never use display name as authentication.
- Never depend on in-memory state surviving Durable Object hibernation.
- Do not introduce D1 unless required by an actual documented blocker; room SQLite storage is sufficient.
- Do not introduce another backend framework/provider.
- Keep game logic independent from Cloudflare APIs.
- Use viewer-specific state projection structure from the spec from day one.
- Do not leave architecture TODOs that will force Prompt 2 to redesign the room model.

Acceptance criteria:

- locally, 7 isolated browser contexts can join one room;
- live join/disconnect/reconnect presence works;
- refresh restores the same player;
- a disconnected host transfers after grace period;
- placeholder game selection can be changed by host only;
- non-host host commands are rejected server-side;
- persisted room state survives Durable Object re-instantiation test;
- CI configuration exists and local checks pass.

At completion:

1. run all relevant checks;
2. fix failures;
3. summarize architecture actually implemented;
4. list files changed;
5. list commands to run locally;
6. identify any deviation from specification and justify it. If none, say none.

Do not proceed to implement the full games in this task.
