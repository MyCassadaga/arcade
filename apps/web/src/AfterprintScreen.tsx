import { useCallback, useEffect, useRef, useState } from "react";
import { emptyAfterprintBoard, simulateAfterprint, simulateAfterprintSteps } from "@team-arcade/games/afterprint";
import type {
  AfterprintBoard,
  AfterprintEvent,
  AfterprintEventId,
  GameCommand,
  TypedGameViewerState
} from "@team-arcade/shared";

interface AfterprintScreenProps {
  game: Extract<TypedGameViewerState, { gameId: "afterprint" }>;
  commandPending: boolean;
  sendGame: (command: GameCommand) => boolean;
  playAgain: () => boolean;
  backToArcade: () => boolean;
}

const INK_GLYPHS = { coral: "╱", blue: "•", gold: "+", plum: "×" } as const;

export function AfterprintScreen({ game, commandPending, sendGame, playAgain, backToArcade }: AfterprintScreenProps) {
  const view = game.public;
  const lastAttempt = view.attempts.at(-1);
  const [order, setOrder] = useState<AfterprintEventId[]>(() => [...view.initialEventIds]);
  const [selected, setSelected] = useState<AfterprintEventId | null>(null);
  const [displayedBoard, setDisplayedBoard] = useState<AfterprintBoard>(() =>
    lastAttempt ? simulateAfterprint(view.events, lastAttempt.eventIds) : emptyAfterprintBoard()
  );
  const [animating, setAnimating] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [inspectedAttempt, setInspectedAttempt] = useState<number | null>(() => view.attempts.length > 0 ? view.attempts.length - 1 : null);
  const [expandedBoard, setExpandedBoard] = useState<"target" | "replay" | null>(null);
  const [shareVisible, setShareVisible] = useState(false);
  const [status, setStatus] = useState("Tap two events to swap their positions.");
  const timers = useRef<number[]>([]);
  const observedAttemptCount = useRef(view.attempts.length);

  const stopAnimation = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
    setAnimating(false);
  }, []);

  const replay = useCallback((eventIds: readonly AfterprintEventId[], completionStatus = "Replay complete.") => {
    stopAnimation();
    const steps = simulateAfterprintSteps(view.events, eventIds);
    setDisplayedBoard(steps[0] as AfterprintBoard);
    setActiveStep(0);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setDisplayedBoard(steps.at(-1) as AfterprintBoard);
      setActiveStep(eventIds.length);
      setStatus(completionStatus);
      return;
    }
    setAnimating(true);
    steps.slice(1).forEach((step, index) => {
      const timer = window.setTimeout(() => {
        setDisplayedBoard(step);
        setActiveStep(index + 1);
        if (index === eventIds.length - 1) {
          setAnimating(false);
          setStatus(completionStatus);
        }
      }, (index + 1) * 260);
      timers.current.push(timer);
    });
  }, [stopAnimation, view.events]);

  useEffect(() => () => stopAnimation(), [stopAnimation]);

  useEffect(() => {
    stopAnimation();
    const latest = view.attempts.at(-1);
    setOrder([...(latest?.eventIds ?? view.initialEventIds)]);
    setSelected(null);
    setDisplayedBoard(latest ? simulateAfterprint(view.events, latest.eventIds) : emptyAfterprintBoard());
    setActiveStep(latest ? 5 : 0);
    setInspectedAttempt(latest ? view.attempts.length - 1 : null);
    setShareVisible(false);
    observedAttemptCount.current = view.attempts.length;
  }, [stopAnimation, view.gameInstanceId]);

  useEffect(() => {
    if (view.attempts.length <= observedAttemptCount.current) return;
    observedAttemptCount.current = view.attempts.length;
    const latest = view.attempts.at(-1);
    if (!latest) return;
    setOrder([...latest.eventIds]);
    setInspectedAttempt(view.attempts.length - 1);
    replay(latest.eventIds, latest.solved ? "Trace matched. Case closed." : `${latest.mismatchCount} squares still differ.`);
  }, [replay, view.attempts]);

  const swap = (eventId: AfterprintEventId) => {
    if (game.phase !== "playing" || animating || commandPending) return;
    if (selected === null) {
      setSelected(eventId);
      setStatus(`${eventName(view.events, eventId)} selected. Choose another event to swap.`);
      return;
    }
    if (selected === eventId) {
      setSelected(null);
      setStatus("Selection cleared.");
      return;
    }
    setOrder((current) => {
      const next = [...current];
      const left = next.indexOf(selected);
      const right = next.indexOf(eventId);
      [next[left], next[right]] = [next[right] as AfterprintEventId, next[left] as AfterprintEventId];
      return next;
    });
    setSelected(null);
    setStatus("Events swapped. Replay when the sequence looks right.");
  };

  const submit = () => {
    setSelected(null);
    setStatus("Checking that reconstruction…");
    sendGame({
      type: "afterprint.submitOrder",
      gameInstanceId: view.gameInstanceId,
      puzzleNumber: view.puzzleNumber,
      eventIds: [...order]
    });
  };

  const inspect = (index: number) => {
    const attempt = view.attempts[index];
    if (!attempt) return;
    setInspectedAttempt(index);
    setOrder([...attempt.eventIds]);
    setStatus(`Replaying attempt ${index + 1}. No attempt used.`);
    replay(attempt.eventIds, `Attempt ${index + 1} replayed. No attempt used.`);
  };

  const shownAttempt = inspectedAttempt === null ? null : view.attempts[inspectedAttempt];
  const showMismatches = shownAttempt !== undefined && !animating && activeStep === 5;
  const attemptsLeft = view.maxAttempts - view.attempts.length;
  const shareText = formatAfterprintShare(view.puzzleNumber, view.attempts, view.solved);

  return (
    <section className="afterprint-shell" aria-labelledby="afterprint-title">
      <header className="afterprint-heading">
        <div>
          <p>Five events. One mess.</p>
          <h1 id="afterprint-title">AFTERPRINT</h1>
        </div>
        <div className="afterprint-meta" aria-label={`Puzzle ${view.puzzleNumber}, ${attemptsLeft} attempts left`}>
          <span>#{String(view.puzzleNumber).padStart(3, "0")}</span>
          <strong>{view.attempts.length}/{view.maxAttempts}</strong>
          <small>attempts</small>
        </div>
      </header>

      <div className="afterprint-boards">
        <Board title="Target" board={view.target} onExpand={() => setExpandedBoard("target")} />
        <Board title="Replay" board={displayedBoard} target={view.target} showMismatches={showMismatches} onExpand={() => setExpandedBoard("replay")} />
      </div>

      <div className="afterprint-feedback" role="status" aria-live="polite">
        <span>{activeStep > 0 && activeStep <= order.length ? `Event ${activeStep}/5` : `${attemptsLeft} ${attemptsLeft === 1 ? "attempt" : "attempts"} left`}</span>
        <strong>{status}</strong>
      </div>

      <section className="afterprint-sequence" aria-labelledby="sequence-title">
        <div className="afterprint-section-title">
          <h2 id="sequence-title">Your event order</h2>
          {game.phase === "playing" && <button type="button" onClick={() => {
            setOrder([...view.initialEventIds]); setSelected(null); setStatus("Sequence reset to its starting order.");
          }}>Reset</button>}
        </div>
        <ol className="afterprint-events">
          {order.map((eventId, index) => {
            const event = view.events.find((candidate) => candidate.id === eventId) as AfterprintEvent;
            return <li key={eventId}>
              <span className="afterprint-order-number">{index + 1}</span>
              <button
                type="button"
                className={selected === eventId ? "is-selected" : ""}
                aria-pressed={selected === eventId}
                aria-label={`${index + 1}. ${describeEvent(event)}. ${selected === eventId ? "Selected; choose another event to swap." : "Select to swap."}`}
                disabled={game.phase !== "playing" || animating || commandPending}
                onClick={() => swap(eventId)}
              >
                <MiniEvent event={event} />
                <strong>{event.kind === "drop" ? "Drop" : event.kind === "roll" ? "Roll" : "Wipe"}</strong>
              </button>
            </li>;
          })}
        </ol>
      </section>

      {game.phase === "playing" ? (
        <button className="afterprint-replay" type="button" disabled={commandPending || animating || !game.private.canSubmit} onClick={submit}>
          {commandPending ? "Checking…" : animating ? "Replaying…" : "Replay order"}
        </button>
      ) : (
        <section className={`afterprint-result ${view.solved ? "is-solved" : ""}`} aria-labelledby="afterprint-result-title">
          <p>{view.solved ? "Trace reconstructed" : "Case still open"}</p>
          <h2 id="afterprint-result-title">{view.solved ? `Solved in ${view.attempts.length}/4` : "Four attempts used"}</h2>
          <div className="afterprint-result-actions">
            <button type="button" onClick={() => { setShareVisible(true); void navigator.clipboard?.writeText(shareText).catch(() => undefined); }}>Share result</button>
            <button type="button" onClick={playAgain}>Play today again</button>
            <button type="button" onClick={backToArcade}>Back to arcade</button>
          </div>
          {shareVisible && <label className="afterprint-share">Spoiler-free result<textarea readOnly value={shareText} onFocus={(event) => event.currentTarget.select()} /></label>}
        </section>
      )}

      {view.attempts.length > 0 && <section className="afterprint-history" aria-labelledby="history-title">
        <h2 id="history-title">Attempt history</h2>
        <div>{view.attempts.map((attempt, index) => <button type="button" key={index} aria-pressed={inspectedAttempt === index}
          aria-label={`Replay attempt ${index + 1}: ${attempt.solved ? "match" : `${attempt.mismatchCount} mismatches`}`} onClick={() => inspect(index)}>
          <span>{index + 1}</span><strong>{attempt.solved ? "Match" : `${attempt.mismatchCount} off`}</strong>
        </button>)}</div>
      </section>}

      <details className="afterprint-details">
        <summary>How to play & event details</summary>
        <p>Tap one event and then another to swap them. Replay all five events from a clean board. Any order that makes the target wins.</p>
        <dl>
          <div><dt>Drop</dt><dd>Replaces the marked square with its ink.</dd></div>
          <div><dt>Roll</dt><dd>Starts clean, picks up ink it crosses, and paints later blank squares. A new color changes what it carries.</dd></div>
          <div><dt>Wipe</dt><dd>Removes every ink mark along its path.</dd></div>
        </dl>
      </details>

      {expandedBoard && <div className="afterprint-modal" role="dialog" aria-modal="true" aria-label={`Enlarged ${expandedBoard} board`}>
        <div>
          <Board title={expandedBoard === "target" ? "Target" : "Replay"} board={expandedBoard === "target" ? view.target : displayedBoard}
            target={view.target} showMismatches={expandedBoard === "replay" && showMismatches} />
          <button type="button" onClick={() => setExpandedBoard(null)}>Close enlarged board</button>
        </div>
      </div>}
    </section>
  );
}

