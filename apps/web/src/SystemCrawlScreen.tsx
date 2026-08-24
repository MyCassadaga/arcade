import { useEffect, useMemo, useState } from "react";
import {
  ABILITY_DEFINITIONS,
  CLASS_DEFINITIONS,
  ITEM_DEFINITIONS,
  getViewerReachableMovementTiles,
  getViewerRestartTargets,
  getViewerValidAbilityTargets,
  getViewerValidItemTargets,
  positionKey,
  type Position,
  type SystemCrawlClassId,
  type SystemCrawlTarget,
  type SystemCrawlViewerState
} from "@team-arcade/games";
import type { PlayerView, SystemCrawlCommand } from "@team-arcade/shared";
import type { ConnectionStatus } from "./useRoomSocket";

interface SystemCrawlScreenProps {
  view: SystemCrawlViewerState;
  players: PlayerView[];
  selfId: string;
  isHost: boolean;
  status: ConnectionStatus;
  commandPending: boolean;
  sendGame: (command: SystemCrawlCommand) => boolean;
  playAgain: () => boolean;
  backToArcade: () => boolean;
}

export function SystemCrawlScreen(props: SystemCrawlScreenProps) {
  const { view } = props;
  if (view.phase === "class_selection" || view.phase === "ready_to_start") {
    return <ClassSelection {...props} />;
  }
  if (view.phase === "victory" || view.phase === "defeat") {
    return <CrawlResults {...props} />;
  }
  return <Adventure {...props} />;
}

function ClassSelection({
  view,
  selfId,
  isHost,
  status,
  commandPending,
  sendGame
}: SystemCrawlScreenProps) {
  const currentSelection = view.classSelections[selfId] ?? [];
  const [soloDraft, setSoloDraft] = useState<SystemCrawlClassId[]>(currentSelection);
  const isSolo = view.players.length === 1;
  const unavailable = new Set(
    Object.entries(view.classSelections).flatMap(([playerId, classIds]) => playerId === selfId ? [] : classIds)
  );
  const disabled = status !== "connected" || commandPending;

  useEffect(() => setSoloDraft(currentSelection), [currentSelection.join("|")]);

  const chooseClass = (classId: SystemCrawlClassId) => {
    if (isSolo) {
      setSoloDraft((draft) => draft.includes(classId)
        ? draft.filter((candidate) => candidate !== classId)
        : draft.length < 2 ? [...draft, classId] : [draft[1] as SystemCrawlClassId, classId]);
      return;
    }
    sendGame({ type: "select_class", classIds: [classId] });
  };

  return (
    <div className="sc-shell sc-selection">
      <header className="sc-heading">
        <p>Party provisioning</p>
        <h2>Choose your support class{isSolo ? "es" : ""}</h2>
        <span>{isSolo ? "A solo operator owns two unique characters." : "Each operator owns one unique character."}</span>
      </header>

      <div className="sc-roster" aria-label="Class selections">
        {view.players.map((player) => {
          const selected = view.classSelections[player.id] ?? [];
          return (
            <div key={player.id}>
              <strong>{player.displayName}{player.id === selfId ? " (you)" : ""}</strong>
              <span>{selected.length > 0 ? selected.map(className).join(" + ") : "Choosing…"}</span>
            </div>
          );
        })}
      </div>

      <div className="sc-class-grid">
        {Object.values(CLASS_DEFINITIONS).map((definition) => {
          const selected = (isSolo ? soloDraft : currentSelection).includes(definition.id);
          return (
            <button
              key={definition.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled || unavailable.has(definition.id)}
              onClick={() => chooseClass(definition.id)}
            >
              <span>{selected ? "Selected" : unavailable.has(definition.id) ? "Assigned" : "Available"}</span>
              <strong>{definition.displayName}</strong>
              <small>{definition.maxHp} HP · {definition.movement} movement</small>
              <ul>{definition.abilityIds.map((abilityId) => <li key={abilityId}>{ABILITY_DEFINITIONS[abilityId].displayName}</li>)}</ul>
            </button>
          );
        })}
      </div>

      {isSolo && (
        <button
          className="primary-button sc-primary"
          type="button"
          disabled={disabled || soloDraft.length !== 2 || sameClasses(soloDraft, currentSelection)}
          onClick={() => sendGame({ type: "select_class", classIds: soloDraft })}
        >
          Save two classes
        </button>
      )}

      {view.phase === "ready_to_start"
        ? isHost
          ? <button className="primary-button sc-primary" type="button" disabled={disabled} onClick={() => sendGame({ type: "start_adventure" })}>Start adventure</button>
          : <Status text="Party ready. Waiting for the host to start the adventure." />
        : <Status text="Waiting for every operator to finish class selection." />}
    </div>
  );
}

