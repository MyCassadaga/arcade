import { useMemo, useState, type FormEvent } from "react";
import {
  GAME_CATALOG,
  displayNameSchema,
  roomCodeSchema,
  sessionStorageKey,
  type RoomSessionResponse
} from "@team-arcade/shared";
import { ApiError, createRoom, joinRoom } from "./api";
import { useRoomSocket } from "./useRoomSocket";
import { GameScreen } from "./GameScreen";

type EntryMode = "create" | "join";

export function App() {
  const initialCode = useMemo(() => {
    const candidate = new URLSearchParams(window.location.search).get("room") ?? "";
    return roomCodeSchema.safeParse(candidate).data ?? "";
  }, []);
  const storedSession = initialCode ? readStoredSession(initialCode) : null;
  const [session, setSession] = useState<RoomSessionResponse | null>(storedSession);
  const [inviteCode, setInviteCode] = useState(initialCode);

  if (session) {
    return <Lobby session={session} onLeave={() => { setInviteCode(""); setSession(null); }} />;
  }

  return <EntryScreen initialCode={inviteCode} onSession={setSession} />;
}

function EntryScreen({ initialCode, onSession }: { initialCode: string; onSession: (session: RoomSessionResponse) => void }) {
  const [mode, setMode] = useState<EntryMode>(initialCode ? "join" : "create");
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const parsedName = displayNameSchema.safeParse(displayName);
    if (!parsedName.success) {
      setError(parsedName.error.issues[0]?.message ?? "Enter a display name.");
      return;
    }
    const parsedCode = mode === "join" ? roomCodeSchema.safeParse(roomCode) : null;
    if (parsedCode && !parsedCode.success) {
      setError(parsedCode.error.issues[0]?.message ?? "Enter a valid room code.");
      return;
    }

    setSubmitting(true);
    try {
      const nextSession = mode === "create"
        ? await createRoom(parsedName.data)
        : await joinRoom(parsedCode?.data ?? "", parsedName.data);
      localStorage.setItem(sessionStorageKey(nextSession.roomCode), JSON.stringify(nextSession));
      window.history.replaceState(null, "", `/?room=${encodeURIComponent(nextSession.roomCode)}`);
      onSession(nextSession);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="entry-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <section className="hero" aria-labelledby="page-title">
        <div className="brand-mark" aria-hidden="true"><span>TA</span></div>
        <p className="eyebrow">The breakroom, upgraded</p>
        <h1 id="page-title">TEAM<br /><span>ARCADE</span></h1>
        <p className="hero-copy">Fast, friendly party games. Bring a name. Bring your team. Leave the login screen behind.</p>
        <div className="feature-pills" aria-label="Arcade features">
          <span>2–12 players</span><span>No accounts</span><span>Play anywhere</span>
        </div>
      </section>

      <section className="entry-panel" aria-label="Enter the arcade">
        <div className="mode-switch" role="group" aria-label="Room action">
          <button className={mode === "create" ? "active" : ""} type="button" onClick={() => setMode("create")}>Create room</button>
          <button className={mode === "join" ? "active" : ""} type="button" onClick={() => setMode("join")}>Join room</button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <h2>{mode === "create" ? "Open a new cabinet" : "Your team is waiting"}</h2>
          <p>{mode === "create" ? "You’ll be the host. Invite up to 11 more players." : "Enter the code on your host’s screen."}</p>
          <label htmlFor="display-name">Display name</label>
          <input
            id="display-name"
            autoComplete="nickname"
            maxLength={24}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="How should we call you?"
            autoFocus
          />
          {mode === "join" && (
            <>
              <label htmlFor="room-code">Room code</label>
              <input
                id="room-code"
                className="code-input"
                autoComplete="off"
                maxLength={6}
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                placeholder="ABCDE"
              />
            </>
          )}
          <div className="form-message" role="alert" aria-live="polite">{error}</div>
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Opening…" : mode === "create" ? "Create game" : "Join the fun"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Lobby({ session, onLeave }: { session: RoomSessionResponse; onLeave: () => void }) {
  const { room, game, status, message, send } = useRoomSocket(session.roomCode, session.sessionToken);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const self = room?.players.find((player) => player.id === session.playerId);
  const host = room?.players.find((player) => player.isHost);
  const joinUrl = `${window.location.origin}/?room=${session.roomCode}`;

  const selectGame = (gameId: (typeof GAME_CATALOG)[number]["id"]) => {
    send({ type: "host.selectGame", requestId: crypto.randomUUID(), payload: { gameId } });
  };

  const copyJoinLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopyStatus("Invite link copied!");
    } catch {
      setCopyStatus("Copy was blocked. Select the invite link and copy it manually.");
    }
    window.setTimeout(() => setCopyStatus(null), 2_500);
  };

  const leave = () => {
    localStorage.removeItem(sessionStorageKey(session.roomCode));
    window.history.replaceState(null, "", "/");
    onLeave();
  };

  return (
    <main className="lobby-shell">
      <header className="lobby-header">
        <a className="compact-brand" href="/" onClick={(event) => { event.preventDefault(); leave(); }} aria-label="Leave room and return home">
          <span>TA</span><strong>Team Arcade</strong>
        </a>
        <div className={`connection-badge ${status}`} role="status" aria-live="polite">
          <i aria-hidden="true" /> {status === "connected" ? "Live" : status === "offline" ? "Offline" : status === "error" ? "Session ended" : status === "connecting" ? "Connecting…" : "Reconnecting…"}
        </div>
      </header>

      <section className="room-banner">
        <div>
          <p className="eyebrow">Room code</p>
          <h1>{session.roomCode}</h1>
          <label className="invite-link-label" htmlFor="invite-link">Share this link</label>
          <input id="invite-link" className="invite-link" value={joinUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
          <p className="copy-feedback" role="status" aria-live="polite">{copyStatus}</p>
        </div>
        <button
          className="copy-button"
          type="button"
          onClick={() => void copyJoinLink()}
        >
          Copy invite link
        </button>
      </section>

      {(status !== "connected" || message) && (
        <div className="status-panel" role="alert">
          <strong>{status === "offline" ? "You’re offline." : status === "error" ? "This session ended." : status !== "connected" ? "Finding your room…" : "Heads up"}</strong>
          <span>{message ?? (status === "offline" ? "We’ll reconnect when your network returns." : "Your seat is saved while we reconnect.")}</span>
        </div>
      )}

      <div className={`lobby-layout ${game ? "game-layout" : ""}`}>
        {game && room ? <GameScreen game={game} room={room} selfId={session.playerId} send={send} /> : <section className="arcade-section" aria-labelledby="choose-game-title">
          <div className="section-heading">
            <div><p className="eyebrow">Pick the next adventure</p><h2 id="choose-game-title">Choose a game</h2></div>
            {!self?.isHost && <span className="host-note">{host?.connected === false ? "Host disconnected — holding their seat" : `${host?.displayName ?? "The host"} is choosing`}</span>}
          </div>
          <div className="game-grid">
            {GAME_CATALOG.map((game, index) => {
              const selected = room?.selectedGameId === game.id;
              return (
                <button
                  type="button"
                  className={`game-card game-${index + 1} ${selected ? "selected" : ""}`}
                  key={game.id}
                  aria-pressed={selected}
                  disabled={!self?.isHost || status !== "connected"}
                  onClick={() => selectGame(game.id)}
                >
                  <span className="game-icon" aria-hidden="true">{game.icon === "speech" ? "?!" : "⌁"}</span>
                  <span className="game-title">{game.name}</span>
                  <span className="game-description">{game.description}</span>
                  <span className="game-meta"><span>{game.duration}</span><span>{game.playerRange}</span></span>
                  <span className="select-label">{selected ? "Selected" : self?.isHost ? "Select game" : "Host selects"}</span>
                </button>
              );
            })}
          </div>
          {self?.isHost && (
            <button
              className="primary-button start-button"
              type="button"
              disabled={!room?.selectedGameId || status !== "connected"}
              onClick={() => send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} })}
            >
              {room?.selectedGameId ? "Start game" : "Choose a game"}
            </button>
          )}
        </section>}

        <aside className="players-panel" aria-labelledby="players-title">
          <div className="players-heading">
            <div><p className="eyebrow">The crew</p><h2 id="players-title">Players</h2></div>
            <span className="player-count">{room?.players.length ?? 0}/12</span>
          </div>
          {!room ? <p className="loading-copy">Loading players…</p> : (
            <ol className="player-list">
              {room.players.map((player, index) => (
                <li key={player.id} className={!player.connected ? "disconnected" : ""}>
                  <span className={`avatar avatar-${index % 5}`} aria-hidden="true">{initials(player.displayName)}</span>
                  <span className="player-name">{player.displayName}{player.id === session.playerId ? " (you)" : ""}<small>{player.connected ? (player.isHost ? "Host" : "Ready") : "Reconnecting"}</small></span>
                  <span className="score" aria-label={`${player.score} points`}>{player.score} pts</span>
                </li>
              ))}
            </ol>
          )}
          <button className="text-button" type="button" onClick={leave}>Leave room</button>
        </aside>
      </div>
      <p className="sr-only" aria-live="polite">{room ? `${room.players.filter((player) => player.connected).length} players connected.` : "Connecting to room."}</p>
    </main>
  );
}

function readStoredSession(roomCode: string): RoomSessionResponse | null {
  try {
    const raw = localStorage.getItem(sessionStorageKey(roomCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RoomSessionResponse>;
    return parsed.roomCode === roomCode && typeof parsed.playerId === "string" && typeof parsed.sessionToken === "string"
      ? parsed as RoomSessionResponse
      : null;
  } catch {
    return null;
  }
}

function initials(displayName: string): string {
  return displayName.split(/\s+/u).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
