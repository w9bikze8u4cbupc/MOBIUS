// orb/tutorialOverlays.ts

// Core types mirroring the G3 visualization contract shape.

export interface G3PacingWavePoint {
  angle: number;   // radians, [0, 2π]
  radius: number;  // normalized, [0, 1] in Orb space
  amplitude: number; // wpm deviation from target; mapping to y-offset handled by renderer
}

export interface G3DensitySegment {
  angleStart: number;
  angleEnd: number;
  radiusInner: number;
  radiusOuter: number;
  densityScore: number; // 0..∞, typically small; renderer maps to opacity/intensity
}

export interface G3VisualLoadArc {
  angleStart: number;
  angleEnd: number;
  radius: number;
  load: number; // 0..1
}

export interface G3CaptionBlock {
  angleStart: number;
  angleEnd: number;
  radiusInner: number;
  radiusOuter: number;
  cps: number;
  lines: number; // 0..2
}

export interface G3ClarityPoint {
  angle: number;
  radius: number;
  clarityScore: number; // 0..1
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
  timeline: any[]; // Orb usually doesn't need raw samples, but we keep them for future overlays.
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

  if (!bundle.overlays || !bundle.overlays.pacingWave || !Array.isArray(bundle.overlays.pacingWave.points)) {
    throw new Error("Invalid G3 bundle: pacingWave.points missing");
  }

  return bundle;
}

// Orb-level DTO: exactly what we want the canvas/render code to consume.
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

// --- Rendering helpers (pure, deterministic, dependency-free) ---

export interface CartesianPoint {
  x: number;
  y: number;
}

/**
 * Convert polar coordinates (angle in radians, radius in [0,1]) to
 * Cartesian coordinates in a normalized Orb canvas:
 * - Center at (0,0)
 * - Unit circle radius 1
 */
export function polarToCartesian(angle: number, radius: number): CartesianPoint {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

// Design palette (kept in one place for consistency).

export const ORB_COLORS = {
  pacing: "#14b8a6",   // teal
  density: "#ffc957",  // golden amber
  motion: "#ec4899",   // magenta/pink
  captions: "#facc15", // yellow
  clarity: "#38bdf8",  // blue
};

// Simple mapping helpers for visual intensity.

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function densityToOpacity(densityScore: number): number {
  // Soft logistic-ish mapping to [0.1, 0.85].
  const scaled = Math.log1p(Math.max(0, densityScore));
  const normalized = clamp01(scaled / 3); // heuristic
  return 0.1 + normalized * 0.75;
}

export function motionToOpacity(load: number): number {
  const normalized = clamp01(load);
  return 0.15 + normalized * 0.7;
}

export function captionsToOpacity(cps: number): number {
  const normalized = clamp01(cps / 25); // >25 CPS considered heavy
  return 0.12 + normalized * 0.7;
}

export function clarityToOpacity(score: number): number {
  const normalized = clamp01(score);
  return 0.25 + normalized * 0.6;
}
