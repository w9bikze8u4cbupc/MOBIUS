// Render job configuration builder for feeding the external rendering pipeline.
// This module maps Phase E ingestion + storyboard outputs into a single
// JSON contract that the renderer can consume without being tightly coupled
// to the rendering engine internals.

const projectStateStore = new Map();

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseResolution(input) {
  if (!input || typeof input !== "string") return null;
  const match = input.toLowerCase().match(/(\d+)x(\d+)/);
  if (!match) return null;
  const [, width, height] = match;
  return { width: Number(width), height: Number(height) };
}

function normalizeStoryboardScenes(storyboardManifest) {
  if (!storyboardManifest || !Array.isArray(storyboardManifest.scenes)) {
    return { scenes: [], totalDurationSec: 0 };
  }

  const orderedScenes = [...storyboardManifest.scenes].sort((a, b) => {
    const aIdx = safeNumber(a.index, 0);
    const bIdx = safeNumber(b.index, 0);
    return aIdx - bIdx;
  });

  const scenes = orderedScenes.map((scene, idx) => ({
    id: scene.id || `scene-${idx + 1}`,
    segmentId: scene.segmentId || null,
    type: scene.type || "unknown",
    durationSec: safeNumber(scene.durationSec ?? scene.durationMs / 1000, 0),
    overlays: Array.isArray(scene.overlays)
      ? scene.overlays.map((overlay) => ({
          id: overlay.id,
          role: overlay.role,
          text: overlay.text,
        }))
      : [],
  }));

  const totalDurationSec = scenes.reduce(
    (sum, scene) => sum + safeNumber(scene.durationSec, 0),
    0,
  );

  return { scenes, totalDurationSec };
}

export function buildRenderJobConfig({
  projectId,
  metadata = {},
  ingestionManifest,
  storyboardManifest,
  lang = "en",
  resolution,
  fps,
  mode = "preview",
} = {}) {
  if (!projectId) {
    throw new Error("RENDER_JOB_PROJECT_ID_REQUIRED");
  }
  if (!ingestionManifest) {
    throw new Error("RENDER_JOB_MISSING_INGESTION");
  }
  if (!storyboardManifest) {
    throw new Error("RENDER_JOB_MISSING_STORYBOARD");
  }

  const { scenes, totalDurationSec } = normalizeStoryboardScenes(
    storyboardManifest,
  );

  const storyboardResolution = storyboardManifest.resolution || {};
  const resolvedResolution =
    resolution || parseResolution(metadata.resolutionOverride);

  const video = {
    resolution: {
      width: resolvedResolution?.width || storyboardResolution.width || 1920,
      height: resolvedResolution?.height || storyboardResolution.height || 1080,
    },
    fps: safeNumber(
      fps ?? storyboardResolution.fps ?? storyboardManifest.fps,
      30,
    ),
    mode,
  };

  const imageAssets =
    ingestionManifest.assets?.components?.map((component) => ({
      id: component.id,
      hash: component.hash,
      type: "component",
    })) || [];

  const pageAssets =
    ingestionManifest.assets?.pages?.map((page) => ({
      id: `page-${page.page}`,
      hash: page.hash,
      type: "page",
    })) || [];

  const assets = {
    images: [...imageAssets, ...pageAssets],
    audio: [],
    captions: [],
    storyboardScenes: scenes.map((scene) => ({
      id: scene.id,
      type: scene.type,
      durationSec: scene.durationSec,
    })),
  };

  const timing = {
    totalDurationSec,
    scenes: scenes.map((scene) => ({
      id: scene.id,
      durationSec: scene.durationSec,
    })),
  };

  return {
    projectId,
    gameName:
      metadata.gameName ||
      storyboardManifest.game?.name ||
      ingestionManifest.document?.title ||
      "",
    lang,
    video,
    assets,
    timing,
    metadata: {
      ingestionVersion: ingestionManifest.version,
      storyboardContractVersion: storyboardManifest.storyboardContractVersion,
      seed: metadata.seed || null,
    },
    deterministic: true,
  };
}

export function setProjectState(projectId, state) {
  projectStateStore.set(String(projectId), state);
}

export function clearProjectState() {
  projectStateStore.clear();
}

export function getProjectState(projectId) {
  return projectStateStore.get(String(projectId));
}

export function registerRenderJobConfigRoute(app, { loadProjectById } = {}) {
  const load = loadProjectById || getProjectState;

  app.get("/api/render-job-config", (req, res) => {
    const { projectId, lang, resolution, fps, mode } = req.query || {};

    if (!projectId || !lang) {
      return res.status(400).json({
        ok: false,
        code: "RENDER_JOB_BAD_REQUEST",
        error: "projectId and lang are required",
      });
    }

    const project = load(projectId);
    if (!project) {
      return res.status(404).json({
        ok: false,
        code: "RENDER_JOB_PROJECT_NOT_FOUND",
        error: "Project not found",
      });
    }

    if (!project.ingestionManifest) {
      return res.status(400).json({
        ok: false,
        code: "RENDER_JOB_MISSING_INGESTION",
        error: "Ingestion manifest is required",
      });
    }

    if (!project.storyboardManifest) {
      return res.status(400).json({
        ok: false,
        code: "RENDER_JOB_MISSING_STORYBOARD",
        error: "Storyboard manifest is required",
      });
    }

    try {
      const config = buildRenderJobConfig({
        projectId,
        metadata: project.metadata || {},
        ingestionManifest: project.ingestionManifest,
        storyboardManifest: project.storyboardManifest,
        lang,
        resolution: parseResolution(resolution) || project.resolution,
        fps: fps ? Number(fps) : undefined,
        mode: mode || "preview",
      });

      return res.json({ ok: true, config });
    } catch (err) {
      console.error("Failed to build render job config", err);
      const status = err.message?.startsWith("RENDER_JOB") ? 400 : 500;
      return res.status(status).json({
        ok: false,
        code: err.message || "RENDER_JOB_UNKNOWN_ERROR",
        error: "Unable to build render job config",
      });
    }
  });
}

