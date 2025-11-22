// orb/clarityInsight.ts

import type { G3GlobalMetrics } from "./tutorialOverlays";

/**
 * High-level view of clarity state that higher layers (e.g., tooltips,
 * side panels) can consume without needing raw G3 metrics.
 */
export interface ClarityOverlayState {
  clarityScore: number;       // 0..1
  pacingStability: number;    // 0..1 normalized
  densityVariance: number;    // 0..1 normalized
  captionLoadIndex: number;   // 0..1 normalized
}

/**
 * Early stub for INSIGHT overlays (G4+).
 * This is deliberately minimal and additive.
 */
export interface InsightOverlayState {
  // e.g. textual summary, anomaly flags, etc.
  summary: string;
  hasPacingIssues: boolean;
  hasCaptionIssues: boolean;
  hasMotionIssues: boolean;
}

/**
 * Map raw G3 global metrics into a normalized clarity overlay state.
 * This is deterministic, pure, and safe to evolve with contract version bumps.
 */
export function buildClarityOverlayState(metrics: G3GlobalMetrics): ClarityOverlayState {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  // Simple normalization heuristics for pass 1. We can refine in G4.
  const pacingStability = clamp01(1 - metrics.pacingStability / 5000); // arbitrary scale
  const densityVariance = clamp01(metrics.densityVariance / 5);        // arbitrary scale
  const captionLoadIndex = clamp01(metrics.captionLoadIndex / 25);     // heavy captions >25

  return {
    clarityScore: clamp01(metrics.avgClarityScore),
    pacingStability,
    densityVariance,
    captionLoadIndex,
  };
}

/**
 * Placeholder for INSIGHT overlay generation. In G3 it simply encodes a
 * conservative summary; G4 can replace the body with richer logic without
 * changing call sites.
 */
export function buildInsightOverlayState(metrics: G3GlobalMetrics): InsightOverlayState {
  const clarityOk = metrics.avgClarityScore >= 0.6;
  const pacingOk = metrics.pacingStability < 4000;
  const captionsOk = metrics.captionLoadIndex < 20;
  const motionOk = metrics.avgMotionLoad <= 0.7;

  const issues: string[] = [];
  if (!clarityOk) issues.push("clarity");
  if (!pacingOk) issues.push("pacing");
  if (!captionsOk) issues.push("captions");
  if (!motionOk) issues.push("motion");

  const summary =
    issues.length === 0
      ? "Tutorial quality is broadly stable with no major issues detected."
      : `Tutorial shows potential issues in: ${issues.join(", ")}.`;

  return {
    summary,
    hasPacingIssues: !pacingOk,
    hasCaptionIssues: !captionsOk,
    hasMotionIssues: !motionOk,
  };
}
