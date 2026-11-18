# Private survey preparation and loading

The game accepts a **prepared JSON file**, not the original spreadsheet. No real deck is bundled. The host can create/start Two Truths before everyone joins, and sees only setup readiness until Begin.

## Later spreadsheet handoff

1. The owner gives the unopened spreadsheet directly to the assistant, without opening it. Process it privately; do not paste source rows, answers or inferred facts into chat, issue/PR, logs, screenshots or repository files.
2. Confirm the intended seven names and truth/lie columns from the actual file. Do not infer ambiguous flags. Preserve the participant's explicitly marked authored lie verbatim. Generate other plausible lies only from actual supplied truths. A generated claim is not guaranteed false; if a truth/lie distinction is materially uncertain, resolve it privately with the preparer rather than silently mislabel it or spoil the host.
3. Produce a private, unattached-to-source-control JSON file with `version: 1` and `participants`, exactly seven records. Each record has `displayName`, `truths` (exactly two strings), `lie` (one string), and `lieSource` (`authored` or `generated`). Names must match room seats after trimming/case-insensitive comparison, maximum 24 UTF-16 units. Statements must be distinct, nonempty and at most 180 UTF-16 units and 720 JSON-encoded UTF-8 bytes. No extra fields. Do not silently truncate or rewrite authored content to fit; flag it privately.
4. Validate privately without printing statement text or answer keys. Confirm roster completeness, marked authored lie preservation and schema validity. Report only completion/counts or a non-spoiling blocker.
5. Host selects the assistant-prepared `.json` file via “Prepared game file”. The browser forwards bytes with no parse, preview or browser-storage copy. The server returns a receipt, not deck data. Never open the prepared file to inspect it. A successful import is sealed and cannot be replaced; Back to arcade and a fresh game create an empty instance if correction is required.
6. All seven matching participants join and connect. Host chooses Begin blind game. The server shuffles the people and each triple. Everyone guesses except the current subject. Host can explicitly close voting when someone disconnects; missing votes earn zero. New game opens empty setup, not a replay of known answers.

## Privacy boundary

The prepared file contains the key and is private material. Deliver it only to the authorized owner/preparer, never commit it or attach it to an issue/PR. The normal game never sends future content or correct answers before reveal, even to the host. Someone who deliberately opens a file they possess or inspects their own upload can read it; this is a spoiler-avoiding workflow, not cryptographic protection against the uploader.

The room's existing inactivity/expiry lifecycle deletes game content. No deck-download/admin-preview route exists. Client upload errors are generic and never include source values. Do not use production data for validation.
