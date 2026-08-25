import { useEffect, useState } from "react";
import { ABILITY_DEFINITIONS, CLASS_DEFINITIONS, type SystemCrawlClassId, type SystemCrawlViewerState } from "@team-arcade/games";
import type { PlayerView, SystemCrawlCommand } from "@team-arcade/shared";
import type { ConnectionStatus } from "../../useRoomSocket";
import { ABILITY_PRESENTATION } from "./presentation";
import { CharacterSprite } from "./sprites/CharacterSprite";

interface SetupProps {
  view: SystemCrawlViewerState;
  players: PlayerView[];
  selfId: string;
  isHost: boolean;
  status: ConnectionStatus;
  commandPending: boolean;
  sendGame: (command: SystemCrawlCommand) => boolean;
}

export function SystemCrawlSetup({ view, players, selfId, isHost, status, commandPending, sendGame }: SetupProps) {
  const selected = view.classSelections[selfId] ?? [];
  const [draft, setDraft] = useState<SystemCrawlClassId[]>(selected);
  const solo = players.length === 1;
  const disabled = status !== "connected" || commandPending;
  const assignedElsewhere = new Set(Object.entries(view.classSelections).flatMap(([id, choices]) => id === selfId ? [] : choices));
  useEffect(() => setDraft(selected), [selected.join("|")]);

  const choose = (classId: SystemCrawlClassId) => {
    if (!solo) return void sendGame({ type: "select_class", classIds: [classId] });
    setDraft((current) => current.includes(classId)
      ? current.filter((candidate) => candidate !== classId)
      : current.length < 2 ? [...current, classId] : [current[1] as SystemCrawlClassId, classId]);
  };

  return <div className="sc-terminal sc-setup">
    <header className="sc-setup__header"><div><span>INCIDENT PROVISIONING / NODE 0</span><h1>Assemble the response team</h1><p>{solo ? "Choose two unique operators for a solo crawl." : "Choose one unique operator. Every class fills a different support role."}</p></div><ConnectionBadge status={status} pending={commandPending} /></header>
    <section className="sc-party-roster" aria-label="Class selections">{players.map((player) => {
      const choices = view.classSelections[player.id] ?? [];
      return <div key={player.id}><i className={choices.length ? "ready" : ""} /><strong>{player.displayName}{player.id === selfId ? " · YOU" : ""}</strong><span>{choices.length ? choices.map((id) => CLASS_DEFINITIONS[id].displayName).join(" + ") : "SELECTING…"}</span></div>;
    })}</section>
    <div className="sc-class-grid">{Object.values(CLASS_DEFINITIONS).map((definition) => {
      const active = (solo ? draft : selected).includes(definition.id);
      const assigned = assignedElsewhere.has(definition.id);
      return <button key={definition.id} type="button" aria-pressed={active} disabled={disabled || assigned} onClick={() => choose(definition.id)}>
        <span className="sc-class-state">{active ? "SELECTED" : assigned ? "ASSIGNED" : "AVAILABLE"}</span>
        <svg viewBox="0 0 24 34"><CharacterSprite classId={definition.id} displayName={definition.displayName} current={active} /></svg>
        <strong>{definition.displayName}</strong><small>{definition.maxHp} HP · {definition.movement} MOVE</small>
        <div className="sc-class-ability-label">Class abilities</div>
        <ul>{definition.abilityIds.map((id) => <li key={id}><strong>{ABILITY_DEFINITIONS[id].displayName}</strong><span>{ABILITY_PRESENTATION[id].impact}</span></li>)}</ul>
      </button>;
    })}</div>
    <footer className="sc-setup__actions">
      {solo && <button className="sc-command primary" type="button" disabled={disabled || draft.length !== 2 || sameChoices(draft, selected)} onClick={() => sendGame({ type: "select_class", classIds: draft })}>Save two operators</button>}
      {view.phase === "ready_to_start" && isHost && <button className="sc-command primary" type="button" disabled={disabled} onClick={() => sendGame({ type: "start_adventure" })}>Initialize adventure</button>}
      <p role="status">{view.phase === "ready_to_start" ? isHost ? "All operators are provisioned." : "Party ready. Waiting for the host to initialize." : "Waiting for every operator to finish selection."}</p>
    </footer>
  </div>;
}

export function ConnectionBadge({ status, pending }: { status: ConnectionStatus; pending: boolean }) {
  const label = pending ? "COMMAND PENDING" : status === "connected" ? "UPLINK ONLINE" : status === "reconnecting" ? "RECONNECTING" : "UPLINK OFFLINE";
  return <span className={`sc-connection ${status} ${pending ? "pending" : ""}`} role="status"><i />{label}</span>;
}

function sameChoices(a: readonly SystemCrawlClassId[], b: readonly SystemCrawlClassId[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}
