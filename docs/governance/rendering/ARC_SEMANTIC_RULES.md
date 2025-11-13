# Authoritative Rendering Contract (ARC) Semantic Rules

The ARC defines the policy envelope that rendering jobs must satisfy before we accept a build as stable. This document highlights the semantic checks enforced by the tooling.

## 4. SSIM Requirements

### 4.1 Global Threshold

The ARC establishes a global `validation.ssim.min` floor. Any rendering comparison must meet or exceed this number, regardless of platform, unless an explicit override is supplied.

### 4.2 Platform Considerations

Historically, the global threshold alone governed the SSIM checks. Operators occasionally tuned manual overrides to compensate for known codec or driver noise, but the contract did not provide a structured location for them.

### 4.3 Per-Platform Overrides

ARC allows optional per-platform SSIM overrides:

```jsonc
"validation": {
  "ssim": {
    "min": 0.95,
    "perPlatform": {
      "windows": { "min": 0.95 },
      "macos":   { "min": 0.95 },
      "linux":   { "min": 0.95 }
    }
  }
}
```

Rules:

- `perPlatform.<os>.min` MUST be between 0.0 and 1.0.
- `perPlatform.<os>.min` MUST be ≥ global `validation.ssim.min`.
- If an OS key is missing, it falls back to the global min.

These overrides are intended to absorb predictable platform-specific noise (e.g., macOS-specific codec behavior) while keeping a single global contract.
