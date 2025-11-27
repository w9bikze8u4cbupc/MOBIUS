// Render job configuration builder for feeding the external rendering pipeline.
// This module maps Phase E ingestion + storyboard outputs into a single
// JSON contract that the renderer can consume without being tightly coupled
// to the rendering engine internals.

import * as fs from "fs";
import * as path from "path";

const projectStateStore = new Map();

const CONFIG_DIR = path.join(process.cwd(), "config");
const CAPTIONS_GENERATED_PATH = path.join(CONFIG_DIR, "captions.generated.json");
const LOCALIZATION_GENERATED_PATH = path.join(
  CONFIG_DIR,
  "localization.generated.json",
);
const CAPTIONS_FALLBACK_PATH = path.join(CONFIG_DIR, "captions.json");
const LOCALIZATION_FALLBACK_PATH = path.join(CONFIG_DIR, "localization.json");

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadJsonConfig(primaryPath, fallbackPath, defaultValue = {}) {
  const pathToUse = fs.existsSync(primaryPath) ? primaryPath : fallbackPath;
  if (!pathToUse || !fs.existsSync(pathToUse)) return defaultValue;
  try {
    const raw = fs.readFileSync(pathToUse, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`Failed to parse config from ${pathToUse}`, err);
    return defaultValue;
  }
}

function normalizeCaptionsConfig(raw = {}) {
  if (!raw || typeof raw !== "object") return {};
  return {
    format: raw.format || raw.caption_format || "srt",
    encoding: raw.encoding,
    maxCharsPerLine: raw.maxCharsPerLine || raw.max_chars_per_line,
    maxCps: raw.maxCps || raw.max_cps,
    maxLines: raw.maxLines || raw.max_lines,
    languages: raw.languages || [],
  };
}

function normalizeLocalizationConfig(raw = {}) {
  if (!raw || typeof raw !== "object") return {};
  return {
    defaultLocale: raw.defaultLocale || raw.default_locale,
    subtitleNamingPattern:
      raw.subtitleNamingPattern || raw.subtitle_naming_pattern || "{game}-{locale}.srt",
    subtitleLocaleCodes:
      raw.subtitleLocaleCodes || raw.subtitle_locale_codes || raw.locales || {},
    locales: raw.locales || {},
  };
}

function normalizeGameBasename(name) {
  if (!name) return "game";
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function applySubtitleNamingPattern(pattern, { game, localeCode }) {
  const safeGame = normalizeGameBasename(game);
  return pattern
    .replace(/{game}/g, safeGame || "game")
    .replace(/{locale}/g, localeCode || "en");
}

function buildCaptionTracks({
  captionLocales = [],
  captionsConfig,
  localizationConfig,
  gameName,
  burnInCaptions,
}) {
  const locales = captionLocales.length
    ? captionLocales
    : [localizationConfig.defaultLocale].filter(Boolean);

  return locales
    .filter((locale) => localizationConfig.subtitleLocaleCodes?.[locale])
    .map((locale, idx) => {
      const languageCode = localizationConfig.subtitleLocaleCodes[locale];
      const path = applySubtitleNamingPattern(localizationConfig.subtitleNamingPattern, {
        game: gameName,
        localeCode: languageCode,
      });

      return {
        id: `caption-${idx + 1}`,
        languageCode,
        locale,
        type: burnInCaptions ? "burnin" : "sidecar",
        path,
        format: captionsConfig.format || "srt",
        enabled: true,
      };
    });
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
  captionLocales = [],
  burnInCaptions = false,
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

  const gameName =
    metadata.gameName ||
    storyboardManifest.game?.name ||
    ingestionManifest.document?.title ||
    "";

  const captionsConfig = normalizeCaptionsConfig(
    loadJsonConfig(CAPTIONS_GENERATED_PATH, CAPTIONS_FALLBACK_PATH, {}),
  );
  const localizationConfig = normalizeLocalizationConfig(
    loadJsonConfig(
      LOCALIZATION_GENERATED_PATH,
      LOCALIZATION_FALLBACK_PATH,
      {},
    ),
  );

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

  const selectedCaptionLocales = captionLocales.length
    ? captionLocales
    : Array.isArray(metadata.captionLocales)
      ? metadata.captionLocales
      : [];

  const effectiveBurnIn = Boolean(
    burnInCaptions || metadata.burnInCaptions || metadata.captionBurnIn,
  );

  const captionTracks = buildCaptionTracks({
    captionLocales: selectedCaptionLocales,
    captionsConfig,
    localizationConfig,
    gameName,
    burnInCaptions: effectiveBurnIn,
  });

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
    captions: captionTracks,
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
    gameName,
    lang,
    video,
    assets,
    timing,
    options: {
      burnInCaptions: effectiveBurnIn,
      sidecarCaptions: captionTracks.some((track) => track.type === "sidecar"),
    },
    metadata: {
      ingestionVersion: ingestionManifest.version,
      storyboardContractVersion: storyboardManifest.storyboardContractVersion,
      seed: metadata.seed || null,
      captionLocales: selectedCaptionLocales,
      captionsConfig,
    },
    localization: {
      defaultLocale: localizationConfig.defaultLocale,
      subtitleNamingPattern: localizationConfig.subtitleNamingPattern,
      localeCodes: localizationConfig.subtitleLocaleCodes,
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
    const captionLocales = (() => {
      if (Array.isArray(req.query.captionLocales)) return req.query.captionLocales;
      if (typeof req.query.captionLocales === "string") {
        return req.query.captionLocales
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
      return [];
    })();
    const burnInCaptions = String(req.query.burnInCaptions).toLowerCase() === "true";

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
        captionLocales,
        burnInCaptions,
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

