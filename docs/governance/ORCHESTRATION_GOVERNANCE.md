# MOBIUS Orchestration Governance (Phase F5)

## Purpose

Phase F5 governs **multi-render orchestration consistency**. Whenever multiple renders exist for the same project and OS (e.g., preview and full), MOBIUS must guarantee:

- The same **game and ARC**,
- The same **toolchain and environment**, 
- The same **video/audio encoding envelope**,
- A sensible **duration relationship** (full ≥ preview).

This sits on top of ARC (F2) and audio governance (F3) and uses `container.json` manifests to reason about orchestration.

## Scope

F5 applies to any workflow that produces more than one render for a given project+OS, such as:

- 5s preview + full render
- 30s preview + full render
- Future multi-resolution runs with a shared toolchain

It does **not** re-check SSIM or audio tolerances; those remain the responsibility of ARC + F2/F3 governance.

## Invariants

1. All manifests in an orchestration group must share:
   - `project.game`
   - `arc.version` and `arc.sha256`
   - `tools.ffmpeg.version` and `tools.ffprobe.version`
   - `env.node.version` and `env.npm.version`

2. Within a single orchestration check, `media.video[0]` for each manifest must share:
   - `codec`
   - `width`, `height`
   - `fps` (within ±0.1)
   - `pixFmt`
   - `sar`

3. Within a single orchestration check, `media.audio[0]` for each manifest must share:
   - `sampleRate`
   - `channels`

4. Duration ordering:
   - For any project where both `project.mode = "preview"` and `project.mode = "full"` are present:
     - `min(full.durationSec) >= max(preview.durationSec)`

5. Every manifest included in orchestration checks is **already expected** to pass:
   - ARC-driven rendering consistency checks (F2)
   - Audio governance checks (F3)
   - Packaging validation (F4)

## CI behavior

- The `orchestration-consistency` job runs after `packaging-validation`.
- It invokes:

  ```bash
  node scripts/check_orchestration_consistency.cjs \
    --container out/preview/container.json \
    --container out/full/container.json \
    --junit out/junit/orchestration-contract.junit.xml
  ```

- On failure, CI:
  - Marks JUnit testcase `orchestration-contract[…]` as failed.
  - Uploads the JUnit file and all container manifests used.

## Developer workflow

1. Run the renderer to produce both preview and full outputs for a project/OS.
2. Ensure that:
   - `out/preview/container.json`
   - `out/full/container.json`
   exist and have passed `packaging:validate`.
3. Run locally:

   ```bash
   node scripts/check_orchestration_consistency.cjs \
     --container out/preview/container.json \
     --container out/full/container.json \
     --junit out/junit/orchestration-contract.junit.xml
   ```

4. If the orchestration check fails:
   - Fix tool / env drift (Node/ffmpeg/ARC mismatch),
   - Align render settings (codec, dimensions, fps, pixFmt, SAR),
   - Ensure preview duration ≤ full duration.

## Changes and versioning

Any change to orchestration invariants must:

- Update this document,
- Update `scripts/check_orchestration_consistency.cjs`,
- Add/update tests or fixtures,
- Use PR label: `governance:orchestration`.

---

**Validation note:** This text matches the behavior of the checker script and plugs cleanly into your existing governance folder alongside PACKAGING/ARC/AUDIO docs.
