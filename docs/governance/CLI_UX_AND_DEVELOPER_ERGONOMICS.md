# Section 8 – CLI UX & Developer Ergonomics

**Brand Asset URL:** `/mnt/data/Banner.png`

Director-approved CLI experience to keep MOBIUS tooling clean, predictable, and CI-friendly. Sections 9 and 10 (QA/UAT and Priorities/Timeline) will extend this governance layer.

## 8.1 Canonical Commands

These are the only developer-facing commands we support; everything else should be an alias or wrapper.

1. **Generate Tutorial**
   ```bash
   npm run tutorial:generate -- --game sushi-go --os macos --res 1080p --fps 30
   ```
   - **Script:** `scripts/tutorial-generate.cjs`
   - **Purpose:** End-to-end pipeline (ingest → render → package) for a single game + OS.
   - **Flags (all explicit, no hidden defaults):**
     - `--game <slug>` (required) – e.g., `sushi-go`
     - `--os <windows|macos|linux>` (required)
     - `--res <1080p|1440p>` (default: `1080p`)
     - `--fps <30>` (must match golden spec)
     - `--lang <en|fr|both>` (default: `both`)
     - `--mode <full|preview-5|preview-30>` (default: `full`)
     - `--out-dir <path>` (default: `dist/<game>/<os>`)
   - **Exit codes:** `0` success; `1` usage error (bad flags, missing game, etc.); `2` pipeline failure (render, ingest, TTS, etc.).

2. **Golden Check (frames + SSIM + container.json)**
   ```bash
   npm run golden:check-with-junit -- --game sushi-go --platform macos
   ```
   - **Script:** `scripts/check_golden.cjs`
   - **Purpose:** Compare current render vs golden baselines, emit JUnit, and fail if tolerances are violated.
   - **Flags:**
     - `--game <slug>` (required)
     - `--platform <windows|macos|linux>` (required)
     - `--res <1080p>` (default: `1080p` only)
     - `--junit-out <path>` (default: `tests/results/golden-<game>-<platform>.xml`)
     - `--debug-dir <path>` (default: `tests/golden-debug/<game>/<platform>`)
   - **Exit codes:** `0` all metrics within thresholds; `3` golden mismatch (SSIM/PSNR/VMAF too low, missing frame); `4` structural error (missing `container.json`, wrong fps/duration).

3. **Checklist Validator (Mobius E2E)**
   ```bash
   npm run golden:validate -- --game sushi-go
   ```
   - **Script:** `scripts/validate_mobius_checklist.cjs`
   - **Purpose:** Validate Simple End-to-End Checklist items (A01–K06) programmatically where possible.
   - **Flags:**
     - `--game <slug>` (required)
     - `--os <windows|macos|linux|all>` (default: `all`)
     - `--report-out <path>` (default: `tests/results/checklist-<game>.json`)
   - **Exit codes:** `0` all auto-checkable items pass; `5` one or more checklist items fail; `6` structural project issue (missing dist folder, manifest, etc.).

## 8.2 CLI Help Text (Ready-to-paste)

### `scripts/check_golden.cjs` – `--help` output
```
Usage: node scripts/check_golden.cjs --game <slug> --platform <windows|macos|linux> [options]

Description:
  Run golden-frame comparison for a rendered tutorial and emit a JUnit report.
  Validates SSIM/PSNR, fps, duration, and container.json structure against baselines.

Required:
  --game <slug>          Game slug, e.g. "sushi-go"
  --platform <name>      "windows", "macos", or "linux"

Options:
  --res <1080p>          Resolution to check (default: 1080p)
  --junit-out <path>     JUnit XML output path
                         (default: tests/results/golden-<game>-<platform>.xml)
  --debug-dir <path>     Directory for diff images and logs
                         (default: tests/golden-debug/<game>/<platform>)
  --verbose              Enable verbose logging to stdout
  --help                 Show this help text and exit

Exit codes:
  0  Golden check passed
  3  Golden mismatch (SSIM/PSNR/VMAF below thresholds, missing frame)
  4  Structural error (missing container.json, fps/duration mismatch)
  1  Usage error (invalid or missing arguments)
```

### `scripts/validate_mobius_checklist.cjs` – `--help` output
```
Usage: node scripts/validate_mobius_checklist.cjs --game <slug> [options]

Description:
  Validate the Mobius Tutorial Generator end-to-end checklist for a given game.
  Automatically checks items like render presence, captions, manifests, and logs.

Required:
  --game <slug>          Game slug, e.g. "sushi-go"

Options:
  --os <name>            "windows", "macos", "linux", or "all" (default: all)
  --report-out <path>    JSON report output path
                         (default: tests/results/checklist-<game>.json)
  --verbose              Enable verbose logging to stdout
  --help                 Show this help text and exit

Exit codes:
  0  All auto-checkable items passed
  5  One or more checklist items failed
  6  Structural project issue (missing dist folder, manifest, etc.)
  1  Usage error (invalid or missing arguments)
```

## 8.3 Logs and Verbosity

- **Defaults:** CLI prints compact, single-line progress (`[OK]` / `[FAIL]`).
- **Full logs:** Written to `dist/<game>/<os>/render.log` and `tests/logs/*.log`.
- **Flags:**
  - `--verbose` → Human-friendly, multi-line logs to stdout.
  - `--log-json` → NDJSON structured logs to stdout (for CI pipelines).
- Logging aligns with the rendering pipeline’s NDJSON and observability design.

## 8.4 PR / CI UX

Each PR run should include:

- `npm run test`
- `npm run golden:check-with-junit -- --game sushi-go --platform windows`

Additional macOS/Linux matrix rows are added via the CI matrix.

**PR summary plugin (CodeRabbit / GitHub Actions summary) shows:**

- Golden result status
- Checklist validator summary (count of passes/fails)
- Link to artifact directory

## 8.5 Quick Validation Checklists (Dev-side)

After implementing:

**Help text**
- `node scripts/check_golden.cjs --help`
- `node scripts/validate_mobius_checklist.cjs --help`

**Usage errors**
- Run commands without `--game` → expect exit code 1 and clear error.

**Happy path**
- With an existing `dist/sushi-go/macos` folder, run both commands → expect `0`.

**Intentional failure**
- Delete `tutorial-en.srt` → expect checklist validator exit `5` and report the missing caption file.

---

The file URL/path for the uploaded brand asset: `/mnt/data/Banner.png`.
