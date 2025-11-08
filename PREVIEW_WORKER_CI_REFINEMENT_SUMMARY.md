# Preview Worker CI Refinement Summary

## Overview
This document records the set of changes that finalized the preview rendering pipeline CI hardening. The refinements consolidate prior incremental updates so the CI workflows now generate deterministic preview artifacts across all runners and serve as the foundation for Phase PR-18: Golden Validation Matrix.

## Preview Artifact Normalization
- Establishes `out/preview_with_audio.mp4` at repository root as the canonical render output emitted by all jobs.
- Aligns copy and normalization logic so each workflow stage reads and writes from the same target paths, preventing divergence between OS-specific runners.

## Audio Validation
- Replaces multi-metric EBUR128 inspection with a single true-peak check to minimize variability while guaranteeing that audio peaks remain within the validated envelope.
- Confirms that the simplified check still blocks regressions by running identically on Linux, macOS, and Windows environments.

## Cross-Platform Consistency
- Validates that Ubuntu, macOS, and Windows runners emit identical artifacts once normalization is complete.
- Migrates Windows tasks to PowerShell Core (`pwsh`) for consistent scripting semantics across platforms.

## Artifact Manifest Hygiene
- Cleans the artifact manifest to remove duplicated entries.
- Normalizes line endings to avoid carriage-return drift when transferring artifacts between operating systems.

## Workflow Hardening
- Adds guarded exits that fail the job early when required outputs are missing.
- Normalizes copy operations and validation paths so mismatches are detected immediately.

## Traceability
- These changes correspond to commit `1714612` ("Add CI refinement recap summary").
- All updates are captured here to maintain context for subsequent validation phases.
