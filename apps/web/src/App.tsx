import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  PUBLIC_GAME_CATALOG,
  SINGLE_PLAYER_GAME_CATALOG,
  displayNameSchema,
  roomCodeSchema,
  sessionStorageKey,
  type GameId,
  type RoomSessionResponse
} from "@team-arcade/shared";
import { ApiError, createRoom, isTerminalRoomSessionError, joinRoom, validateRoomSession } from "./api";
import { useRoomSocket } from "./useRoomSocket";
import { GameScreen } from "./GameScreen";
import { nextSoloLaunchCommand, soloRoomPointerStorageKey, type SoloLaunchRequestIds } from "./solo-launch";

type EntryMode = "create" | "join";
type SoloGameId = (typeof SINGLE_PLAYER_GAME_CATALOG)[number]["id"];

interface InitialRoute {
  inviteCode: string;
  session: RoomSessionResponse | null;
  soloGameId: SoloGameId | null;
}

export function App() {
  const initialRoute = useMemo(readInitialRoute, []);
  const [session, setSession] = useState<RoomSessionResponse | null>(initialRoute.soloGameId ? null : initialRoute.session);
  const [soloResumeSession, setSoloResumeSession] = useState<RoomSessionResponse | null>(initialRoute.soloGameId ? initialRoute.session : null);
  const [inviteCode, setInviteCode] = useState(initialRoute.inviteCode);
  const [soloGameId, setSoloGameId] = useState<SoloGameId | null>(initialRoute.soloGameId);

  if (soloResumeSession && soloGameId) {
    return <SoloResumeGate
      session={soloResumeSession}
      gameId={soloGameId}
      onValid={() => { setSession(soloResumeSession); setSoloResumeSession(null); }}
      onInvalid={() => {
        clearSoloSession(soloResumeSession, soloGameId);
        setSoloResumeSession(null);
        setSoloGameId(null);
      }}
      onCancel={() => {
        clearSoloSession(soloResumeSession, soloGameId);
        setSoloResumeSession(null);
        setSoloGameId(null);
      }}
    />;
  }

  if (session) {
    return <Lobby session={session} soloGameId={soloGameId} onLeave={() => {
      setInviteCode("");
      setSoloGameId(null);
      setSession(null);
    }} />;
  }

  return <EntryScreen
    initialCode={inviteCode}
    onRoomSession={(nextSession) => { setSoloGameId(null); setSession(nextSession); }}
    onSoloSession={(nextSession, gameId) => { setSoloGameId(gameId); setSession(nextSession); }}
  />;
}

