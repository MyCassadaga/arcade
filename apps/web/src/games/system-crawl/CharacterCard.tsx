import { CLASS_DEFINITIONS, ITEM_DEFINITIONS, type PublicCharacter } from "@team-arcade/games";
import { readableActionKey } from "./presentation";
import { CharacterSprite } from "./sprites/CharacterSprite";

interface CharacterCardProps {
  character: PublicCharacter;
  playerName: string;
  current: boolean;
  owned: boolean;
  selected: boolean;
  movementRemaining: number;
  onSelect?: () => void;
}

export function CharacterCard({ character, playerName, current, owned, selected, movementRemaining, onSelect }: CharacterCardProps) {
  const item = character.carriedItemId ? ITEM_DEFINITIONS[character.carriedItemId] : null;
  const statuses = statusLabels(character);
  const content = <>
    <div className="sc-character-card__sprite">
      <svg viewBox="0 0 48 52" aria-hidden="true"><CharacterSprite classId={character.classId} displayName={character.displayName} current={current} damaged={character.hp <= character.maxHp / 3} downed={character.downed} /></svg>
    </div>
    <div className="sc-character-card__identity">
      <span>{playerName}{owned ? " · YOU" : ""}</span>
      <strong>{CLASS_DEFINITIONS[character.classId].displayName}</strong>
      <small>{current ? "CURRENT CHARACTER" : character.downed ? "DOWN — RESTART REQUIRED" : owned ? "STANDBY" : "PARTY MEMBER"}</small>
    </div>
    <div className="sc-character-card__hp">
      <span>HP <b>{character.hp}/{character.maxHp}</b></span>
      <meter min={0} max={character.maxHp} value={character.hp} aria-label={`${character.hp} of ${character.maxHp} hit points`} />
    </div>
    <dl className="sc-character-card__stats">
      <div><dt>Move</dt><dd>{current ? movementRemaining : "—"}</dd></div>
      <div><dt>Shield</dt><dd>{character.statuses.firewallShield?.amount ?? 0}</dd></div>
      <div><dt>Item</dt><dd>{item?.displayName ?? "Empty"}</dd></div>
      <div><dt>Last action</dt><dd>{readableActionKey(character.lastActionKey)}</dd></div>
    </dl>
    <div className="sc-character-card__statuses" aria-label="Status effects">
      {statuses.length ? statuses.map((status) => <span key={status}>{status}</span>) : <span>Nominal</span>}
    </div>
    {character.lastActionKey && <p className="sc-lock-explanation"><b>{readableActionKey(character.lastActionKey)} locked.</b> Used last turn — choose another action or end the turn without acting to Reboot.</p>}
  </>;

  if (onSelect) {
    return <button type="button" className={`sc-character-card ${current ? "is-current" : ""} ${selected ? "is-selected" : ""}`} aria-pressed={selected} onClick={onSelect}>{content}</button>;
  }
  return <article className={`sc-character-card ${current ? "is-current" : ""} ${selected ? "is-selected" : ""}`}>{content}</article>;
}

function statusLabels(character: PublicCharacter): string[] {
  const labels: string[] = [];
  if (character.downed) labels.push("Downed");
  if (character.statuses.firewallShield) labels.push(`Firewall ${character.statuses.firewallShield.amount}`);
  if (character.statuses.dodgeNextAttack) labels.push("Dodge ready");
  if (character.statuses.movementBoostNextTurn) labels.push("Move boost queued");
  if (character.statuses.actionBlockedNextTurn) labels.push("Action blocked next turn");
  if (character.statuses.nextDamageBonus) labels.push(`+${character.statuses.nextDamageBonus} next damage`);
  return labels;
}
