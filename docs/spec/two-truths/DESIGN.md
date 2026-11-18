# Two Truths and a Lie: frozen implementation direction

## Contract and authority

Sanitized development record. The owner's full request and intended private roster are retained outside the repository; no survey has been supplied. Authorized outcome: a survey-backed seven-player game with one round per actual survey respondent (1–7), correct guesses earn points, and the host can play without previewing statements or answers. One participant supplied their own marked lie, which private preparation must preserve verbatim. Others need plausible lies derived only after their actual truths are supplied.

AC-1: Selectable seven-player room game.
AC-2: Opaque prepared-file import with safe setup readiness only.
AC-3: One shuffled round per respondent, secret immutable guesses, +1 correct, explicit reveal and final standings.
AC-4: No future statements, solutions, provenance or other guesses in unrevealed viewer state; server-owned score, retry/phase/reconnect safety.
AC-5: Document a private spreadsheet handoff without real content in source, reports or logs.

Scoring rule: the subject sits out their own round. All seven players must be connected at begin, including every imported respondent; players with no response may still join and guess every round. With R responses, respondents have R−1 scoring opportunities and nonrespondents R. Raw +1 correct-guess points remain unchanged and this difference is disclosed. Missing guesses earn zero when the host explicitly closes voting. No bonus for fooling others. No runtime AI, survey collection, external provider, new database, deployment or unrelated-game changes.

## Execution record

Baseline: `71962b7306bbba1ef5bc3410c533c83c2974b483` (verified fetched main). Sole owner: implementation lane under the authorized game coordinator. Risk HIGH: hidden state, authoritative scores, host authorization and retry boundaries.

Bounded designer dispatch: `/root/arcade_game/implementation/designer`, explicitly requested and accepted `gpt-6-astra`, medium, read-only role. Design and one targeted privacy amendment returned before dependent implementation. Runtime model telemetry beyond accepted dispatch is unavailable. Separate Astra-high read-only final review required.

Frozen approach: additive registered party game; setup → guessing → reveal → next or results. Private prepared JSON is forwarded without client parsing/preview to bounded bearer-authenticated POST. Import validates the complete packet atomically, seals one immutable deck, and stores only a hash receipt beside the existing game JSON. The deck contains 1–7 unique generic respondent names, each matched case-insensitively to a connected seat at begin. All seven connected seat IDs are frozen, including nonrespondents. Total rounds derive from persisted rounds.length, and eligible voters from frozen playerIds.length minus the subject. Private preparation, not public code, verifies the intended actual roster and preserves the marked authored lie. Statements and subject order shuffle once server-side and persist. All game commands carry instance and phase nonce; host-only begin/reveal/next; generic host.advance rejects. A bounded 64-entry additive receipt key detects exact retry versus conflicting payload. Score is committed exactly once with guessing-to-reveal state and receipt.

Scope-shape: the game screen, shared discriminants, pure engine, registry adapter and bounded import route are necessary to deliver this new game safely. They reuse the existing Worker/DO SQLite JSON, room/session authority, WebSocket transport, React presentation and test stack. No dependency, infrastructure, secret, migration or production changes.

## Visual contract

No owner-approved game-specific reference exists. This is a designer-selected, source-grounded direction, not a claim of prior visual approval. The existing Arcade shell is the reference: cream, purple ink, violet actions, pink/lime reveal accents, heavy headings, rounded cards, hard offset shadows.

Must preserve: subject as large heading, three equal-status A/B/C statement cards dominating the playable scene, progress/actions below, secondary standings. No correctness cues before reveal. Explicit Selected/Guess locked labels. Reveal labels Truth/Lie in text and color, with no card shuffling. CSS envelope motif in setup has no fabricated statement preview. Desktop 1440×900 uses three columns; phone 390×844 stacks cards; 320px must not overflow. Text is 18px, controls at least 44px, native keyboard radio selection plus lock, visible focus. No essential animation; reduced-motion follows shell.

Functional and visual acceptance are separate. Runtime captures must be opened and inspected for layout/readability; they cannot establish approval against a nonexistent concept image.


## Material amendment: variable response count (v2)

Owner clarified that fewer than seven people may have responded while all seven should be able to play. The existing designer selected the bounded amendment: 1–7 respondent records, still exactly 7 connected players at Begin, one round per respondent, no fabricated missing rounds. Every respondent must match a seat; all 7 seats enter scoring/voting roster. Subject exclusion and +1 correct remain; raw scoring opportunities differ and UI discloses this without unrequested normalization. Empty/eight-record decks and missing respondents reject before RNG. Existing version 1 seven-record packets and stored seven-round states retain their shape and behavior; no migration/read-time rewrite. Shared schema, begin/finish/projection totals and setup/readiness/round/results copy updated. Privacy/receipt/visual contracts unchanged. Canonical issue 47 records the sanitized authorized scope.


## Material amendment: attendance and initial penalty (v3, current)

Authority: the owner's direct request on 2026-11-18, verified by coordinator `/root`: “started with any number of players” when someone misses the meeting; a sealed-file name without a matching attendee “doesn't include that round”; anyone attending without a matched round is “automatically -1”; update game help. Canonical historical issue: #47. This sanitized amendment supersedes fixed-seven attendance and v2's unequal scoring maxima, preserving the original sealed-deck/privacy contract. No release authority is included.

Frozen Astra approach: `/root/attendance_design`, requested and accepted `gpt-6-astra` / medium, selected the bounded design before implementation. Begin freezes all connected seats within existing room capacity 1–12, matches trimmed/case-insensitive names, and persists shuffled rounds for matching responses only. At least one match is required before RNG or mutation. Deck remains version 1 with 1–7 responses. Every unmatched frozen attendee starts at −1 in gameScores and an atomic scoreDelta committed with Begin and its exact-payload receipt; matched attendees start at 0. Disconnected seats are excluded; later reconnects never alter the roster or rounds. Reveal still awards +1 correct only and the subject sits out. With R actual rounds, matched and unmatched attendees both have maximum R−1. Missing/wrong guesses earn zero. Solo matched play is allowed, waits for explicit host reveal, and renders no zero-max progress meter.

Acceptance: AC-1 now advertises 1–12 attendees; AC-2 setup shows loaded responses, connected count, available rounds, absent-response skip labels, and a no-match explanation with Begin disabled. AC-3 uses included rounds and the initial penalty described above. AC-4/5, auth/receipt/nonce/projection boundaries, and existing visual contract remain. Results use neutral scoring copy so historical active games are not misdescribed. No schema migration, active-state rewrite, import-size change, or unrelated game changes.

Implementation continuation: branch `codex/two-truths-attendance`, base `cee54d98f9c3fc179fb49a7380e32403fce7f8b2`; sole implementation owner `/root/attendance_implementation`. HIGH risk retained for deterministic scoring, persisted state and idempotency. Root owns external draft PR/CI and separate Astra-high review. No actual material design-assumption failure found. Required checks and evidence are indexed in EVIDENCE.md; reviewer is separate from designer and implementer.
