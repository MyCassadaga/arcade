import { useEffect, useRef, useState } from "react";
import { CLASS_DEFINITIONS, type SystemCrawlPhase } from "@team-arcade/games";
import { ABILITY_PRESENTATION } from "./presentation";

const TUTORIAL_KEY = "team-arcade:system-crawl:tutorial-dismissed";

const tutorialSteps = [
  "Your team moves through four connected map cards.",
  "On your turn, move up to your movement value and perform one action.",
  "You cannot repeat the same action on your next turn.",
  "End a turn without acting to Reboot and clear the action lock.",
  "After every character acts, revealed enemies take their turns.",
  "Move onto caches to collect items.",
  "Adjacent allies can Restart a downed teammate.",
  "Defeat the boss on card 4."
] as const;

const statusRules = [
  ["Action blocked", "You may move, but cannot perform the normal action this turn."],
  ["Immobilized", "Movement is 0 for one turn; the normal action remains available."],
  ["Firewall", "Absorbs damage until depleted or the architect's next turn."],
  ["Stunned", "The enemy skips its next activation."],
  ["Ability lock", "One class ability is unavailable for the affected turn."],
  ["Damage bonus", "Adds damage to the next damaging action, then expires."]
] as const;

export function SystemCrawlHelp({ phase }: { phase: SystemCrawlPhase }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (phase !== "class_selection") return;
    try {
      if (window.localStorage.getItem(TUTORIAL_KEY) !== "1") setOpen(true);
    } catch {
      // Storage can be unavailable in hardened browsing modes; Help remains manually available.
    }
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const close = (remember = true) => {
    setOpen(false);
    if (!remember) return;
    try {
      window.localStorage.setItem(TUTORIAL_KEY, "1");
    } catch {
      // The preference is optional and never game authority.
    }
  };

  return <>
    <button className="sc-local-control" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">Rules &amp; tutorial</button>
    {open && <div className="sc-help-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) close();
    }}>
      <section className="sc-help-dialog" role="dialog" aria-modal="true" aria-labelledby="sc-help-title">
        <header><div><span>FIELD MANUAL / LOCAL VIEW</span><h2 id="sc-help-title">System Crawl rules</h2></div><button ref={closeRef} type="button" onClick={() => close()}>Close</button></header>
        <div className="sc-help-content">
          <section aria-labelledby="sc-tutorial-title"><h3 id="sc-tutorial-title">Eight-step tutorial</h3><ol>{tutorialSteps.map((step) => <li key={step}>{step}</li>)}</ol></section>
          <section aria-labelledby="sc-core-rules"><h3 id="sc-core-rules">Core loop</h3><dl>
            <div><dt>Turn</dt><dd>Move in one or more segments, then Attack or use one stronger class or item action in either order.</dd></div>
            <div><dt>Alternation</dt><dd>Your last non-movement action is locked next turn. Reboot by ending a turn without acting.</dd></div>
            <div><dt>Items</dt><dd>Carry one. Action items replace an action; free and passive items say when they apply.</dd></div>
            <div><dt>Downed</dt><dd>At 0 HP you stop acting. An adjacent ally may Restart User; everyone down means defeat unless a backup restores the party.</dd></div>
            <div><dt>Enemy phase</dt><dd>After every living character acts, every revealed living enemy activates in stable order.</dd></div>
            <div><dt>Cards</dt><dd>Reach the frontier exit to reveal the next node. Defeat the incident boss on card 4 to win.</dd></div>
          </dl></section>
          <section aria-labelledby="sc-class-reference"><h3 id="sc-class-reference">Classes</h3><div className="sc-help-classes">{Object.values(CLASS_DEFINITIONS).map((definition) => <article key={definition.id}><strong>{definition.displayName}</strong><span>{definition.maxHp} HP · {definition.movement} move</span><ul>{definition.abilityIds.map((id) => <li key={id}>{ABILITY_PRESENTATION[id].impact}</li>)}</ul></article>)}</div></section>
          <section aria-labelledby="sc-status-reference"><h3 id="sc-status-reference">Common statuses</h3><dl>{statusRules.map(([name, description]) => <div key={name}><dt>{name}</dt><dd>{description}</dd></div>)}</dl></section>
        </div>
      </section>
    </div>}
  </>;
}
