// orb/crossTutorialAnalytics.ts

export interface G5Identity {
  analysisId: string;
  generatedAtUtc: string;
  generatorVersion: string;
}

export interface G5Centroid {
  clarityScore: number;
  pacingStability: number;
  densityVariance: number;
  captionLoadIndex: number;
}

export interface G5TutorialComparison {
  tutorialId: string;
  distanceFromCentroid: number;
  rankIndex: number;
  zScores: {
    clarityScore: number;
    captionLoadIndex: number;
    avgMotionLoad: number;
  };
  flags: string[];
}

export interface G5Cluster {
  clusterId: string;
  members: string[];
  centroidClarity: number;
}

export interface G5Drift {
  clarityDrift: number;
  captionLoadDrift: number;
  motionLoadDrift: number;
  tutorialsImpacted: string[];
}

export interface G5Recommendation {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
}

export interface G5AnalyticsBundle {
  contract: {
    name: "g5_cross_tutorial_analytics_contract";
    version: string;
  };
  identity: G5Identity;
  input: {
    tutorialIds: string[];
    g4Versions: string[];
    count: number;
  };
  aggregateMetrics: {
    clarityCentroid: G5Centroid;
    motionLoadMean: number;
    captionLoadMean: number;
  };
  tutorialComparisons: G5TutorialComparison[];
  clusters: G5Cluster[];
  drift: G5Drift;
  recommendations: G5Recommendation[];
  metadata?: { notes: string };
}

export function parseG5AnalyticsBundle(json: unknown): G5AnalyticsBundle {
  const bundle = json as G5AnalyticsBundle;
  if (!bundle.contract || bundle.contract.name !== "g5_cross_tutorial_analytics_contract") {
    throw new Error("Invalid G5 bundle: contract.name mismatch");
  }
  return bundle;
}
