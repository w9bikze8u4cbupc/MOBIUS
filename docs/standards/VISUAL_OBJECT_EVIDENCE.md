# Visual object evidence — bounded recovery, not a publishability certificate

## Canonical path

`sourcePageVisuals` synchronizes already stored API page pixels by canonical project/PDF identity. It verifies every page before recording readiness. `prepare-source-visuals` combines source candidates and source-grounded terms; `qualify-source-visuals` performs conservative candidate screening; `match-scene-visuals` produces bounded object-specific pixel measurements; `sourceVisualSelection` carries those measurements into `sourceAssetResolver` and `canonicalProductionCompiler`. The existing project persistence and Cockpit queue own the result.

No extraction is required when source pages and HEPHAESTUS already exist. Different worker/API data roots must not produce an empty focused-crop manifest after a false ready checkpoint. Page synchronization is read-only at the API and validates source SHA/page count, scoped URLs, image decoding and local checksums.

## Hypothesis versus measurement versus acceptance

- Extracted names, categories, aliases, page proximity and proposed component bindings are search hypotheses, not proof of visible identity. Opaque component IDs remain exact identifiers; `comp-1` and `comp-57` cannot match through the shared word `comp`.
- A column/region crop starts with UNKNOWN completeness/isolation. Neither native extraction nor a local heuristic grants complete/clean status.
- UNKNOWN component identity remains eligible for bounded examination and cache reuse. Local screening counts are distinct from pixel-reviewed, rejected and accepted counts; a candidate must not require a fabricated positive label to reach the matcher.
- `mobius-object-visual-evidence-v1` binds a measurement to asset ID, image SHA, requested referent, scene, evidence packet, configured model, observed bounds, confidence, complete silhouette, isolation and requested physical state. Wrong pixels, other objects/scenes, clipping, insufficient detail or unsupported states fail closed.
- A provider outage or budget limit is UNKNOWN. It is not a favourable local fallback, nor proof of genuine source ambiguity.
- Current safe acceptance requires object confidence ≥0.90, complete/isolated visible bounds with margin, source detail and the existing authority/ranking-margin thresholds. No generative enlargement creates source detail.
- Separate confirmed image usability, object matches and completely illustrated scenes. A measured image is not necessarily usable. Partial object coverage is not scene coverage.

## Bounds and replay

The normal matcher allows at most eight calls (configurable bounded maximum 32), at most three candidates per request, and zero SDK retries. It stops after a provider failure. Cache identity includes the evidence packet, actual image bytes, model and contract. A run replay preserves budget-exhausted/unknown dispositions without spending again; another analysis batch is an explicit action. `MOBIUS_VISUAL_CACHE_ONLY=true` prohibits new calls. No model is silently substituted when configuration is absent. Provider/base-URL/credential selection comes from the existing canonical AI configuration; credentials never enter evidence artifacts.

New image requests reuse the existing 1600×1600 maximum visual-probe helper, without enlarging or altering native source files. The original pixel hash and source-detail lineage remain authoritative. Unsafe/undecodable probes remain UNKNOWN and spend no provider call; no decoder safety limit is disabled. Existing valid measurements of the original pixels remain reusable.

The normal rulebook worker uses the existing runtime manager's configuration-path resolver for its visual subprocess. Declared canonical provider settings take precedence over stale worktree dotenv defaults in that subprocess; the configuration files and generator model selection are not edited. Its visual checkpoint records the already preflighted provider/model identity, not historical hard-coded model fallbacks. Proofs must not require Codex to supply a configuration path that normal production omits.

## Persistence and Cockpit

Candidate metadata and provenance remain in the canonical catalogue; per-referent evaluations use a versioned column list plus rows, retaining every evaluated candidate and rejection. The existing content-addressed transport retains its 20 MiB budget and 25 MiB HTTP limit.

