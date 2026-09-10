# Architecture

## System context

```text
Browser A ─┐
Browser B ─┼── HTTPS / WebSocket ──> Cloudflare Worker ──> Room Durable Object
Browser C ─┤                                           ├── SQLite-backed DO storage
Browser ...┘                                           ├── room state + game engine
                                                     └── private temporary R2 drawings

Static React assets are served from Cloudflare.
```

## Why Durable Objects

A multiplayer room requires a single authoritative coordination point for multiple concurrent clients. Model each room as exactly one Durable Object. This avoids distributed locking and gives room mutations a natural serialization boundary.

## Component responsibilities

### React client
Owns:
- navigation;
- forms;
- presenting catalog entries by room or single-player launch mode;
- filtering the lobby game picker to catalog entries marked public;
- rendering public/private views;
- local session token persistence;
- WebSocket connection/reconnection behavior;
- optimistic affordances only when they cannot affect authoritative outcome.

The main page launches catalogued single-player games without room ceremony. For multiplayer rooms, the client stores the opaque session under the room-keyed local-storage key plus one room-code-only resume pointer. Reloading the room URL or returning to the root route validates that saved token before restoring the same seat; explicit Leave or a terminal invalid/expired response clears the token, pointer, and any private local Shirt Fight draft. A recoverable validation failure preserves the saved session and offers retry. For AFTERPRINT, the client creates the existing one-player room internally and stores only a game-to-room-code pointer alongside the established session. Once validated, the client derives idempotent select/start commands from authoritative room snapshots using stable request IDs. The solo presentation is active before connection, so room code, invite, lobby-picker, player-list, and waiting-for-players UI are never rendered.

An open authenticated client sends no periodic heartbeat or state-refresh traffic. A one-shot local deadline is reset only by intentional outbound room/game commands. After 15 minutes without such activity, the socket closes, automatic reconnect remains paused, and the saved session is retained behind an explicit reconnect action.

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

### Party-game registry and presentation

`apps/worker/src/game-registry.ts` binds typed adapters for Who Said That?, Impostor, Categories, AFTERPRINT, and Shirt Fight. Each adapter creates a discriminated stored game, validates its command family, advances its pure engine, and projects the viewer state. The Durable Object keeps the existing authorization, request deduplication and atomic persistence boundary. Existing stored game JSON shapes are unchanged; new games add discriminants without changing SQLite tables.

System Crawl stays hidden and uses its existing separate routing; it is outside this refactor.

`apps/web/src/game-presentation.tsx` holds the demonstrated phase card, text form, progress/waiting, points, scoreboard and results components. Game screens retain their own phase-specific presentation. Categories renders answer text and author names only from revealed groups, with explicit Unique/Cancelled labels. AFTERPRINT has a compact solo screen that reuses the pure simulator for visual replay while the Worker remains authoritative for attempts and completion. Shirt Fight adds a touch-first 600×800 backing canvas that scales into the live phone viewport, rapid slogan entry, independent drawing/slogan selection, private voting controls, and a host-selectable public display that consumes only the public projection. During an open slot, bounded vector strokes are retained in tab-scoped session storage under the exact room/player/game/round/drawing identity and restored only after the authoritative projection confirms that slot is still open. Native canvas WebP is verified before upload; a lazy bundled encoder handles browsers that silently return another format.

Shirt Fight drawing binaries use the private `SHIRT_FIGHT_DRAWINGS` R2 binding and application-owned HTTP routes. A server-only Durable Object manifest reserves opaque object keys before upload, while the stored game JSON contains only validated drawing IDs and bounded metadata. Session credentials travel in an `Authorization` header, never an asset URL. The Durable Object authorizes each read against the viewer and current phase; responses are private/non-store and never expose R2 keys or URLs.

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

Room sockets are accepted with `DurableObjectState.acceptWebSocket`, handled through hibernation event methods, and retain only the player identity in their serialized attachment. Meaningful activity is reconstructed from the durable player row after wake. The shared alarm schedules the earliest meaningful-activity deadline alongside game progression, host failover, room expiry, and asset cleanup; an idle player's sockets are all closed after 15 minutes without deleting the persisted player or game.

Shirt Fight also uses the one Durable Object alarm. Its persisted deadline reconciliation runs before commands, reconnect projections, and alarm work; the scheduler chooses the earliest game deadline, host failover, room expiry, or asset-cleanup retry. Logical expiry denies normal access while retaining a private R2 cleanup tombstone until every recorded object is deleted.

## Reconnection

Client reconnection algorithm:

- exponential backoff with jitter;
- cap retry delay at a reasonable value such as 10 seconds;
- immediately show `Reconnecting…` state;
- reconnect with room code and locally stored session token;
- for a stored direct-solo session, revalidate the token after an opaque WebSocket upgrade failure so a room that expired between the resume preflight and socket connection is cleared instead of retried forever;
- server rebinds socket to player identity;
- server sends complete current player-specific snapshot;
- client replaces local game state with server snapshot.
- an inactivity close pauses automatic retries until the player explicitly reconnects with the same saved session;
- only the current socket owns status, messages, the one-shot inactivity deadline, and retry scheduling; close events from a replaced socket are ignored.
- a current unsubmitted Shirt Fight draft is redrawn only after the replacement snapshot confirms its exact slot; submitted, advanced, terminal, or explicitly left sessions retire local draft data without auto-upload.

## Security boundaries

Treat room code as discoverable, not a secret.

Authorization is based on session token + server-side player association, not display name.

Host authorization is based on server-side player record.

Hidden game data never enters generic public room snapshots.

## D1 decision

D1 is intentionally not required for MVP. Room state belongs in each Durable Object's local SQLite storage. Add D1 later only for true cross-room concerns such as global prompt administration, aggregate analytics, or persistent accounts.