function Adventure({ view, players, selfId, status, commandPending, sendGame }: SystemCrawlScreenProps) {
  const activeCharacter = view.activeCharacterId ? view.characters[view.activeCharacterId] : undefined;
  const ownsActiveCharacter = activeCharacter?.ownerPlayerId === selfId;
  const connected = status === "connected";
  const commandReady = connected && !commandPending;
  const turnReady = view.phase === "player_turn" && Boolean(activeCharacter && ownsActiveCharacter && !activeCharacter.downed);
  const canAct = commandReady && turnReady && view.turn?.actionUsed === false && view.turn.actionBlocked === false;
  const canMove = commandReady && turnReady;
  const reachable = useMemo(
    () => activeCharacter && canMove ? getViewerReachableMovementTiles(view, activeCharacter.id) : [],
    [activeCharacter, canMove, view]
  );
  const reachableKeys = new Set(reachable.map(positionKey));
  const localCharacters = Object.values(view.characters).filter((character) => character.ownerPlayerId === selfId);

  if (view.phase === "resolving_choice" && view.pendingChoice) {
    const ownsChoice = view.pendingChoice.ownerPlayerId === selfId;
    return (
      <div className="sc-shell">
        <header className="sc-heading"><p>Google It</p><h2>Pick the least suspicious result</h2></header>
        {ownsChoice && view.pendingChoice.candidateItemIds
          ? <div className="sc-choice-list">{view.pendingChoice.candidateItemIds.map((itemId) => (
              <button
                key={itemId}
                type="button"
                disabled={!commandReady}
                onClick={() => sendGame({ type: "resolve_choice", choiceId: view.pendingChoice?.id ?? "", itemId })}
              >
                <strong>{ITEM_DEFINITIONS[itemId].displayName}</strong>
                <span>Add this item to your inventory</span>
              </button>
            ))}</div>
          : <Status text={`Waiting for ${playerName(players, view.pendingChoice.ownerPlayerId)} to resolve a private item choice.`} />}
        <EventLog view={view} />
      </div>
    );
  }

  return (
    <div className="sc-shell">
      <header className="sc-heading sc-adventure-heading">
        <div><p>Incident in progress</p><h2>Round {view.round}</h2></div>
        <div className="sc-turn-chip">
          <span>Current turn</span>
          <strong>{activeCharacter?.displayName ?? (view.phase === "enemy_phase" ? "Enemies" : "Resolving…")}</strong>
        </div>
      </header>

      {!connected && <Status text="Controls are paused while this device reconnects." />}
      {commandPending && <Status text="Applying your command on the server…" />}
      {view.phase === "enemy_phase" && <Status text="Enemy services are running their phase." />}
      {view.phase === "player_turn" && activeCharacter && !ownsActiveCharacter && (
        <Status text={`${playerName(players, activeCharacter.ownerPlayerId)} controls ${activeCharacter.displayName}.`} />
      )}

      <div className="sc-adventure-layout">
        <section className="sc-board-panel" aria-labelledby="sc-map-title">
          <div className="sc-panel-heading"><h3 id="sc-map-title">System map</h3><span>{view.revealedCardCount}/{view.maps.length} sectors revealed</span></div>
          <div className="sc-map-strip">
            {view.maps.map((map) => map.revealed && map.terrain
              ? <MapCard
                  key={map.cardIndex}
                  map={map}
                  view={view}
                  reachableKeys={reachableKeys}
                  canMove={canMove}
                  onMove={(destination) => activeCharacter && sendGame({ type: "move_to", characterId: activeCharacter.id, destination })}
                />
              : <div className="sc-map-card sc-map-hidden" key={map.cardIndex}><span>Sector {map.cardIndex + 1}</span><strong>Not discovered</strong></div>)}
          </div>
        </section>

        <aside className="sc-control-panel">
          <div className="sc-panel-heading"><h3>Your characters</h3><span>{localCharacters.length} assigned</span></div>
          <div className="sc-character-list">
            {localCharacters.map((character) => (
              <article className={character.id === view.activeCharacterId ? "active" : ""} key={character.id}>
                <div><strong>{character.displayName}</strong><span>{className(character.classId)}</span></div>
                <meter min={0} max={character.maxHp} value={character.hp} aria-label={`${character.hp} of ${character.maxHp} hit points`} />
                <small>{character.hp}/{character.maxHp} HP · {character.carriedItemId ? ITEM_DEFINITIONS[character.carriedItemId].displayName : "No item"}{character.downed ? " · Down" : ""}</small>
              </article>
            ))}
          </div>

          {activeCharacter && ownsActiveCharacter && view.phase === "player_turn" && (
            <TurnControls
              view={view}
              characterId={activeCharacter.id}
              canAct={canAct}
              commandReady={commandReady}
              sendGame={sendGame}
            />
          )}
        </aside>
      </div>
      <EventLog view={view} />
    </div>
  );
}

