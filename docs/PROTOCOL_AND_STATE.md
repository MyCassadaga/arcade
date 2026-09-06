# Protocol and State Contract

## Design rule

Use one typed protocol shared by frontend and worker. Do not duplicate string message names or schemas in multiple packages.

## Suggested client messages

```ts
type ClientMessage =
  | { type: "room.reconnect"; requestId: string; payload: { sessionToken: string } }
  | { type: "host.selectGame"; requestId: string; payload: { gameId: string } }
  | { type: "host.startGame"; requestId: string; payload: Record<string, never> }
  | { type: "host.advance"; requestId: string; payload: Record<string, never> }
  | { type: "host.backToArcade"; requestId: string; payload: Record<string, never> }
  | { type: "game.command"; requestId: string; payload: { command: unknown } }
  | { type: "ping"; requestId: string; payload: { clientTime: number } };
```

Room creation/join may use HTTP first and upgrade to WebSocket afterward, or use a WebSocket handshake. Prefer whichever results in cleaner authentication and testing. Do not create two unrelated state models.

## Suggested server messages

```ts
type ServerMessage =
  | { type: "room.snapshot"; payload: RoomView }
  | { type: "room.presence"; payload: PresenceView }
  | { type: "game.state"; payload: GameViewerState }
  | { type: "command.ack"; requestId: string; payload: { accepted: true } }
  | { type: "error"; requestId?: string; payload: { code: string; message: string } }
  | { type: "pong"; payload: { serverTime: number } };
```

## Room public view

```ts
interface RoomView {
  roomCode: string;
  players: Array<{
    id: string;
    displayName: string;
    connected: boolean;
    isHost: boolean;
    score: number;
  }>;
  selectedGameId: string | null;
  roomPhase: "lobby" | "playing" | "results";
}
```

## Viewer game state

Avoid one universal object with every secret and a client-side `hidden` boolean.

Build projections by viewer:

```ts
interface GameViewerState {
  gameId: string;
  phase: string;
  public: unknown;
  private?: unknown;
}
```

Examples:

Impostor non-impostor private state:
```json
{ "role": "player", "secretWord": "microwave" }
```

Impostor private state:
```json
{ "role": "impostor" }
```

No other client receives the other variant.

## Idempotency

Every mutating client command should have a `requestId`.

The server should guard against accidental duplicate processing caused by reconnect/retry, at least for commands where duplication changes score or phase.

A small bounded set of recently processed request IDs per player is sufficient for MVP.

## Stale commands

Commands invalid for current phase are rejected rather than coerced.

Example: a delayed `submit clue` arriving after the room entered voting returns `STALE_PHASE` and does not mutate state.

## Server error codes

Recommended stable codes:

- ROOM_NOT_FOUND
- ROOM_EXPIRED
- ROOM_FULL
- NAME_TAKEN
- INVALID_NAME
- INVALID_SESSION
- NOT_HOST
- INVALID_PHASE
- INVALID_COMMAND
- ALREADY_SUBMITTED
- PLAYER_NOT_ACTIVE
- GAME_NOT_AVAILABLE
- TOO_FEW_PLAYERS
- SERVER_ERROR

UI text may be friendlier than codes.

## Categories commands and projections

`categories.submitAnswer` is strict: `{ type, gameInstanceId, roundNumber, answer }`, with a UUID game instance, integer round 1–5, and 1–40 trimmed UTF-16 code units (the same bound used by the browser textarea). Unexpected fields are rejected. The pure engine verifies the instance, round, submission phase and frozen active roster. Replay creates a fresh instance; existing game command shapes are unchanged.

During submission, Categories public state contains the current category, submission/roster counts, game/round metadata and scores; it excludes answers, author mappings, normalized values, and future categories. Private state contains only the viewer's own answer/status. Once all active players submit, public `groups` contain `unique` or `cancelled` results with answer/author pairs. Normalized matching keys remain server-owned. Reveal applies each unique author's +1 delta atomically with game state and the request ledger. Host advance changes phases without scoring again.

The five selected categories are frozen in the stored JSON at creation so editing the built-in deck cannot change an active game after eviction. No table or storage migration is needed. See [Categories rules](GAME_SPEC_CATEGORIES.md).
