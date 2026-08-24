import { useEffect, useMemo, useRef, useState } from "react";
import {
  ENEMY_DEFINITIONS,
  INCIDENT_DEFINITIONS,
  getViewerReachableMovementTiles,
  type Position,
  type SystemCrawlEvent,
  type SystemCrawlTarget,
  type SystemCrawlViewerState
} from "@team-arcade/games";
import type { PlayerView, SystemCrawlCommand } from "@team-arcade/shared";
import type { ConnectionStatus } from "../../useRoomSocket";
import { type ActionSelection } from "./AbilityPanel";
import { type BoardInteraction, SystemCrawlBoard } from "./SystemCrawlBoard";
import { EventLog } from "./EventLog";
import { eventAnnouncement } from "./presentation";
import { ConnectionBadge, SystemCrawlSetup } from "./SystemCrawlSetup";
import { SystemCrawlHud } from "./SystemCrawlHud";
import { SystemCrawlHelp } from "./SystemCrawlHelp";
import { useSystemCrawlAudio } from "./useSystemCrawlAudio";
import "./system-crawl.css";

export interface SystemCrawlViewProps {
  view: SystemCrawlViewerState;
  players: PlayerView[];
  selfId: string;
  isHost: boolean;
  status: ConnectionStatus;
  commandPending: boolean;
  sendGame: (command: SystemCrawlCommand) => boolean;
  playAgainNewSeed: () => boolean;
  replaySameSeed: () => boolean;
  backToArcade: () => boolean;
}

export function SystemCrawlView(props: SystemCrawlViewProps) {
  const { view } = props;
  const reducedMotion = usePrefersReducedMotion();
  const effects = useAuthoritativeEffects(view.events, reducedMotion);
  const audio = useSystemCrawlAudio(view.events);

  let screen;
  if (view.phase === "class_selection" || view.phase === "ready_to_start") screen = <SystemCrawlSetup {...props} />;
  else if (view.phase === "incident_briefing") screen = <IncidentBriefing {...props} />;
  else if (view.phase === "victory" || view.phase === "defeat") screen = <Results {...props} announcement={effects.announcement} />;
  else screen = <Adventure {...props} reducedMotion={reducedMotion} effects={effects} />;
  return <>{screen}<div className="sc-local-controls"><SystemCrawlHelp phase={view.phase} /><button className="sc-local-control" type="button" aria-pressed={audio.enabled} onClick={() => void audio.toggle()}>{audio.enabled ? "Sound on" : "Sound muted"}</button></div></>;
}

