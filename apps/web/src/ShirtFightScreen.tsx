import { useCallback, useEffect, useRef, useState } from "react";
import { SHIRT_FIGHT_BRUSH_SIZES, SHIRT_FIGHT_COLORS, type GameCommand, type PlayerView, type TypedGameViewerState } from "@team-arcade/shared";
import { fetchShirtFightDrawing, uploadShirtFightDrawing } from "./api";
import { PhaseCard, PrimaryAction, Progress, Waiting, playerName } from "./game-presentation";

type Game = Extract<TypedGameViewerState, { gameId: "shirt-fight" }>;

export function ShirtFightScreen({ game, players, isHost, roomCode, sessionToken, sendGame, hostAdvance, playAgain, backToArcade }: {
  game: Game;
  players: PlayerView[];
  isHost: boolean;
  roomCode: string;
  sessionToken: string;
  sendGame: (command: GameCommand) => boolean;
  hostAdvance: () => boolean;
  playAgain: () => boolean;
  backToArcade: () => boolean;
}) {
  const [sharedDisplay, setSharedDisplay] = useState(false);
  const view = game.public;
  const remaining = useCountdown(view.deadlineAt);
  const identity = { gameInstanceId: view.gameInstanceId, phaseNonce: view.phaseNonce };
  const phaseLabel = game.phase === "finalVoting" || game.phase === "finalReveal" || game.phase === "gameResults" ? "Finals" : `Round ${view.generationRound} of 2`;

  return (
    <div className={`shirt-fight-screen ${sharedDisplay ? "shared-display" : ""}`}>
      <div className="phase-topline shirt-fight-topline">
        <span>Shirt Fight</span><span>{phaseLabel}</span>
        {view.deadlineAt !== undefined && <strong className="shirt-timer" role="timer" aria-label={`${remaining} seconds remaining`}>{remaining}s</strong>}
        {isHost && <button className="text-button display-toggle" type="button" aria-pressed={sharedDisplay} onClick={() => setSharedDisplay((value) => !value)}>{sharedDisplay ? "Use player view" : "Use shared display"}</button>}
      </div>

      {game.phase === "drawing" && (sharedDisplay ? (
        <PublicProgress title={`Drawing ${view.drawingNumber} is underway`} kicker="Pens up, chaos on" view={view} />
      ) : game.private.drawingSubmitted ? (
        <PhaseCard title="Drawing locked" kicker={`Drawing ${view.drawingNumber} of 2`}><Progress current={view.completedCount} total={view.totalPlayers} label="drawings in" /><Waiting text="Waiting for the room or the timer…" /></PhaseCard>
      ) : (
        <DrawingStudio key={`${view.generationRound}-${view.drawingNumber}`} roomCode={roomCode} sessionToken={sessionToken} deadlineAt={view.deadlineAt} />
      ))}

      {game.phase === "slogans" && (sharedDisplay ? (
        <PublicProgress title="Write punchy slogans" kicker="Fast words, questionable taste" view={view} />
      ) : (
        <SloganStudio game={game} sendGame={sendGame} identity={identity} />
      ))}

      {game.phase === "assembly" && (sharedDisplay ? (
        <PublicProgress title="Shirts are taking shape" kicker="Remix time" view={view} />
      ) : game.private.shirtSubmitted ? (
        <PhaseCard title="Shirt locked" kicker="A permanent fashion decision"><Progress current={view.completedCount} total={view.totalPlayers} label="shirts in" /><Waiting text="Waiting for the next runway…" /></PhaseCard>
      ) : (
        <ShirtBuilder game={game} roomCode={roomCode} sessionToken={sessionToken} sendGame={sendGame} identity={identity} />
      ))}

      {(game.phase === "voting" || game.phase === "finalVoting") && view.matchup && (
        <VotingStage game={game} sharedDisplay={sharedDisplay} roomCode={roomCode} sessionToken={sessionToken} sendGame={sendGame} identity={identity} />
      )}

      {game.phase === "roundReveal" && view.reveal && (
        <PhaseCard title={`Round ${view.generationRound} champion`} kicker={view.reveal.randomTieBreak ? "The chaos coin chose this one" : "The room has spoken"}>
          <ShirtCard shirt={view.reveal.shirt} roomCode={roomCode} sessionToken={sessionToken} />
          <Credits credits={view.reveal.credits} players={players} />
          {isHost ? <PrimaryAction onClick={hostAdvance}>{view.generationRound === 1 ? "Start round two" : "Start finals"}</PrimaryAction> : <Waiting text={view.generationRound === 1 ? "Round two starts shortly…" : "The final tournament starts shortly…"} />}
        </PhaseCard>
      )}

      {(game.phase === "finalReveal" || game.phase === "gameResults") && view.winner && (
        <PhaseCard title="The ultimate shirt" kicker="Shirt Fight champion">
          <ShirtCard shirt={view.winner.shirt} roomCode={roomCode} sessionToken={sessionToken} featured />
          <Credits credits={view.winner.credits} players={players} />
          {game.phase === "finalReveal" ? isHost ? <PrimaryAction onClick={hostAdvance}>Show awards</PrimaryAction> : <Waiting text="Awards are being tailored…" /> : <>
            <div className="shirt-awards" aria-label="Post-game awards">{view.awards?.map((award) => <article key={award.title}><span>{award.title}</span><strong>{award.playerIds.map((id) => playerName(players, id)).join(" & ")}</strong><p>{award.description}</p></article>)}</div>
            {isHost ? <div className="result-actions"><PrimaryAction onClick={playAgain}>Play again</PrimaryAction><button className="secondary-button" type="button" onClick={backToArcade}>Back to arcade</button></div> : <Waiting text="The host chooses what comes next." />}
          </>}
        </PhaseCard>
      )}
    </div>
  );
}

