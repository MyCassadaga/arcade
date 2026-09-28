import { useEffect, useRef, useState } from "react";
import type { GameCommand, PlayerView, StarGardenEffect, StarGardenGoal, StarGardenMode, StarKind, TypedGameViewerState } from "@team-arcade/shared";
import { STAR_GARDEN_ACTIONS, STAR_GARDEN_GOALS, matchStarGardenGoal, previewStarGardenAction, refillStars, starGardenMatches } from "@team-arcade/games/star-garden";
import { readStarGardenHistory, recordStarGardenResult } from "./star-garden-history";
import { ActionArt, CelestialPiece } from "./StarGardenArt";
import "./star-garden.css";

type View = Extract<TypedGameViewerState, { gameId: "star-garden" }>;
interface Props { game: View; players: PlayerView[]; isHost: boolean; connected: boolean; commandPending: boolean; sendGame: (command: GameCommand) => boolean; playAgain: () => boolean; backToArcade: () => boolean; changedCells?: number[] }
const KINDS = [{ name: "gold circle", glyph: "●" }, { name: "teal diamond", glyph: "◆" }, { name: "pink triangle", glyph: "▲" }, { name: "violet crescent", glyph: "☾" }] as const;
const MODE_NAMES = { daily: "Daily", practice: "Solo Practice", cup: "Constellation Cup" };
export function StarGardenScreen(props: Props) {
  const { game, players, isHost, connected, commandPending, sendGame, playAgain, backToArcade } = props;
  const v = game.public, p = game.private;
  const shell = useRef<HTMLDivElement>(null);
  const focusWasInPlay = useRef(false);
  const previous = useRef({ instance: v.gameInstanceId, player: p });
  const [feedback, setFeedback] = useState({ message: "", cells: [] as number[] });
  useEffect(() => {
    const old = previous.current;
    previous.current = { instance: v.gameInstanceId, player: p };
    if (old.instance !== v.gameInstanceId) { setFeedback({ message: "", cells: [] }); return; }
    if (old.player.revision === p.revision && old.player.score === p.score) return;
    if (focusWasInPlay.current && document.activeElement === document.body) {
      shell.current?.querySelector<HTMLButtonElement>(".sg-card-list button:not(:disabled), .sg-goal:not(:disabled), .sg-secondary button:not(:disabled), .sg-result button:not(:disabled)")?.focus({ preventScroll: true });
    }
    const spent = p.actionsSpent - old.player.actionsSpent;
    const played = old.player.hand.find((c) => !p.hand.some((next) => next.id === c.id));
    const points = p.score - old.player.score;
    const message = points > 0 ? `+${points} points · constellation discovered` : spent >= 3 ? "Garden refreshed · 3 actions spent" : spent > 0 && played ? `${STAR_GARDEN_ACTIONS.find((a) => a.id === played.action)!.name} played · 1 action spent` : "";
    // Feedback observes accepted, visible snapshots only; it never predicts a draw.
    setFeedback({ message, cells: p.board.flatMap((kind, cell) => old.player.board[cell] !== kind ? [cell] : []) });
  }, [v.gameInstanceId, p]);
  useEffect(() => {
    if (!feedback.message && !feedback.cells.length) return;
    const timer = window.setTimeout(() => setFeedback({ message: "", cells: [] }), 1600);
    return () => window.clearTimeout(timer);
  }, [feedback]);
  const [mode, setMode] = useState<StarGardenMode>("daily");
  const [tutorial, setTutorial] = useState(false);
  const [share, setShare] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [history, setHistory] = useState(() => v.dailyDate ? readStarGardenHistory(v.dailyDate) : null);
  useEffect(() => { if (v.deadlineAt === null) return; const timer = window.setInterval(() => setClock(Date.now()), 250); return () => clearInterval(timer); }, [v.deadlineAt]);
  useEffect(() => {
    if (!v.dailyDate) { setHistory(null); return; }
    const saved = game.phase === "gameResults" ? recordStarGardenResult(v.dailyDate, { instance: v.gameInstanceId, score: p.score, goals: p.goalsClaimed, actions: p.actionsSpent }) : readStarGardenHistory(v.dailyDate);
    setHistory(saved);
  }, [game.phase, v.dailyDate, v.gameInstanceId, p.score, p.goalsClaimed, p.actionsSpent]);
  const replay = v.mode === "daily" && history !== null && history.first.instance !== v.gameInstanceId;
  const blocked = !connected || commandPending;
  const identity = { gameInstanceId: v.gameInstanceId, roundNumber: v.roundNumber, expectedRevision: p.revision };
  const shareResult = async () => {
    const text = `Star Garden ${v.mode ? MODE_NAMES[v.mode] : ""}${v.dailyDate ? ` ${v.dailyDate}` : ""}${replay ? " · Replay" : ""} · v1 | ${p.score} points | ${p.goalsClaimed}/30 constellations | ${p.actionsSpent} actions`;
    setShare(text);
    try { await navigator.clipboard.writeText(text); setCopyMessage("Copied!"); } catch { setCopyMessage("Select the text below and copy it manually."); }
  };
  const name = (id: string) => players.find((person) => person.id === id)?.displayName ?? "Player";
  return <div ref={shell} onFocusCapture={(event) => { focusWasInPlay.current = Boolean((event.target as HTMLElement).closest(".sg-table")); }} className={`sg-shell ${game.phase !== "setup" ? "sg-active" : ""}`}>
    <header className="sg-header"><div><p className="sg-eyebrow">Team Arcade · a little room to wonder</p><h1>Star Garden <span aria-hidden="true">✦</span></h1><p>{v.mode ? MODE_NAMES[v.mode] : "Arrange. Discover. Let the stars flow."}{v.dailyDate && ` · ${v.dailyDate}`}{replay && " · Replay"} <small>v1</small></p></div>
      {v.mode === "cup" && <div className="sg-timer" aria-label={`Round ${v.roundNumber} of 6`}><strong>{v.roundNumber}<small>/6</small></strong><span>{game.phase === "gameResults" ? "Cup complete" : `${game.phase === "reveal" ? "Next round" : "Time left"} ${Math.max(0, Math.ceil(((v.deadlineAt ?? clock) - clock) / 1000))}s`}</span></div>}
    </header>
    {game.phase === "setup" ? <section className="sg-setup"><div className="sg-orbit" aria-hidden="true">✧ <b>✦</b> ✧</div><h2>Your corner of the cosmos</h2><p>Arrange ten stars with your cards. Claim a constellation, watch the stars flow, and discover what arrives next.</p>
      {v.roster.length === 1 ? <fieldset disabled={blocked || !isHost}><legend>Choose your run</legend><label><input type="radio" name="sg-mode" checked={mode === "daily"} onChange={() => setMode("daily")} /> Daily <small>The same sky for everyone, each UTC day.</small></label><label><input type="radio" name="sg-mode" checked={mode === "practice"} onChange={() => setMode("practice")} /> Solo Practice <small>A fresh sky every time.</small></label></fieldset> : <p><strong>Constellation Cup · {v.roster.length} players</strong><br />Six rounds. 75 seconds each. Three actions and one claim per round. Your garden stays private.</p>}
      {isHost ? <button className="sg-primary" disabled={blocked} onClick={() => sendGame({ type: "starGarden.begin", ...identity, mode: v.roster.length === 1 ? mode : "cup" })}>Begin</button> : <p>Waiting for the host to Begin.</p>}
      <button onClick={() => setTutorial(!tutorial)}>{tutorial ? "Close tutorial" : "Try the short tutorial"}</button>
      {tutorial && <StarGardenTutorial />}
      {isHost && <button disabled={blocked} onClick={backToArcade}>Back to arcade</button>}
    </section> : <>
      <div className="sg-stats" aria-label="Your progress"><span><strong key={p.score} className="sg-score">{p.score}</strong> points</span><span><strong>{p.goalsClaimed}</strong>/{v.mode === "cup" ? 6 : 30}<span className="sg-stat-long"> constellations</span><span className="sg-stat-short"> goals</span></span><span><strong>{p.actionsSpent}</strong> <span className="sg-stat-long">actions spent</span><span className="sg-stat-short">actions</span></span><span><strong>{p.hand.length}</strong>/5 cards{v.mode === "cup" && ` · ${p.remainingActions}/3 actions left`}</span></div>
      {game.phase === "playing" && !p.done ? <StarGardenPlay key={`${v.gameInstanceId}:${p.revision}:${v.roundNumber}:${connected}`} {...props} changedCells={feedback.cells} /> : <>
        {game.phase !== "gameResults" && <section className="sg-notice" role="status"><h2>{game.phase === "reveal" ? `Round ${v.roundNumber} revealed` : "You're Done"}</h2><p>{game.phase === "reveal" ? "Take a breath. The next sky is on its way." : "Your garden is saved. Waiting for the round to close."}</p></section>}
        <StarBoard board={p.board} label="Your saved garden" />
      </>}
      {v.mode === "cup" && <section className="sg-standings" aria-label="Cup standings"><h2>{game.phase === "gameResults" ? "Cup results" : "Around the garden"}</h2>{v.standings.map((entry) => <div key={entry.playerId}><strong>{game.phase === "gameResults" ? `${entry.rank === 1 ? "★ " : ""}${entry.rank}. ` : ""}{name(entry.playerId)}</strong><span>{entry.score} pts · {entry.goals} claimed · {entry.actions} actions{game.phase === "playing" ? ` · ${v.readiness[entry.playerId] ? "Done" : "Planning"}` : ""}</span></div>)}<p>Ranked by points, constellations, then fewer actions. Exact ties share the win.</p></section>}
      {v.history.length > 0 && <details className="sg-reference" open={game.phase === "reveal"}><summary>Round reveals</summary>{v.history.map((round) => <section key={round.roundNumber}><h3>Round {round.roundNumber}</h3>{round.claims.map(([goalId, points], seat) => <p key={v.roster[seat]}>{name(v.roster[seat]!)} · {goalId ? STAR_GARDEN_GOALS.find((g) => g.id === goalId)?.name : "No constellation"} · {points} points</p>)}</section>)}</details>}
      {game.phase === "gameResults" && <section className="sg-result"><p className="sg-eyebrow">A sky to remember</p><h2>{v.endingReason === "all-goals" ? "All 30 constellations!" : v.mode === "cup" ? "The Cup is complete" : "Run complete"}</h2><p>{v.endingReason === "out-of-cards" ? "No cards or matching constellations remain." : v.endingReason === "ended" ? "You chose to end this run." : v.endingReason === "cup-complete" ? "Six rounds played." : "Every constellation discovered."}</p><p>{v.mode && MODE_NAMES[v.mode]} · v1 {v.dailyDate} {replay ? "· Replay" : ""}</p>
        {history && <p>On this device: first {history.first.score} pts · best {history.best.score} pts. Local history is a convenience, not a verified ranking.</p>}
        {v.mode !== "cup" && <button onClick={() => void shareResult()}>Share result</button>}
        {share && <label className="sg-share">Plain-text result<textarea readOnly value={share} onFocus={(e) => e.currentTarget.select()} /><span role="status">{copyMessage}</span></label>}
        {isHost && <div className="sg-controls"><button className="sg-primary" disabled={blocked} onClick={() => { setMode("daily"); setShare(""); playAgain(); }}>{v.mode === "cup" ? "Play another Cup" : v.mode === "daily" ? "Daily Replay" : "Play Daily"}</button>{v.mode !== "cup" && <button disabled={blocked} onClick={() => { setMode("practice"); setShare(""); playAgain(); }}>New Practice</button>}<button disabled={blocked} onClick={backToArcade}>Back to arcade</button></div>}
      </section>}
    </>}
    <div className="sg-feedback" role="status" aria-live="polite">{feedback.message}</div>
    <StarGardenReference />
  </div>;
}

