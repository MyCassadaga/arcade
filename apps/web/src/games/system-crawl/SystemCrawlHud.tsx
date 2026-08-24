import { ITEM_DEFINITIONS, type SystemCrawlItemId, type SystemCrawlViewerState } from "@team-arcade/games";
import type { PlayerView, SystemCrawlCommand } from "@team-arcade/shared";
import type { ConnectionStatus } from "../../useRoomSocket";
import { AbilityPanel, type ActionSelection } from "./AbilityPanel";
import { CharacterCard } from "./CharacterCard";
import { EventLog } from "./EventLog";
import { ITEM_PRESENTATION } from "./presentation";

interface HudProps {
  view: SystemCrawlViewerState;
  players: PlayerView[];
  selfId: string;
  status: ConnectionStatus;
  commandPending: boolean;
  selectedCharacterId: string | null;
  selection: ActionSelection;
  onCharacterSelect: (id: string) => void;
  onSelection: (selection: ActionSelection) => void;
  sendGame: (command: SystemCrawlCommand) => boolean;
}

export function SystemCrawlHud(props: HudProps) {
  const { view, players, selfId, status, commandPending, selectedCharacterId, selection, onCharacterSelect, onSelection, sendGame } = props;
  const local = Object.values(view.characters).filter((character) => character.ownerPlayerId === selfId);
  const selected = view.characters[selectedCharacterId ?? ""] ?? local[0];
  const active = view.activeCharacterId ? view.characters[view.activeCharacterId] : undefined;
  const ownsCurrent = active?.ownerPlayerId === selfId && selected?.id === active.id;
  const commandReady = status === "connected" && !commandPending;
  const movementRemaining = Math.max(0, (view.turn?.movementAllowance ?? 0) - (view.turn?.movementSpent ?? 0));

  return <aside className="sc-hud" aria-label="Player control deck">
    <section className="sc-owned-characters" aria-labelledby="sc-operators-title"><header><h3 id="sc-operators-title">Your operators</h3><span>{local.length > 1 ? "SELECT TO INSPECT" : "LOCAL"}</span></header>
      <div>{local.map((character) => <CharacterCard key={character.id} character={character} playerName={playerName(players, character.ownerPlayerId)} current={character.id === view.activeCharacterId} owned selected={character.id === selected?.id} movementRemaining={character.id === view.activeCharacterId ? movementRemaining : 0} onSelect={() => onCharacterSelect(character.id)} />)}</div>
    </section>

    {view.phase === "resolving_choice" && view.pendingChoice ? <GoogleChoice view={view} players={players} selfId={selfId} commandReady={commandReady} sendGame={sendGame} /> : selected ? <AbilityPanel view={view} character={selected} ownsCurrent={ownsCurrent} commandReady={commandReady} selection={selection} onSelection={onSelection} sendGame={sendGame} /> : null}

    {active && <button className="sc-command sc-end-turn" type="button" disabled={!commandReady || !ownsCurrent || view.phase !== "player_turn"} onClick={() => sendGame({ type: "end_turn", characterId: active.id })}>{view.turn?.actionUsed ? "End Turn" : "End Turn and Reboot Abilities"}</button>}
    {!ownsCurrent && view.phase === "player_turn" && active && <p className="sc-waiting" role="status">Waiting for {playerName(players, active.ownerPlayerId)} to control {active.displayName}.</p>}
    <PartyStatus view={view} players={players} selfId={selfId} />
    <EventLog events={view.events} compact />
  </aside>;
}

function GoogleChoice({ view, players, selfId, commandReady, sendGame }: { view: SystemCrawlViewerState; players: PlayerView[]; selfId: string; commandReady: boolean; sendGame: (command: SystemCrawlCommand) => boolean }) {
  const choice = view.pendingChoice;
  if (!choice) return null;
  if (choice.ownerPlayerId !== selfId || !choice.candidateItemIds) return <section className="sc-private-choice"><span>PRIVATE QUERY</span><h3>Google It is resolving</h3><p role="status">Waiting for {playerName(players, choice.ownerPlayerId)} to select a private result. Candidate details remain hidden.</p></section>;
  return <section className="sc-private-choice"><span>PRIVATE QUERY / OWNER ONLY</span><h3>Choose the least suspicious result</h3><div>{choice.candidateItemIds.map((itemId) => <ChoiceItem key={itemId} itemId={itemId} disabled={!commandReady} onChoose={() => sendGame({ type: "resolve_choice", choiceId: choice.id, itemId })} />)}</div></section>;
}

function ChoiceItem({ itemId, disabled, onChoose }: { itemId: SystemCrawlItemId; disabled: boolean; onChoose: () => boolean }) {
  const item = ITEM_DEFINITIONS[itemId];
  const copy = ITEM_PRESENTATION[itemId];
  return <button type="button" disabled={disabled} onClick={onChoose}><span>{copy.rarity} · {copy.timing}</span><strong>{item.displayName}</strong><p>{copy.description}</p><small>KEEP THIS ITEM</small></button>;
}

function PartyStatus({ view, players, selfId }: { view: SystemCrawlViewerState; players: PlayerView[]; selfId: string }) {
  return <section className="sc-party-status" aria-labelledby="sc-party-title"><header><h3 id="sc-party-title">Party uplinks</h3><span>{Object.values(view.characters).filter((character) => !character.downed).length}/{Object.keys(view.characters).length} ONLINE</span></header><div>{Object.values(view.characters).map((character) => <div key={character.id} className={character.downed ? "is-downed" : character.id === view.activeCharacterId ? "is-current" : ""}><i /><span>{character.displayName}<small>{playerName(players, character.ownerPlayerId)}{character.ownerPlayerId === selfId ? " · YOU" : ""}</small></span><b>{character.hp}/{character.maxHp}</b></div>)}</div></section>;
}

function playerName(players: PlayerView[], id: string) {
  return players.find((player) => player.id === id)?.displayName ?? "Another player";
}