The read-only visual-review endpoints project the existing persisted queue. Image routes accept only an asset ID in that project's review state and files physically inside its canonical source-owned project directory. Missing/forbidden thumbnails are explicit failures, not usable-review passes. The storyboard Cockpit displays the requested terms, dependencies, reasons, source evidence, measurements, hypotheses and loading failures; existing operator editing remains separate from automated analysis.

## Recovery status and proof discipline

This slice addresses the supplied Recovery Matrix references RF-001, RF-002, RF-003, RF-005, RF-011 and RF-014; it does not close all visual-quality recovery work. Initial real-source probes rejected backgrounds, publisher logos and incomplete fragments correctly, but validated zero complete instructional scenes. This is **PARTIAL**, not autonomous visual-production success. More retrieval/crop/state-composition coverage remains to be demonstrated.

`scripts/prove-unprepared-visual-binding.mjs` copies existing source pixels and provider-generated knowledge, clears prefilled asset associations/quality guarantees, invokes the normal services, tests the actual persistence/review/image routes and replays caches. It never generates rules, HEPHAESTUS, TTS or video. Optional browser capture mounts the real Cockpit review component on the isolated API. `scripts/prove-generator-productization.mjs` remains a historical hand-prepared integration fixture, not evidence of autonomous source selection.

Review screenshots must be physically inspected after execution. Record negative results and budget-limited work honestly. Machine rule coverage is not human-certified completeness; persistence PASS is neither visual PASS nor a publishable tutorial.

### Local unprepared proof, 2026-09-13

Existing provider-generated rules and all available native images were copied without preset bindings or quality labels. Two predeclared batches allowed six then four visual calls per game, no retries; subsequent replays made zero calls. Cowboy examined nine distinct images; Terraforming Mars examined six. Both produced **zero accepted object bindings and zero completely illustrated scenes** (33 and 8 scenes respectively). Wrong-object verdicts and an incomplete Cowboy card were preserved as negative evidence.

All 71 Cowboy and 62 Terraforming review sets had HTTP-loadable candidate references through the real project routes. Browser captures mounted the real Cockpit component; progressive display keeps every candidate available without mounting hundreds of images at once. One Terraforming contact-sheet image exceeded the decoder/pixel budget. HTTP loading and schema completeness do **not** certify operator usability: retrieval remains incomplete, technical reason codes need interpretation, and some required terms are uncertain extraction fragments. No review decision was made. `out/object-visual-proof/evidence-audit.json` and each `*-verified/` directory preserve local measurements, contact sheets and browser captures; generated evidence is excluded from Git.

The original 71 requests represent 33 scene requests plus 38 component-only requests, spanning 56 referents. They are not 71 independent problems. The historical prepared integration fixture cannot close this deficit. The next visual-engineering work is evidence-driven candidate prioritization and source-faithful object-region recovery/state composition, not another full tutorial production. The recovery status remains PARTIAL; no claim of autonomous visual completion is warranted.

### Limited instructional-scene proof, 2026-09-14 — BLOCKED

The bounded extension chooses an accepted `reference_aid` with exactly one required object, ordered by earliest cited PDF page then existing rule order. The selection is persisted before calls and cannot change on replay. It selected the Character-board Fuel lesson for Cowboy and the game-board identification lesson for Terraforming Mars. All original rule requirements and source pixels remain unchanged; no illustration was validated.

The normal search now admits source-page context linked by extracted referent terms (including other component/setup pages), retains page diversity and deduplicates identical pixel hashes. Metadata generates hypotheses only. `materializeMeasuredObjectCrop` reuses `compileObjectAwareCrop`, checks the parent hash, pads automatically measured bounds, rejects clipped bounds and records the unresampled region's real dimensions. A generated crop stays UNKNOWN pending another pixel examination.

