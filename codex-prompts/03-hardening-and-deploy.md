# Codex Prompt 3 — Hardening, Polish, and Production Readiness

Treat the current implementation and repository specs as frozen. This task is hardening, not redesign.

Perform a complete production-readiness pass.

## Validate functionality

Exercise all documented MVP acceptance criteria with automated tests where practical.

Specifically verify:

- 7 simultaneous browser clients;
- refresh/reconnect during lobby;
- refresh/reconnect during every sensitive game phase;
- host disconnect/failover;
- same-name rejection;
- room capacity limit;
- expired room behavior;
- non-host command rejection;
- duplicate command idempotency;
- stale command rejection;
- return to arcade preserves members and cumulative scores;
- second game can start without creating new room.

## Security review

Inspect the implementation for:

- private game data leakage;
- client-authoritative scoring or phase transitions;
- unsafe rendering of player input;
- session token leakage in logs/errors;
- predictable session tokens;
- missing payload length limits;
- missing runtime schemas;
- accidental secrets in repo;
- WebSocket authorization gaps.

Fix any findings.

## Durable Object correctness

Verify:

- room does not rely on volatile in-memory state after hibernation;
- WebSocket attachments/session metadata are sufficient for wake/reconnect behavior;
- authoritative mutation is persisted before broadcast;
- object re-instantiation tests pass.

## UI polish

Without changing the product architecture:

- improve spacing/typography/responsiveness;
- improve lobby share-code presentation;
- add Copy Join Link action;
- add reconnect banner;
- add accessible focus states;
- add reduced-motion handling;
- add lightweight winner celebration;
- verify no game depends solely on color;
- ensure all default text/prompt content is workplace safe.

## CI/deployment

Ensure:

- GitHub Actions pass;
- Wrangler configuration is complete;
- production environment variables/secrets are documented;
- no manual dashboard-only configuration is required unless unavoidable;
- `wrangler deploy --dry-run` or current equivalent succeeds;
- deployment command is documented;
- custom domain setup instructions are documented but do not hardcode a domain.

## Final deliverable

Update README with a concise operator guide:

- prerequisites;
- install;
- local run;
- test;
- deploy;
- architecture diagram;
- adding a new game;
- troubleshooting WebSocket/reconnect behavior.

Then run the full check suite and fix failures.

Return:

1. production-readiness summary;
2. test results;
3. security findings fixed;
4. any remaining known limitations;
5. exact deploy commands;
6. confirmation whether all MASTER_BUILD_SPEC acceptance criteria are met.
