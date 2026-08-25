import { useState } from "react";
import {
  ABILITY_DEFINITIONS,
  CLASS_DEFINITIONS,
  ITEM_DEFINITIONS,
  getViewerValidAttackTargets,
  getViewerRestartTargets,
  getViewerValidAbilityTargets,
  getViewerValidItemTargets,
  type PublicCharacter,
  type SystemCrawlAbilityId,
  type SystemCrawlTarget,
  type SystemCrawlViewerState
} from "@team-arcade/games";
import type { SystemCrawlCommand } from "@team-arcade/shared";
import { ABILITY_PRESENTATION, ITEM_PRESENTATION } from "./presentation";

export type ActionSelection =
  | { kind: "attack"; label: string; targets: SystemCrawlTarget[] }
  | { kind: "ability"; abilityId: SystemCrawlAbilityId; label: string; targets: SystemCrawlTarget[] }
  | { kind: "item"; label: string; targets: SystemCrawlTarget[] }
  | { kind: "restart"; label: string; targetCharacterIds: string[] }
  | null;

interface AbilityPanelProps {
  view: SystemCrawlViewerState;
  character: PublicCharacter;
  ownsCurrent: boolean;
  commandReady: boolean;
  selection: ActionSelection;
  onSelection: (selection: ActionSelection) => void;
  sendGame: (command: SystemCrawlCommand) => boolean;
}

export function AbilityPanel({ view, character, ownsCurrent, commandReady, selection, onSelection, sendGame }: AbilityPanelProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const definition = CLASS_DEFINITIONS[character.classId];
  const canSpendAction = ownsCurrent && view.phase === "player_turn" && !character.downed && !view.turn?.actionBlocked && !view.turn?.actionUsed && commandReady;
  const attackTargets = getViewerValidAttackTargets(view, character.id);
  const restartTargets = getViewerRestartTargets(view, character.id);
  const attackRepeated = character.lastActionKey === "system:attack";
  const attackReason = standardAttackUnavailableReason({ view, character, ownsCurrent, commandReady, repeated: attackRepeated, targets: attackTargets });

  return <section className="sc-ability-panel" aria-labelledby="sc-ability-title">
    <header><div><span>ACTION MATRIX</span><h3 id="sc-ability-title">Actions</h3></div>{selection && <button type="button" className="sc-cancel-target" onClick={() => onSelection(null)}>Cancel targeting <kbd>Esc</kbd></button>}</header>
    <h3 className="sc-section-label">Standard action</h3>
    <button type="button" className={`sc-wide-action sc-basic-attack ${selection?.kind === "attack" ? "is-selected" : ""}`} aria-pressed={selection?.kind === "attack"} disabled={Boolean(attackReason)} onClick={() => onSelection({ kind: "attack", label: "Attack", targets: attackTargets })}>
      <strong>Attack</strong><span>Strike one adjacent hostile process for 1 damage.</span><small>RANGE 1 · 1 DAMAGE · UNIVERSAL</small>
      {attackReason && <em>{attackReason}</em>}
    </button>

    <h3 className="sc-section-label">Class abilities</h3>
    <div className="sc-ability-list">{definition.abilityIds.map((abilityId) => {
      const ability = ABILITY_DEFINITIONS[abilityId];
      const targets = getViewerValidAbilityTargets(view, character.id, abilityId);
      const repeated = character.lastActionKey === `ability:${abilityId}` && character.statuses.repeatOverrideAbilityId !== abilityId;
      const reason = unavailableReason({ view, character, ownsCurrent, commandReady, repeated, targets, abilityId });
      const active = selection?.kind === "ability" && selection.abilityId === abilityId;
      return <button key={abilityId} type="button" className={active ? "is-selected" : ""} aria-pressed={active} disabled={Boolean(reason)} onClick={() => onSelection({ kind: "ability", abilityId, label: ability.displayName, targets })}>
        <span className="sc-action-code">{String(definition.abilityIds.indexOf(abilityId) + 1).padStart(2, "0")}</span>
        <strong>{ability.displayName}</strong><span>{ABILITY_PRESENTATION[abilityId].description}</span>
        <small>RANGE {ability.range} · {ABILITY_PRESENTATION[abilityId].impact}</small>
        {reason && <em>{reason}</em>}
      </button>;
    })}</div>

    <h3 className="sc-section-label">Recovery</h3>
    <button type="button" className={`sc-wide-action ${selection?.kind === "restart" ? "is-selected" : ""}`} disabled={!canSpendAction || restartTargets.length === 0 || character.lastActionKey === "system:restart-user"} onClick={() => onSelection({ kind: "restart", label: "Restart User", targetCharacterIds: restartTargets })}>
      <strong>Restart User</strong><span>Bring a valid downed ally back online.</span><small>{restartTargets.length ? `${restartTargets.length} VALID TARGET${restartTargets.length === 1 ? "" : "S"}` : "NO DOWNED ALLY IN RANGE"}</small>
    </button>

    <h3 className="sc-section-label">Carried item</h3>
    {character.carriedItemId ? <ItemControl character={character} view={view} canSpendAction={canSpendAction} selection={selection} onSelection={onSelection} confirmDiscard={confirmDiscard} setConfirmDiscard={setConfirmDiscard} sendGame={sendGame} /> : <div className="sc-empty-item">ITEM SLOT / EMPTY</div>}
  </section>;
}

