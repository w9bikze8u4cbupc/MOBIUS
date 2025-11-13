# MOBIUS Pull Request

## 1. Summary
(Brief description of the change)

---

## 2. Rendering Impact Assessment

> If ANY part of this PR affects rendering, audio, extraction, golden tests, or CI behavior around them, complete this section.

**Does this PR impact rendering?**  
- [ ] No — skip to section 3  
- [ ] Yes — continue below

### 2.1 Risk Level (exactly one)
- [ ] `rendering:low-risk`  
- [ ] `rendering:medium-risk`  
- [ ] `rendering:rfc` (high risk)

### 2.2 ARC Updated?
- [ ] Yes — updated `docs/spec/authoritative_rendering_contract.json`  
- [ ] No — ARC unchanged

If yes, summarize changes here:



ARC Changes Summary:

(e.g., Updated SSIM soft-pass from 0.92 → 0.93)

(e.g., Tightened frame count range)


### 2.3 Local Validation (must be run before opening PR)

#### ARC Validation
```bash
node scripts/validate_arc.cjs


 Passed

Rendering Consistency (local platform)
node scripts/check_rendering_consistency.cjs \
  --game sushi-go \
  --platform local \
  --output-dir consistency_out


 Passed

Preview artifacts manually inspected?

 Yes

2.4 Golden Baselines

Does this PR require promoting baselines?

 No

 Yes (list platforms):

Platforms to promote:
- macos
- windows
- ubuntu


Promotion requirements acknowledged:

 SSIM ≥ soft-pass

 No visual regressions

 Rendering invariants unchanged

 Promotion will be done in follow-up commit or dedicated PR

3. CI and Tests

Expected CI jobs to pass before merge:

 Validate ARC

 Rendering Consistency (Windows)

 Rendering Consistency (macOS)

 Rendering Consistency (Linux)

 Audio Metrics Validation (Unix)

 Audio Metrics Validation (Windows)

If this PR is expected to temporarily break rendering on certain platforms, explain why:

Temporary breakage explanation:
(rare exceptions only)

4. Reviewer Notes

(Optional)

Anything special reviewers should look for?

5. Checklist for Merge

Author confirms:

 I have read docs/ops/ARC_CHANGE_GUIDE.md

 I have followed all required governance steps

 I understand that high-risk rendering PRs require an RFC summary

Reviewer confirms:

 Rendering risk label is correct

 ARC changes (if any) are correct and validated

 Required CI jobs are green

 Golden promotions are justified and follow policy


---

# 🧠 Why this template matters  
This transforms rendering governance from:

> Tribal knowledge + reviewer memory  
into  
> Enforced procedural discipline from the moment a PR is created.

This template:

- Removes ambiguity  
- Forces contributors to acknowledge ARC  
- Embeds the governance model directly in the workflow  
- Reduces accidental drift  
- Guides new contributors correctly every time  
- Ensures rendering stability long-term across OSes  
- Prevents broken merges that would corrupt golden baselines

This is the highest-leverage step for governing a critical subsystem.

---
