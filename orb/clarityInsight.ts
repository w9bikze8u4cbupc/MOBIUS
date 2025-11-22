// orb/clarityInsight.ts

import type { G3VisualizationBundle, G3GlobalMetrics } from "./tutorialOverlays";

export interface G4ClarityScores {
  clarityScore: number;      // 0..1
  pacingStability: number;   // 0..1
  densityVariance: number;   // 0..1
  captionLoadIndex: number;  // 0..1
}

export type G4IssueSeverity = "info" | "warn" | "error";

export interface G4InsightIssue {
  code: string;
  severity: G4IssueSeverity;
  message: string;
  segment: string;
}

export interface G4PerSceneInsight {
  sceneIndex: number;
  kind: string;
  message: string;
}

export interface G4ClarityInsightIdentity {
  tutorialId: string;
  mobiusExportVersion: string;
  genesisIngestVersion: string;
  g2QualityContractVersion: string;
  g3VisualizationContractVersion: string;
  seqIndex: number;
}

export interface G4ClarityInsightBundle {
  contract: {
    name: "g4_clarity_insight_contract";
    version: string;
  };
  identity: G4ClarityInsightIdentity;
  clarity: G4ClarityScores;
  insights: {
    grade: "A" | "B" | "C" | "D" | "F";
    summary: string;
    issues: G4InsightIssue[];
  };
  perSceneInsights: {
    items: G4PerSceneInsight[];
  };
  metadata?: {
    createdAtUtc?: string | null;
    generator?: string;
    generatorVersion?: string;
  };
}

/**
 * Parse a G4 bundle from an untyped JSON blob.
 */
export function parseG4ClarityInsightBundle(json: unknown): G4ClarityInsightBundle {
  const bundle = json as G4ClarityInsightBundle;
  if (!bundle.contract || bundle.contract.name !== "g4_clarity_insight_contract") {
    throw new Error("Invalid G4 bundle: contract.name mismatch");
  }
  return bundle;
}

/**
 * Temporary helper to derive a local-only G4-like overlay directly from G3
 * (useful for testing or when the backend hasn't emitted G4 yet).
 */
export function buildLocalClarityOverlayFromG3(metrics: G3GlobalMetrics): G4ClarityScores {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  const clarityScore = clamp01(metrics.avgClarityScore);
  const pacingStability = clamp01(1 - metrics.pacingStability / 5000);
  const densityVariance = clamp01(metrics.densityVariance / 5);
  const captionLoadIndex = clamp01(metrics.captionLoadIndex / 25);

  return {
    clarityScore,
    pacingStability,
    densityVariance,
    captionLoadIndex,
  };
}

/**
 * Map a G4 bundle into a simple "badge" state for UI.
 */
export interface ClarityBadgeState {
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  clarityScore: number;
}

export function buildClarityBadgeState(bundle: G4ClarityInsightBundle): ClarityBadgeState {
  return {
    grade: bundle.insights.grade,
    summary: bundle.insights.summary,
    clarityScore: bundle.clarity.clarityScore,
  };
}