function MapCard({
  map,
  view,
  reachableKeys,
  canMove,
  onMove
}: {
  map: SystemCrawlViewerState["maps"][number];
  view: SystemCrawlViewerState;
  reachableKeys: Set<string>;
  canMove: boolean;
  onMove: (position: Position) => boolean | undefined;
}) {
  return (
    <div className="sc-map-card">
      <header><strong>{map.displayName}</strong><span>{map.role}</span></header>
      <div className="sc-tile-grid" role="grid" aria-label={`${map.displayName} map`}>
        {map.terrain?.flatMap((row, y) => [...row].map((terrain, x) => {
          const position = { cardIndex: map.cardIndex, x, y };
          const key = positionKey(position);
          const reachable = reachableKeys.has(key);
          const characters = Object.values(view.characters).filter((character) => positionKey(character.position) === key);
          const enemies = Object.values(view.enemies).filter((enemy) => enemy.hp > 0 && positionKey(enemy.position) === key);
          const door = map.doors?.find((candidate) => positionKey(candidate.position) === key);
          const cache = map.caches?.find((candidate) => !candidate.pickedUp && positionKey(candidate.position) === key);
          const prop = map.props?.find((candidate) => candidate.position.x === x && candidate.position.y === y);
          const exit = map.exit?.x === x && map.exit.y === y;
          const labelParts = [
            `sector ${map.cardIndex + 1}, ${x + 1}, ${y + 1}`,
            terrain === "#" ? "wall" : "floor",
            ...characters.map((character) => character.displayName),
            ...enemies.map((enemy) => enemy.displayName),
            door ? (door.open ? "open door" : "locked door") : "",
            cache ? "item cache" : "",
            prop?.kind ?? "",
            exit ? "exit" : "",
            reachable ? "valid move" : ""
          ].filter(Boolean).join(", ");
          return (
            <button
              type="button"
              role="gridcell"
              key={key}
              aria-label={labelParts}
              className={`sc-tile ${terrain === "#" ? "wall" : "floor"} ${reachable ? "reachable" : ""}`}
              disabled={!canMove || !reachable}
              onClick={() => onMove(position)}
            >
              {exit && <span className="sc-exit">EXIT</span>}
              {prop && <span className="sc-prop">P</span>}
              {door && <span className="sc-door">{door.open ? "□" : "■"}</span>}
              {cache && <span className="sc-cache">?</span>}
              {enemies.map((enemy) => <span className="sc-enemy" key={enemy.id}>E</span>)}
              {characters.map((character) => <span className="sc-character" key={character.id}>{character.displayName.slice(0, 1)}</span>)}
            </button>
          );
        }))}
      </div>
    </div>
  );
}

function TurnControls({
  view,
  characterId,
  canAct,
  commandReady,
  sendGame
}: {
  view: SystemCrawlViewerState;
  characterId: string;
  canAct: boolean;
  commandReady: boolean;
  sendGame: (command: SystemCrawlCommand) => boolean;
}) {
  const character = view.characters[characterId];
  if (!character) return null;
  const definition = CLASS_DEFINITIONS[character.classId];
  const itemTargets = getViewerValidItemTargets(view, characterId);
  const restartTargets = getViewerRestartTargets(view, characterId);
  return (
    <div className="sc-turn-controls" aria-label={`${character.displayName} controls`}>
      <div className="sc-turn-stats">
        <span>Movement <strong>{Math.max(0, (view.turn?.movementAllowance ?? 0) - (view.turn?.movementSpent ?? 0))}</strong></span>
        <span>Action <strong>{view.turn?.actionBlocked ? "Blocked" : view.turn?.actionUsed ? "Used" : "Ready"}</strong></span>
      </div>

      <h4>Abilities</h4>
      {definition.abilityIds.map((abilityId) => {
        const targets = getViewerValidAbilityTargets(view, characterId, abilityId);
        const repeated = character.lastActionKey === `ability:${abilityId}`;
        return (
          <div className="sc-action" key={abilityId}>
            <strong>{ABILITY_DEFINITIONS[abilityId].displayName}</strong>
            <div>{targets.map((target) => (
              <button
                type="button"
                key={targetKey(target)}
                disabled={!canAct || repeated}
                onClick={() => sendGame({ type: "use_ability", characterId, abilityId, target })}
              >
                {targetLabel(view, target)}
              </button>
            ))}</div>
            {targets.length === 0 && <small>No valid targets</small>}
            {repeated && <small>Last action cannot repeat</small>}
          </div>
        );
      })}

      <h4>Inventory</h4>
      {character.carriedItemId ? (
        <div className="sc-action">
          <strong>{ITEM_DEFINITIONS[character.carriedItemId].displayName}</strong>
          <div>{itemTargets.map((target) => (
            <button
              type="button"
              key={targetKey(target)}
              disabled={!canAct || character.lastActionKey === `item:${character.carriedItemId}`}
              onClick={() => sendGame({ type: "use_item", characterId, target })}
            >Use on {targetLabel(view, target)}</button>
          ))}</div>
          {itemTargets.length === 0 && <small>{ITEM_DEFINITIONS[character.carriedItemId].effect === "passive" ? "Passive item" : "No valid targets"}</small>}
          <button type="button" disabled={!canAct} onClick={() => sendGame({ type: "discard_item", characterId })}>Discard item</button>
        </div>
      ) : <small>No item carried</small>}

      {restartTargets.length > 0 && (
        <div className="sc-action">
          <strong>Restart User</strong>
          <div>{restartTargets.map((targetCharacterId) => (
            <button
              type="button"
              key={targetCharacterId}
              disabled={!canAct || character.lastActionKey === "system:restart-user"}
              onClick={() => sendGame({ type: "restart_user", characterId, targetCharacterId })}
            >Revive {view.characters[targetCharacterId]?.displayName}</button>
          ))}</div>
        </div>
      )}

      <button
        className="primary-button sc-end-turn"
        type="button"
        disabled={!commandReady}
        onClick={() => sendGame({ type: "end_turn", characterId })}
      >Reboot / End turn</button>
    </div>
  );
}