function Board({ title, board, target, showMismatches = false, onExpand }: {
  title: string;
  board: AfterprintBoard;
  target?: AfterprintBoard;
  showMismatches?: boolean;
  onExpand?: () => void;
}) {
  const summary = board.map((ink, index) => ink ? `${index + 1} ${ink}` : null).filter(Boolean).join(", ") || "clean";
  return <section className="afterprint-board-card" aria-label={`${title} board: ${summary}`}>
    <header><h2>{title}</h2>{onExpand && <button type="button" aria-label={`Enlarge ${title.toLowerCase()} board`} onClick={onExpand}>⌗</button>}</header>
    <div className="afterprint-board" aria-hidden="true">
      {board.map((ink, index) => <span key={index} className={`${ink ? `ink-${ink}` : "is-clean"} ${showMismatches && ink !== target?.[index] ? "is-mismatch" : ""}`}>
        {ink ? INK_GLYPHS[ink] : ""}
      </span>)}
    </div>
  </section>;
}

function MiniEvent({ event }: { event: AfterprintEvent }) {
  return <span className={`afterprint-mini event-${event.kind}`} aria-hidden="true">
    {Array.from({ length: 25 }, (_, cell) => <i key={cell} className={miniCellClass(event, cell)}>{miniCellGlyph(event, cell)}</i>)}
  </span>;
}

