import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { GHOST_CAMPAIGN, GHOST_CHAPTERS, LEGACY_GHOST_CONTRACT, coordinate, getGhostContract, piecePorts } from "@team-arcade/games/ghost-circuit";
import type { ClientMessage, GhostDirection, GhostLayout, GhostPiece, TypedGameViewerState } from "@team-arcade/shared";
import { readGhostDraft, readGhostSummary, saveGhostDraft, saveGhostSummary, storageAvailable } from "./ghost-circuit-storage";
import "./ghost-circuit.css";
type View = Extract<TypedGameViewerState, { gameId: "ghost-circuit" }>;
interface Props { game: View; connected: boolean; commandPending: boolean; send: (message: ClientMessage) => boolean; backToArcade: () => boolean }
const spriteIndexes = { socket: 0, entry: 1, badge: 2, scanner: 3, vault: 4, cache: 5, exit: 6, ghost: 7 };
function Art({ kind, className = "" }: { kind: keyof typeof spriteIndexes; className?: string }) { const i = spriteIndexes[kind]; return <span aria-hidden="true" className={`gc-art ${className}`} style={{ backgroundPosition: `${i % 4 * 100 / 3}% ${Math.floor(i / 4) * 100}%` }} />; }
const points: Record<GhostDirection, string> = { N: "50,0", E: "100,50", S: "50,100", W: "0,50" };
function Cable({ ports }: { ports: readonly GhostDirection[] }) { const route = `${points[ports[0]!]} 50,50 ${ports[1] ? points[ports[1]] : "50,50"}`; return <svg viewBox="0 0 100 100" aria-hidden="true" className="gc-cable"><polyline className="gc-cable-jacket" points={route} /><polyline points={route} /></svg>; }
const allContracts = [...GHOST_CAMPAIGN, LEGACY_GHOST_CONTRACT];
const identity = ({ id, contentVersion, rulesVersion }: (typeof allContracts)[number]) => ({ contractId: id, contentVersion, rulesVersion });
export function GhostCircuitScreen(props: Props) {
 const view = props.game.public;
 const heading = useRef<HTMLHeadingElement>(null), previous = useRef(view.selectionRevision);
 useEffect(() => {
  if (view.selectionRevision !== previous.current) {
   previous.current = view.selectionRevision;
   heading.current?.focus();
  }
 }, [view.selectionRevision]);
 return <GhostCircuitEditor key={`${view.contractId}:${view.selectionRevision}`} {...props} heading={heading} />;
}
function GhostCircuitEditor({ game, connected, commandPending, send, backToArcade, heading }: Props & { heading: RefObject<HTMLHeadingElement | null> }) {
 const view = game.public;
 const contract = getGhostContract(view.contractId);
 const { nodes, sockets, inventory } = contract;
 const cacheCount = nodes.filter(node => node.kind === "cache").length;
 const completed = useMemo(() => new Set([...view.completedContractIds, ...allContracts.filter(item => readGhostSummary(identity(item))).map(item => item.id)]), [view.completedContractIds]);
 const recommended = GHOST_CAMPAIGN.find(item => !completed.has(item.id));
 const contractStatus = (id: string) => {
  if (id === contract.id && view.bestRating) return ` · ${view.bestRating}`;
  if (completed.has(id)) return " · Cleared";
  return recommended?.id === id ? " · Recommended" : "";
 };
 const next = contract.number ? GHOST_CAMPAIGN.find(item => item.number === contract.number + 1) : recommended;
 const [restored] = useState(() => readGhostDraft(view));
 const [layout, setLayout] = useState<GhostLayout>(() => (restored.draft?.execution === view.executions ? restored.draft.layout : undefined) ?? view.latest?.layout ?? []);
 const [pending, setPending] = useState(() => restored.draft?.pending && restored.draft.pending.command.expectedExecution === view.executions ? restored.draft.pending : null);
 const [undo, setUndo] = useState<GhostLayout[]>([]), [redo, setRedo] = useState<GhostLayout[]>([]);
 const [pieceKind, setPieceKind] = useState<GhostPiece["kind"]>("straight"), [rotation, setRotation] = useState(1);
 const [selected, setSelected] = useState<number | null>(null), [status, setStatus] = useState("Select a cable, then place or rotate it on an empty socket.");
 const [notice, setNotice] = useState(restored.notice || (view.executions === 0 && readGhostSummary(view) ? "New server session. Local completion history does not restore expired authority or old executions." : "")), [saved, setSaved] = useState(storageAvailable);
 const [summary, setSummary] = useState(() => readGhostSummary(view));
 const [replaying, setReplaying] = useState(false), [playing, setPlaying] = useState(false), [step, setStep] = useState(0), [share, setShare] = useState(false);
 const observed = useRef(view.executions), buttons = useRef<Array<HTMLButtonElement | null>>([]);
 const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 const events = view.latest?.result.events ?? [], event = replaying ? events[step] : undefined;
 const locked = !!pending || commandPending || replaying;
 const displayedLayout = replaying ? view.latest?.layout ?? layout : layout;
 useEffect(() => {
  const ok = saveGhostDraft(view, { version: 1, contentVersion: view.contentVersion, rulesVersion: view.rulesVersion, execution: view.executions, layout, pending });
  if (!ok) setSaved(false);
 }, [layout, pending, view]);
 useEffect(() => {
  if (!saveGhostSummary(view)) setSaved(false); setSummary(readGhostSummary(view));
  if (pending && view.executions > pending.command.expectedExecution) setPending(null);
  if (view.executions > observed.current) {
   observed.current = view.executions; setLayout(view.latest?.layout ?? []); setUndo([]); setRedo([]); setReplaying(true); setStep(reducedMotion ? Math.max(0, events.length - 1) : 0); setPlaying(!reducedMotion); setStatus(`Execution ${view.executions} accepted. Replay never uses an execution.`);
  }
 }, [view, pending, events.length, reducedMotion]);
 useEffect(() => { if (!playing) return; if (step >= events.length - 1) { setPlaying(false); return; } const timer = window.setTimeout(() => setStep(s => s + 1), 320); return () => window.clearTimeout(timer); }, [playing, step, events.length]);
 const edit = (next: GhostLayout, message: string) => { if (locked) return; setUndo(h => [...h.slice(-99), layout]); setRedo([]); setLayout(next); setStatus(message); };
 const place = (cell: number) => {
  setSelected(cell); const node = nodes.find(n => n.cell === cell);
  if (locked) return;
  if (node) { setStatus(`${coordinate(cell)} ${node.kind}: ${node.kind === "scanner" ? "Checks only this tile; requires a badge." : node.kind === "vault" ? "Steals archive and removes disguise." : "Fixed node. Follow the visible ports."}`); return; }
  if (!sockets.includes(cell)) { setStatus("Blocked hardware. Choose an illustrated socket."); return; }
  const next = layout.filter(p => p.cell !== cell);
  if (next.filter(p => p.kind === pieceKind).length >= inventory[pieceKind]) { setStatus(`No ${pieceKind} cables left. Remove one or choose another shape.`); return; }
  edit([...next, { cell, kind: pieceKind, rotation }], `${coordinate(cell)}: ${pieceKind} placed. R rotates; Delete removes.`);
 };
 const rotate = () => { const p = layout.find(p => p.cell === selected); if (p) edit(layout.map(x => x.cell === selected ? { ...x, rotation: (x.rotation + 1) % 4 } : x), `${coordinate(p.cell)} rotated.`); else { setRotation(r => (r + 1) % 4); setStatus("Cable orientation rotated for the next placement."); } };
 const remove = () => { if (selected !== null && layout.some(p => p.cell === selected)) edit(layout.filter(p => p.cell !== selected), `${coordinate(selected)} cable removed.`); };
 const key = (e: KeyboardEvent<HTMLButtonElement>, cell: number) => {
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 };
  if (e.key in offsets) { e.preventDefault(); const next = Math.min(35, Math.max(0, cell + offsets[e.key]!)); buttons.current[next]?.focus(); setSelected(next); }
  if (e.key.toLowerCase() === "r") { e.preventDefault(); rotate(); }
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(); }
  if (e.key === "Escape") { setSelected(null); setStatus("Selection cleared."); }
 };
 const selectContract = (id: string) => {
  if (!connected || !game.private.canExecute || pending || commandPending || id === contract.id) return;
  const target = getGhostContract(id);
  send({ type: "game.command", requestId: crypto.randomUUID(), payload: {
   command: { type: "ghostCircuit.select", gameInstanceId: view.gameInstanceId, ...identity(target), selectionRevision: view.selectionRevision }
  } });
 };
 const execute = () => {
  if (!connected || replaying || commandPending) return;
  const run = pending ?? { requestId: crypto.randomUUID(), command: { type: "ghostCircuit.execute" as const, gameInstanceId: view.gameInstanceId, contractId: view.contractId, contentVersion: view.contentVersion, rulesVersion: view.rulesVersion, selectionRevision: view.selectionRevision, expectedExecution: view.executions, layout: structuredClone(layout) } };
  setPending(run); saveGhostDraft(view, { version: 1, contentVersion: view.contentVersion, rulesVersion: view.rulesVersion, execution: view.executions, layout, pending: run });
  send({ type: "game.command", requestId: run.requestId, payload: { command: run.command } }); setStatus("Waiting for the server. Retry preserves the same execution request.");
 };
 const result = view.latest?.result;
 const playbackStatus = event && (event.kind === "move" || event.kind === "fail" ? event.text : `${coordinate(event.cell)} · ${event.text}`);
 const shareText = `Ghost Circuit · ${contract.title}\nRules ${view.rulesVersion} · Content ${view.contentVersion}\n${view.bestRating ?? "Still planning"} · ${view.executions} executions${view.firstSuccess ? ` · first escape on execution ${view.firstSuccess}` : ""}`;
 return <section className="gc-shell" aria-labelledby="gc-title">
  <header className="gc-heading">
   <div><p>SMALL GHOSTS. BIG CHANGES.</p><h1 id="gc-title">GHOST CIRCUIT</h1></div>
   <label className="gc-contract-picker">
    <span>Contract</span>
    <select value={contract.id} disabled={!connected || !game.private.canExecute || !!pending || commandPending}
     onChange={event => selectContract(event.currentTarget.value)}>
     {GHOST_CHAPTERS.map(chapter => <optgroup key={chapter} label={chapter}>
      {GHOST_CAMPAIGN.filter(item => item.chapter === chapter).map(item => (
       <option key={item.id} value={item.id}>
        {item.number}. {item.title}{item.tutorial ? " · Tutorial" : ""}{contractStatus(item.id)}
       </option>
      ))}
     </optgroup>)}
     <optgroup label="Archive">
      <option value={LEGACY_GHOST_CONTRACT.id}>{LEGACY_GHOST_CONTRACT.title}{contractStatus(LEGACY_GHOST_CONTRACT.id)}</option>
     </optgroup>
    </select>
   </label>
   <div className="gc-counter"><strong>{view.executions}</strong><span>executions</span></div>
  </header>
  <div className="gc-layout">
   <aside className="gc-mission" aria-label="Contract dossier">
    <div className="gc-dossier">
     <div className="gc-briefing">
      <p className="gc-contract-label">{contract.number ? `${contract.chapter} / ${String(contract.number).padStart(3, "0")}${contract.tutorial ? " / Tutorial" : ""}` : "Archive / Original contract"}</p>
      <h2 ref={heading} tabIndex={-1}>{contract.title}</h2>
      <p className="gc-brief">{contract.brief}</p>
     </div>
     <div className="gc-objectives">
      <p><span aria-hidden="true">▤</span><strong>Basic</strong><span>Extract the archive</span></p>
      {cacheCount > 0 && <p><span aria-hidden="true">▰</span><strong>Full Haul</strong><span>{cacheCount === 1 ? "Bring the cache too" : `Bring all ${cacheCount} caches too`}</span></p>}
     </div>
     {contract.guidance && <p className="gc-rule-note">{contract.guidance}</p>}
    </div>
    <figure className="gc-portrait"><img src="/ghost-circuit/courier.png" alt="" /><figcaption>Same circuits.<br />Kinder ghosts.</figcaption></figure>
   </aside>
   <div className="gc-workbench">
   <div className="gc-board" role="group" aria-label="Circuit board, columns A to F, rows 1 to 6">
    {Array.from({ length: 36 }, (_, cell) => { const node = nodes.find(n => n.cell === cell), piece = displayedLayout.find(p => p.cell === cell), socket = sockets.includes(cell), ports = node?.ports ?? (piece ? piecePorts(piece.kind, piece.rotation) : []); const active = event?.cell === cell; return <button key={cell} ref={el => { buttons.current[cell] = el; }} type="button" className={`gc-cell ${!node && !socket ? "gc-blocked" : ""} ${selected === cell ? "gc-selected" : ""} ${active ? "gc-active" : ""} ${active && event.kind === "fail" ? "gc-failed" : ""}`} aria-label={`${coordinate(cell)} ${node ? `${node.kind}, ports ${ports.join(" ")}` : (socket ? piece ? `${piece.kind}, ports ${ports.join(" ")}` : "empty socket" : "blocked hardware")}${selected === cell ? ", selected" : ""}`} aria-pressed={selected === cell} onFocus={() => setSelected(cell)} onKeyDown={e => key(e, cell)} onClick={() => place(cell)}>
     {(socket || node) && <Art kind="socket" />}{node && <Art kind={node.kind} className="gc-node" />}{ports.length > 0 && <Cable ports={ports} />}<span className="gc-coordinate">{coordinate(cell)}</span>{node && <span className="gc-node-label">{node.kind}</span>}{selected === cell && <span className="gc-selection-mark" aria-hidden="true">⌖</span>}{active && <><Art kind="ghost" className="gc-courier" />{event.disguise && <span className="gc-badge" aria-hidden="true">ID</span>}</>}
    </button>; })}
   </div>
   <div className="gc-tray" aria-label="Cable inventory">{(["straight", "elbow"] as const).map(kind => <button type="button" key={kind} aria-pressed={kind === pieceKind} disabled={locked} onClick={() => { setPieceKind(kind); setStatus(`${kind} selected. Tap an empty socket.`); }}><span className="gc-piece-preview"><Cable ports={piecePorts(kind, rotation)} /></span><strong>{kind}</strong><span>{inventory[kind] - displayedLayout.filter(p => p.kind === kind).length} left</span></button>)}</div>
