# Rendering CI Flow (Developer-Facing)

1. **PR Created**
2. **validate-arc.yml**
   - Validate ARC JSON structure
3. **validate-arc-semantic.yml**
   - Validate ARC semantic invariants
4. **rendering-consistency.yml**
   - Render preview
   - Extract frames
   - Validate invariants
   - Compute SSIM
   - Upload artifacts
5. **Failure?**
   - If failed → developer reviews logs + artifacts, applies troubleshooting guide
6. **Visual Impact?**
   - If visuals changed → follow Golden Baseline Promotion Protocol
7. **Merge**

