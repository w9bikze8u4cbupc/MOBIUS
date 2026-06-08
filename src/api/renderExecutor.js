import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { packageRenderJob } from './packaging.js';

const moduleDirname = path.join(process.cwd(), 'src', 'api');
export const RENDER_OUTPUT_BASE =
  process.env.JOB_RESULTS_DIR || path.join(moduleDirname, 'uploads', 'render-jobs');

/** Default storyboard renderer script (relative to project root). */
export const DEFAULT_STORYBOARD_RENDERER = path.join(
  process.cwd(),
  'scripts',
  'render-storyboard-ffmpeg.mjs',
);

function parseProgress(line) {
  const match = line.match(/progress[:=]\s*(\d{1,3})/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function writeConfig(jobOutputDir, jobId, config) {
  const configPath = path.join(jobOutputDir, `${jobId}-config.json`);
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

/**
 * Adapt the internal render job config (from buildRenderJobConfig) into the
 * scene-based format expected by render-storyboard-ffmpeg.mjs.
 */
export function adaptConfigForStoryboardRenderer(jobConfig, { outputPath, imageAssets } = {}) {
  const video = jobConfig.video || {};
  const resolution = video.resolution || { width: 1920, height: 1080 };
  const fps = video.fps || 30;
  const projectId = jobConfig.projectId || 'unknown';

  // Build a lookup of available renderer-ready images by id
  const imageMap = new Map();
  if (Array.isArray(imageAssets)) {
    for (const img of imageAssets) {
      if (img.id && img.renderPath) {
        imageMap.set(img.id, img);
      }
    }
  }

  // Build scenes from storyboard data or timing data
  const storyboardScenes = jobConfig.assets?.storyboardScenes || [];
  const timingScenes = jobConfig.timing?.scenes || [];
  const sourceScenes = storyboardScenes.length > 0 ? storyboardScenes : timingScenes;

  const imageWarnings = [];

  const scenes = sourceScenes.map((scene, idx) => {
    // Resolve background: prefer scene's explicit background, then try image asset
    let background = scene.background || null;
    if (!background && scene.imageId && imageMap.has(scene.imageId)) {
      background = { image: imageMap.get(scene.imageId).renderPath };
    } else if (!background && scene.imageRef && imageMap.has(scene.imageRef)) {
      background = { image: imageMap.get(scene.imageRef).renderPath };
    }
    if (!background) {
      background = { color: idx === 0 ? '#1a1a2e' : '#16213e' };
      if (scene.imageId || scene.imageRef) {
        imageWarnings.push(`Scene ${scene.id || idx}: image ref '${scene.imageId || scene.imageRef}' not resolved, using color fallback`);
      }
    }

    return {
      id: scene.id || `scene-${idx + 1}`,
      durationSec: scene.durationSec || 3,
      background,
      overlays: scene.overlays || [
        { type: 'title', text: scene.id || `Scene ${idx + 1}`, position: 'center' },
      ],
      audio: scene.audio || undefined,
    };
  });

  // If no scenes available, create a single placeholder scene
  if (scenes.length === 0) {
    const totalDuration = jobConfig.timing?.totalDurationSec || 6;
    scenes.push({
      id: 'scene-placeholder',
      durationSec: totalDuration,
      background: { color: '#1a1a2e' },
      overlays: [
        { type: 'title', text: jobConfig.gameName || projectId, position: 'center' },
        { type: 'body', text: 'Tutorial Preview', position: 'bottom' },
      ],
    });
  }

  return {
    projectId,
    video: { resolution, fps },
    scenes,
    _outputPath: outputPath || undefined,
    _source: 'renderExecutor-adapter',
    _imageWarnings: imageWarnings.length > 0 ? imageWarnings : undefined,
  };
}

export function buildCommand({ jobId, configPath, jobOutputDir, outputFilePath }) {
  const rendererCommand = process.env.RENDERER_COMMAND;
  const rendererArgsEnv = process.env.RENDERER_ARGS || '';
  const rendererEntrypoint = process.env.RENDERER_ENTRYPOINT;
  const dryRun = process.env.RENDERER_DRY_RUN === 'true';

  // Priority: RENDERER_COMMAND > RENDERER_ENTRYPOINT > default storyboard renderer
  const useStoryboardDefault = !rendererCommand && !rendererEntrypoint;
  const entrypoint = rendererEntrypoint || (useStoryboardDefault ? DEFAULT_STORYBOARD_RENDERER : null);

  if (!rendererCommand && !entrypoint) {
    throw new Error('RENDERER_COMMAND_NOT_CONFIGURED');
  }

  const args = rendererArgsEnv
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean);

  if (entrypoint) {
    args.push(entrypoint);
  }

  if (useStoryboardDefault) {
    // Use storyboard renderer CLI interface
    args.push('--config', configPath);
    if (outputFilePath) {
      args.push('--out', outputFilePath);
    }
    if (dryRun) {
      args.push('--dry-run');
    }
  } else {
    // Legacy renderer interface
    args.push('--job-id', jobId, '--config', configPath, '--output', jobOutputDir);
  }

  return {
    command: rendererCommand || 'node',
    args,
    entrypoint: entrypoint || rendererCommand,
    isStoryboardRenderer: useStoryboardDefault,
  };
}

async function collectArtifacts(jobOutputDir, publicBasePath) {
  const files = await fs.promises.readdir(jobOutputDir);
  return files.map((file) => path.join(publicBasePath, file));
}

export async function runRenderJob(job, options = {}) {
  const jobOutputDir = path.join(options.outputBaseDir || RENDER_OUTPUT_BASE, job.id);
  const publicBasePath = path.join('/uploads/render-jobs', job.id);
  await ensureDir(jobOutputDir);

  // Determine if we should adapt config for storyboard renderer
  const useStoryboard = !process.env.RENDERER_COMMAND && !process.env.RENDERER_ENTRYPOINT;
  const outputFilePath = useStoryboard
    ? path.join(jobOutputDir, `${job.id}-preview.mp4`)
    : null;

  // Write the renderer-appropriate config
  let configToWrite = job.config;
  if (useStoryboard) {
    configToWrite = adaptConfigForStoryboardRenderer(job.config, { outputPath: outputFilePath });
  }

  const configPath = await writeConfig(jobOutputDir, job.id, configToWrite);
  const { command, args, entrypoint, isStoryboardRenderer } = buildCommand({
    jobId: job.id,
    configPath,
    jobOutputDir,
    outputFilePath,
  });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env },
      cwd: process.cwd(),
    });

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      text
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => {
          const progress = parseProgress(line);
          if (progress !== null && typeof options.onProgress === 'function') {
            options.onProgress(progress);
          }
        });
    });

    const stderrLines = [];
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderrLines.push(text);
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('exit', async (code) => {
      if (code === 0) {
        try {
          let packagingResult = {};
          try {
            packagingResult = await packageRenderJob({
              jobId: job.id,
              outputDir: jobOutputDir,
              jobConfig: job.config,
            });
          } catch (packagingError) {
            console.error('Failed to package render job', job.id, packagingError);
            packagingResult = { packagingError: packagingError?.message };
          }

          const artifacts = await collectArtifacts(jobOutputDir, publicBasePath);
          const manifestPath = packagingResult.manifestPath
            ? path.join(publicBasePath, path.basename(packagingResult.manifestPath))
            : null;
          const zipPath = packagingResult.zipPath
            ? path.join(publicBasePath, path.basename(packagingResult.zipPath))
            : null;

          resolve({
            artifacts,
            manifest: packagingResult.manifest,
            manifestPath,
            zipPath,
            packagingError: packagingResult.packagingError,
            rendererEntrypoint: entrypoint,
            isStoryboardRenderer,
            configPath,
            outputFilePath,
          });
        } catch (err) {
          reject(err);
        }
      } else {
        const error = new Error(
          `Render process exited with code ${code}: ${stderrLines.join('\n').trim()}`,
        );
        error.rendererEntrypoint = entrypoint;
        error.configPath = configPath;
        reject(error);
      }
    });
  });
}
