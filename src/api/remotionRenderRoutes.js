import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { generateNarration } from '../services/elevenLabsService.js';

const execFileAsync = promisify(execFile);
// Keep this compatible with the repository's Jest CommonJS transform.
const moduleDirectory = path.join(process.cwd(), 'src', 'api');
const projectDirectory = path.resolve(moduleDirectory, '..', '..');
const rendererScript = path.join(projectDirectory, 'scripts', 'render-remotion.mjs');
const defaultOutputBaseDirectory = path.join(moduleDirectory, 'uploads', 'remotion');

function loadProject(db, projectId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM projects WHERE id = ?', [projectId], (error, project) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(project || null);
    });
  });
}

function parseProjectScenes(project) {
  if (project.scenes === undefined) {
    const error = new Error('REMOTION_SCENES_MISSING');
    error.status = 400;
    throw error;
  }

  let scenes;
  try {
    scenes = typeof project.scenes === 'string' ? JSON.parse(project.scenes) : project.scenes;
  } catch {
    const error = new Error('REMOTION_SCENES_INVALID');
    error.status = 400;
    throw error;
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    const error = new Error('REMOTION_SCENES_INVALID');
    error.status = 400;
    throw error;
  }

  return scenes;
}

function isExternalAssetReference(value) {
  return /^(?:https?:|data:)/i.test(value);
}

function rejectUnsafeAssetReference(value) {
  const error = new Error(`REMOTION_ASSET_INVALID: ${value}`);
  error.status = 400;
  throw error;
}

function resolveProjectAsset(value) {
  if (typeof value !== 'string' || isExternalAssetReference(value)) {
    return value;
  }

  if (/^file:/i.test(value)) {
    rejectUnsafeAssetReference(value);
  }

  const uploadRoot = path.join(moduleDirectory, 'uploads');
  const assetRoot = value.startsWith('/uploads/') ? uploadRoot : projectDirectory;
  const assetPath = value.startsWith('/uploads/')
    ? path.resolve(moduleDirectory, `.${value}`)
    : path.resolve(projectDirectory, value);
  const relativePath = path.relative(assetRoot, assetPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    rejectUnsafeAssetReference(value);
  }

  return assetPath;
}

function toPublicRenderPath(renderId, outputPath) {
  return `/uploads/remotion/${encodeURIComponent(renderId)}/${encodeURIComponent(path.basename(outputPath))}`;
}

function prepareScenesForRenderer(scenes) {
  return scenes.map((scene) => {
    const imageUrls = Array.isArray(scene.imageUrls)
      ? scene.imageUrls.map((imageUrl) => resolveProjectAsset(imageUrl))
      : scene.imageUrls;
    const legacyImageUrl = Array.isArray(imageUrls) && imageUrls.length > 0
      ? imageUrls[0]
      : resolveProjectAsset(scene.imageUrl);

    return {
      ...scene,
      ...(imageUrls !== undefined ? { imageUrls } : {}),
      imageUrl: legacyImageUrl,
      ...(scene.audioFile ? { audioFile: resolveProjectAsset(scene.audioFile) } : {}),
    };
  });
}

function normalizeVoiceId(voiceId) {
  return typeof voiceId === 'string' && voiceId.trim() !== '' ? voiceId.trim() : null;
}

async function attachGeneratedNarration(scenes, voiceId, configurationDirectory, narrationGenerator) {
  if (!voiceId || !process.env.ELEVENLABS_API_KEY?.trim()) {
    return scenes;
  }

  const narratedScenes = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const audioFile = path.join(configurationDirectory, `scene-${index + 1}.mp3`);
    await narrationGenerator(scene.narrationText, voiceId, audioFile);
    narratedScenes.push({ ...scene, audioFile });
  }
  return narratedScenes;
}

export async function runRemotionRender({
  scenes,
  outputDirectory,
  voiceId,
  generateNarration: generateSceneNarration = generateNarration,
}) {
  const configurationDirectory = await fs.mkdtemp(path.join(tmpdir(), 'mobius-remotion-config-'));
  const configurationPath = path.join(configurationDirectory, 'scenes.json');

  try {
    const scenesWithNarration = await attachGeneratedNarration(
      scenes,
      normalizeVoiceId(voiceId),
      configurationDirectory,
      generateSceneNarration,
    );
    await fs.mkdir(outputDirectory, { recursive: true });
    await fs.writeFile(configurationPath, JSON.stringify(scenesWithNarration, null, 2), 'utf8');
    const shouldConcatenate = scenesWithNarration.length > 1
      && scenesWithNarration.some((scene) => Boolean(scene.audioFile));
    const rendererArgs = [rendererScript, configurationPath, '--out-dir', outputDirectory];
    if (shouldConcatenate) {
      rendererArgs.push('--concat');
    }
    await execFileAsync(
      process.execPath,
      rendererArgs,
      {
        cwd: projectDirectory,
        maxBuffer: 1024 * 1024,
      },
    );

    const renderedEntries = await fs.readdir(outputDirectory, { withFileTypes: true });
    const outputPaths = renderedEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.mp4'))
      .map((entry) => path.join(outputDirectory, entry.name))
      .sort();

    if (outputPaths.length === 0) {
      throw new Error('REMOTION_OUTPUT_MISSING');
    }

    return { outputPaths };
  } finally {
    await fs.rm(configurationDirectory, { recursive: true, force: true });
  }
}

export function registerRemotionRenderRoutes(
  app,
  {
    db,
    runRemotionRender: executeRemotionRender = runRemotionRender,
    generateNarration: generateSceneNarration = generateNarration,
    outputBaseDirectory = defaultOutputBaseDirectory,
  } = {},
) {
  if (!db) {
    throw new Error('registerRemotionRenderRoutes requires a db dependency.');
  }

  app.post('/api/render-remotion', async (req, res) => {
    const { projectId, voiceId } = req.body || {};
    if ((typeof projectId !== 'string' && typeof projectId !== 'number') || String(projectId).trim() === '') {
      return res.status(400).json({
        ok: false,
        code: 'REMOTION_PROJECT_ID_REQUIRED',
        error: 'A projectId is required.',
      });
    }

    try {
      const project = await loadProject(db, projectId);
      if (!project) {
        return res.status(404).json({
          ok: false,
          code: 'REMOTION_PROJECT_NOT_FOUND',
          error: 'Project not found.',
        });
      }

      const scenes = prepareScenesForRenderer(parseProjectScenes(project));
      const renderId = `remotion-${randomUUID()}`;
      const outputDirectory = path.join(outputBaseDirectory, renderId);
      const result = await executeRemotionRender({
        scenes,
        outputDirectory,
        voiceId: normalizeVoiceId(voiceId),
        generateNarration: generateSceneNarration,
      });
      const outputPaths = result?.outputPaths || [];

      if (outputPaths.length === 0) {
        throw new Error('REMOTION_OUTPUT_MISSING');
      }

      const publicOutputPaths = outputPaths.map((outputPath) => toPublicRenderPath(renderId, outputPath));
      return res.json({
        ok: true,
        projectId: String(project.id),
        outputPath: publicOutputPaths[0],
        outputPaths: publicOutputPaths,
      });
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) {
        console.error('Remotion render failed', error);
      }
      return res.status(status).json({
        ok: false,
        code: error.message === 'REMOTION_SCENES_MISSING' || error.message === 'REMOTION_SCENES_INVALID'
          ? error.message
          : 'REMOTION_RENDER_FAILED',
        error: status === 400
          ? 'The project does not contain a valid Remotion scenes array.'
          : 'Unable to render the project with Remotion.',
      });
    }
  });
}
