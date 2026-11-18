import { useState } from "react";
import type { ChangeEvent } from "react";
import { MAX_PLAYERS } from "@team-arcade/shared";
import type { GameCommand, PlayerView, TypedGameViewerState } from "@team-arcade/shared";
import { GameResults, PhaseCard, Points, Progress, Waiting, playerName } from "./game-presentation";
import { uploadTwoTruthsDeck } from "./api";
import "./two-truths.css";

type View = Extract<TypedGameViewerState, { gameId: "two-truths" }>;
interface Props {
  game: View; players: PlayerView[]; selfId: string; isHost: boolean;
  roomCode: string; sessionToken: string; disabled: boolean;
  sendGame: (command: GameCommand) => boolean;
  playAgain: () => boolean; backToArcade: () => boolean;
}
export function TwoTruthsScreen(props: Props) {
  return <TwoTruthsPhase key={`${props.game.public.gameInstanceId}-${props.game.public.phaseNonce}`} {...props} />;
}
function TwoTruthsPhase({ game, players, selfId, isHost, roomCode, sessionToken, disabled, sendGame, playAgain, backToArcade }: Props) {
  const view = game.public;
  const [selection, setSelection] = useState<number | undefined>(game.private.selection);
  const displayedSelection = game.private.selection ?? selection;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const identity = { gameInstanceId: view.gameInstanceId, phaseNonce: view.phaseNonce };
  const connectedCount = players.filter(p => p.connected).length;
  const namesReady = view.participantNames.filter(name => players.some(p => p.connected && p.displayName.trim().toLowerCase() === name.toLowerCase()));
  async function load(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(""); setUploading(true);
    try { await uploadTwoTruthsDeck(roomCode, sessionToken, identity, file); }
    catch { setError("The prepared file could not be loaded. Check your connection or ask the preparer to check it privately, then try again."); }
    finally { setUploading(false); }
  }
  if (game.phase === "setup") return <PhaseCard title="Keep it sealed" kicker="Two Truths and a Lie">
    <div className="tt-seal" aria-hidden="true">✉<span>2 + 1</span></div>
    <p>Load the prepared game file without opening it. No statement preview. The host plays blind too.</p>
    <p>1–12 players. One round per connected survey respondent. Correct guesses earn 1 point.</p>
    <p>Respondents start at 0 and sit out their own round. Players without a matching response start at −1 and guess every round. That gives everyone the same maximum score. Missing or wrong guesses earn 0.</p>
    {view.loaded ? <>
      <h3>Game file sealed</h3>
      <p>{view.totalRounds} {view.totalRounds === 1 ? "response" : "responses"} loaded · {connectedCount} {connectedCount === 1 ? "player" : "players"} connected · {namesReady.length} {namesReady.length === 1 ? "round" : "rounds"} available</p>
      <p>Responses without a matching connected player are skipped. At least one respondent must be connected to begin.</p>
      {namesReady.length === 0 && <p role="status">No matching survey respondent is connected. Join using a prepared-file name to begin.</p>}
      <ul className="tt-roster">{view.participantNames.map(name => <li key={name}>{namesReady.includes(name) ? "✓ Connected: " : "Skipped if absent: "}{name}</li>)}</ul>
      {isHost ? <button className="primary-button" disabled={disabled || namesReady.length === 0 || connectedCount < 1 || connectedCount > MAX_PLAYERS} onClick={() => sendGame({ type: "twoTruths.begin", ...identity })}>Begin blind game</button> : <Waiting text="The host will begin with the connected players." />}
    </> : isHost ? <label className="tt-import">Prepared game file (.json)
      <input type="file" accept=".json,application/json" disabled={disabled || uploading} onChange={event => { void load(event); }} />
      <small>This is the assistant-prepared game file, not the original spreadsheet.</small>
    </label> : <Waiting text="The host is loading the sealed game file." />}
    {uploading && <p role="status">Sealing game file…</p>}
    {error && <p role="alert">{error}</p>}
    {isHost && <button className="secondary-button" disabled={disabled || uploading} onClick={backToArcade}>Back to arcade</button>}
  </PhaseCard>;
  if (game.phase === "gameResults") return <fieldset className="tt-controls" disabled={disabled}><GameResults title="Who spotted the lies?" view={view} players={players} isHost={isHost} playAgain={playAgain} backToArcade={backToArcade} /><p>Play again opens an empty setup. A known deck will not be a surprise. Correct guesses earn 1 point. Missing or wrong guesses earn 0. The subject sits out their own round.</p></fieldset>;
  const revealed = game.phase === "reveal";
  const subject = view.subjectPlayerId === selfId;
  const locked = game.private.hasGuessed;
  return <PhaseCard title={playerName(players, view.subjectPlayerId ?? "")} kicker={`Round ${view.roundNumber} of ${view.totalRounds} · Two Truths and a Lie`}>
    <p>{revealed ? "The lie is revealed." : "Two are true. Which one is the lie?"}</p>
    <fieldset className="tt-options" disabled={disabled || locked || revealed || !game.private.canGuess}>
      <legend className="sr-only">Choose the lie</legend>
      {view.statements?.map((text, index) => <label className={`tt-option ${displayedSelection === index ? "tt-selected" : ""} ${revealed ? index === view.lieOption ? "tt-lie" : "tt-truth" : ""}`} key={index}>
        <input type="radio" name="lie-choice" value={index} checked={displayedSelection === index} onChange={() => setSelection(index)} />
        <span className="tt-letter">{"ABC"[index]}</span><span className="tt-statement">{text}</span>
        <strong>{revealed ? index === view.lieOption ? "✕ Lie" : "✓ Truth" : displayedSelection === index ? "Selected" : ""}</strong>
      </label>)}
    </fieldset>
    {revealed ? <>
      <Points players={players} scores={view.pointsAwarded ?? {}} />
      {isHost ? <button className="primary-button" disabled={disabled} onClick={() => sendGame({ type: "twoTruths.next", ...identity })}>{view.roundNumber === view.totalRounds ? "See final standings" : "Next person"}</button> : <Waiting text="The host will continue." />}
    </> : <>
      {view.eligibleGuessCount > 0 ? <Progress current={view.guessCount} total={view.eligibleGuessCount} label="guesses locked" /> : <p>No guesses are needed. The host can reveal this round.</p>}
      {subject ? <Waiting text="These are your statements. Sit out this round and keep a straight face." /> : locked ? <Waiting text="Guess locked. Waiting for the reveal." /> : game.private.canGuess ? <button className="primary-button" disabled={disabled || selection === undefined} onClick={() => selection !== undefined && sendGame({ type: "twoTruths.submitGuess", ...identity, option: selection })}>Lock guess</button> : <Waiting text="You are watching this game." />}
      {isHost && <button className="secondary-button" disabled={disabled} onClick={() => sendGame({ type: "twoTruths.reveal", ...identity })}>{view.eligibleGuessCount === 0 ? "Reveal lie" : `Close voting and reveal (${view.eligibleGuessCount - view.guessCount} missing)`}</button>}
      <p className="tt-note">Missing guesses earn 0. The subject does not vote.</p>
    </>}
  </PhaseCard>;
}
