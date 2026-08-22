# Team Arcade — Master Build Specification

## 1. Objective

Build a polished, browser-based, Jackbox-style party-game arcade for small work teams. Players must be able to join a room from any modern browser with only:

- a room code;
- a display name.

No account creation, email address, password, installation, or mobile app is required.

The primary target is a 6–7 person work team playing remotely or together on a video call. The system should comfortably support 2–12 players per room.

The application must be simple enough that a first-time player can understand the join flow without explanation.

## 2. MVP Scope

The MVP contains:

- Home / join screen
- Create-room flow
- Room codes
- Host designation
- Player lobby
- Ready/presence indication
- Reconnection after refresh
- Host-controlled game selection
- Shared score board
- Round transitions
- Two complete games:
  - Who Said That?
  - Impostor
- End-game results
- Start another game without recreating the room
- Responsive browser UI
- Automated tests
- GitHub CI
- Cloudflare deployment configuration

## 3. Non-goals for MVP

Do not build:

- user accounts;
- SSO;
- persistent player profiles;
- public matchmaking;
- voice/video chat;
- payments;
- AI-generated content;
- moderation dashboards;
- admin portals;
- native apps;
- spectator mode;
- database-backed analytics;
- achievements;
- custom avatars;
- game creation tools.

The architecture should not prevent these later, but no MVP work should be spent on them.

## 4. Product principles

### 4.1 Zero-friction participation
A player should go from URL to lobby in approximately 10 seconds.

### 4.2 Server-authoritative game state
Clients render state and submit commands. Clients do not decide round winners, scores, impostor assignment, secret words, or legal state transitions.

### 4.3 Private information stays private
Game-specific private data must only be sent to the relevant player. Never broadcast a complete game state containing hidden answers or roles and rely on the browser to hide it.

### 4.4 Reusable arcade platform
Games plug into a shared room/session platform. Do not build each game as a separate application.

### 4.5 Host has orchestration power, not secret knowledge
The host can start/advance/reset games but must not receive hidden player information unless the game rules explicitly say so.

### 4.6 Friendly work-safe defaults
Content and default prompt decks should be suitable for a normal workplace. No sexual, political, religious, medical, insulting, or otherwise high-friction prompts in the default deck.

## 5. Technology constraints

These are frozen unless implementation proves a documented correctness/security blocker.

- TypeScript throughout
- React + Vite client
- Cloudflare Worker entry point
- Cloudflare Durable Object per active room
- SQLite-backed Durable Object storage
- Durable Object WebSocket Hibernation API
- Zod validation for inbound HTTP and WebSocket messages
- Vitest unit/integration tests
- Playwright E2E
- npm workspaces monorepo
- GitHub Actions

Do not introduce Next.js, Remix, Firebase, Supabase, Express, Socket.IO, Redis, Postgres, or another hosting provider.

## 6. Repository shape

```text
team-arcade/
  apps/
    web/                    # React/Vite frontend
    worker/                 # Cloudflare Worker + Durable Object
  packages/
    shared/                 # schemas, enums, protocol types, utilities
    game-core/              # reusable game interfaces/state machine helpers
    games/
      who-said-that/
      impostor/
  tests/
    e2e/
  docs/
  .github/
    workflows/
  wrangler.jsonc
  package.json
  tsconfig.base.json
  README.md
```

A smaller equivalent structure is acceptable if ownership boundaries remain obvious and shared protocol types are not duplicated.

## 7. Core user journeys

### Create a room
1. User visits root page.
2. Clicks `Create Game`.
3. Enters display name.
4. Server creates a random human-readable room code.
5. Creator becomes host.
6. User enters lobby.
7. Shareable join URL is displayed.

### Join a room
1. User visits root page or room URL.
2. Enters name and room code if not encoded in URL.
3. Server validates room and name.
4. Player receives a random opaque session token.
5. Token is stored locally in browser storage.
6. Player appears in lobby in real time.

### Reconnect
1. Player refreshes or temporarily loses network.
2. Client reconnects using room code + session token.
3. Same player identity is restored.
4. Current public state and that player's private state are rehydrated.
5. No duplicate player is created.

### Start a game
1. Host chooses a game card in lobby.
2. Host clicks Start.
3. Server initializes selected game state.
4. All clients transition simultaneously.

### Finish / play again
1. Final scoreboard is shown.
2. Host can choose `Play Again` or `Back to Arcade`.
3. Room membership remains intact.

## 8. UX / visual direction

Create an original visual identity inspired by arcade/party-game energy, but do not imitate Jackbox branding, artwork, typography, logos, layouts, or assets.

Desired qualities:

