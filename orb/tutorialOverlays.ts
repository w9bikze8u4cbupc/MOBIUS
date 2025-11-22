export interface G3PacingWavePoint {
  angle: number;
  radius: number;
  amplitude: number;
}

export interface G3DensitySegment {
  angleStart: number;
  angleEnd: number;
  radiusInner: number;
  radiusOuter: number;
  densityScore: number;
}

export interface G3VisualLoadArc {
  angleStart: number;
  angleEnd: number;
  radius: number;
  load: number;
}

export interface G3CaptionBlock {
  angleStart: number;
  angleEnd: number;
  radiusInner: number;
  radiusOuter: number;
  cps: number;
  lines: number;
}

export interface G3ClarityPoint {
  angle: number;
  radius: number;
  clarityScore: number;
}

export interface G3GlobalMetrics {
  durationSec: number;
  avgWpm: number;
  avgCps: number;
  avgMotionLoad: number;
  avgClarityScore: number;
  densityVariance: number;
  pacingStability: number;
  captionLoadIndex: number;
}

export interface G3VisualizationIdentity {
  tutorialId: string;
  mobiusExportVersion: string;
  genesisIngestVersion: string;
  g2QualityContractVersion: string;
  seqIndex: number;
}

export interface G3VisualizationOverlays {
  pacingWave: {
    targetWpm: number;
    points: G3PacingWavePoint[];
  };
  densityBand: {
    segments: G3DensitySegment[];
  };
  visualLoadRing: {
    arcs: G3VisualLoadArc[];
  };
  captionBand: {
    blocks: G3CaptionBlock[];
  };
  clarityThread: {
    points: G3ClarityPoint[];
  };
}

export interface G3VisualizationBundle {
  contract: {
    name: string;
    version: string;
  };
  identity: G3VisualizationIdentity;
  timeline: any[]; // Orb usually doesn't need raw samples, but we keep it available.
  globalMetrics: G3GlobalMetrics;
  overlays: G3VisualizationOverlays;
  metadata?: Record<string, unknown>;
}

/**
 * Convert an untyped JSON blob from GENESIS into a typed G3VisualizationBundle.
 * This is a light runtime guard; heavy validation happens on the GENESIS side.
 */
export function parseG3VisualizationBundle(json: unknown): G3VisualizationBundle {
  const bundle = json as G3VisualizationBundle;

  if (!bundle.contract || bundle.contract.name !== "g3_tutorial_visualization_contract") {
    throw new Error("Invalid G3 bundle: contract.name mismatch");
  }

  // Minimal sanity checks
  if (!bundle.overlays || !bundle.overlays.pacingWave || !Array.isArray(bundle.overlays.pacingWave.points)) {
    throw new Error("Invalid G3 bundle: pacingWave.points missing");
  }

  return bundle;
}

export type OrbTutorialOverlays = {
  pacingWave: G3PacingWavePoint[];
  densitySegments: G3DensitySegment[];
  motionArcs: G3VisualLoadArc[];
  captionBlocks: G3CaptionBlock[];
  clarityPoints: G3ClarityPoint[];
  globalMetrics: G3GlobalMetrics;
  identity: G3VisualizationIdentity;
};

export function buildOrbTutorialOverlays(bundle: G3VisualizationBundle): OrbTutorialOverlays {
  return {
    pacingWave: bundle.overlays.pacingWave.points,
    densitySegments: bundle.overlays.densityBand.segments,
    motionArcs: bundle.overlays.visualLoadRing.arcs,
    captionBlocks: bundle.overlays.captionBand.blocks,
    clarityPoints: bundle.overlays.clarityThread.points,
    globalMetrics: bundle.globalMetrics,
    identity: bundle.identity,
  };
}