function EntryScreen({ initialCode, onRoomSession, onSoloSession }: {
  initialCode: string;
  onRoomSession: (session: RoomSessionResponse) => void;
  onSoloSession: (session: RoomSessionResponse, gameId: SoloGameId) => void;
}) {
  const [mode, setMode] = useState<EntryMode>(initialCode ? "join" : "create");
  const [displayName, setDisplayName] = useState("");
  const [roomCode, setRoomCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [soloError, setSoloError] = useState<string | null>(null);
  const [soloSubmitting, setSoloSubmitting] = useState<SoloGameId | null>(null);

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
      onRoomSession(nextSession);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const launchSolo = async (gameId: SoloGameId) => {
    setSoloError(null);
    setSoloSubmitting(gameId);
    try {
      const nextSession = await createRoom("Solo Player");
      localStorage.setItem(sessionStorageKey(nextSession.roomCode), JSON.stringify(nextSession));
      localStorage.setItem(soloRoomPointerStorageKey(gameId), nextSession.roomCode);
      window.history.replaceState(null, "", `/?play=${encodeURIComponent(gameId)}`);
      onSoloSession(nextSession, gameId);
    } catch (caught) {
      setSoloError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setSoloSubmitting(null);
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
        <p className="hero-copy">Fast, friendly games for solo breaks and team play. Leave the login screen behind.</p>
        <div className="feature-pills" aria-label="Arcade features">
          <span>1–12 players</span><span>No accounts</span><span>Play anywhere</span>
        </div>
      </section>

      <div className="entry-actions">
        <section className="solo-panel" aria-labelledby="single-player-title">
          <div className="solo-panel-heading">
            <div><p className="eyebrow">Play right now</p><h2 id="single-player-title">Single-player</h2></div>
            <span>No room needed</span>
          </div>
          {SINGLE_PLAYER_GAME_CATALOG.map((game) => (
            <button
              className="solo-game-card"
              type="button"
              key={game.id}
              disabled={soloSubmitting !== null}
              onClick={() => void launchSolo(game.id)}
              aria-label={`Play ${game.name} solo`}
            >
              <span className="solo-game-icon" aria-hidden="true">▦</span>
              <span><strong>{game.name}</strong><small>{game.description}</small></span>
              <span className="solo-game-meta">{game.duration}<b>{soloSubmitting === game.id ? "Opening…" : "Play now →"}</b></span>
            </button>
          ))}
          <p className="solo-message" role="alert" aria-live="polite">{soloError}</p>
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
      </div>
    </main>
  );
}

export function Lobby({ session, soloGameId, onLeave }: {
  session: RoomSessionResponse;
  soloGameId: SoloGameId | null;
  onLeave: () => void;
}) {
  const { room, game, status, message, fatalSession, commandPending, send } = useRoomSocket(
    session.roomCode,
    session.sessionToken,
    soloGameId !== null
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const soloRequestIds = useRef<SoloLaunchRequestIds | null>(null);
  if (!soloRequestIds.current) {
    soloRequestIds.current = {
      select: `solo-select:${crypto.randomUUID()}`,
      start: `solo-start:${crypto.randomUUID()}`
    };
  }
  const self = room?.players.find((player) => player.id === session.playerId);
  const host = room?.players.find((player) => player.isHost);
  const joinUrl = `${window.location.origin}/?room=${session.roomCode}`;

  const selectGame = (gameId: GameId) => {
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

  const leave = useCallback(() => {
    localStorage.removeItem(sessionStorageKey(session.roomCode));
    if (soloGameId) localStorage.removeItem(soloRoomPointerStorageKey(soloGameId));
    window.history.replaceState(null, "", "/");
    onLeave();
  }, [onLeave, session.roomCode, soloGameId]);

  useEffect(() => {
    if (!soloGameId || status !== "connected") return;
    const command = nextSoloLaunchCommand({
      gameId: soloGameId,
      room,
      hasGame: game !== null,
      commandPending,
      requestIds: soloRequestIds.current as SoloLaunchRequestIds
    });
    if (command) send(command);
  }, [commandPending, game, room, send, soloGameId, status]);

  useEffect(() => {
    if (soloGameId && fatalSession) leave();
  }, [fatalSession, leave, soloGameId]);

  return (
    <main className={`lobby-shell ${game?.gameId === "system-crawl" ? "system-crawl-room" : ""} ${soloGameId || game?.gameId === "afterprint" ? "afterprint-room" : ""}`}>
      <header className="lobby-header">
        <a className="compact-brand" href="/" onClick={(event) => { event.preventDefault(); leave(); }} aria-label={soloGameId ? "Return to the main page" : "Leave room and return home"}>
          <span>TA</span><strong>Team Arcade</strong>
        </a>
        <div className={`connection-badge ${status}`} role="status" aria-live="polite">
          <i aria-hidden="true" /> {status === "connected" ? "Live" : status === "offline" ? "Offline" : status === "error" ? "Session ended" : status === "connecting" ? "Connecting…" : "Reconnecting…"}
        </div>
      </header>

      {!soloGameId && game?.gameId !== "afterprint" && <section className="room-banner">
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
      </section>}

      {(status !== "connected" || message) && (!soloGameId || game) && (
        <div className="status-panel" role="alert">
          <strong>{status === "offline" ? "You’re offline." : status === "error" ? "This session ended." : status !== "connected" ? "Finding your room…" : "Heads up"}</strong>
          <span>{message ?? (status === "offline" ? "We’ll reconnect when your network returns." : "Your seat is saved while we reconnect.")}</span>
        </div>
      )}

      <div className={`lobby-layout ${game ? "game-layout" : ""} ${game?.gameId === "system-crawl" ? "system-crawl-layout" : ""} ${game?.gameId === "afterprint" ? "afterprint-layout" : ""}`}>
        {game && room ? <GameScreen game={game} room={room} selfId={session.playerId} status={status} commandPending={commandPending} send={send} onBackToArcade={soloGameId ? leave : undefined} /> : soloGameId ? <SoloLaunchScreen gameId={soloGameId} status={status} message={message} onCancel={leave} /> : <section className="arcade-section" aria-labelledby="choose-game-title">
          <div className="section-heading">
            <div><p className="eyebrow">Pick the next adventure</p><h2 id="choose-game-title">Choose a game</h2></div>
            {!self?.isHost && <span className="host-note">{host?.connected === false ? "Host disconnected — holding their seat" : `${host?.displayName ?? "The host"} is choosing`}</span>}
          </div>
          <div className="game-grid">
            {PUBLIC_GAME_CATALOG.map((game, index) => {
              const selected = room?.selectedGameId === game.id;
              return (
                <button
                  type="button"
                  className={`game-card game-${index + 1} ${selected ? "selected" : ""}`}
                  key={game.id}
                  aria-pressed={selected}
                  disabled={!self?.isHost || status !== "connected" || commandPending}
                  onClick={() => selectGame(game.id)}
                >
                  <span className="game-icon" aria-hidden="true">{game.icon === "speech" ? "?!" : game.icon === "terminal" ? ">_" : game.icon === "categories" ? "≠" : game.icon === "afterprint" ? "▦" : "⌁"}</span>
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
              disabled={!room?.selectedGameId || status !== "connected" || commandPending}
              onClick={() => send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} })}
            >
              {room?.selectedGameId ? "Start game" : "Choose a game"}
            </button>
          )}
        </section>}

        {!soloGameId && game?.gameId !== "afterprint" && <aside className="players-panel" aria-labelledby="players-title">
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
        </aside>}
      </div>
      <p className="sr-only" aria-live="polite">{soloGameId
        ? game ? "Solo game ready." : "Preparing solo game."
        : room ? `${room.players.filter((player) => player.connected).length} players connected.` : "Connecting to room."}</p>
    </main>
  );
}

function SoloResumeGate({ session, gameId, onValid, onInvalid, onCancel }: {
  session: RoomSessionResponse;
  gameId: SoloGameId;
  onValid: () => void;
  onInvalid: () => void;
  onCancel: () => void;
}) {
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      await validateRoomSession(session.roomCode, session.sessionToken);
      onValid();
    } catch (caught) {
      if (isTerminalRoomSessionError(caught)) {
        onInvalid();
        return;
      }
      setError(caught instanceof ApiError ? caught.message : "This session could not be restored.");
      setChecking(false);
    }
  }, [onInvalid, onValid, session.roomCode, session.sessionToken]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void check();
  }, [check]);

  return (
    <main className="lobby-shell afterprint-room">
      <header className="lobby-header">
        <a className="compact-brand" href="/" onClick={(event) => { event.preventDefault(); onCancel(); }} aria-label="Return to the main page">
          <span>TA</span><strong>Team Arcade</strong>
        </a>
        <div className={`connection-badge ${error ? "error" : "connecting"}`} role="status" aria-live="polite">
          <i aria-hidden="true" /> {error ? "Needs attention" : "Restoring…"}
        </div>
      </header>
      <div className="lobby-layout">
        <SoloLaunchScreen
          gameId={gameId}
          status={error ? "error" : "connecting"}
          message={error ?? (checking ? "Checking your saved puzzle…" : null)}
          onCancel={onCancel}
          onRetry={error ? () => { void check(); } : undefined}
        />
      </div>
      <p className="sr-only" aria-live="polite">Restoring solo game.</p>
    </main>
  );
}

