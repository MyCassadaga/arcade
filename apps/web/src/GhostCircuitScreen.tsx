import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GHOST_INVENTORY, GHOST_NODES, GHOST_SOCKETS, coordinate, piecePorts } from "@team-arcade/games/ghost-circuit";
import type { ClientMessage, GhostDirection, GhostLayout, GhostPiece, TypedGameViewerState } from "@team-arcade/shared";
import { readGhostDraft, readGhostSummary, saveGhostDraft, saveGhostSummary, storageAvailable } from "./ghost-circuit-storage";
import "./ghost-circuit.css";
type View = Extract<TypedGameViewerState, { gameId: "ghost-circuit" }>;
interface Props { game: View; connected: boolean; commandPending: boolean; send: (message: ClientMessage) => boolean; backToArcade: () => boolean }
const spriteIndexes = { socket: 0, entry: 1, badge: 2, scanner: 3, vault: 4, cache: 5, exit: 6, ghost: 7 };
function Art({ kind, className = "" }: { kind: keyof typeof spriteIndexes; className?: string }) { const i = spriteIndexes[kind]; return <span aria-hidden="true" className={`gc-art ${className}`} style={{ backgroundPosition: `${i % 4 * 100 / 3}% ${Math.floor(i / 4) * 100}%` }} />; }
const points: Record<GhostDirection, string> = { N: "50,0", E: "100,50", S: "50,100", W: "0,50" };
function Cable({ ports }: { ports: GhostDirection[] }) { return <svg viewBox="0 0 100 100" aria-hidden="true" className="gc-cable"><polyline points={`${points[ports[0]!]} 50,50 ${ports[1] ? points[ports[1]] : "50,50"}`} /></svg>; }
export function GhostCircuitScreen({ game, connected, commandPending, send, backToArcade }: Props) {
 const view = game.public;
 const [restored] = useState(() => readGhostDraft(view));
 const [layout, setLayout] = useState<GhostLayout>(() => (restored.draft?.execution === view.executions ? restored.draft.layout : undefined) ?? view.latest?.layout ?? []);
 const [pending, setPending] = useState(() => restored.draft?.pending && restored.draft.pending.command.expectedExecution === view.executions ? restored.draft.pending : null);
 const [undo, setUndo] = useState<GhostLayout[]>([]), [redo, setRedo] = useState<GhostLayout[]>([]);
 const [pieceKind, setPieceKind] = useState<GhostPiece["kind"]>("straight"), [rotation, setRotation] = useState(1);
 const [selected, setSelected] = useState<number | null>(null), [status, setStatus] = useState("Select a cable, then tap a socket. Badge → scanner → vault → exit.");
 const [notice, setNotice] = useState(restored.notice || (view.executions === 0 && readGhostSummary() ? "New server session. Local completion history does not restore expired authority or old executions." : "")), [saved, setSaved] = useState(storageAvailable);
 const [summary, setSummary] = useState(readGhostSummary);
 const [replaying, setReplaying] = useState(false), [playing, setPlaying] = useState(false), [step, setStep] = useState(0), [share, setShare] = useState(false);
 const observed = useRef(view.executions), buttons = useRef<Array<HTMLButtonElement | null>>([]);
 const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 const events = view.latest?.result.events ?? [], event = replaying ? events[step] : undefined;
 const locked = !!pending || commandPending || replaying;
 const displayedLayout = replaying ? view.latest?.layout ?? layout : layout;
 useEffect(() => {
  const ok = saveGhostDraft(view.gameInstanceId, { version: 1, contentVersion: 1, rulesVersion: 1, execution: view.executions, layout, pending });
  if (!ok) setSaved(false);
 }, [layout, pending, view.gameInstanceId, view.executions]);
 useEffect(() => {
  if (!saveGhostSummary(view)) setSaved(false); setSummary(readGhostSummary());
  if (pending && view.executions > pending.command.expectedExecution) setPending(null);
  if (view.executions > observed.current) {
   observed.current = view.executions; setLayout(view.latest?.layout ?? []); setUndo([]); setRedo([]); setReplaying(true); setStep(reducedMotion ? Math.max(0, events.length - 1) : 0); setPlaying(!reducedMotion); setStatus(`Execution ${view.executions} accepted. Replay never uses an execution.`);
  }
 }, [view, pending, events.length, reducedMotion]);
 useEffect(() => { if (!playing) return; if (step >= events.length - 1) { setPlaying(false); return; } const timer = window.setTimeout(() => setStep(s => s + 1), 320); return () => window.clearTimeout(timer); }, [playing, step, events.length]);
 const edit = (next: GhostLayout, message: string) => { if (locked) return; setUndo(h => [...h.slice(-99), layout]); setRedo([]); setLayout(next); setStatus(message); };
 const place = (cell: number) => {
  setSelected(cell); const node = GHOST_NODES.find(n => n.cell === cell);
  if (locked) return;
  if (node) { setStatus(`${coordinate(cell)} ${node.kind}: ${node.kind === "scanner" ? "Checks only this tile; requires a badge." : node.kind === "vault" ? "Steals archive and removes disguise." : "Fixed node. Follow the visible ports."}`); return; }
  if (!GHOST_SOCKETS.includes(cell)) { setStatus("Blocked hardware. Choose an illustrated socket."); return; }
  const next = layout.filter(p => p.cell !== cell);
  if (next.filter(p => p.kind === pieceKind).length >= GHOST_INVENTORY[pieceKind]) { setStatus(`No ${pieceKind} cables left. Remove one or choose another shape.`); return; }
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
 const execute = () => {
  if (!connected || replaying || commandPending) return;
  const run = pending ?? { requestId: crypto.randomUUID(), command: { type: "ghostCircuit.execute" as const, gameInstanceId: view.gameInstanceId, contractId: view.contractId, contentVersion: view.contentVersion, rulesVersion: view.rulesVersion, expectedExecution: view.executions, layout: structuredClone(layout) } };
  setPending(run); saveGhostDraft(view.gameInstanceId, { version: 1, contentVersion: 1, rulesVersion: 1, execution: view.executions, layout, pending: run });
  send({ type: "game.command", requestId: run.requestId, payload: { command: run.command } }); setStatus("Waiting for the server. Retry preserves the same execution request.");
 };
 const result = view.latest?.result;
 const shareText = `Ghost Circuit · Borrowed Identity\nRules 1 · Content 1\n${view.bestRating ?? "Still planning"} · ${view.executions} executions${view.firstSuccess ? ` · first escape on execution ${view.firstSuccess}` : ""}`;
 return <section className="gc-shell" aria-labelledby="gc-title">
  <header className="gc-heading"><div><p>ONE COURIER. BORROWED CREDENTIALS.</p><h1 id="gc-title">GHOST CIRCUIT</h1><span>Borrowed Identity · M0 proof</span></div><div className="gc-counter"><strong>{view.executions}</strong><span>executions</span></div></header>
  <div className="gc-layout"><div className="gc-workbench">
   <div className="gc-board" role="group" aria-label="Circuit board, columns A to F, rows 1 to 6">
    {Array.from({ length: 36 }, (_, cell) => { const node = GHOST_NODES.find(n => n.cell === cell), piece = displayedLayout.find(p => p.cell === cell), socket = GHOST_SOCKETS.includes(cell), ports = node?.ports ?? (piece ? piecePorts(piece.kind, piece.rotation) : []); const active = event?.cell === cell; return <button key={cell} ref={el => { buttons.current[cell] = el; }} type="button" className={`gc-cell ${!node && !socket ? "gc-blocked" : ""} ${selected === cell ? "gc-selected" : ""} ${active ? "gc-active" : ""} ${active && event.kind === "fail" ? "gc-failed" : ""}`} aria-label={`${coordinate(cell)} ${node?.kind ?? (socket ? piece ? `${piece.kind}, ports ${ports.join(" ")}` : "empty socket" : "blocked hardware")}${selected === cell ? ", selected" : ""}`} aria-pressed={selected === cell} onFocus={() => setSelected(cell)} onKeyDown={e => key(e, cell)} onClick={() => place(cell)}>
     {(socket || node) && <Art kind="socket" />}{node && <Art kind={node.kind} className="gc-node" />}{ports.length > 0 && <Cable ports={ports} />}<span className="gc-coordinate">{coordinate(cell)}</span>{node && <span className="gc-node-label">{node.kind}</span>}{selected === cell && <span className="gc-selection-mark" aria-hidden="true">⌖</span>}{active && <><Art kind="ghost" className="gc-courier" />{event.disguise && <span className="gc-badge" aria-hidden="true">ID</span>}</>}
    </button>; })}
   </div>
   <div className="gc-tray" aria-label="Cable inventory">{(["straight", "elbow"] as const).map(kind => <button type="button" key={kind} aria-pressed={kind === pieceKind} disabled={locked} onClick={() => { setPieceKind(kind); setStatus(`${kind} selected. Tap an empty socket.`); }}><span className="gc-piece-preview"><Cable ports={piecePorts(kind, rotation)} /></span><strong>{kind}</strong><span>{GHOST_INVENTORY[kind] - displayedLayout.filter(p => p.kind === kind).length} left</span></button>)}<button type="button" disabled={locked} onClick={rotate}>Rotate ↻</button><button type="button" disabled={locked || !layout.some(p => p.cell === selected)} onClick={remove}>Remove ×</button></div>
   <div className="gc-edit-actions"><button type="button" disabled={locked || !undo.length} onClick={() => { setRedo(h => [...h, layout]); setLayout(undo.at(-1)!); setUndo(h => h.slice(0, -1)); }}>Undo</button><button type="button" disabled={locked || !redo.length} onClick={() => { setUndo(h => [...h.slice(-99), layout]); setLayout(redo.at(-1)!); setRedo(h => h.slice(0, -1)); }}>Redo</button><button type="button" disabled={locked || !layout.length} onClick={() => { if (window.confirm("Reset this layout? Undo can restore it.")) edit([], "Layout reset. Undo restores your cables."); }}>Reset layout</button></div>
   <button type="button" className="gc-execute" disabled={!connected || replaying || commandPending || !game.private.canExecute} onClick={execute}>{pending ? "Retry pending execution" : "EXECUTE CIRCUIT →"}</button>
   <p className="gc-status" role="status" aria-live="polite">{event ? `${coordinate(event.cell)} · ${event.text}` : status}</p>
   {view.latest && <div className="gc-playback"><button type="button" disabled={!!pending || commandPending} onClick={() => { setReplaying(true); setStep(0); setPlaying(!reducedMotion); }}>Replay latest</button><button type="button" disabled={!replaying} onClick={() => setPlaying(p => !p)}>{playing ? "Pause" : "Play"}</button><button type="button" disabled={!replaying || step >= events.length - 1} onClick={() => { setPlaying(false); setStep(s => Math.min(events.length - 1, s + 1)); }}>Step</button><button type="button" disabled={!replaying} onClick={() => { setReplaying(false); setPlaying(false); setStatus("Back in edit. The original layout is preserved."); }}>Return to edit</button><span>{replaying ? `${step + 1}/${events.length} events · no execution used` : "Replay is free"}</span></div>}
  </div><aside className="gc-mission"><h2>Steal the archive.</h2><p>Take the badge before crossing a scanner. The vault steals your disguise. Find a different way out.</p><ul><li>◆ Basic: escape with the archive</li><li>✦ Full Haul: bring the optional cache too</li><li>8 straight + 8 elbow cables. Every turn spends supply.</li></ul><p className="gc-hint">Scanners inspect their own tile only. No Ghost achievement on this contract.</p>
   {result && <section className={`gc-result ${result.success ? "gc-success" : ""}`}><h2>{result.success ? `✓ ${result.rating}` : "× Route interrupted"}</h2><p>{result.failure ?? "Archive extracted. Keep editing to improve your haul."}</p><p>Best: {view.bestRating ?? "No escape yet"}{view.firstSuccess ? ` · first escape: execution ${view.firstSuccess}` : ""}</p><button type="button" onClick={() => { setShare(true); void navigator.clipboard?.writeText(shareText).catch(() => setStatus("Copy blocked. Select the result text and copy it manually.")); }}>Share result</button>{share && <label>Spoiler-free result<textarea readOnly value={shareText} onFocus={e => e.currentTarget.select()} /></label>}</section>}
   {summary && <p className="gc-local-history">On this device: {summary.bestRating}. Noncompetitive history survives room expiry; it cannot restore a server session.</p>}
   {!saved && <p role="alert">Progress won't be saved on this device. You can keep playing in memory.</p>}{notice && <p>{notice} <button type="button" onClick={() => setNotice("")}>Dismiss</button></p>}
   <details><summary>Controls & node rules</summary><p>Select a cable, then tap/click a socket. Select a placed cable to replace it; Rotate and Remove affect the selected socket. Arrows move focus, Enter places, R rotates, Delete removes, Escape clears selection. Undo/Redo work while editing.</p><dl>{GHOST_NODES.filter((n,i,a) => a.findIndex(x => x.kind === n.kind) === i).map(n => <div key={n.kind}><dt>{n.kind}</dt><dd>{({ entry: "Starts the courier; cannot be re-entered.", badge: "Gives a disguise for scanner crossings.", scanner: "Detects a courier without a badge.", vault: "Collects the archive and removes disguise.", cache: "Optional data for Full Haul.", exit: "Requires the archive to escape." })[n.kind]}</dd></div>)}</dl></details>
   <button type="button" onClick={backToArcade}>Back to arcade</button>
  </aside></div>
 </section>;
}
