# Functional and Nonfunctional Requirements

## Functional requirements

### FR-001 Room creation
The system shall allow a user to create a room and become its host.

### FR-002 Room joining
The system shall allow a player to join an active room by room code and display name without an account.

### FR-003 Join link
The lobby shall expose a copyable join URL containing the room code.

### FR-004 Unique names
The server shall reject duplicate display names within a room using case-insensitive comparison.

### FR-005 Presence
All connected players shall see joins, leaves/disconnects, reconnects, and host changes in real time.

### FR-006 Reconnection
A player shall retain identity across refresh/reconnect by using an opaque locally stored session token.

### FR-007 Host controls
Only the current host shall be able to select games, start games, and issue host-only progression/reset commands.

### FR-008 Host failover
If the host remains disconnected for 60 seconds, another active player shall be promoted.

### FR-009 Game catalog
The lobby shall display the games available to the room and their basic metadata.

### FR-010 Shared score
The room shall maintain cumulative scores while the room remains active.

### FR-011 Game reset
A completed game shall allow the host to restart the same game or return to the arcade without dropping room membership.

### FR-012 Who Said That?
The application shall implement all phases and scoring described in `GAME_SPEC_WHO_SAID_THAT.md`.

### FR-013 Impostor
The application shall implement all phases and scoring described in `GAME_SPEC_IMPOSTOR.md`.

### FR-014 Private state
The server shall emit player-private game data only to that player's authenticated room WebSocket session.

### FR-015 Room expiry
Inactive rooms shall be eligible for deletion after 12 hours.

## Nonfunctional requirements

### NFR-001 Supported browsers
Current major desktop and mobile versions of Chrome, Safari, Firefox, and Edge.

### NFR-002 Target room capacity
Correctness target: 2–12 players. UX optimized for 6–7.

### NFR-003 Latency
Under normal network conditions, player-visible state changes should normally appear within 500 ms after accepted server mutation.

### NFR-004 Security
All client input is untrusted. The server is authoritative. No raw HTML rendering of player content.

### NFR-005 Privacy
Do not store email, IP-derived identity, device fingerprint, or other unnecessary personal information.

### NFR-006 Reliability
A Durable Object wake from hibernation must reconstruct enough authoritative room/game state to continue safely.

### NFR-007 Observability
Server errors shall be logged with request/room correlation identifiers but never session tokens or hidden game answers unless explicitly necessary for debugging in local development.

### NFR-008 Maintainability
Game rules should be unit-testable without booting Cloudflare runtime or a browser.

### NFR-009 Deployability
Production deployment must be reproducible from repository configuration and documented commands.

### NFR-010 Cost awareness
Avoid needless timers, polling, and continuously active Durable Objects. Use WebSocket hibernation where possible.
