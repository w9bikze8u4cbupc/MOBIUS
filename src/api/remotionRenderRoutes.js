import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { promisify } from 'node:util';
import { generateNarration } from '../services/elevenLabsService.js';
import { sanitizeSpokenText } from '../services/scriptPackage.js';

const execFileAsync = promisify(execFile);
// Keep this compatible with the repository's Jest CommonJS transform.
const moduleDirectory = path.join(process.cwd(), 'src', 'api');
const projectDirectory = path.resolve(moduleDirectory, '..', '..');
const rendererScript = path.join(projectDirectory, 'scripts', 'render-remotion.mjs');
const defaultOutputBaseDirectory = path.join(moduleDirectory, 'uploads', 'remotion');
const defaultBackgroundMusicUploadDirectory = path.join(moduleDirectory, 'uploads');
const supportedMusicExtensions = new Set(['.m4a', '.mp3', '.ogg', '.wav']);

function createRemotionError(code, message, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  error.publicMessage = message;
  return error;
}

function createBackgroundMusicUpload(uploadDirectory) {
  if (!existsSync(uploadDirectory)) {
    mkdirSync(uploadDirectory, { recursive: true });
  }

  return multer({
    storage: multer.diskStorage({
      destination: uploadDirectory,
      filename: (request, file, callback) => {
        callback(null, `remotion-music-${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
      },
    }),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (request, file, callback) => {
      if (!supportedMusicExtensions.has(path.extname(file.originalname).toLowerCase())) {
        callback(new Error('REMOTION_BACKGROUND_MUSIC_INVALID'));
        return;
      }
      callback(null, true);
    },
  });
}

function updateProjectMetadata(db, projectId, metadata) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE projects SET metadata = ? WHERE id = ?',
      [JSON.stringify(metadata), projectId],
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

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
  if (typeof value !== 'string') {
    return value;
  }
  if (isExternalAssetReference(value) || /^file:/i.test(value)) {
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

function resolveProjectImageAsset(value) {
  if (typeof value === 'string' && isExternalAssetReference(value)) {
    throw createRemotionError(
      'REMOTION_IMAGE_ASSET_INVALID',
      'Tutorial images must be stored in the project before rendering.',
    );
  }
  return resolveProjectAsset(value);
}

function toPublicRenderPath(renderId, outputPath) {
  return `/uploads/remotion/${encodeURIComponent(renderId)}/${encodeURIComponent(path.basename(outputPath))}`;
}

function parseProjectMetadata(project) {
  try {
    const metadata = typeof project.metadata === 'string'
      ? JSON.parse(project.metadata)
      : project.metadata;
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
  } catch {
    return {};
  }
}

function getBackgroundMusic(project) {
  const backgroundMusic = parseProjectMetadata(project).renderState?.backgroundMusic;
  if (!backgroundMusic || typeof backgroundMusic !== 'object') {
    return null;
  }

  const file = typeof backgroundMusic.file === 'string' ? backgroundMusic.file.trim() : '';
  if (!file) {
    return null;
  }
  const expectedPrefix = `/uploads/remotion-music/${project.id}/`;
  if (!file.startsWith(expectedPrefix)) {
    throw createRemotionError(
      'REMOTION_BACKGROUND_MUSIC_INVALID',
      'Background music must belong to the project being rendered.',
    );
  }

  return {
    file,
    volume: Number.isFinite(backgroundMusic.volume)
      ? Math.min(1, Math.max(0, backgroundMusic.volume))
      : 0.12,
  };
}

function prepareScenesForRenderer(scenes, backgroundMusic) {
  const resolvedBackgroundMusicFile = backgroundMusic
    ? resolveProjectAsset(backgroundMusic.file)
    : null;
  let backgroundMusicStartFrom = 0;

  return scenes.map((scene) => {
    const imageUrls = Array.isArray(scene.imageUrls)
      ? scene.imageUrls.map((imageUrl) => resolveProjectImageAsset(imageUrl))
      : scene.imageUrls;
    const legacyImageUrl = Array.isArray(imageUrls) && imageUrls.length > 0
      ? imageUrls[0]
      : resolveProjectImageAsset(scene.imageUrl);
    const preparedScene = {
      ...scene,
      narrationText: sanitizeSpokenText(scene.narrationText),
      ...(imageUrls !== undefined ? { imageUrls } : {}),
      imageUrl: legacyImageUrl,
      ...(scene.audioFile ? { audioFile: resolveProjectAsset(scene.audioFile) } : {}),
      ...(resolvedBackgroundMusicFile
        ? {
            backgroundMusicFile: resolvedBackgroundMusicFile,
            backgroundMusicVolume: backgroundMusic.volume,
            backgroundMusicStartFrom,
          }
        : {}),
    };
    backgroundMusicStartFrom += Number.isInteger(scene.durationInFrames) ? scene.durationInFrames : 0;
    return preparedScene;
  });
}

function normalizeVoiceId(voiceId) {
  return typeof voiceId === 'string' && voiceId.trim() !== '' ? voiceId.trim() : null;
}

async function attachGeneratedNarration(scenes, voiceId, configurationDirectory, narrationGenerator) {
  if (!voiceId) {
    return scenes;
  }

  const narratedScenes = [];
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const audioFile = path.join(configurationDirectory, `scene-${index + 1}.mp3`);
    const narrationText = sanitizeSpokenText(scene.narrationText);
    await narrationGenerator(narrationText, voiceId, audioFile);
    narratedScenes.push({ ...scene, narrationText, audioFile });
  }
  return narratedScenes;
}

export async function runRemotionRender({
  scenes,
  outputDirectory,
  voiceId,
  generateNarration: generateSceneNarration = generateNarration,
}) {
  const normalizedVoiceId = normalizeVoiceId(voiceId);
  if (normalizedVoiceId && !process.env.ELEVENLABS_API_KEY?.trim()) {
    throw createRemotionError(
      'REMOTION_NARRATION_UNAVAILABLE',
      'Narration is unavailable because ElevenLabs is not configured.',
    );
  }

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
      && scenesWithNarration.some((scene) => Boolean(scene.audioFile || scene.backgroundMusicFile));
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
    isNarrationAvailable = () => Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    backgroundMusicUploadDirectory = defaultBackgroundMusicUploadDirectory,
    outputBaseDirectory = defaultOutputBaseDirectory,
  } = {},
) {
  if (!db) {
    throw new Error('registerRemotionRenderRoutes requires a db dependency.');
  }
  const musicUpload = createBackgroundMusicUpload(backgroundMusicUploadDirectory);

  app.post('/api/render-remotion/background-music', async (req, res) => {
    const requestedProjectId = req.query?.projectId;
    if ((typeof requestedProjectId !== 'string' && typeof requestedProjectId !== 'number')
      || String(requestedProjectId).trim() === '') {
      return res.status(400).json({
        ok: false,
        code: 'REMOTION_PROJECT_ID_REQUIRED',
        error: 'A projectId is required to upload background music.',
      });
    }

    try {
      const project = await loadProject(db, requestedProjectId);
      if (!project) {
        return res.status(404).json({
          ok: false,
          code: 'REMOTION_PROJECT_NOT_FOUND',
          error: 'Project not found.',
        });
      }

      return musicUpload.single('backgroundMusic')(req, res, async (error) => {
        if (error) {
          return res.status(400).json({
            ok: false,
            code: 'REMOTION_BACKGROUND_MUSIC_INVALID',
            error: 'Upload an MP3, M4A, OGG, or WAV background-music file up to 25 MB.',
          });
        }
        if (!req.file) {
          return res.status(400).json({
            ok: false,
            code: 'REMOTION_BACKGROUND_MUSIC_REQUIRED',
            error: 'A background-music file is required.',
          });
        }

        try {
          const projectMusicDirectory = path.join(
            backgroundMusicUploadDirectory,
            'remotion-music',
            String(project.id),
          );
          await fs.mkdir(projectMusicDirectory, { recursive: true });
          const storedFilePath = path.join(projectMusicDirectory, req.file.filename);
          await fs.rename(req.file.path, storedFilePath);
          const volume = Number(req.body?.volume);
          const backgroundMusic = {
            file: `/uploads/remotion-music/${project.id}/${req.file.filename}`,
            volume: Number.isFinite(volume) ? Math.min(0.4, Math.max(0, volume)) : 0.12,
          };
          const metadata = parseProjectMetadata(project);
          metadata.renderState = {
            ...(metadata.renderState || {}),
            backgroundMusic,
          };
          await updateProjectMetadata(db, project.id, metadata);

          return res.status(201).json({
            ok: true,
            backgroundMusicPath: backgroundMusic.file,
          });
        } catch (uploadError) {
          console.error('Unable to persist background music', uploadError);
          return res.status(500).json({
            ok: false,
            code: 'REMOTION_BACKGROUND_MUSIC_UPLOAD_FAILED',
            error: 'Unable to save background music.',
          });
        }
      });
    } catch (error) {
      console.error('Unable to prepare background music upload', error);
      return res.status(500).json({
        ok: false,
        code: 'REMOTION_BACKGROUND_MUSIC_UPLOAD_FAILED',
        error: 'Unable to save background music.',
      });
    }
  });

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
      const normalizedVoiceId = normalizeVoiceId(voiceId);
      if (normalizedVoiceId && !isNarrationAvailable()) {
        throw createRemotionError(
          'REMOTION_NARRATION_UNAVAILABLE',
          'Narration is unavailable because ElevenLabs is not configured.',
        );
      }

      const scenes = prepareScenesForRenderer(
        parseProjectScenes(project),
        getBackgroundMusic(project),
      );
      const renderId = `remotion-${randomUUID()}`;
      const outputDirectory = path.join(outputBaseDirectory, renderId);
      const result = await executeRemotionRender({
        scenes,
        outputDirectory,
        voiceId: normalizedVoiceId,
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
        code: error.code || (error.message === 'REMOTION_SCENES_MISSING' || error.message === 'REMOTION_SCENES_INVALID'
          ? error.message
          : 'REMOTION_RENDER_FAILED'),
        error: error.publicMessage || (status === 400
          ? 'The project does not contain a valid Remotion scenes array.'
          : 'Unable to render the project with Remotion.'),
      });
    }
  });
}
