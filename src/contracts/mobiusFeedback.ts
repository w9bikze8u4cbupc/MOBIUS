// src/contracts/mobiusFeedback.ts

export type MobiusFeedbackSeverity = "info" | "warn" | "error";

export interface MobiusFeedbackRecommendation {
  code: string;
  severity: MobiusFeedbackSeverity;
  message: string;
  category: "script" | "captions" | "motion" | "audio" | "overall" | string;
  priority: number;
}

export interface MobiusFeedbackHints {
  targetWpmRange: { min: number; max: number };
  targetCaptionCpsRange: { min: number; max: number };
  maxMotionLoad: number;
  suggestLowerDuckingThreshold: boolean;
  suggestStrongerPauseCues: boolean;
}

export interface MobiusFeedbackSummary {
  grade: "A" | "B" | "C" | "D" | "F" | string;
  clarityScore: number;
  distanceFromCentroid: number;
}

export interface MobiusFeedbackBundle {
  contract: {
    name: "g6_mobius_feedback_contract";
    version: string;
  };
  identity: {
    analysisId: string;
    generatedAtUtc: string;
    generatorVersion: string;
  };
  input: {
    tutorialId: string;
    mobiusExportVersion: string;
    genesisIngestVersion: string;
    g4ClarityVersion: string;
    g5AnalyticsVersion: string;
  };
  summary: MobiusFeedbackSummary;
  recommendations: MobiusFeedbackRecommendation[];
  mobiusHints: MobiusFeedbackHints;
  metadata?: {
    notes?: string;
  };
}

export function parseMobiusFeedback(json: unknown): MobiusFeedbackBundle {
  const bundle = json as MobiusFeedbackBundle;
  if (!bundle.contract || bundle.contract.name !== "g6_mobius_feedback_contract") {
    throw new Error("Invalid MOBIUS feedback bundle: contract.name mismatch");
  }
  return bundle;
}