function PublicProgress({ title, kicker, view }: { title: string; kicker: string; view: Game["public"] }) {
  return <PhaseCard title={title} kicker={kicker}><Progress current={view.completedCount} total={view.totalPlayers} label="players ready" /><p className="shared-instruction">Keep this screen where everyone can see it. Private choices stay on player devices.</p></PhaseCard>;
}

function DrawingStudio({ roomCode, sessionToken, deadlineAt }: { roomCode: string; sessionToken: string; deadlineAt: number | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<ImageData[]>([]);
  const active = useRef(false);
  const submitted = useRef(false);
  const [color, setColor] = useState<(typeof SHIRT_FIGHT_COLORS)[number]>("black");
  const [size, setSize] = useState<(typeof SHIRT_FIGHT_BRUSH_SIZES)[number]>("medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!canvas || !context) return;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget, context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    history.current.push(context.getImageData(0, 0, canvas.width, canvas.height));
    if (history.current.length > 20) history.current.shift();
    const { x, y } = point(event);
    context.beginPath(); context.moveTo(x, y); context.lineCap = "round"; context.lineJoin = "round";
    context.strokeStyle = color; context.lineWidth = size === "small" ? 5 : size === "medium" ? 12 : 28;
    active.current = true; canvas.setPointerCapture(event.pointerId); event.preventDefault();
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!active.current) return;
    const context = event.currentTarget.getContext("2d"); if (!context) return;
    const { x, y } = point(event); context.lineTo(x, y); context.stroke(); event.preventDefault();
  };
  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => { active.current = false; event.currentTarget.releasePointerCapture(event.pointerId); event.preventDefault(); };

  const submit = useCallback(async () => {
    if (submitted.current || !canvasRef.current) return;
    submitted.current = true; setSaving(true); setError(null);
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvasRef.current?.toBlob((value) => value ? resolve(value) : reject(new Error("WebP unavailable")), "image/webp", 0.78));
      await uploadShirtFightDrawing(roomCode, sessionToken, blob);
    } catch (caught) {
      submitted.current = false;
      setSaving(false);
      setError(caught instanceof Error ? caught.message : "The drawing could not be saved.");
    }
  }, [roomCode, sessionToken]);

  useEffect(() => {
    if (deadlineAt === undefined) return;
    const timer = window.setTimeout(() => { void submit(); }, Math.max(0, deadlineAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [deadlineAt, submit]);

  const undo = () => { const previous = history.current.pop(), context = canvasRef.current?.getContext("2d"); if (previous && context) context.putImageData(previous, 0, 0); };
  const clear = () => { const canvas = canvasRef.current, context = canvas?.getContext("2d", { willReadFrequently: true }); if (!canvas || !context) return; history.current.push(context.getImageData(0, 0, canvas.width, canvas.height)); context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); };

  return <PhaseCard title="Draw something unforgettable" kicker="Portrait canvas · keep it bold">
    <div className="drawing-tools" aria-label="Drawing tools">
      <div className="color-tools" role="group" aria-label="Brush color">{SHIRT_FIGHT_COLORS.map((value) => <button type="button" key={value} className={`color-swatch ${color === value ? "selected" : ""}`} style={{ "--swatch": value } as React.CSSProperties} aria-label={value === "white" ? "White eraser" : `${value} brush`} aria-pressed={color === value} onClick={() => setColor(value)}><span aria-hidden="true" /></button>)}</div>
      <div className="brush-tools" role="group" aria-label="Brush size">{SHIRT_FIGHT_BRUSH_SIZES.map((value) => <button type="button" key={value} className={size === value ? "selected" : ""} aria-pressed={size === value} onClick={() => setSize(value)}>{value}</button>)}</div>
      <div className="edit-tools"><button type="button" onClick={undo}>Undo</button><button type="button" onClick={clear}>Clear</button></div>
    </div>
    <canvas ref={canvasRef} className="drawing-canvas" width={600} height={800} aria-label="Shirt drawing canvas" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} />
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="primary-button" type="button" disabled={saving} onClick={() => { void submit(); }}>{saving ? "Saving drawing…" : "Lock drawing"}</button>
  </PhaseCard>;
}