<div className="gc-toolstrip"><div className="gc-tools"><button type="button" disabled={locked} onClick={rotate}>Rotate ↻</button><button type="button" disabled={locked || !layout.some(p => p.cell === selected)} onClick={remove}>Remove ×</button></div>
   <div className="gc-edit-actions"><button type="button" disabled={locked || !undo.length} onClick={() => { setRedo(h => [...h, layout]); setLayout(undo.at(-1)!); setUndo(h => h.slice(0, -1)); }}>Undo</button><button type="button" disabled={locked || !redo.length} onClick={() => { setUndo(h => [...h.slice(-99), layout]); setLayout(redo.at(-1)!); setRedo(h => h.slice(0, -1)); }}>Redo</button><button type="button" disabled={locked || !layout.length} onClick={() => { if (window.confirm("Reset this layout? Undo can restore it.")) edit([], "Layout reset. Undo restores your cables."); }}>Reset layout</button></div>
</div>
</div>
   <button type="button" className="gc-execute" disabled={!connected || replaying || commandPending || !game.private.canExecute} onClick={execute}>{pending ? "Retry pending execution" : "EXECUTE CIRCUIT →"}</button>
<aside className="gc-support">
   <p className="gc-status" role="status" aria-live="polite">{playbackStatus ?? status}</p>
   {view.latest && <div className="gc-playback"><button type="button" disabled={!!pending || commandPending} onClick={() => { setReplaying(true); setStep(0); setPlaying(!reducedMotion); }}>Replay latest</button><button type="button" disabled={!replaying} onClick={() => setPlaying(p => !p)}>{playing ? "Pause" : "Play"}</button><button type="button" disabled={!replaying || step >= events.length - 1} onClick={() => { setPlaying(false); setStep(s => Math.min(events.length - 1, s + 1)); }}>Step</button><button type="button" disabled={!replaying} onClick={() => { setReplaying(false); setPlaying(false); setStatus("Back in edit. The original layout is preserved."); }}>Return to edit</button><span>{replaying ? `${step + 1}/${events.length} events · no execution used` : "Replay is free"}</span></div>}
   {result && <section className={`gc-result ${result.success ? "gc-success" : ""}`}><h2>{result.success ? `✓ ${result.rating}` : "× Route interrupted"}</h2><p>{result.failure ?? (result.rating === "Basic" && cacheCount ? "Archive extracted. Keep editing to improve your haul." : "Archive extracted. Escape complete.")}</p><p>Best: {view.bestRating ?? "No escape yet"}{view.firstSuccess ? ` · first escape: execution ${view.firstSuccess}` : ""}</p>{result.success && next && <button type="button" disabled={!connected || !game.private.canExecute || !!pending || commandPending} onClick={() => selectContract(next.id)}>Next contract</button>}<button type="button" onClick={() => { setShare(true); void navigator.clipboard?.writeText(shareText).catch(() => setStatus("Copy blocked. Select the result text and copy it manually.")); }}>Share result</button>{share && <label>Spoiler-free result<textarea readOnly value={shareText} onFocus={e => e.currentTarget.select()} /></label>}</section>}
   {summary && <p className="gc-local-history">On this device: {summary.bestRating}. Noncompetitive history survives room expiry; it cannot restore a server session.</p>}
   {!saved && <p role="alert">Progress won't be saved on this device. You can keep playing in memory.</p>}{notice && <p>{notice} <button type="button" onClick={() => setNotice("")}>Dismiss</button></p>}
   <details><summary>Controls & node rules</summary><p>Select a cable, then tap/click a socket. Select a placed cable to replace it; Rotate and Remove affect the selected socket. Arrows move focus, Enter places, R rotates, Delete removes, Escape clears selection. Undo/Redo work while editing.</p><dl>{nodes.filter((n,i,a) => a.findIndex(x => x.kind === n.kind) === i).map(n => <div key={n.kind}><dt>{n.kind}</dt><dd>{({ entry: "Starts the courier; cannot be re-entered.", badge: "Gives a disguise for scanner crossings.", scanner: "Detects a courier without a badge.", vault: "Collects the archive and removes disguise.", cache: "Optional data for Full Haul.", exit: "Requires the archive to escape." })[n.kind]}</dd></div>)}</dl></details>
   <button type="button" onClick={backToArcade}>Back to arcade</button>
  </aside></div>
 </section>;
}
