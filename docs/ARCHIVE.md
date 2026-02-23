# MOBIUS — Archived & Quarantined Folders

This document records **non-canonical MOBIUS-related directories** discovered during the system audit.
These folders are **NOT active** and must not be used for development.

---

## Quarantined Legacy Projects

### Board_Game_Video_Tutorial__QUARANTINE__*
- Location: C:\
- Status: Quarantined (dirty working tree, 100+ modified files)
- Git state: ~137 commits behind origin/main
- Reason:
  Early experimental generator, mixed scripts, deprecated CI,
  superseded by current MOBIUS architecture.

Audit snapshot:
C:\Users\danie\Documents\MOBIUS_Audit\quarantine_status_20260202-161855.md

---

### mobius-games-tutorial-generator__QUARANTINE__*
- Location: Documents\
- Status: Quarantined duplicate
- Reason:
  Redundant clone with no unique value.

---

## Important Clarification

Folders containing the word \"mobius\" elsewhere on the system
(e.g. HEPHAESTUS_OUTPUT, GENESIS modules, Temp folders)
are **artifacts or integrations**, not project roots.

---

## Canonical Project

The ONLY valid MOBIUS project root is:

C:\mobius-games-tutorial-generator

All future work resumes from there.