function SloganStudio({ game, sendGame, identity }: { game: Game; sendGame: (command: GameCommand) => boolean; identity: { gameInstanceId: string; phaseNonce: number } }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const submit = (event: React.FormEvent) => { event.preventDefault(); const value = text.trim(); if (!value) return; if (sendGame({ type: "shirtFight.submitSlogan", ...identity, text: value })) { setText(""); window.setTimeout(() => inputRef.current?.focus(), 0); } };
  if (game.private.slogansDone) return <PhaseCard title="Slogans locked" kicker="Words are in"><Progress current={game.public.completedCount} total={game.public.totalPlayers} label="writers done" /><Waiting text="Waiting for the room or the timer…" /></PhaseCard>;
  return <PhaseCard title="Write as many slogans as you can" kicker="80 characters max · fast and punchy">
    <form className="slogan-form" onSubmit={submit}><label htmlFor="shirt-slogan">Your next slogan</label><div><input ref={inputRef} id="shirt-slogan" value={text} maxLength={80} autoComplete="off" enterKeyHint="send" onChange={(event) => setText(event.target.value)} /><button className="primary-button" type="submit" disabled={!text.trim()}>Add</button></div><small>{text.length}/80</small></form>
    <ul className="slogan-list" aria-label="Accepted slogans">{game.private.slogans?.map((slogan) => <li key={slogan.id}>{slogan.text}</li>)}</ul>
    <button className="secondary-button" type="button" onClick={() => sendGame({ type: "shirtFight.finishSlogans", ...identity })}>Done writing</button>
  </PhaseCard>;
}

function ShirtBuilder({ game, roomCode, sessionToken, sendGame, identity }: { game: Game; roomCode: string; sessionToken: string; sendGame: (command: GameCommand) => boolean; identity: { gameInstanceId: string; phaseNonce: number } }) {
  const assignment = game.private.assignment;
  const [drawingIndex, setDrawingIndex] = useState(0), [sloganIndex, setSloganIndex] = useState(0);
  if (!assignment?.drawings.length || !assignment.slogans.length) return <PhaseCard title="Tailoring your choices" kicker="Almost ready"><Waiting text="Waiting for a valid assignment…" /></PhaseCard>;
  const drawing = assignment.drawings[drawingIndex % assignment.drawings.length] as NonNullable<typeof assignment.drawings[number]>;
  const slogan = assignment.slogans[sloganIndex % assignment.slogans.length] as NonNullable<typeof assignment.slogans[number]>;
  const wrap = (index: number, delta: number, length: number) => (index + delta + length) % length;
  return <PhaseCard title="Build your contender" kicker="Artwork and words move independently">
    <div className="shirt-builder"><Cycle label="Drawing" onPrevious={() => setDrawingIndex((value) => wrap(value, -1, assignment.drawings.length))} onNext={() => setDrawingIndex((value) => wrap(value, 1, assignment.drawings.length))} /><ShirtCard shirt={{ id: "draft", drawing, slogan: slogan.text }} roomCode={roomCode} sessionToken={sessionToken} /><Cycle label="Slogan" onPrevious={() => setSloganIndex((value) => wrap(value, -1, assignment.slogans.length))} onNext={() => setSloganIndex((value) => wrap(value, 1, assignment.slogans.length))} /></div>
    <button className="primary-button" type="button" onClick={() => sendGame({ type: "shirtFight.submitShirt", ...identity, drawingId: drawing.id, sloganId: slogan.id })}>Lock this shirt</button>
  </PhaseCard>;
}

