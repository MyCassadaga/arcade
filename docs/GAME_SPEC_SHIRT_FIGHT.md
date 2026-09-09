# Shirt Fight Rules and State Contract

## Players and authority

Shirt Fight freezes 3–8 connected players when the host starts. The Room Durable Object owns the phase, phase nonce, deadline, assignments, shirts, matchups, votes, deterministic tie breaks, finalists, results, and awards. Player commands carry the game instance and phase nonce; expired, stale, inactive, duplicate, or out-of-assignment commands fail closed.

The single Durable Object alarm schedules the earliest room-expiry, host-failover, Shirt Fight deadline, or drawing-cleanup event. The same due-state reconciliation runs before game commands and reconnect projection. It atomically stores each transition before broadcasting, can catch up delayed alarms, and is a no-op when the persisted phase has already advanced.

## Generation rounds

Rounds 1 and 2 contain two 60-second portrait drawing phases, a 60-second rapid-slogan phase, a 60-second shirt assembly phase, and sequential head-to-head voting. Completing every drawing or assembly entry advances early. Slogan writers can mark themselves done; otherwise the deadline closes the phase. Missing drawings receive a bounded blank fallback and missing slogans receive a synthetic fallback that is excluded from prolific-writing awards.

Each assembly assignment contains two distinct drawings from other players and up to seven slogans from other players whenever inventory permits. Round 2 considers both rounds and sorts fresh exposure before repeats. Frozen assignments, shirt source identifiers, and creation timestamps are stored in the game JSON.

## Voting and final tournament

Shirts are deterministically shuffled into a survivor sequence. Every active player may vote once in each matchup, including for contributed content. Missing votes are abstentions. A tie opens one 10-second sudden-death vote; a second tie uses the stored session seed and matchup identity, and the public reveal identifies the random decision.

Every shirt that wins a generation-round matchup qualifies once for the final pool. The de-duplicated pool is shuffled and runs through the same elimination sequence, which supports any pool size without a power-of-two requirement. Voting views contain rendered shirt content but no artist, writer, assembler, assignment, or per-player vote attribution. Round and final reveals publish the three credits.

## Drawings and retention

The browser canvas is 600×800 and exports bounded WebP only when finalized. WebSocket state stores metadata, never drawing bytes or R2 keys. A server-only manifest reserves each non-guessable object key before `R2.put`, confirms the object before finalizing game metadata, and retains enough information to clean up a partial upload.

Drawing reads use the same-origin application route with the room session token in the `Authorization` header. The Durable Object authorizes the viewer's own drawing, a current private assignment, or artwork in the current public matchup/reveal. It streams private, non-store bytes without redirects, R2 URLs, or object keys.

Completed-game assets become cleanup-eligible after approximately 24 hours. Room expiration is logical first: player and asset access stops immediately while the private cleanup manifest remains. Recorded deletes are idempotent; failures retain bounded retry state, and expired Durable Object storage is removed only after the manifest empties.

## Awards

The final view derives awards only from recorded data. Current awards are Most Prolific, Speed Artist, Crowd Favorite, Wordsmith, Art School, and Fashion Designer. Tied metrics produce multiple recipients, zero-evidence awards are omitted, and synthetic fallbacks do not count as authored productivity.
