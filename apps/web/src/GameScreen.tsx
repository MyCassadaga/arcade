import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type {
  ClientMessage,
  GameCommand,
  ImpostorPublicView,
  PlayerView,
  RoomView,
  TypedGameViewerState,
  WhoSaidThatPublicView
} from "@team-arcade/shared";

interface GameScreenProps {
  game: TypedGameViewerState;
  room: RoomView;
  selfId: string;
  send: (message: ClientMessage) => boolean;
}

export function GameScreen({ game, room, selfId, send }: GameScreenProps) {
  const self = room.players.find((player) => player.id === selfId);
  const sendGame = (command: GameCommand) => send({
    type: "game.command",
    requestId: crypto.randomUUID(),
    payload: { command }
  });
  const hostAdvance = () => send({ type: "host.advance", requestId: crypto.randomUUID(), payload: {} });
  const playAgain = () => send({ type: "host.startGame", requestId: crypto.randomUUID(), payload: {} });
  const backToArcade = () => send({ type: "host.backToArcade", requestId: crypto.randomUUID(), payload: {} });

  return (
    <section className={`game-stage ${game.gameId}`} aria-live="polite">
      <div className="phase-topline">
        <span>{game.gameId === "who-said-that" ? "Who Said That?" : "Impostor"}</span>
        <span>Round {game.public.roundNumber} of {game.public.totalRounds}</span>
      </div>
      {game.gameId === "who-said-that" ? (
        <WhoSaidThatScreen
          game={game}
          players={room.players}
          selfId={selfId}
          isHost={self?.isHost === true}
          sendGame={sendGame}
          hostAdvance={hostAdvance}
          playAgain={playAgain}
          backToArcade={backToArcade}
        />
      ) : (
        <ImpostorScreen
          game={game}
          players={room.players}
          selfId={selfId}
          isHost={self?.isHost === true}
          sendGame={sendGame}
          hostAdvance={hostAdvance}
          playAgain={playAgain}
          backToArcade={backToArcade}
        />
      )}
    </section>
  );
}

interface SharedGameProps {
  players: PlayerView[];
  selfId: string;
  isHost: boolean;
  sendGame: (command: GameCommand) => boolean;
  hostAdvance: () => boolean;
  playAgain: () => boolean;
  backToArcade: () => boolean;
}

function WhoSaidThatScreen({ game, players, selfId, isHost, sendGame, hostAdvance, playAgain, backToArcade }: SharedGameProps & { game: Extract<TypedGameViewerState, { gameId: "who-said-that" }> }) {
  const view = game.public;
  if (game.phase === "submitting") {
    return (
      <PhaseCard title="Answer in your own words" kicker="A fresh prompt">
        <blockquote className="prompt-card">{view.prompt}</blockquote>
        <Progress current={view.submissionCount} total={view.totalPlayers} label="answers in" />
        <AnswerForm
          key={`${view.roundNumber}-${game.private.submittedAnswer ?? "new"}`}
          initialValue={game.private.submittedAnswer ?? ""}
          submitted={game.private.hasSubmitted}
          onSubmit={(answer) => sendGame({ type: "wst.submitAnswer", answer })}
        />
      </PhaseCard>
    );
  }

  if (game.phase === "guessing") {
    return (
      <PhaseCard title={`Who said this?`} kicker={`Answer ${view.currentAnswerNumber} of ${view.totalAnswers}`}>
        <blockquote className="answer-card">“{view.currentAnswer}”</blockquote>
        <Progress current={view.guessCount ?? 0} total={view.eligibleGuessCount ?? 0} label="guesses locked" />
        {game.private.isCurrentAuthor ? (
          <Waiting text="You wrote this one — watch everyone guess." />
        ) : game.private.hasGuessed ? (
          <Waiting text="Guess locked. Waiting for everyone else…" />
        ) : (
          <ChoiceGrid
            players={players.filter((player) => player.id !== selfId)}
            label="Choose the author"
            onChoose={(targetPlayerId) => sendGame({ type: "wst.submitGuess", targetPlayerId })}
          />
        )}
      </PhaseCard>
    );
  }

  if (game.phase === "reveal" && view.reveal) {
    const author = playerName(players, view.reveal.authorPlayerId);
    return (
      <PhaseCard title={`${author} said that!`} kicker="Answer revealed">
        <blockquote className="answer-card">“{view.currentAnswer}”</blockquote>
        <Distribution players={players} values={view.reveal.distribution} title="Guess spread" />
        <Points players={players} scores={view.reveal.pointsAwarded} />
        {isHost ? <PrimaryAction onClick={hostAdvance}>Next answer</PrimaryAction> : <Waiting text="The host will reveal the next answer." />}
      </PhaseCard>
    );
  }

  if (game.phase === "roundResults") {
    return (
      <PhaseCard title="Round complete" kicker={`Round ${view.roundNumber} scores`}>
        <ScoreBoard players={players} scores={view.roundScores} />
        {isHost
          ? <PrimaryAction onClick={hostAdvance}>{view.roundNumber === view.totalRounds ? "See game results" : "Start next round"}</PrimaryAction>
          : <Waiting text="Waiting for the host to continue…" />}
      </PhaseCard>
    );
  }

  return <GameResults title="Who knew the team best?" view={view} players={players} isHost={isHost} playAgain={playAgain} backToArcade={backToArcade} />;
}

