# Mobius End-to-End Checklist – Phase R2

Document every validation run with this template. Replace bracketed values with run-specific notes.

## Section A – Inputs
- [ ] Rulebook asset ingested (`[rulebook-file]`).
- [ ] Metadata reviewed (publisher `[publisher]`, duration `[duration]`).
- [ ] Voice preset locked (`[voice-id]`).

## Section B – Generation Harness
- [ ] Shotlist compiled (`npm run compile-shotlist`).
- [ ] Alignment bind verified (`npm run bind-alignment`).
- [ ] Render dry run completed (`npm run render -- --dry`).

## Section C – Audio Quality Control
- [ ] Audio QC preset selected: `[preset-id]`.
- [ ] JSON report archived at `[json-artifact]`.
- [ ] Markdown summary archived at `[markdown-artifact]`.
- [ ] Integrated LUFS after normalization: `[lufs-after]` (target `[target] ± [tolerance]`).
- [ ] True peak after normalization: `[true-peak]` (limit `[limit]`).
- [ ] Corrective actions logged: `[actions]`.

## Section D – Evidence & Packaging
- [ ] Section C bundle uploaded (`section-c-*.zip`).
- [ ] Section D bundle uploaded (`section-d-*.zip`).
- [ ] Section C/D summary updated with timestamp.

## Section E – Sign-off
- [ ] Operator: `[name]`.
- [ ] Reviewer: `[name]`.
- [ ] Date: `[date]`.

> Store completed checklists alongside the evidence bundles for traceability.
