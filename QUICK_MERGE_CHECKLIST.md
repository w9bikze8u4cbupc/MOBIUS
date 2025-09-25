# Quick PR Merge Checklist

## Essential Gates ✅
- [ ] All CI workflows green (Ubuntu, macOS, Windows)
- [ ] Golden file tests passing (SSIM ≥0.995, LUFS/TP ±1.0dB)
- [ ] TypeScript builds without errors
- [ ] Required reviewer approval
- [ ] Clean rebase on main

## Pre-Merge ✅  
- [ ] Backup current main branch
- [ ] Rollback strategy documented
- [ ] Merge commit message clear

## Post-Merge ✅
- [ ] Main CI passes
- [ ] Video pipeline smoke test
- [ ] Golden baselines validated

## Emergency ⚠️
If broken: **Stop → Assess → Rollback/Fix → Document**

---
See [PR_MERGE_CHECKLIST.md](PR_MERGE_CHECKLIST.md) for complete checklist.