function ImpostorScreen({ game, players, selfId, isHost, sendGame, hostAdvance, playAgain, backToArcade }: SharedGameProps & { game: Extract<TypedGameViewerState, { gameId: "impostor" }> }) {
  const view = game.public;
  const role = game.private;

  if (game.phase === "roleReveal") {
    return (
      <PhaseCard title={role.role === "impostor" ? "You are the Impostor" : "You know the word"} kicker="Keep this screen private">
        {role.role === "impostor"
          ? <div className="secret-card danger"><span>Blend in</span><strong>No word for you</strong><p>Listen carefully and give a convincing clue.</p></div>
          : <div className="secret-card"><span>The secret word</span><strong>{role.secretWord}</strong><p>Give a clue that proves you know it without giving it away.</p></div>}
        {isHost ? <PrimaryAction onClick={hostAdvance}>Everyone ready — start clues</PrimaryAction> : <Waiting text="Read your role. The host will start clues." />}
      </PhaseCard>
    );
  }

  if (game.phase === "clueSubmission") {
    return (
      <PhaseCard title="Give one subtle clue" kicker={role.role === "impostor" ? "Think fast. Fit in." : `Your word is ${role.secretWord}`}>
        <Progress current={view.clueCount} total={view.totalPlayers} label="clues in" />
        {role.hasSubmittedClue
          ? <Waiting text="Clue locked. Waiting for the others…" />
          : <TextCommandForm label="Your clue" maxLength={32} button="Lock clue" onSubmit={(clue) => sendGame({ type: "impostor.submitClue", clue })} />}
      </PhaseCard>
    );
  }

  if (game.phase === "clueReveal") {
    const latest = view.revealedClues.at(-1);
    return (
      <PhaseCard title={latest ? playerName(players, latest.playerId) : "Reveal the clues"} kicker={`Clue ${view.revealedClues.length} of ${view.totalPlayers}`}>
        <blockquote className="answer-card">“{latest?.clue}”</blockquote>
        {isHost
          ? <PrimaryAction onClick={hostAdvance}>{view.revealedClues.length === view.totalPlayers ? "Start discussion" : "Next clue"}</PrimaryAction>
          : <Waiting text="Talk it over while the host reveals clues." />}
      </PhaseCard>
    );
  }

  if (game.phase === "discussion") {
    return (
      <PhaseCard title="Who sounds suspicious?" kicker="Discuss the clues">
        <ClueList players={players} clues={view.revealedClues} />
        {isHost ? <PrimaryAction onClick={hostAdvance}>Start vote</PrimaryAction> : <Waiting text="Discuss. The host will open voting." />}
      </PhaseCard>
    );
  }

  if (game.phase === "voting") {
    const candidates = players.filter((player) => player.id !== selfId && (view.runoffCandidates?.includes(player.id) ?? true));
    return (
      <PhaseCard title={view.voteRound === 2 ? "Runoff vote" : "Find the Impostor"} kicker={view.voteRound === 2 ? "The tie must be broken" : "Vote in secret"}>
        <Progress current={view.voteCount} total={view.totalPlayers} label="votes locked" />
        {role.hasVoted
          ? <Waiting text="Vote locked. Waiting for everyone else…" />
          : <ChoiceGrid players={candidates} label="Cast your vote" onChoose={(targetPlayerId) => sendGame({ type: "impostor.submitVote", targetPlayerId })} />}
      </PhaseCard>
    );
  }

  if (game.phase === "voteReveal" && view.voteReveal) {
    const outcome = view.voteReveal.outcome;
    const title = outcome === "runoff" ? "We have a tie" : outcome === "caught" ? "Impostor caught!" : "The Impostor escaped";
    return (
      <PhaseCard title={title} kicker="Vote reveal">
        <Distribution players={players} values={view.voteReveal.totals} />
        {view.voteReveal.accusedPlayerId && <p className="outcome-copy">Most votes: <strong>{playerName(players, view.voteReveal.accusedPlayerId)}</strong></p>}
        {isHost
          ? <PrimaryAction onClick={hostAdvance}>{outcome === "runoff" ? "Start runoff" : outcome === "caught" ? "Give the Impostor one guess" : "Show round results"}</PrimaryAction>
          : <Waiting text="Waiting for the host to continue…" />}
      </PhaseCard>
    );
  }

  if (game.phase === "impostorGuess") {
    return (
      <PhaseCard title="One last chance" kicker="Guess the secret word">
        {role.role === "impostor"
          ? <TextCommandForm label="Secret word guess" maxLength={64} button="Make final guess" onSubmit={(guess) => sendGame({ type: "impostor.submitGuess", guess })} />
          : <Waiting text="The Impostor is trying to steal the round…" />}
      </PhaseCard>
    );
  }

  if (game.phase === "roundResults" && view.roundResult) {
    const result = view.roundResult;
    const title = result.outcome === "escaped" ? "The Impostor escaped" : result.outcome === "stolen" ? "The Impostor stole it" : "The team wins";
    return (
      <PhaseCard title={title} kicker="Round results">
        <div className="result-facts"><span>Secret word<strong>{result.secretWord}</strong></span><span>Impostor<strong>{playerName(players, result.impostorPlayerId)}</strong></span></div>
        {result.finalGuess && <p className="outcome-copy">Final guess: <strong>{result.finalGuess}</strong></p>}
        <Points players={players} scores={result.pointsAwarded} />
        {isHost
          ? <PrimaryAction onClick={hostAdvance}>{view.roundNumber === view.totalRounds ? "See game results" : "Start next round"}</PrimaryAction>
          : <Waiting text="Waiting for the host to continue…" />}
      </PhaseCard>
    );
  }

  return <GameResults title="Final undercover standings" view={view} players={players} isHost={isHost} playAgain={playAgain} backToArcade={backToArcade} />;
}