function ItemControl({ character, view, canSpendAction, selection, onSelection, confirmDiscard, setConfirmDiscard, sendGame }: {
  character: PublicCharacter;
  view: SystemCrawlViewerState;
  canSpendAction: boolean;
  selection: ActionSelection;
  onSelection: (selection: ActionSelection) => void;
  confirmDiscard: boolean;
  setConfirmDiscard: (value: boolean) => void;
  sendGame: (command: SystemCrawlCommand) => boolean;
}) {
  const itemId = character.carriedItemId;
  if (!itemId) return null;
  const item = ITEM_DEFINITIONS[itemId];
  const copy = ITEM_PRESENTATION[itemId];
  const targets = getViewerValidItemTargets(view, character.id);
  const passive = item.effect === "passive";
  const free = item.effect === "free";
  const repeated = character.lastActionKey === `item:${itemId}`;
  const selected = selection?.kind === "item";
  return <article className={`sc-item-card rarity-${copy.rarity.toLowerCase()}`}>
    <header><span>◈ {copy.rarity}</span><strong>{item.displayName}</strong><small>{copy.timing}</small></header>
    <p>{copy.description}</p>
    <div>
      {!passive && itemId === "stack-overflow-answer" ? targets.map((target) => target.type === "ability" ? <button key={target.abilityId} type="button" disabled={!canSpendAction || view.turn?.freeItemUsed} onClick={() => sendGame({ type: "use_item", characterId: character.id, target })}>Unlock {ABILITY_DEFINITIONS[target.abilityId].displayName}</button> : null) : null}
      {!passive && itemId !== "stack-overflow-answer" && <button type="button" aria-pressed={selected} disabled={!canSpendAction || (!free && repeated) || targets.length === 0} onClick={() => onSelection({ kind: "item", label: item.displayName, targets })}>{selected ? "Targeting…" : "Use item"}</button>}
      {passive && <span className="sc-passive-label">PASSIVE / AUTOMATIC</span>}
      {!confirmDiscard ? <button type="button" className="sc-discard" disabled={!canSpendAction} onClick={() => copy.rarity === "Rare" || copy.rarity === "Legendary" ? setConfirmDiscard(true) : sendGame({ type: "discard_item", characterId: character.id })}>Discard</button> : <span className="sc-discard-confirm" role="group" aria-label={`Confirm discard ${item.displayName}`}><b>Discard valuable item?</b><button type="button" onClick={() => sendGame({ type: "discard_item", characterId: character.id })}>Confirm</button><button type="button" onClick={() => setConfirmDiscard(false)}>Keep</button></span>}
    </div>
    {repeated && <em>Used last turn — choose another action or end the turn without acting to Reboot.</em>}
  </article>;
}

function unavailableReason({ view, character, ownsCurrent, commandReady, repeated, targets, abilityId }: {
  view: SystemCrawlViewerState;
  character: PublicCharacter;
  ownsCurrent: boolean;
  commandReady: boolean;
  repeated: boolean;
  targets: readonly SystemCrawlTarget[];
  abilityId: SystemCrawlAbilityId;
}): string | null {
  if (!ownsCurrent || view.phase !== "player_turn") return "Wrong turn";
  if (!commandReady) return "Command pending or uplink unavailable";
  if (character.downed) return "Character is downed";
  if (view.turn?.actionBlocked) return "Action blocked by negative status";
  if (view.turn?.actionUsed) return "Action already spent";
  if (character.statuses.lockedAbilityId === abilityId) return "Temporarily locked by Strategic Realignment";
  if (repeated) return "Used last turn — Reboot or choose another action";
  if (abilityId === "google-it" && character.carriedItemId) return "Required item slot condition — discard the carried item first";
  if (targets.length === 0) return "No valid target";
  return null;
}

function standardAttackUnavailableReason({ view, character, ownsCurrent, commandReady, repeated, targets }: {
  view: SystemCrawlViewerState;
  character: PublicCharacter;
  ownsCurrent: boolean;
  commandReady: boolean;
  repeated: boolean;
  targets: readonly SystemCrawlTarget[];
}): string | null {
  if (!ownsCurrent || view.phase !== "player_turn") return "Available on this operator's turn";
  if (!commandReady) return "Command pending or uplink unavailable";
  if (character.downed) return "Character is downed";
  if (view.turn?.actionBlocked) return "Action blocked by negative status";
  if (view.turn?.actionUsed) return "Action already spent";
  if (repeated) return "Used last turn — choose a class ability or Reboot";
  if (targets.length === 0) return "Move adjacent to an enemy to Attack";
  return null;
}
