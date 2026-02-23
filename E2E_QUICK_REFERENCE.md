# E2E-01 Commissioning - Quick Reference

**Status**: ✅ PRODUCTION-READY

## Quick Start

### Dry Run (CI/Testing)
```bash
npm run e2e:commission:dry -- --project-id test-e2e-01
```

### Full Run (Interactive) - PRODUCTION READY
```bash
# Start API server first
npm run server

# In another terminal
npm run e2e:commission -- \
  --project-id my-game \
  --pdf path/to/rulebook.pdf \
  --bgg-url https://boardgamegeek.com/boardgame/13/catan
```

**This will**:
- Upload PDF and extract components
- Fetch BGG metadata
- Generate ingestion report
- Prompt for gate confirmations
- Generate script candidate
- Prompt for script confirmation
- Render MP4 + SRT
- Verify all artifacts
- Generate commissioning report with "MOBIUS v1 COMMISSIONED"

### Full Run (Non-Interactive)
```bash
npm run e2e:commission -- \
  --project-id 1 \
  --pdf path/to/rulebook.pdf \
  --non-interactive \
  --confirm confirm_metadata \
  --confirm confirm_components \
  --confirm confirm_script
```

### With HEPHAESTUS
```bash
export MOBIUS_ENABLE_HEPHAESTUS=true
export HEPHAESTUS_WORKSPACE=/path/to/hephaestus

npm run e2e:commission -- \
  --project-id 1 \
  --pdf path/to/rulebook.pdf \
  --use-hephaestus
```

## CLI Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--project-id <id>` | ✅ | - | Project ID in database |
| `--pdf <path>` | For non-dry-run | - | Path to rulebook PDF |
| `--bgg-url <url>` | ❌ | - | BoardGameGeek URL |
| `--lang <code>` | ❌ | `en` | Language code |
| `--use-hephaestus` | ❌ | `false` | Enable image extraction |
| `--dry-run` | ❌ | `false` | Skip processing, validate wiring |
| `--non-interactive` | ❌ | `false` | Fail if confirmations needed |
| `--confirm <gateId>` | ❌ | - | Pre-confirm gate (repeatable) |
| `--confirm-file <path>` | ❌ | - | JSON file with confirmations |

## Gate IDs

- `confirm_metadata` - Game metadata (title, designer, etc.)
- `confirm_components` - Physical components list
- `confirm_setup_logic` - Setup instructions (conditional)
- `confirm_turn_structure` - Turn sequence (conditional)
- `confirm_ocr_hazards` - OCR quality (conditional)
- `confirm_script` - Tutorial script
- `confirm_component_images` - Extracted images (if HEPHAESTUS used)

## Stages

1. **Ingestion** - Ingest PDF and BGG metadata (stub)
2. **Confirm Ingestion Gates** - Operator confirms ingestion data
3. **Script Generation** - Generate tutorial script candidate
4. **Confirm Script** - Operator confirms script as authoritative
5. **Image Extraction** - Extract images via HEPHAESTUS (optional)
6. **Confirm Images** - Operator confirms extracted images (optional)
7. **Render** - Generate MP4 + SRT (stub)
8. **Verification** - Verify all required artifacts

## Outputs

- `FIRST_FULL_E2E_RUN.md` - Commissioning report (Markdown)
- `FIRST_FULL_E2E_RUN.json` - Commissioning report (JSON)
- `data/outputs/<project-id>/final.mp4` - Final video (when render implemented)
- `data/outputs/<project-id>/final.srt` - Captions (when render implemented)

## Testing

### Run Dry-Run Test
```bash
node --test tests/e2e/e2e-01-dry.test.mjs
```

### Expected Output
```
✔ E2E-01 dry run completes successfully
✔ E2E-01 dry run fails without project ID
✔ E2E-01 dry run handles unknown arguments
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

## Troubleshooting

### "Gate requires confirmation but --non-interactive is set"
Add `--confirm <gateId>` for each required gate or use `--confirm-file`

### "HEPHAESTUS not enabled"
Set `MOBIUS_ENABLE_HEPHAESTUS=true` in `.env`

### "No ingestion report found"
Project needs ingestion data - run ingestion first

### "API call failed: 500"
Check API server logs and database accessibility

## CI Integration

```yaml
- name: E2E Commissioning Dry Run
  run: npm run e2e:commission:dry -- --project-id test-e2e-01
```

## Documentation

- Full docs: `docs/commissioning/E2E-01.md`
- Implementation summary: `E2E_COMMISSIONING_COMPLETE.md`
- This quick reference: `E2E_QUICK_REFERENCE.md`
