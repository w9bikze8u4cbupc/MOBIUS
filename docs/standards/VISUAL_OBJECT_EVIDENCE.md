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