function CrawlResults({ view, isHost, status, commandPending, playAgain, backToArcade }: SystemCrawlScreenProps) {
  const won = view.phase === "victory";
  const disabled = status !== "connected" || commandPending;
  return (
    <div className={`sc-shell sc-results ${won ? "victory" : "defeat"}`}>
      <header className="sc-heading">
        <p>Adventure complete</p>
        <h2>{won ? "Production stabilized" : "Incident unresolved"}</h2>
        <span>{won ? `The party cleared the system in ${view.round} rounds.` : `The party was overwhelmed in round ${view.round}.`}</span>
      </header>
      <EventLog view={view} />
      {isHost
        ? <div className="sc-result-actions"><button className="primary-button" type="button" disabled={disabled} onClick={playAgain}>Play again</button><button className="secondary-button" type="button" disabled={disabled} onClick={backToArcade}>Back to arcade</button></div>
        : <Status text="The host can provision another run or return to the arcade." />}
    </div>
  );
}

function EventLog({ view }: { view: SystemCrawlViewerState }) {
  const events = view.events.slice(-20).reverse();
  return (
    <section className="sc-event-log" aria-labelledby="sc-events-title">
      <div className="sc-panel-heading"><h3 id="sc-events-title">Event stream</h3><span>Latest {events.length}</span></div>
      {events.length === 0 ? <p>No events yet.</p> : <ol>{events.map((event) => (
        <li key={event.id}><span>R{event.round}</span><strong>{event.type.replaceAll("_", " ")}</strong></li>
      ))}</ol>}
    </section>
  );
}

function Status({ text }: { text: string }) {
  return <div className="sc-status" role="status">{text}</div>;
}

function className(classId: SystemCrawlClassId): string {
  return CLASS_DEFINITIONS[classId].displayName;
}

function playerName(players: PlayerView[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.displayName ?? "Another player";
}

function sameClasses(left: readonly SystemCrawlClassId[], right: readonly SystemCrawlClassId[]): boolean {
  return left.length === right.length && left.every((classId) => right.includes(classId));
}

function targetKey(target: SystemCrawlTarget): string {
  if (target.type === "position") return `position:${positionKey(target.position)}`;
  if (target.type === "load_balancer") return `load:${target.characterId}:${positionKey(target.destination)}`;
  if (target.type === "character") return `character:${target.characterId}`;
  if (target.type === "enemy") return `enemy:${target.enemyId}`;
  return `door:${target.doorId}`;
}

function targetLabel(view: SystemCrawlViewerState, target: SystemCrawlTarget): string {
  if (target.type === "character") return view.characters[target.characterId]?.displayName ?? "character";
  if (target.type === "enemy") return view.enemies[target.enemyId]?.displayName ?? "enemy";
  if (target.type === "door") return `door ${target.doorId.split(":").at(-1) ?? ""}`;
  if (target.type === "position") return `tile ${target.position.x + 1},${target.position.y + 1}`;
  const character = view.characters[target.characterId]?.displayName ?? "character";
  return `${character} to ${target.destination.x + 1},${target.destination.y + 1}`;
}