function miniCellClass(event: AfterprintEvent, cell: number): string {
  if (event.kind === "drop" && event.cell === cell) return `is-marked ink-${event.ink}`;
  if (event.kind !== "drop" && event.path.includes(cell)) return "is-path";
  return "";
}

function miniCellGlyph(event: AfterprintEvent, cell: number): string {
  if (event.kind === "drop") return event.cell === cell ? INK_GLYPHS[event.ink] : "";
  const index = event.path.indexOf(cell);
  if (index < 0) return "";
  if (event.kind === "wipe") return "×";
  if (index > 0) return "•";
  const next = event.path[1] as number;
  if (next === cell + 1) return "→";
  if (next === cell - 1) return "←";
  return next === cell + 5 ? "↓" : "↑";
}

function describeEvent(event: AfterprintEvent): string {
  if (event.kind === "drop") return `${event.ink} Drop at row ${Math.floor(event.cell / 5) + 1}, column ${event.cell % 5 + 1}`;
  const first = event.path[0] as number;
  const last = event.path.at(-1) as number;
  return `${event.kind === "roll" ? "Roll" : "Wipe"} from row ${Math.floor(first / 5) + 1}, column ${first % 5 + 1} to row ${Math.floor(last / 5) + 1}, column ${last % 5 + 1}`;
}

function eventName(events: readonly AfterprintEvent[], eventId: AfterprintEventId): string {
  const event = events.find((candidate) => candidate.id === eventId);
  return event ? describeEvent(event) : `Event ${eventId}`;
}

export function formatAfterprintShare(puzzleNumber: number, attempts: readonly { mismatchCount: number; solved: boolean }[], solved: boolean): string {
  const outcome = solved ? `▶ Solved in ${attempts.length}/4` : "◇ Not solved in 4/4";
  return `AFTERPRINT #${String(puzzleNumber).padStart(3, "0")}\n${outcome}\n\n${attempts.map((attempt) => attempt.mismatchCount).join(" → ")} ${solved ? "✦" : "·"}`;
}