function IncidentBriefing({ view, isHost, status, commandPending, sendGame }: SystemCrawlViewProps) {
  const incident = view.incidentId ? INCIDENT_DEFINITIONS[view.incidentId] : null;
  const disabled = status !== "connected" || commandPending;
  if (!incident) return null;
  return <div className="sc-terminal sc-briefing">
    <header><span>INCIDENT TICKET / AWAITING HOST ACKNOWLEDGEMENT</span><h1>{incident.displayTitle}</h1><p>{incident.premise}</p></header>
    <dl className="sc-briefing__metadata">{incident.metadata.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
    <section><span>OBJECTIVE</span><h2>{incident.objective}</h2><p>Expected threat category: <strong>{incident.threatCategory}</strong>. Detailed mechanics remain classified until encountered.</p></section>
    {isHost ? <button className="sc-command primary" type="button" disabled={disabled} onClick={() => sendGame({ type: "continue_briefing" })}>Acknowledge and deploy</button> : <p className="sc-waiting">Waiting for the host to acknowledge the incident.</p>}
  </div>;
}

function Adventure(props: SystemCrawlViewProps & { reducedMotion: boolean; effects: EffectState }) {
  const { view, players, selfId, status, commandPending, sendGame, reducedMotion, effects } = props;
  const active = view.activeCharacterId ? view.characters[view.activeCharacterId] : undefined;
  const ownedActive = active?.ownerPlayerId === selfId;
  const commandReady = status === "connected" && !commandPending;
  const canMove = view.phase === "player_turn" && Boolean(active && ownedActive && !active.downed) && commandReady;
  const movement = useMemo(() => active && canMove ? getViewerReachableMovementTiles(view, active.id) : [], [active, canMove, view]);
  const local = Object.values(view.characters).filter((character) => character.ownerPlayerId === selfId);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(local[0]?.id ?? null);
  const [selection, setSelection] = useState<ActionSelection>(null);

  useEffect(() => {
    if (ownedActive && active) setSelectedCharacterId(active.id);
    setSelection(null);
  }, [active?.id, ownedActive]);
  useEffect(() => {
    if (view.phase !== "player_turn" || commandPending || status !== "connected") setSelection(null);
  }, [commandPending, status, view.phase]);
  useEffect(() => {
    if (!selection) return;
    const cancel = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [selection]);

  const boardInteraction: BoardInteraction = selection?.kind === "restart"
    ? { kind: "restart", label: selection.label, targets: selection.targetCharacterIds.map((characterId) => ({ type: "character", characterId })) }
    : selection ? { kind: selection.kind, label: selection.label, targets: selection.targets } : { kind: "movement" };

  const target = (selectedTarget: SystemCrawlTarget) => {
    if (!active || !selection || !commandReady) return;
    let sent = false;
    if (selection.kind === "ability") sent = sendGame({ type: "use_ability", characterId: active.id, abilityId: selection.abilityId, target: selectedTarget });
    else if (selection.kind === "item") sent = sendGame({ type: "use_item", characterId: active.id, target: selectedTarget });
    else if (selectedTarget.type === "character") sent = sendGame({ type: "restart_user", characterId: active.id, targetCharacterId: selectedTarget.characterId });
    if (sent) setSelection(null);
  };

  return <div className="sc-terminal sc-adventure">
    <header className="sc-incident-bar">
      <div><span>ACTIVE INCIDENT / PRODUCTION NETWORK</span><h1>{view.incidentId ? INCIDENT_DEFINITIONS[view.incidentId].displayTitle : "Crawl the system"}</h1></div>
      <dl><div><dt>Round</dt><dd>{view.round}</dd></div><div><dt>Current turn</dt><dd>{active?.displayName ?? "Resolving"}</dd></div><div><dt>Frontier</dt><dd>Node {view.revealedCardCount}/4</dd></div></dl>
      <ConnectionBadge status={status} pending={commandPending} />
    </header>
    {(status !== "connected" || commandPending) && <div className="sc-network-notice" role="status">{commandPending ? "Command pending — controls are locked until the server replies." : status === "reconnecting" ? "Reconnecting — the latest board remains available while controls are paused." : "Offline — the latest board remains available while controls are paused."}</div>}
    {(view.phase === "enemy_phase" || effects.systemPhase) && <div className="sc-system-phase" role="status"><span>SYSTEM PHASE</span><small>Hostile processes executing authoritative events</small></div>}
    <div className="sc-live-region sr-only" aria-live="assertive" aria-atomic="true">{effects.announcement} {active ? `Current turn: ${active.displayName}.` : ""}</div>
    <main className="sc-game-layout">
      <SystemCrawlBoard view={view} activeCharacterId={active?.id ?? null} movementPositions={movement} canMove={canMove && !selection} interaction={boardInteraction} freshEvents={effects.visualEvents} reducedMotion={reducedMotion} onMove={(destination: Position) => {
        if (active) sendGame({ type: "move_to", characterId: active.id, destination });
      }} onTarget={target} />
      <SystemCrawlHud view={view} players={players} selfId={selfId} status={status} commandPending={commandPending} selectedCharacterId={selectedCharacterId} selection={selection} onCharacterSelect={setSelectedCharacterId} onSelection={setSelection} sendGame={sendGame} />
    </main>
  </div>;
}

function Results({ view, players, isHost, status, commandPending, playAgainNewSeed, replaySameSeed, backToArcade, announcement }: SystemCrawlViewProps & { announcement: string }) {
  const won = view.phase === "victory";
  const disabled = status !== "connected" || commandPending;
  const incident = view.incidentId ? INCIDENT_DEFINITIONS[view.incidentId] : null;
  const boss = incident ? ENEMY_DEFINITIONS[incident.bossId] : null;
  return <div className={`sc-terminal sc-results ${won ? "victory" : "defeat"}`}>
    <div className="sr-only" aria-live="assertive">{announcement}</div>
    <span className="sc-results__code">INCIDENT {won ? "CLOSED" : "ESCALATED"}</span><h1>{won ? "Production stabilized" : "Incident unresolved"}</h1><p>{won ? "Service restored. The retrospective has already been scheduled." : "The escalation path now includes several people who were not on the call."}</p>
    <dl className="sc-summary-grid">
      <div><dt>Incident</dt><dd>{incident?.displayTitle ?? "Unknown incident"}</dd></div><div><dt>Seed</dt><dd>{view.seed ?? "Unavailable"}</dd></div>
      <div><dt>Outcome</dt><dd>{won ? "Victory" : "Defeat"}</dd></div><div><dt>Rounds</dt><dd>{view.round}</dd></div>
      <div><dt>Maps explored</dt><dd>{view.maps.filter((map) => map.revealed).map((map) => map.displayName).filter(Boolean).join(" → ")}</dd></div>
      <div><dt>Enemies defeated</dt><dd>{view.stats.enemiesDefeated}</dd></div><div><dt>Boss</dt><dd>{boss?.displayName ?? "Unknown"} · {view.stats.bossDefeated ? "defeated" : "active"}</dd></div>
      <div><dt>Damage prevented</dt><dd>{view.stats.damagePrevented}</dd></div><div><dt>Items used</dt><dd>{view.stats.itemsUsed}</dd></div>
      <div><dt>Revivals</dt><dd>{view.stats.revivals}</dd></div><div><dt>Characters downed</dt><dd>{view.stats.charactersDowned}</dd></div>
    </dl>
    <section className="sc-character-summary"><h2>Operator report</h2>{Object.entries(view.stats.byCharacter).map(([characterId, stats]) => {
      const character = view.characters[characterId];
      const owner = players.find((player) => player.id === character?.ownerPlayerId)?.displayName ?? "Player";
      return <article key={characterId}><strong>{character?.displayName ?? characterId}</strong><span>{owner}</span><dl><div><dt>Damage</dt><dd>{stats.damageDealt}</dd></div><div><dt>Healing</dt><dd>{stats.healingPerformed}</dd></div><div><dt>Prevented</dt><dd>{stats.damagePrevented}</dd></div><div><dt>Items</dt><dd>{stats.itemsUsed}</dd></div><div><dt>Revivals</dt><dd>{stats.revivals}</dd></div><div><dt>Downs</dt><dd>{stats.downs}</dd></div></dl></article>;
    })}</section>
    <details className="sc-results__events"><summary>View final event log</summary><EventLog events={view.events} /></details>
    {isHost ? <div className="sc-results__actions"><button className="sc-command primary" type="button" disabled={disabled} onClick={playAgainNewSeed}>Play Again With New Seed</button><button className="sc-command" type="button" disabled={disabled} onClick={replaySameSeed}>Replay Same Seed</button><button className="sc-command" type="button" disabled={disabled} onClick={backToArcade}>Return to Arcade</button></div> : <p className="sc-waiting">The host can replay this incident, provision a new seed, or return to the arcade.</p>}
  </div>;
}

interface EffectState {
  visualEvents: SystemCrawlEvent[];
  announcement: string;
  systemPhase: boolean;
}

function useAuthoritativeEffects(events: readonly SystemCrawlEvent[], reducedMotion: boolean): EffectState {
  const latestObservedId = useRef<number | null>(null);
  const [queue, setQueue] = useState<SystemCrawlEvent[]>([]);
  const [current, setCurrent] = useState<SystemCrawlEvent | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const latest = events.at(-1)?.id ?? 0;
    if (latestObservedId.current === null) {
      latestObservedId.current = latest;
      return;
    }
    if (latest < latestObservedId.current) {
      latestObservedId.current = latest;
      setCurrent(null);
      setQueue([]);
      return;
    }
    const fresh = events.filter((event) => event.id > (latestObservedId.current ?? 0)).sort((a, b) => a.id - b.id);
    latestObservedId.current = latest;
    if (!fresh.length) return;
    if (reducedMotion) {
      setAnnouncement(fresh.map(eventAnnouncement).join(" "));
      setCurrent(null);
      setQueue([]);
    } else {
      setQueue((pending) => [...pending, ...fresh]);
    }
  }, [events, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || current || !queue[0]) return;
    const next = queue[0];
    setQueue((pending) => pending.slice(1));
    setCurrent(next);
  }, [current, queue, reducedMotion]);

  useEffect(() => {
    if (!current || reducedMotion) return;
    setAnnouncement(eventAnnouncement(current));
    const timer = window.setTimeout(() => setCurrent(null), current.type === "map_card_revealed" ? 700 : 380);
    return () => window.clearTimeout(timer);
  }, [current, reducedMotion]);

  return { visualEvents: current ? [current] : [], announcement, systemPhase: current?.type === "enemy_phase_started" };
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const change = () => setReduced(query.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);
  return reduced;
}