function Cycle({ label, onPrevious, onNext }: { label: string; onPrevious: () => void; onNext: () => void }) { return <div className="cycle-controls" aria-label={`${label} choices`}><button type="button" aria-label={`Previous ${label.toLowerCase()}`} onClick={onPrevious}>←</button><strong>{label}</strong><button type="button" aria-label={`Next ${label.toLowerCase()}`} onClick={onNext}>→</button></div>; }

function VotingStage({ game, sharedDisplay, roomCode, sessionToken, sendGame, identity }: { game: Game; sharedDisplay: boolean; roomCode: string; sessionToken: string; sendGame: (command: GameCommand) => boolean; identity: { gameInstanceId: string; phaseNonce: number } }) {
  const matchup = game.public.matchup;
  if (!matchup) return null;
  return <PhaseCard title={matchup.suddenDeath ? "Sudden-death rematch" : game.phase === "finalVoting" ? "Final tournament" : "Choose the stronger shirt"} kicker={matchup.suddenDeath ? "One short vote — a second tie goes to the chaos coin" : "Votes are private"}>
    <Progress current={matchup.voteCount} total={game.public.totalPlayers} label="votes in" />
    <div className="shirt-matchup">{matchup.shirts.map((shirt) => sharedDisplay || game.private.hasVoted ? <ShirtCard key={shirt.id} shirt={shirt} roomCode={roomCode} sessionToken={sessionToken} /> : <button className="shirt-vote" type="button" key={shirt.id} onClick={() => sendGame({ type: "shirtFight.submitVote", ...identity, shirtId: shirt.id })}><ShirtCard shirt={shirt} roomCode={roomCode} sessionToken={sessionToken} /><span>Vote for this shirt</span></button>)}</div>
    {(sharedDisplay || game.private.hasVoted) && <Waiting text={sharedDisplay ? "Players vote on their own devices." : "Vote locked. Waiting for the runway…"} />}
  </PhaseCard>;
}

function ShirtCard({ shirt, roomCode, sessionToken, featured = false }: { shirt: { id: string; drawing: { id: string; width: number; height: number }; slogan: string }; roomCode: string; sessionToken: string; featured?: boolean }) {
  const imageUrl = useDrawingUrl(roomCode, sessionToken, shirt.drawing.id);
  return <article className={`shirt-card ${featured ? "featured" : ""}`}><div className="shirt-silhouette"><div className="shirt-print">{imageUrl ? <img src={imageUrl} alt="Player-created shirt artwork" draggable={false} /> : <span className="art-loading">Loading art…</span>}<strong>{shirt.slogan}</strong></div></div></article>;
}

function Credits({ credits, players }: { credits: { artistPlayerId: string; authorPlayerId: string; assemblerPlayerId: string }; players: PlayerView[] }) { return <dl className="shirt-credits"><div><dt>Artist</dt><dd>{playerName(players, credits.artistPlayerId)}</dd></div><div><dt>Words</dt><dd>{playerName(players, credits.authorPlayerId)}</dd></div><div className="winner-credit"><dt>Shirt creator</dt><dd>{playerName(players, credits.assemblerPlayerId)}</dd></div></dl>; }

function useDrawingUrl(roomCode: string, sessionToken: string, drawingId: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false, objectUrl: string | undefined;
    void fetchShirtFightDrawing(roomCode, sessionToken, drawingId).then((blob) => { if (cancelled) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => setUrl(null));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [drawingId, roomCode, sessionToken]);
  return url;
}

function useCountdown(deadlineAt?: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (deadlineAt === undefined) return; const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, [deadlineAt]);
  return deadlineAt === undefined ? 0 : Math.max(0, Math.ceil((deadlineAt - now) / 1_000));
}
