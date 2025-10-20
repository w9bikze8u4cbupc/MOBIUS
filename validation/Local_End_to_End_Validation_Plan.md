# Mobius Tutorial Generator - Local End-to-End Validation Plan

## Directive Summary
Mobius Tutorial Generator is functionally restored across UI and backend. We now move decisively into the Local End-to-End Validation Phase to prove the stack is production-ready. Validation must be executed against the full checklist, with evidence logged for each pass/fail condition.

## Decision Log
- Go/No-Go: Proceed with comprehensive local validation before any staging promotion
- Scope: Exercise every critical workflow against the "Mobius Tutorial Generator — Simple End-to-End Checklist"
- Ownership: Directly coordinating this phase
- Standards: Enforce DeepAgent/Mobius coding practices in every validation artifact

## Environment Snapshot

### Backend Configuration (Port 5001)
```
PORT=5001
NODE_ENV=development
BACKEND_URL=http://localhost:5001
CORS_ORIGIN=http://localhost:3000
```

### Frontend Configuration (Port 3000)
```
REACT_APP_BACKEND_URL=http://localhost:5001
REACT_APP_API_BASE=http://localhost:5001
```

### API Keys Present
- OPENAI_API_KEY: Present (redacted)
- ELEVENLABS_API_KEY: Present (redacted)
- ANTHROPIC_API_KEY: Present (redacted)
- IMAGE_EXTRACTOR_API_KEY: Present (redacted)

### Data Directories
- Projects database: `./data/projects.db` (canonical path)
- Uploads directory: `./data/uploads/` (canonical path)

## Immediate Plan (Next 24 Hours)

### Checklist Execution – Batch 1: Sections A & B
**Project setup + BGG metadata**
- Execute all items in Sections A and B of the checklist
- Log outcomes using the provided IDs (e.g., B-12 → box art saved in assets)
- Capture evidence in `validation/batch1/` directory

### Checklist Execution – Batch 2: Sections C & D
**Rulebook ingestion + Visual assets**
- Execute all items in Sections C and D of the checklist
- Capture before/after evidence for C-08/C-09 and D-07/D-08 to confirm persistence
- Capture evidence in `validation/batch2/` directory

### Checklist Execution – Batch 3: Sections E & F
**Narration/audio + Subtitles**
- Execute all items in Sections E and F of the checklist
- Validate pronunciation overrides and SRT export
- Store generated assets in the project folder
- Capture evidence in `validation/batch3/` directory

### Checklist Execution – Batch 4: Sections G & H
**Rendering + Quality checks**
- Execute all items in Sections G and H of the checklist
- Track render timings and hardware context for reproducibility
- Capture evidence in `validation/batch4/` directory

### Checklist Execution – Batch 5: Sections I–K
**Packaging, CI hooks, delivery**
- Execute all applicable items in Sections I, J, and K of the checklist
- Note any tooling gaps and flag for remediation
- Capture evidence in `validation/batch5/` directory

## Validation Protocol

### Evidence Capture
For every checklist item, record:
- [ ] Pass/Fail status
- [ ] Notes on execution
- [ ] File paths to evidence
- [ ] Screenshots/log snippets as needed
- [ ] Standardized filenames (e.g., validation/B-12_box_art.png, logs/C-02_parser.txt)

### Issue Logging
Any failure immediately spawns a ticket with:
- [ ] Root-cause hypothesis
- [ ] Remedial action plan
- [ ] Tracebacks, response payloads, and environment conditions

### Regression Guards
Where fixes are applied:
- [ ] Augment with unit/integration coverage
- [ ] Re-test affected functionality
- [ ] Document regression test results

### Cross-Platform Requirement
Repeat critical flows (ingest, render, playback) on:
- [ ] Windows
- [ ] macOS
- [ ] Linux
- [ ] Document platform deltas

### Completion Gate
Local validation is considered passed only when:
- [ ] Every checklist item is green
- [ ] OR an exception is explicitly waived with mitigation

## Risks & Mitigations

### SQLite Path Drift
- Risk: Modules may reference different DB paths
- Mitigation: Double-check all modules reference the same DB path; enforce via config constant
- Verification: Run automated smoke test to assert single handle

### BGG Scrape Fragility
- Risk: DOM changes may break extraction
- Mitigation: Implement cached metadata fallback and retry logic
- Verification: Test with both live and cached data

### LLM/TTS Rate Limits
- Risk: API requests may be throttled
- Mitigation: Queue requests with exponential backoff and enforce token budgets
- Verification: Log usage per provider for billing awareness

### PDF Image Extraction Performance
- Risk: Extraction process may be slow or consume excessive resources
- Mitigation: Warm ffmpeg/Sharp pipeline and ensure temporary directories are cleaned post-run
- Verification: Monitor performance metrics during testing

## Required Inputs
- [x] Current .env values documented above
- [ ] High-quality rulebook PDF for test coverage
- [ ] Board/component imagery for test coverage

## Next Reporting Window
Once checklist execution Batch 1–3 completes, a consolidated validation report will be delivered with:
- [ ] Pass/fail status for each item
- [ ] Evidence links
- [ ] Any emergent defects
- [ ] Progress toward staging deployment

## Execution Tracking

### Batch 1: Sections A & B (Project setup + BGG metadata)
- [ ] Execution started
- [ ] Evidence captured
- [ ] Issues logged
- [ ] Batch complete

### Batch 2: Sections C & D (Rulebook ingestion + Visual assets)
- [ ] Execution started
- [ ] Evidence captured
- [ ] Issues logged
- [ ] Batch complete

### Batch 3: Sections E & F (Narration/audio + Subtitles)
- [ ] Execution started
- [ ] Evidence captured
- [ ] Issues logged
- [ ] Batch complete

### Batch 4: Sections G & H (Rendering + Quality checks)
- [ ] Execution started
- [ ] Evidence captured
- [ ] Issues logged
- [ ] Batch complete

### Batch 5: Sections I–K (Packaging, CI hooks, delivery)
- [ ] Execution started
- [ ] Evidence captured
- [ ] Issues logged
- [ ] Batch complete

## Final Validation Status
- [ ] All batches completed
- [ ] All issues resolved or documented
- [ ] Final validation report generated
- [ ] Staging promotion approved