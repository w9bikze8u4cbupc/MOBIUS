## Summary

- 

## Testing

- 

---

### 🧪 ARC & Golden Troubleshooting (Rendering Governance)

- [ ] I have run the rendering consistency check for any rendering-impacting change  
      (e.g., `node scripts/check_rendering_consistency.cjs --game <game> --platform <os>` or the corresponding npm script).
- [ ] I inspected the CI logs for the **ARC summary** (video/audio/SSIM expectations) and confirmed they match my intent.
- [ ] If ARC was modified, I reviewed  
      `docs/governance/rendering/ARC_SEMANTIC_RULES.md`  
      and explained my changes in this PR description.
- [ ] If golden baselines changed, I followed the **Baseline Promotion Protocol** and applied the appropriate PR label  
      (e.g., `rendering-baseline-update`) and attached SSIM/visual justification.