function StarGardenPlay({ game, connected, commandPending, sendGame, changedCells = [] }: Props) {
  const p = game.private, v = game.public;
  const [cardId, setCardId] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(false);
  const [discard, setDiscard] = useState<string[]>([]);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const [rotation, setRotation] = useState<"clockwise" | "counterclockwise">("clockwise");
  const [permutation, setPermutation] = useState<[number, number, number]>([1, 0, 2]);
  const [endConfirm, setEndConfirm] = useState(false);
  const table = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  useEffect(() => { if (!commandPending) lock.current = false; }, [commandPending]);
  const blocked = commandPending || !connected;
  const card = p.hand.find((c) => c.id === cardId);
  const goal = v.goals.find((g) => g.id === goalId);
  const action = STAR_GARDEN_ACTIONS.find((a) => a.id === card?.action);
  const reset = () => { setCardId(null); setGoalId(null); setSelected([]); setOrigin(null); setRefresh(false); setDiscard([]); setEndConfirm(false); };
  let effect: StarGardenEffect | null = null, preview: Array<StarKind | null> | null = null, reason = "Select a card or a matching constellation.";
  try {
    if (card) {
      const a = selected[0], b = selected[1];
      if (a === undefined) throw Error(["drift", "mirror"].includes(card.action) ? "Select any star in the row to move." : card.action === "crosswind" ? "Select any star, then choose the top row's direction." : "Select a target star. For Spin or Scramble, select the top-left or leftmost star.");
      switch (card.action) {
        case "exchange": case "blink": case "echo": if (b === undefined) throw Error("Select a second star (Echo: source first, target second)."); effect = { action: card.action, source: a, target: b }; break;
        case "spin": effect = { action: card.action, origin: a, direction: rotation }; break;
        case "scramble": effect = { action: card.action, origin: a, permutation }; break;
        case "collapse": case "mutation": effect = { action: card.action, target: a }; break;
        case "drift": effect = { action: card.action, row: Math.floor(a / 5), direction }; break;
        case "mirror": effect = { action: card.action, row: Math.floor(a / 5) }; break;
        case "crosswind": effect = { action: card.action, direction }; break;
      }
      if (!effect) throw Error("Select valid card options.");
      preview = previewStarGardenAction(p.board, effect);
      reason = preview.every((k, i) => k === p.board[i]) ? "This leaves the colors unchanged. It still spends one card and one action." : preview.includes(null) ? "? means a new random star. Its kind is revealed only after you confirm." : "Preview ready. Confirm to spend this card.";
    } else if (goal && origin !== null) {
      const cells = matchStarGardenGoal(p.board, goal, origin);
      if (!cells) throw Error("Choose a currently matching origin.");
      preview = refillStars<StarKind | null>(p.board, cells, () => null); reason = `Claim ${goal.name} for ${goal.points} points. Highlighted stars leave; ? marks arrivals.`;
    } else if (refresh) {
      reason = discard.length === 3 ? "Discard these three cards and replace all ten stars. Costs three actions; no replacement cards." : "Select exactly three cards to discard, in order.";
      if (discard.length === 3) preview = Array<null>(10).fill(null);
    }
  } catch (error) { effect = null; preview = null; reason = error instanceof Error ? error.message : "Choose valid targets."; }
  const identity = { gameInstanceId: v.gameInstanceId, roundNumber: v.roundNumber, expectedRevision: p.revision };
  const commit = (command: GameCommand) => { if (blocked || lock.current) return; lock.current = true; if (!sendGame(command)) lock.current = false; };
  const cancel = () => {
    const target = table.current?.querySelector<HTMLButtonElement>(".sg-goal[aria-pressed=true], .sg-card-list button[aria-pressed=true], .sg-secondary button:not(:disabled)");
    reset(); target?.focus({ preventScroll: true });
  };
  const confirm = () => {
    if (card && effect) commit({ type: "starGarden.playCard", ...identity, cardId: card.id, effect });
    else if (goal && origin !== null) commit({ type: "starGarden.claimGoal", ...identity, goalId: goal.id, origin });
    else if (refresh && discard.length === 3) commit({ type: "starGarden.refresh", ...identity, cardIds: discard as [string, string, string] });
  };
  const selectedCells = goal && origin !== null ? matchStarGardenGoal(p.board, goal, origin) ?? [] : selected;
  return <div ref={table} className="sg-table">
    <div className="sg-sky">
    <section className="sg-objectives" aria-label="Available constellations">{v.goals.map((g) => { const matches = starGardenMatches(p.board, g); return <button key={g.id} className={`sg-goal sg-tier-${g.tier} ${matches.length ? "sg-matchable" : ""} ${goalId === g.id ? "sg-selected" : ""}`} disabled={blocked || matches.length === 0} aria-pressed={goalId === g.id} onClick={() => { reset(); setGoalId(g.id); setOrigin(matches[0]!); }} aria-label={`${g.name}, ${g.points} points, ${matches.length} matching origins`}><span className="sg-goal-top">{g.tier}<b>{g.points} pts</b></span><Constellation goal={g} /><strong>{g.name}</strong><small>{goalId === g.id ? "Selected" : matches.length ? `✧ ${matches.length} match${matches.length === 1 ? "" : "es"}` : "No match yet"}</small></button>; })}</section>
    <details className="sg-pattern-key"><summary>Pattern key <span>A ≠ B · fixed orientation</span></summary><p>Same letter = same kind. A and B differ. Dots don’t matter. Orientation is fixed.</p></details>

    <div className="sg-garden"><div className="sg-section-heading"><h2>Your garden</h2><span>Flow → then ←</span></div><StarBoard board={p.board} label="Your garden" changedCells={changedCells} selected={selectedCells} disabled={blocked || !card} onSelect={(cell) => { const two = ["exchange", "blink", "echo"].includes(card?.action ?? ""); setSelected((old) => old.includes(cell) ? old.filter((c) => c !== cell) : two && old.length === 1 ? [...old, cell] : [cell]); }} /></div>
    {goal && <div className="sg-origins" aria-label="Choose matching origin">{starGardenMatches(p.board, goal).map((o) => <button key={o} aria-label={`Origin row ${Math.floor(o / 5) + 1} column ${o % 5 + 1}`} disabled={blocked} aria-pressed={origin === o} onClick={() => setOrigin(o)}>R{Math.floor(o / 5) + 1} · C{o % 5 + 1}</button>)}</div>}
    </div><div className="sg-console">
    <section className="sg-hand" aria-label="Your hand"><div className="sg-section-heading"><h2>Your cards</h2><span>Play one · no automatic draw</span></div><div className="sg-card-list" onFocus={(event) => {
      // A partially visible focused card must be fully readable, including its ring.
      // Scroll only the deck, so confirmation focus recovery never moves the page.
      const card = (event.target as HTMLElement).closest("button");
      if (!card) return;
      const deck = event.currentTarget, frame = deck.getBoundingClientRect(), target = card.getBoundingClientRect();
      if (target.right > frame.right - 4) deck.scrollLeft += target.right - frame.right + 4;
      else if (target.left < frame.left + 4) deck.scrollLeft -= frame.left - target.left + 4;
    }}>{p.hand.map((c) => <button key={c.id} aria-label={`${STAR_GARDEN_ACTIONS.find((a) => a.id === c.action)!.name} 1 action${refresh && discard.includes(c.id) ? `, discard ${discard.indexOf(c.id) + 1}` : ""}`} disabled={blocked || (!refresh && v.mode === "cup" && p.remainingActions === 0)} aria-pressed={refresh ? discard.includes(c.id) : cardId === c.id} onClick={() => { if (refresh) setDiscard((old) => old.includes(c.id) ? old.filter((id) => id !== c.id) : old.length < 3 ? [...old, c.id] : old); else { reset(); setCardId(c.id); } }}><ActionArt action={c.action} /><strong>{STAR_GARDEN_ACTIONS.find((a) => a.id === c.action)!.name}</strong><small>{refresh && discard.includes(c.id) ? `Discard ${discard.indexOf(c.id) + 1}` : "1 action"}</small></button>)}</div>{!p.hand.length && <p>No cards left. You can still claim any matching constellation.</p>}</section>
    {(card || goal || refresh) && <section className="sg-preview" aria-label="Selected move">{action ? <details className="sg-action-help"><summary><strong>{action.name}</strong><span>Card details</span></summary><p>{action.description}</p></details> : <h2>{goal ? `Claim ${goal.name}` : "Refresh"}</h2>}
      {card?.action === "spin" && <label>Rotation<select value={rotation} onChange={(e) => setRotation(e.target.value as typeof rotation)}><option value="clockwise">Clockwise ↻</option><option value="counterclockwise">Counterclockwise ↺</option></select></label>}
      {card && ["drift", "crosswind"].includes(card.action) && <label>{card.action === "crosswind" ? "Top row direction" : "Direction"}<select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}><option value="left">Left ←</option><option value="right">Right →</option></select></label>}
      {card?.action === "scramble" && <label>New order of the three positions<select value={permutation.join(",")} onChange={(e) => setPermutation(e.target.value.split(",").map(Number) as [number, number, number])}>{[[0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]].map((order) => <option key={order.join()} value={order.join()}>{order.map((n) => n + 1).join(" → ")}</option>)}</select></label>}
      <p role="status">{reason}</p>{preview && <StarBoard board={preview} label="Preview, not committed" />}
      <div className="sg-controls"><button className="sg-primary" disabled={blocked || !preview || (v.mode === "cup" && !goal && p.remainingActions < (refresh ? 3 : 1))} onClick={confirm}>Confirm {goal ? "claim" : refresh ? "Refresh" : "card"}</button><button disabled={blocked} onClick={cancel}>Cancel</button></div>
    </section>}
    <div className="sg-controls sg-secondary"><button disabled={blocked || p.hand.length < 3 || (v.mode === "cup" && p.remainingActions < 3)} onClick={() => { reset(); setRefresh(true); }}>Refresh · discard 3</button>{v.mode === "cup" ? <button disabled={blocked} onClick={() => commit({ type: "starGarden.doneRound", ...identity })}>Done · no claim</button> : <button disabled={blocked} onClick={() => setEndConfirm(true)}>End Run</button>}</div>
    {endConfirm && <section className="sg-notice" role="group" aria-label="End Run confirmation"><p>End this run and keep your current result?</p><button disabled={blocked} onClick={() => commit({ type: "starGarden.endRun", ...identity })}>Confirm End Run</button><button onClick={() => setEndConfirm(false)}>Keep playing</button></section>}
    </div>
  </div>;
}
export function StarBoard({ board, label, selected = [], changedCells = [], disabled = true, onSelect }: { board: readonly (StarKind | null)[]; label: string; selected?: number[]; changedCells?: number[]; disabled?: boolean; onSelect?: (cell: number) => void }) {
  return <div className="sg-board" role="group" aria-label={label}>{board.map((kind, cell) => <button key={cell} className={`sg-star sg-kind-${kind ?? "unknown"} ${selected.includes(cell) ? "sg-selected" : ""} ${changedCells.includes(cell) ? "sg-changed" : ""}`} aria-label={`Row ${Math.floor(cell / 5) + 1} column ${cell % 5 + 1}: ${kind === null ? "unknown new star" : KINDS[kind].name}`} aria-pressed={selected.includes(cell)} disabled={disabled} onClick={() => onSelect?.(cell)}><CelestialPiece kind={kind} /></button>)}</div>;
}
function Constellation({ goal }: { goal: StarGardenGoal }) {
  const rows = goal.pattern.split("/"), width = rows[0]!.length;
  const points = rows.flatMap((row, r) => [...row].flatMap((letter, c) => letter === "." ? [] : [{ x: 14 + c * 25, y: 18 + r * 30, letter }]));
  return <svg className="sg-constellation" viewBox={`0 0 ${width * 25 + 3} 66`} role="img" aria-label={`${goal.name}: ${goal.pattern}. Same letters same kind, different letters different kinds; dots unconstrained, fixed orientation.`}><polyline points={points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1" className="sg-constellation-line" />{rows.flatMap((row, r) => [...row].map((letter, c) => <g key={`${r}-${c}`}><circle cx={14 + c * 25} cy={18 + r * 30} className={letter === "." ? "sg-dot" : `sg-node sg-node-${letter}`} r={letter === "." ? 1.8 : 9} fill={letter === "." ? "#a8a1bb" : "#e6def5"} /><text x={14 + c * 25} y={22 + r * 30} textAnchor="middle" fill="#201a33" fontSize="11" fontWeight="800">{letter === "." ? "" : letter}</text></g>))}</svg>;
}
function StarGardenReference() { return <details className="sg-reference"><summary>How to play · card reference</summary><p>Same letter = same kind. Different letters = different kinds. Dots don't matter. Orientation is fixed: translate, never rotate or reflect. Only letter cells leave when you claim. Extra stars are fine.</p><p>Stars flow along the top row left to right, then the bottom right to left. Survivors keep their order at the downstream end. New stars enter upstream. Gold ●, teal ◆, pink ▲, violet ☾ are mechanically equivalent.</p><p>Solo claims draw up to two cards, to a maximum of five. Playing a card never draws a replacement. Empty hand? Claim if you can. Cup allows three actions and one claim per round; claiming ends your round. Otherwise press Done. A timeout scores zero and keeps your board changes. Everyone may claim the same goal.</p><dl>{STAR_GARDEN_ACTIONS.map((action) => <div key={action.id}><dt>{action.name} · {action.copies} copies</dt><dd>{action.description}</dd></div>)}<div><dt>Refresh · not a card</dt><dd>Discard exactly three cards; replace all ten stars. Costs three actions. No points or replacement cards.</dd></div></dl><p>A legal move that leaves colors unchanged still spends its card. Preview freely; committed actions cannot be undone. Daily uses a frozen server UTC date. Replays and first/best results are local convenience history, not verified global rankings.</p></details>; }
function StarGardenTutorial() {
  const [step, setStep] = useState(0), [selected, setSelected] = useState<number[]>([]);
  const initial: StarKind[] = [0, 1, 0, 2, 3, 2, 0, 1, 3, 2];
  const changed = previewStarGardenAction(initial, { action: "exchange", source: 1, target: 6 }) as StarKind[];
  const board = step >= 4 ? refillStars<StarKind>(changed, [0, 1, 2], () => 3) : step >= 3 ? changed : initial;
  return <section className="sg-tutorial" aria-label="Isolated tutorial"><h3>A tiny practice sky</h3><p>{["Select Exchange to begin.", "Select row 1 column 2, then row 2 column 2.", "Preview: these two stars swap to make three gold circles. Confirm the Exchange.", "The first three stars match Ember. Claim it!", "The three gold stars left together. Survivors flowed downstream; three scripted violet stars arrived. You're ready!"][step]}</p><StarBoard board={board} label="Tutorial garden" selected={selected} disabled={step !== 1} onSelect={(cell) => { if (![1, 6].includes(cell)) return; const next = selected.includes(cell) ? selected : [...selected, cell]; setSelected(next); if (next.length === 2) setStep(2); }} />{step === 0 && <button onClick={() => setStep(1)}>Select Exchange</button>}{step === 2 && <><StarBoard board={changed} label="Tutorial preview" /><button onClick={() => { setStep(3); setSelected([0, 1, 2]); }}>Confirm Exchange</button></>}{step === 3 && <button onClick={() => { setStep(4); setSelected([]); }}>Claim Ember</button>}{step === 4 && <button onClick={() => { setStep(0); setSelected([]); }}>Repeat tutorial</button>}<small>Isolated scripted tutorial. No run cards, randomness, score, or deadlines are used.</small></section>;
}