function PhaseCard({ title, kicker, children }: { title: string; kicker: string; children: ReactNode }) {
  return <div className="phase-card"><p className="phase-kicker">{kicker}</p><h2>{title}</h2>{children}</div>;
}

function AnswerForm({ initialValue, submitted, onSubmit }: { initialValue: string; submitted: boolean; onSubmit: (value: string) => boolean }) {
  return <TextCommandForm label="Your answer" maxLength={160} button={submitted ? "Update answer" : "Submit answer"} initialValue={initialValue} onSubmit={onSubmit} />;
}

function TextCommandForm({ label, maxLength, button, initialValue = "", onSubmit }: { label: string; maxLength: number; button: string; initialValue?: string; onSubmit: (value: string) => boolean }) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => setValue(initialValue), [initialValue]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim() && onSubmit(value.trim())) setValue("");
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

function ChoiceGrid({ players, label, onChoose }: { players: PlayerView[]; label: string; onChoose: (playerId: string) => boolean }) {
  return <div className="choice-section"><h3>{label}</h3><div className="choice-grid">{players.map((player) => <button type="button" key={player.id} onClick={() => onChoose(player.id)}>{player.displayName}</button>)}</div></div>;
}

function Progress({ current, total, label }: { current: number; total: number; label: string }) {
  return <div className="game-progress"><div><strong>{current}/{total}</strong><span>{label}</span></div><progress max={total} value={current} aria-label={`${current} of ${total} ${label}`} /></div>;
}

function Waiting({ text }: { text: string }) {
  return <div className="waiting-card" role="status"><i aria-hidden="true" /><span>{text}</span></div>;
}

function PrimaryAction({ onClick, children }: { onClick: () => boolean; children: ReactNode }) {
  return <button className="primary-button phase-action" type="button" onClick={onClick}>{children}</button>;
}

function Distribution({ players, values, title = "Vote spread" }: { players: PlayerView[]; values: Record<string, number>; title?: string }) {
  return <div className="distribution"><h3>{title}</h3>{Object.entries(values).sort(([, a], [, b]) => b - a).map(([playerId, count]) => <div key={playerId}><span>{playerName(players, playerId)}</span><strong>{count}</strong></div>)}</div>;
}

function Points({ players, scores }: { players: PlayerView[]; scores: Record<string, number> }) {
  const earned = Object.entries(scores).filter(([, score]) => score > 0);
  return <div className="points-strip">{earned.length === 0 ? <span>No points this time</span> : earned.map(([playerId, score]) => <span key={playerId}><strong>+{score}</strong> {playerName(players, playerId)}</span>)}</div>;
}

function ScoreBoard({ players, scores }: { players: PlayerView[]; scores: Record<string, number> }) {
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  return <ol className="game-scoreboard">{sorted.map(([playerId, score], index) => {
    const previous = sorted[index - 1];
    const placement = previous?.[1] === score ? sorted.findIndex(([, candidate]) => candidate === score) + 1 : index + 1;
    return <li key={playerId}><span>{placement}</span><strong>{playerName(players, playerId)}</strong><b>{score} pts</b></li>;
  })}</ol>;
}

function GameResults({ title, view, players, isHost, playAgain, backToArcade }: { title: string; view: WhoSaidThatPublicView | ImpostorPublicView; players: PlayerView[]; isHost: boolean; playAgain: () => boolean; backToArcade: () => boolean }) {
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

function ClueList({ players, clues }: { players: PlayerView[]; clues: Array<{ playerId: string; clue: string }> }) {
  return <ul className="clue-list">{clues.map(({ playerId, clue }) => <li key={playerId}><strong>{playerName(players, playerId)}</strong><span>{clue}</span></li>)}</ul>;
}

function playerName(players: PlayerView[], playerId: string): string {
  return players.find((player) => player.id === playerId)?.displayName ?? "Unknown player";
}
