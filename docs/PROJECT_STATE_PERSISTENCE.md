# Canonical project persistence and explicit recovery

## Enriched visual state: measured string duplication recovery

The complete resumed isolated Cowboy state contained 63,684,834 logical UTF-8
bytes. Container interning alone produced a 25,557,296-byte state envelope
(25,558,721-byte diagnostic DTO). Repeated page excerpts, paths, explanations and
quotes remained inline across distinct objects. A 3,785-byte page string alone
occurred 376 times. No candidates/reviews need to be removed to recover this cost.

The existing v1 graph now interns repeated long strings as well as containers.
Its historical decoder already supports primitive definitions; no new storage,
compression, budget increase or relaxed integrity check is involved. With the
same state the real route accepted a 19,222,391-byte DTO, below 20,971,520 by
1,749,129 bytes (8.34%). The stored row was 19,222,632 bytes. Three identical
POSTs and a fresh file-store instance retained identical content/size. The real
Cockpit routes reloaded all 71 reviews and all 1,075 image references successfully.
Provider/extraction/rule generation calls for this proof: zero.

Evidence: `out/first-pedagogical-visual-proof/cowboy/history/` preserves each
execution; `persistence-enriched-cowboy-resume.log` records the complete original
enriched-state proof. Later visual-binding changes have separately measured
current-state sizes in `cowboy/proof.json`. A persistence PASS is not visual QA.

With recovered native provenance and renderer-aligned bounds, the final enriched
Cowboy DTO is 20,496,536 bytes and its stored row 20,496,777 bytes; the current
transport margin is only 474,984 bytes (2.27%), not the earlier 8.34%. Three
replays still show zero growth. Future new evidence remains budget-checked and
may legitimately require explicit recovery; this proof is not an unbounded-size
guarantee. The same isolated proof rejects wrong project/source identities and
an oversized full uncompressed body without changing the stored row.

The existing proof supports `--cache-only true`, measures logical state, compact
state, actual DTO and disk independently, verifies three zero-growth replays and
Cockpit hydration after reopening the file database. Its isolated HTTP fixture
consumes responses and closes each observation's connection: synchronous full
state serialization must not race an expired keep-alive socket. No live API or
provider credentials are modified by the fixture's in-process authentication.

## Contract

`mobius-project-state-transport-v1` is shared by the normal production worker,
the existing production-state route and the existing file-backed project store.
Runtime capability `projectContextPersistence` is now
`mobius-project-context-persistence-v3`. Required contracts, not equal Git SHAs,
gate the worker before expensive work. Use the existing canonical local runtime
manager for alignment; do not launch a second API or change Windows tasks.
The manager drops only the inherited `PSModulePath` for its Windows PowerShell
child so PowerShell 5.1 rebuilds compatible module defaults when Node was started
by PowerShell 7. Provider/model environment values are preserved unchanged.
The bridge detaches inherited standard pipes; the manager's existing log/status
files remain diagnostic authority, so a long-lived API cannot hold its caller
open after the alignment process has exited.

The logical project/Cockpit schema is unchanged. A tagged JSON graph stores
identical substantial subtrees once, referenced by SHA-256. Tags cannot collide
with user fields. References are not filesystem paths. Decode verifies hashes,
complete reference inventory, bounded depth and expanded size before hydration.
All ranked candidates, thumbnails, scores, rejections, provenance and decisions
survive. This is serialization, not visual selection or a new review queue.

The normal POST budget is **20 MiB of UTF-8 JSON**, checked before fetch and at
the route. Express retains its existing **25 MiB** limit. Expanded logical state
is bounded at **192 MiB**. A legitimate larger state requires explicit engineering
recovery, not truncation or a globally increased HTTP limit.

### Referenced visual evidence v1

`mobius-canonical-production-state-storage-v1` is the canonical persisted
projection of the compiler's intentionally rich in-memory graph. It keeps the
logical state below a **14 MiB** pre-send budget and stores detailed visual
candidate evidence once in the same project under
`production/visual-evidence-artifact.json`
(`mobius-canonical-visual-evidence-artifact-v1`, **128 MiB** measured artifact
budget). The state stores only stable asset, selection and candidate references;
the artifact records the full asset catalogue, every score, rejection, crop
measurement, provenance and candidate proof exactly once.

The artifact descriptor carries a relative project-owned path, byte count and
SHA-256 over the canonical JSON value. Cockpit's existing visual-review route
resolves it only below the persisted project root and rejects a missing,
out-of-root, wrong-project or checksum-mismatched artifact. It then hydrates the
same review queue; this is not a second review store and no candidates are
truncated. Canonical QA hydrates the same artifact before inspecting source
assets. Historical inline canonical states remain readable.