function SoloLaunchScreen({ gameId, status, message, onCancel, onRetry }: {
  gameId: SoloGameId;
  status: ReturnType<typeof useRoomSocket>["status"];
  message: string | null;
  onCancel: () => void;
  onRetry?: (() => void) | undefined;
}) {
  const game = SINGLE_PLAYER_GAME_CATALOG.find((candidate) => candidate.id === gameId);
  const statusCopy = status === "offline"
    ? "You are offline. We will continue when your connection returns."
    : status === "reconnecting"
      ? "Restoring your puzzle…"
      : status === "error"
        ? "This solo session could not be restored."
        : "Preparing today’s trace…";
  return (
    <section className="solo-launch" aria-labelledby="solo-launch-title">
      <span className="solo-launch-icon" aria-hidden="true">▦</span>
      <p className="eyebrow">Single-player</p>
      <h1 id="solo-launch-title">Opening {game?.name ?? "game"}</h1>
      <p role="status" aria-live="polite">{message ?? statusCopy}</p>
      {onRetry && <button className="primary-button solo-retry" type="button" onClick={onRetry}>Try again</button>}
      <button className="text-button" type="button" onClick={onCancel}>Return to main page</button>
    </section>
  );
}

function readInitialRoute(): InitialRoute {
  const params = new URLSearchParams(window.location.search);
  const inviteCode = roomCodeSchema.safeParse(params.get("room") ?? "").data ?? "";
  if (inviteCode) return { inviteCode, session: readStoredSession(inviteCode), soloGameId: null };

  const requestedGameId = params.get("play");
  const soloGame = SINGLE_PLAYER_GAME_CATALOG.find((game) => game.id === requestedGameId);
  if (!soloGame) return { inviteCode: "", session: null, soloGameId: null };
  const pointer = localStorage.getItem(soloRoomPointerStorageKey(soloGame.id)) ?? "";
  const roomCode = roomCodeSchema.safeParse(pointer).data;
  const session = roomCode ? readStoredSession(roomCode) : null;
  if (session) return { inviteCode: "", session, soloGameId: soloGame.id };
  localStorage.removeItem(soloRoomPointerStorageKey(soloGame.id));
  if (roomCode) localStorage.removeItem(sessionStorageKey(roomCode));
  window.history.replaceState(null, "", "/");
  return { inviteCode: "", session: null, soloGameId: null };
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

function clearSoloSession(session: RoomSessionResponse, gameId: SoloGameId): void {
  localStorage.removeItem(sessionStorageKey(session.roomCode));
  localStorage.removeItem(soloRoomPointerStorageKey(gameId));
  window.history.replaceState(null, "", "/");
}

function initials(displayName: string): string {
  return displayName.split(/\s+/u).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}
