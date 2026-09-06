import type { TypedGameViewerState } from "@team-arcade/shared";
import type { SharedGameProps } from "./GameScreen";
import { GameResults, PhaseCard, Points, PrimaryAction, Progress, ScoreBoard, TextCommandForm, Waiting, playerName } from "./game-presentation";

export function CategoriesScreen({ game, players, isHost, sendGame, hostAdvance, playAgain, backToArcade }: SharedGameProps & {
  game: Extract<TypedGameViewerState, { gameId: "categories" }>;
}) {
  const view = game.public;
  if (game.phase === "submitting") return (
    <PhaseCard title="Think of a unique answer" kicker="Duplicate answers cancel">
      <blockquote className="prompt-card">{view.category}</blockquote>
      <p>One answer, up to 40 characters. You can edit until everyone submits. Unique answers earn 1 point; matching answers earn 0.</p>
      <Progress current={view.submissionCount} total={view.totalPlayers} label="answers in" />
      <TextCommandForm key={`${view.gameInstanceId}-${view.roundNumber}-${game.private.submittedAnswer ?? "new"}`}
        label="Your answer" maxLength={40} clearOnSubmit={false} initialValue={game.private.submittedAnswer ?? ""}
        button={game.private.hasSubmitted ? "Update answer" : "Submit answer"}
        onSubmit={(answer) => sendGame({ type: "categories.submitAnswer", answer,
          gameInstanceId: view.gameInstanceId, roundNumber: view.roundNumber })} />
      {game.private.hasSubmitted && <Waiting text="Answer saved. You can still update it while others are thinking." />}
    </PhaseCard>
  );
  if (game.phase === "reveal") return (
    <PhaseCard title="Unique or cancelled?" kicker={view.category}>
      <p>Matching ignores case, repeated spaces, and punctuation around the answer. Every author in a matching group earns 0 points.</p>
      {(["unique", "cancelled"] as const).map((result) => {
        const groups = view.groups?.filter((group) => group.result === result) ?? [];
        return <section className="category-results" key={result} aria-label={result === "unique" ? "Unique answers" : "Cancelled answers"}>
          <h3>{result === "unique" ? "Unique — 1 point each" : "Cancelled — 0 points"}</h3>
          {groups.length === 0 ? <p>{result === "unique" ? "No unique answers this round." : "No matching answers this round."}</p> :
            groups.map((group) => <div className="category-group" key={group.answers[0]?.playerId}>
              <ul className="clue-list">{group.answers.map(({ playerId, answer }) =>
                <li key={playerId}><strong>{playerName(players, playerId)}</strong><span>{answer}</span></li>)}</ul>
              {result === "cancelled" && <p>These {group.answers.length} answers match, so they cancel each other.</p>}
            </div>)}
        </section>;
      })}
      <Points players={players} scores={view.roundScores} />
      {isHost ? <PrimaryAction onClick={hostAdvance}>See round scores</PrimaryAction> : <Waiting text="The host will show the round scores." />}
    </PhaseCard>
  );
  if (game.phase === "roundResults") return (
    <PhaseCard title="Round complete" kicker={`Round ${view.roundNumber} scores`}>
      <ScoreBoard players={players} scores={view.roundScores} />
      {isHost ? <PrimaryAction onClick={hostAdvance}>{view.roundNumber === view.totalRounds ? "See game results" : "Start next round"}</PrimaryAction>
        : <Waiting text="Waiting for the host to continue…" />}
    </PhaseCard>
  );
  return <GameResults title="Original thinkers" view={view} players={players} isHost={isHost} playAgain={playAgain} backToArcade={backToArcade} />;
}
