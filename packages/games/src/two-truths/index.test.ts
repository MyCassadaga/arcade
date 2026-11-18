import { describe, expect, it } from "vitest";
import { type TwoTruthsState, createTwoTruthsState, loadTwoTruthsDeck, handleTwoTruthsCommand, getTwoTruthsPublicView, getTwoTruthsPrivateView } from ".";
import { twoTruthsDeckSchema, twoTruthsCommandSchema, type PlayerView, type TwoTruthsDeck } from "@team-arcade/shared";
const players: PlayerView[] = Array.from({ length: 7 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, displayName: `Player ${i}`, connected: true, isHost: i === 0, score: 0 }));
const deck: TwoTruthsDeck = { version: 1, participants: players.map((p, i) => ({ displayName: p.displayName, truths: [`Fixture truth ${i} A`, `Fixture truth ${i} B`], lie: `Fixture fiction ${i}`, lieSource: i === 0 ? "authored" : "generated" })) };
const instance = "00000000-0000-4000-8000-999999999999";
const host = players[0]!.id;
const make = () => loadTwoTruthsDeck(createTwoTruthsState({ players, now: 0, random: () => 0.5 }, instance), deck, instance, 0);
function begin() { const s = make(); return handleTwoTruthsCommand(s, { type: "twoTruths.begin", gameInstanceId: instance, phaseNonce: s.phaseNonce }, host, true, players, () => 0.5).state; }
describe("Two Truths sealed engine", () => {
  it.each([1, 5, 7])("plays %s respondent rounds with all seven seats, including nonrespondents", count => {
    const packet = { ...deck, participants: deck.participants.slice(0, count) };
    let state = loadTwoTruthsDeck(createTwoTruthsState({ players, now: 0, random: () => 0.5 }, instance), packet, instance, 0);
    expect(getTwoTruthsPublicView(state).totalRounds).toBe(count);
    state = handleTwoTruthsCommand(state, { type: "twoTruths.begin", gameInstanceId: instance, phaseNonce: state.phaseNonce }, host, true, players, () => 0.5).state;
    expect(state.playerIds).toHaveLength(7); expect(state.rounds).toHaveLength(count);
    for (let index = 0; index < count; index++) {
      const round = state.rounds[state.roundIndex]!;
      const identity = { gameInstanceId: instance, phaseNonce: state.phaseNonce };
      expect(getTwoTruthsPublicView(state).eligibleGuessCount).toBe(6);
      expect(getTwoTruthsPublicView(state).totalRounds).toBe(count);
      for (const player of players.filter(p => p.id !== round.subjectPlayerId)) {
        expect(getTwoTruthsPrivateView(state, player.id).canGuess).toBe(true);
        state = handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.submitGuess", option: round.lieOption }, player.id, false, players, () => 0).state;
      }
      expect(state.phase).toBe("reveal");
      state = handleTwoTruthsCommand(state, { type: "twoTruths.next", gameInstanceId: instance, phaseNonce: state.phaseNonce }, host, true, players, () => 0).state;
    }
    expect(state.phase).toBe("gameResults");
    for (const [index, player] of players.entries()) expect(state.gameScores[player.id]).toBe(index < count ? count - 1 : count - 1);
  });
  it("rejects empty/eight respondent decks and no connected matches before randomization", () => {
    expect(twoTruthsDeckSchema.safeParse({ ...deck, participants: [] }).success).toBe(false);
    expect(twoTruthsDeckSchema.safeParse({ ...deck, participants: [...deck.participants, { ...deck.participants[0]!, displayName: "Eighth respondent" }] }).success).toBe(false);
    const state = make();
    const command = { type: "twoTruths.begin" as const, gameInstanceId: instance, phaseNonce: 1 };
    const noRandom = () => { throw Error("Must validate before RNG"); };
    for (const roster of [[], players.map(p => ({ ...p, connected: false })), players.map(p => ({ ...p, displayName: "Unmatched" })), Array.from({ length: 13 }, (_, i) => ({ ...players[0]!, id: String(i) }))])
      expect(() => handleTwoTruthsCommand(state, command, host, true, roster, noRandom)).toThrow(/at least one survey respondent/);
    expect(state.playerIds).toEqual([]); expect(state.rounds).toEqual([]); expect(state.gameScores).toEqual({});
  });
  it.each([1, 2, 6, 8, 12])("freezes %s connected attendees, skips absent responses and applies signed initial scores once", count => {
    const roster = Array.from({ length: count }, (_, i) => ({ ...players[i % 7]!, id: String(i), displayName: i === 0 ? "  PLAYER 0  " : `Extra ${i}` }));
    const disconnected = { ...players[1]!, connected: false };
    const result = handleTwoTruthsCommand(make(), { type: "twoTruths.begin", gameInstanceId: instance, phaseNonce: 1 }, host, true, [...roster, disconnected], () => 0.5);
    let state = result.state;
    expect(state.playerIds).toEqual(roster.map(p => p.id));
    expect(state.rounds).toHaveLength(1); expect(state.rounds[0]!.subjectPlayerId).toBe("0");
    expect(result.scoreDelta).toEqual(Object.fromEntries(roster.map((p, i) => [p.id, i === 0 ? 0 : -1])));
    expect(state.gameScores).toEqual(result.scoreDelta);
    const identity = { gameInstanceId: instance, phaseNonce: state.phaseNonce };
    expect(() => handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.submitGuess", option: 0 }, disconnected.id, false, roster, () => 0)).toThrow();
    for (const player of roster.slice(1)) state = handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.submitGuess", option: state.rounds[0]!.lieOption }, player.id, false, [], () => 0).state;
    if (count === 1) {
      expect(state.phase).toBe("guessing"); expect(getTwoTruthsPublicView(state).eligibleGuessCount).toBe(0);
      state = handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.reveal" }, host, true, [], () => 0).state;
    }
    expect(state.phase).toBe("reveal"); expect(Object.values(state.gameScores)).toEqual(Array(count).fill(0));
    expect(state.playerIds).toEqual(roster.map(p => p.id));
  });
  it("continues historical active v1 scores without applying a new penalty", () => {
    let state = begin();
    state = { ...state, rounds: state.rounds.slice(0, 5), gameScores: Object.fromEntries(state.playerIds.map(id => [id, 3])) };
    const result = handleTwoTruthsCommand(JSON.parse(JSON.stringify(state)) as TwoTruthsState, { type: "twoTruths.reveal", gameInstanceId: instance, phaseNonce: state.phaseNonce }, host, true, [], () => 0);
    expect(Object.values(result.state.gameScores)).toEqual(Array(7).fill(3));
    expect(Object.values(result.scoreDelta!)).toEqual(Array(7).fill(0));
  });

  it("keeps setup sealed for host and every viewer, freezes roster only at begin", () => {
    const s = make(); const view = getTwoTruthsPublicView(s);
    expect(view.loaded).toBe(true); expect(view.participantNames).toHaveLength(7);
    expect(JSON.stringify(view)).not.toContain("Fixture");
    for (const p of players) expect(getTwoTruthsPrivateView(s, p.id)).toEqual({ canGuess: false, hasGuessed: false });
    expect(handleTwoTruthsCommand(s, { type: "twoTruths.begin", gameInstanceId: instance, phaseNonce: 1 }, host, true, players.slice(0, 6), () => 0).state.playerIds).toHaveLength(6);
    expect(() => handleTwoTruthsCommand(s, { type: "twoTruths.begin", gameInstanceId: instance, phaseNonce: 1 }, players[1]!.id, false, players, () => 0)).toThrow(/host/);
    expect(() => loadTwoTruthsDeck(s, deck, instance, 1)).toThrow(/sealed/);
  });
  it("gives every participant six opportunities, +1 correct only, stable shuffled rounds, immutable guesses and once-only reveal", () => {
    let state = begin(); const subjects: string[] = [];
    const rounds = structuredClone(state.rounds);
    for (let round = 0; round < 7; round++) {
      const current = state.rounds[state.roundIndex]!; subjects.push(current.subjectPlayerId);
      const identity = { gameInstanceId: instance, phaseNonce: state.phaseNonce };
      expect(() => handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.submitGuess", option: current.lieOption }, current.subjectPlayerId, false, players, () => 0)).toThrow(/sits out/);
      const eligible = players.filter(p => p.id !== current.subjectPlayerId);
      const first = eligible[0]!;
      state = handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.submitGuess", option: current.lieOption }, first.id, false, players, () => 0).state;
      expect(() => handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.submitGuess", option: 0 }, first.id, false, players, () => 0)).toThrow(/locked/);
      expect(getTwoTruthsPrivateView(state, first.id).selection).toBe(current.lieOption);
      const projected = getTwoTruthsPublicView(state);
      expect(projected).not.toHaveProperty("lieOption"); expect(projected).not.toHaveProperty("guesses"); expect(projected).not.toHaveProperty("deck");
      for (const p of eligible.slice(1)) {
        const result = handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.submitGuess", option: current.lieOption }, p.id, false, players, () => 0);
        state = result.state;
      }
      expect(state.phase).toBe("reveal"); expect(getTwoTruthsPublicView(state).lieOption).toBe(current.lieOption);
      expect(() => handleTwoTruthsCommand(state, { ...identity, type: "twoTruths.reveal" }, host, true, players, () => 0)).toThrow(/earlier/);
      state = handleTwoTruthsCommand(state, { type: "twoTruths.next", gameInstanceId: instance, phaseNonce: state.phaseNonce }, host, true, players, () => 0).state;
    }
    expect(new Set(subjects).size).toBe(7); expect(Object.values(state.gameScores)).toEqual(Array(7).fill(6));
    expect(state.phase).toBe("gameResults"); expect(state.rounds).toEqual(rounds);
    expect(getTwoTruthsPublicView(state).rankings).toHaveLength(7); expect(getTwoTruthsPublicView(state)).not.toHaveProperty("statements");
  });
  it("allows host closure with missing votes, rejects stale rounds, wrong instance, outsiders and invalid options", () => {
    let s = begin(); const id = { gameInstanceId: instance, phaseNonce: s.phaseNonce };
    expect(() => handleTwoTruthsCommand(s, { ...id, type: "twoTruths.submitGuess", option: 0 }, "outsider", false, players, () => 0)).toThrow();
    const eligible = players.find(p => p.id !== s.rounds[0]!.subjectPlayerId)!;
    s = handleTwoTruthsCommand(s, { ...id, type: "twoTruths.submitGuess", option: (s.rounds[0]!.lieOption + 1) % 3 }, eligible.id, false, players, () => 0).state;
    const closed = handleTwoTruthsCommand(s, { ...id, type: "twoTruths.reveal" }, host, true, players, () => 0);
    expect(Object.values(closed.scoreDelta!)).toEqual(Array(7).fill(0));
    expect(() => handleTwoTruthsCommand(s, { ...id, gameInstanceId: crypto.randomUUID(), type: "twoTruths.reveal" }, host, true, players, () => 0)).toThrow(/earlier/);
    expect(twoTruthsCommandSchema.safeParse({ ...id, type: "twoTruths.submitGuess", option: 3 }).success).toBe(false);
  });
  it("validates private files and bounds worst-case UTF-8 viewer envelopes", () => {
    expect(twoTruthsDeckSchema.safeParse({ ...deck, participants: [] }).success).toBe(false);
    const invalid = structuredClone(deck); invalid.participants[1]!.displayName = invalid.participants[0]!.displayName;
    expect(twoTruthsDeckSchema.safeParse(invalid).success).toBe(false);
    const escaped = structuredClone(deck); escaped.participants[0]!.lie = "\u0001".repeat(180);
    expect(twoTruthsDeckSchema.safeParse(escaped).success).toBe(false);
    const worst = structuredClone(deck); for (const row of worst.participants) { row.truths = ["界".repeat(180), "語".repeat(180)]; row.lie = "文".repeat(180); }
    const twelve = [...players, ...Array.from({ length: 5 }, (_, i) => ({ ...players[0]!, id: crypto.randomUUID(), displayName: `Extra ${i}` }))];
    let s = loadTwoTruthsDeck(createTwoTruthsState({ players, now: 0, random: () => 0 }, instance), worst, instance, 0);
    s = handleTwoTruthsCommand(s, { type: "twoTruths.begin", gameInstanceId: instance, phaseNonce: 1 }, host, true, twelve, () => 0).state;
    s = handleTwoTruthsCommand(s, { type: "twoTruths.reveal", gameInstanceId: instance, phaseNonce: 2 }, host, true, players, () => 0).state;
    const envelope = { type: "game.state", payload: { gameId: "two-truths", phase: s.phase, public: getTwoTruthsPublicView(s), private: getTwoTruthsPrivateView(s, host) } };
    expect(new TextEncoder().encode(JSON.stringify(envelope)).byteLength).toBeLessThan(4096);
  });
});
