# Architecture

## System context

```text
Browser A ─┐
Browser B ─┼── HTTPS / WebSocket ──> Cloudflare Worker ──> Room Durable Object
Browser C ─┤                                           ├── SQLite-backed DO storage
Browser ...┘                                           └── room state + game engine

Static React assets are served from Cloudflare.
```

## Why Durable Objects

A multiplayer room requires a single authoritative coordination point for multiple concurrent clients. Model each room as exactly one Durable Object. This avoids distributed locking and gives room mutations a natural serialization boundary.

## Component responsibilities

### React client
Owns:
- navigation;
- forms;
- rendering public/private views;
- local session token persistence;
- WebSocket connection/reconnection behavior;
- optimistic affordances only when they cannot affect authoritative outcome.

Does not own:
- scoring;
- role assignment;
- secret words;
- vote counting;
- phase transitions;
- host authorization.

### Edge Worker
Owns:
- static asset/API routing as applicable;
- create-room HTTP endpoint;
- validating room code format before Durable Object routing;
- locating Durable Object instance;
- proxying WebSocket upgrade;
- generic security headers.

### Room Durable Object
Owns:
- players;
- room lifecycle;
- host identity/failover;
- current game;
- cumulative score;
- game state machine;
- WebSocket membership;
- command validation;
- persistence;
- broadcasts and private messages.

### Game modules
Own:
- phases;
- game-specific commands;
- scoring;
- hidden/private data projection;
- prompt/word selection.

Must not know Cloudflare APIs directly.

## Durable persistence model

Prefer a small number of tables in the room Durable Object SQLite store:

```sql
CREATE TABLE IF NOT EXISTS room_state (
  key TEXT PRIMARY KEY,
  json_value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  is_host INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0
);
```

The implementation may persist the complete current game state as a JSON document in `room_state` for MVP. Avoid prematurely normalizing game-specific ephemeral data.

Never persist plaintext session token if a practical one-way digest can be used.

## State mutation sequence

For each valid command:

1. Parse envelope.
2. Runtime validate schema.
3. Resolve authenticated player from session attachment/token.
4. Validate command against current room/game phase.
5. Apply game/room mutation.
6. Persist authoritative state.
7. Generate viewer-specific projections.
8. Broadcast public projection.
9. Send private projection separately to each player when needed.

Do not broadcast before persistence succeeds.

## WebSocket hibernation

Connection metadata required after wake must be stored using Cloudflare-supported WebSocket attachment/session mechanisms and/or reconstructed from durable storage.

The code must not depend on a process-global or in-memory Map as the only record of player identity or game state.

## Reconnection

Client reconnection algorithm:

- exponential backoff with jitter;
- cap retry delay at a reasonable value such as 10 seconds;
- immediately show `Reconnecting…` state;
- reconnect with room code and locally stored session token;
- server rebinds socket to player identity;
- server sends complete current player-specific snapshot;
- client replaces local game state with server snapshot.

## Security boundaries

Treat room code as discoverable, not a secret.

Authorization is based on session token + server-side player association, not display name.

Host authorization is based on server-side player record.

Hidden game data never enters generic public room snapshots.

## D1 decision

D1 is intentionally not required for MVP. Room state belongs in each Durable Object's local SQLite storage. Add D1 later only for true cross-room concerns such as global prompt administration, aggregate analytics, or persistent accounts.