The normal worker materializes/validates the full state first, atomically writes
the minified artifact, then atomically writes the compact canonical state. A
serialization `RangeError` is explicitly `PROJECT_STATE_TOO_LARGE` and therefore
Inbox `recovery-required`, never a terminal-invalid PDF. The isolated Attempt-10
proof at `out/persistence-proof-compact-cowboy-20260914-b/proof.json` rebuilt
the full 26,565,881-byte raw request (rejected with 413/no write), persisted the
referenced 13,997,516-byte logical request as a 1,938,718-byte transport packet,
then reloaded all 71 reviews through the real route after a storage restart.
The compact canonical state was 1,955,165 bytes and its checksummed evidence
artifact 8,783,923 bytes. The proof also verified identical replay, wrong
project/SHA/path rejection and atomic rejection of a new oversized request;
providers/extraction/rules/TTS/render calls were all zero.

The existing `projects.json` stores versioned rows using the same graph encoding.
Its public DB row interface, `/load-project/:id`, Cockpit and render-state hydration
remain unchanged. Legacy rows remain readable; corrupt stored state fails closed.
Writes use a unique same-directory temporary file and atomic rename; failed
persistence restores the previous in-memory state. One owned API remains the
single writer. This does not introduce multi-process database support. The
historical browser `/save-project` still accepts its legacy DTO; this change does
not claim a redesigned browser render-upload protocol.

Compact requests require project/source identities. Route project ID, descriptor
SHA and canonical project-owned source storage remain validated before writes.
Identical retries update the same row, without duplicated reviews or assets.
Old runtime binaries must not write the versioned store; align through the
canonical manager rather than downgrading its files in place.

## Failure lifecycle and continuity

`PROJECT_STATE_TOO_LARGE` / production-state HTTP 413 is `recovery-required`,
stored as `failed-retryable` with `recoveryRequired=true`. It is not an invalid
PDF and is excluded from automatic rediscovery until explicit canonical requeue.
Truly invalid source PDFs remain terminal. Requeue retains failure history and
requires the Inbox lease; it never overrides a live owner.

Leases use owner ID + random token + PID + acquisition time. Heartbeat/release
must match the owner token; expiry alone never authorizes stealing a live lease.
Normal/error/review exits clear only owned active metadata and preserve the
last worker as history. An old worker PID in a failed item's history is not an
active lease. Ambiguous live process ownership requires operator investigation.

Recovery sequence: prove fix offline, tests, current-head CI, compatible local
runtime, then `npm run tutorial:inbox:requeue -- --sha <source-sha>` (with
`--reopen-review` only for a review boundary). Requeue is not production launch.
Never automatically loop on the same oversized request.

## Evidence and bounded proof

`scripts/prove-project-state-persistence.mjs --evidence <archived-attempt>
--pdf <existing-source> --output <new-directory>` copies historical inputs into
an isolated proof root, runs the same pure compiler/body serializer, real HTTP
route, real file DB, Cockpit reload and restart. It invokes no generation provider,
worker, extraction or renderer. The active project and archived inputs are not
modified. The output report includes field sizes, all-review equality hashes,
idempotent disk, rejection/atomicity checks and provider counts.

Attempt 10 remains a completed technical failure, not crash-interrupted. Its
canonical pretty-printed state (~45 MB) is not the HTTP body measurement. The
bounded reconstruction (historical images response unavailable, `images=[]`)
is **26,565,851 bytes**, already greater than 26,214,400; compact is **1,768,096**.
Margin is **24,446,304 bytes (93.3%)** below the effective parser limit.
`projectContext` contributes 16,393,508 bytes, including storyboard 10,093,177
and plans 5,061,215; top-level scenes add another 10,001,777 bytes. Rich `ranked`
entries account for 4,282,241 bytes in canonical source selections. Removing only
`rankedEntries` did not remove this other rich field or its repeated projections.
These overlapping figures must not be summed as independent unique payloads.

The isolated proof preserves all **71 reviews**, **33 accepted rules**, and
**zero accepted visual bindings**. Historical Attempts 1–10 remain evidence.
Persistence PASS does not resolve visual binding quality, authorize another
attempt, or establish publishability. Human publication authority is unchanged.
# Enriched production continuation — shared evidence references

The 103-scene continuation exposed a 205,444,763-byte logical send attempt,
above the unchanged 192 MiB expanded budget. Per-candidate evidence was repeated
through reviews, ranked plan entries and both storyboard projections.
`compactVisualEvidence` now retains content-addressed evidence within the SAME
project context; candidate scores, IDs and rejection reasons remain inline.
The production route validates references/checksums before writing. Cockpit's
existing visual-review endpoint hydrates all requested evidence. Historical
inline states remain readable. No HTTP/expanded limit or visual gate was raised.

Real full-state isolated proof (images response reconstructed as empty, so not
claimed as historical exact wire bytes): original logical 204,787,564 bytes;
referenced logical 67,409,620; transport 9,604,898. The real API, durable storage,
Cockpit evidence loading, restart, identical replay and invalid source/project
rejection pass with all 139 reviews retained. Proof:
`out/cowboy-end-to-end/full-state-reference-proof-03/proof.json`.
This is persistence evidence, not a visual/tutorial quality verdict.