`mobius-object-visual-evidence-v2` separates LOCALIZATION from COMPONENT measurements. Localization cannot bind a final teaching visual. Intrinsic component recognition does not certify scene quantities, placement or transitions; such cases remain review-required pending composition evidence. Previous v1 measurements without role overrides remain readable under their original strict scope. Runtime capabilities and visual checkpoints reflect v2, without invalidating compatible source extraction or rules. The existing display/detail/crop gates have not been lowered; complete final-composition validation and the replacement of the universal display-area rule are **not proven by this slice**.

For a multi-project bounded proof, `--budget-ledger` and `--budget-group` use one durable ledger (16 total / 8 per group in the pedagogical proof). The ledger reserves before calls, refuses concurrent ambiguous ownership and retains provider failures; changing output/cache directories is not a fresh allowance. SDK retries remain zero. Cache-only replay never requires new calls.

Both real isolated runs received `AuthenticationError / HTTP 401` on their first visual request: **two new calls total, zero calls on replay, zero measured objects, zero complete instructional scenes**. Further calls were stopped; no credential/model/provider was changed. The API metadata endpoint still reported configured OpenAI / `gpt-5.6-sol`; that does not demonstrate working visual authentication. Local evidence is under `out/first-pedagogical-visual-proof/`; the candidate contact sheets show proposed source pages, **not successful pedagogical compositions**. The original first-pass reports and source selections are retained. RF-001/002/003/005/011/014 remain only partially addressed. Provider authentication must be restored through the existing configuration owner and a bounded continuation explicitly authorized before any new visual request. No Attempt 11, full production, rule analysis, extraction, TTS or video was launched.

The vision prompt keeps bounding boxes normalized to the actual probe; source coordinates are remapped deterministically and require verification. Spatial localization remains a model limitation, not a geometry guarantee ([OpenAI image-input documentation](https://developers.openai.com/api/docs/guides/images-vision)).

### Explicit authentication recovery and resumed evidence — still PARTIAL

The existing Python matcher accepts an explicit `--reopen-provider-blocker LEDGER ACCESS_CHECK PRIOR_FAILURE RECOVERY_ID` operation. It requires a newer successful `models.retrieve` receipt for the unchanged configured model, records the prior failure and receipt, retains every call and cap, and changes only the run-cache recovery epoch. A receipt cannot reopen a later failure a second time. Measurement identities/caches are unchanged. Recovery is an operator action, never an automatic retry; a new provider error still blocks both groups. Resuming the existing proof snapshots its previous reports before writing current execution reports.

Source-page terminology is now carried as **retrieval context only** to native images from the same authoritative page. A pixel-localized object, including an occluded page view, can trigger at most two native alternatives ranked by real source detail. Native extraction's catch-all `other`/`is_component=false` is not a measured negative identity verdict: a nonblank native asset with source-page context remains eligible for examination, without changing its historical label or granting acceptance. Wrong objects, incomplete boundaries and unsupported scene states remain rejected.

The Director's updated owner configuration passed one Python non-generative model retrieval. The existing runtime manager then served compatible visual v2 capabilities. Eleven additional real visual calls succeeded at the provider level (13 cumulative of 16, including the two historical 401s); cache replays used zero calls. Terraforming's unobscured native game-board image was recognized complete, but the resolver still refuses final binding (edge evidence, effective-detail bound and unresolved source authority). Cowboy's localized crop and native fragments were physically inspected and rejected as incomplete. Neither selected scene has a verified pedagogical composition.

Cowboy's resumed isolated proof subsequently stopped at the existing **pre-send transport budget**: 25,557,296 UTF-8 bytes versus 20,971,520 allowed. No limit was raised, no partial API write was made for that state, and no live Cowboy production was touched. The remaining three visual calls were not spent. The historical persistence proof remains preserved; it does not certify this larger resumed state. Current evidence and the exact stop are under `out/first-pedagogical-visual-proof/auth-recovery-key-updated/`. Recovery RF-001/002/003/005/011/014 remains PARTIAL. Authentication success and component recognition do not establish scene quality or publishability.
