import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { PlayerView } from "@team-arcade/shared";

export function PhaseCard({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return <div className="phase-card"><p className="phase-kicker">{kicker}</p><h2>{title}</h2>{children}</div>;
}

export function AnswerForm({ initialValue, submitted, onSubmit }: { initialValue: string; submitted: boolean; onSubmit: (value: string) => boolean }) {
  return <TextCommandForm label="Your answer" maxLength={160} button={submitted ? "Update answer" : "Submit answer"} initialValue={initialValue} onSubmit={onSubmit} />;
}

export function TextCommandForm({ label, maxLength, button, initialValue = "", clearOnSubmit = true, onSubmit }: { label: string; maxLength: number; button: string; initialValue?: string; clearOnSubmit?: boolean; onSubmit: (value: string) => boolean }) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() && onSubmit(value.trim()) && clearOnSubmit) setValue("");
  };
  return (
    <form className="command-form" onSubmit={submit}>
      <label htmlFor={`command-${label.replaceAll(" ", "-")}`}>{label}</label>
      <textarea id={`command-${label.replaceAll(" ", "-")}`} value={value} maxLength={maxLength} onChange={(event) => setValue(event.target.value)} />
      <div className="character-count">{value.length}/{maxLength}</div>
      <button className="primary-button" type="submit" disabled={!value.trim()}>{button}</button>
    </form>
  );
}

export function Progress({ current, total, label }: { current: number; total: number; label: string }) {
  return <div className="game-progress"><div><strong>{current}/{total}</strong><span>{label}</span></div><progress max={total} value={current} aria-label={`${current} of ${total} ${label}`} /></div>;
}

export function Waiting({ text }: { text: string }) {
  return <div className="waiting-card" role="status"><i aria-hidden="true" /><span>{text}</span></div>;
}

export function PrimaryAction({ onClick, children }: { onClick: () => boolean; children: ReactNode }) {
  return <button className="primary-button phase-action" type="button" onClick={onClick}>{children}</button>;
}

export function Points({ players, scores }: { players: PlayerView[]; scores: Record<string, number> }) {
  const earned = Object.entries(scores).filter(([, score]) => score > 0);
  return <div className="points-strip">{earned.length === 0 ? <span>No points this time</span> : earned.map(([playerId, score]) => <span key={playerId}><strong>+{score}</strong> {playerName(players, playerId)}</span>)}</div>;
}

export function ScoreBoard({ players, scores }: { players: PlayerView[]; scores: Record<string, number> }) {
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  return <ol className="game-scoreboard">{sorted.map(([playerId, score], index) => {
    const previous = sorted[index - 1];
    const placement = previous?.[1] === score ? sorted.findIndex(([, candidate]) => candidate === score) + 1 : index + 1;
    return <li key={playerId}><span>{placement}</span><strong>{playerName(players, playerId)}</strong><b>{score} pts</b></li>;
  })}</ol>;
}

export function GameResults({ title, view, players, isHost, playAgain, backToArcade }: { title: string; view: { gameScores: Record<string, number> }; players: PlayerView[]; isHost: boolean; playAgain: () => boolean; backToArcade: () => boolean }) {
  const topScore = Math.max(...Object.values(view.gameScores));
  const winners = Object.entries(view.gameScores).filter(([, score]) => score === topScore).map(([playerId]) => playerName(players, playerId));
  return (
    <PhaseCard title={title} kicker="Game complete">
      <div className="winner-celebration" role="status">
        <span className="celebration-burst" aria-hidden="true">✦</span>
        <p>{winners.length === 1 ? "Arcade champion" : "Arcade champions"}<strong>{winners.join(" & ")}</strong></p>
        <span className="celebration-burst celebration-burst-two" aria-hidden="true">★</span>
      </div>
      <ScoreBoard players={players} scores={view.gameScores} />
      {isHost ? <div className="result-actions"><PrimaryAction onClick={playAgain}>Play again</PrimaryAction><button className="secondary-button" type="button" onClick={backToArcade}>Back to arcade</button></div> : <Waiting text="The host can play again or return to the arcade." />}
    </PhaseCard>
  );
}

export function playerName(players: PlayerView[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.displayName ?? "Unknown player";
}