- colorful;
- large typography;
- readable on laptops and phones;
- playful micro-animations;
- obvious call-to-action buttons;
- high contrast;
- minimal chrome;
- no dense enterprise-dashboard appearance.

The home screen should feel like entering an arcade cabinet selection screen. Each game has a card with icon, name, 1-line explanation, estimated round length, and supported player count.

## 9. Accessibility

MVP must include:

- keyboard-accessible primary flows;
- semantic buttons/forms;
- visible focus styles;
- labels on fields;
- sufficient contrast;
- `aria-live` for important dynamic state changes where appropriate;
- no game mechanic that depends exclusively on color;
- reduced-motion support for nonessential animation.

## 10. Room lifecycle

Room code requirements:

- 4–6 uppercase characters;
- omit ambiguous characters such as O/0/I/1 where practical;
- collision checked before creation.

Room lifecycle:

- ACTIVE while players are participating;
- room data may expire after 12 hours of inactivity;
- expired room join returns a friendly `Room no longer exists` state;
- no permanent historical storage required.

Host lifecycle:

- room creator is initial host;
- if host disconnects, retain host identity during reconnect grace period;
- if host session is gone for 60 seconds, transfer host to longest-connected active player;
- broadcast host transfer.

## 11. Player identity

Player record minimum:

```ts
interface Player {
  id: string;
  displayName: string;
  joinedAt: number;
  connected: boolean;
  isHost: boolean;
  score: number;
}
```

Session token:

- cryptographically random;
- opaque;
- never derived from player name;
- required for reconnection and player-scoped commands;
- must not be exposed to other players.

Display names:

- trim whitespace;
- 1–24 characters;
- unique case-insensitively within room;
- basic HTML escaping is not a substitute for safe React rendering; never render raw HTML.

## 12. Generic game contract

Each game module implements a common interface conceptually equivalent to:

```ts
interface GameDefinition<State, Command> {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  createInitialState(ctx: GameContext): State;
  handleCommand(state: State, command: Command, ctx: CommandContext): GameResult<State>;
  getPublicView(state: State, viewer: ViewerContext): unknown;
  getPrivateView(state: State, playerId: string): unknown;
}
```

Exact API may vary, but game logic must remain separated from transport and React UI.

## 13. Server authority

The server validates:

- player belongs to room;
- command allowed for current phase;
- actor allowed to issue command;
- only host can issue host commands;
- player has not submitted twice when not allowed;
- submitted values meet schema constraints;
- timer/phase rules where applicable.

Invalid commands return an error only to the actor and do not mutate state.

## 14. Realtime model

Each active room maps to one Durable Object by room code or canonical room ID.

WebSocket responsibilities:

- player presence;
- room snapshots;
- state transitions;
- commands;
- private player updates;
- score changes;
- reconnect synchronization.

Use WebSocket Hibernation. Never assume the Durable Object's in-memory JavaScript values survive hibernation. Persist authoritative state or make it reconstructable from Durable Object storage.

## 15. Protocol principle

Use explicit envelope types, e.g.:

```ts
type ClientMessage =
  | { type: "room.join"; payload: ... }
  | { type: "room.reconnect"; payload: ... }
  | { type: "host.startGame"; payload: ... }
  | { type: "game.command"; payload: ... };

type ServerMessage =
  | { type: "room.snapshot"; payload: ... }
  | { type: "room.playerJoined"; payload: ... }
  | { type: "game.publicState"; payload: ... }
  | { type: "game.privateState"; payload: ... }
  | { type: "error"; payload: ... };
```

Every inbound payload is runtime-validated.

## 16. Error handling

Friendly UI states required for:

- room not found;
- room expired;
- name already used;
- room full;
- browser temporarily offline;
- reconnecting;
- host disconnected;
- game cannot start because player count too low;
- stale/invalid command;
- unexpected server error.

Do not show stack traces to users.

## 17. Acceptance definition for MVP

MVP is complete only when all of the following are true:

- 7 separate browser contexts can join one room.
- All 7 see lobby presence updates without refresh.
- A refresh restores identity and current game state.
- Host transfer works after disconnect grace period.
- Who Said That? can be played from start through scoring for multiple rounds.
- Impostor can be played from role assignment through final guess and scoring.
- Private role/answer information is not present in another player's WebSocket messages.
- End-game scoreboard is consistent for all clients.
- Host can return to arcade and launch another game with the same players.
- Unit/integration tests pass.
- Playwright multiplayer smoke tests pass.
- `npm run build` succeeds.
- `wrangler deploy --dry-run` or current equivalent succeeds.
- CI runs typecheck, lint, tests, and build.
- README contains local development and deployment instructions.
