# Canonical project persistence and explicit recovery

## Contract

`mobius-project-state-transport-v1` is shared by the normal production worker,
the existing production-state route and the existing file-backed project store.
Runtime capability `projectContextPersistence` is now
`mobius-project-context-persistence-v2`. Required contracts, not equal Git SHAs,
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
