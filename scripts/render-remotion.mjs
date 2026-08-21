#!/usr/bin/env node

/**
 * Render a MOBIUS tutorial with Remotion.
 *
 * Usage:
 *   node scripts/render-remotion.mjs <scenes.json> [--out-dir <directory>] [--concat]
 *   node scripts/render-remotion.mjs --input <scenes.json> --output <file.mp4> [--concat]
 *
 * The JSON document must be a non-empty array of scenes:
 * [{ id, narrationText, imageUrls?, imageUrl?, sectionTitle, themeBorderColor, audioFile?, durationInFrames }]
 *
 * `imageUrls` is the preferred gallery input. `imageUrl` remains supported for
 * existing callers and is normalized to a one-item imageUrls array. Multi-scene
 * renders without audio use the transition-enabled timeline. Multi-scene renders
 * with narration must use `--concat`, which renders one isolated MP4 per scene
 * before FFmpeg joins the compatible H.264/AAC segments.
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const SCENE_COMPOSITION_ID = 'MobiusTutorialScene';
const TIMELINE_COMPOSITION_ID = 'MobiusTutorialTimeline';
const TIMELINE_OUTPUT_NAME = 'mobius-tutorial.mp4';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const entryPoint = resolve(projectDirectory, 'src', 'remotion', 'index.jsx');
const moduleRequire = createRequire(import.meta.url);
const legacyFfmpegExecutable = resolve(
  projectDirectory,
  'ffmpeg-bin',
  'ffmpeg-master-latest-win64-gpl',
  'bin',
  'ffmpeg.exe',
);
const legacyFfprobeExecutable = resolve(
  projectDirectory,
  'ffmpeg-bin',
  'ffmpeg-master-latest-win64-gpl',
  'bin',
  'ffprobe.exe',
);

function portableBinary(packageName, property = null) {
  try {
    const dependency = moduleRequire(packageName);
    const candidate = property ? dependency?.[property] : dependency;
    return typeof candidate === 'string' && existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

// npm packages select the appropriate executable for the operating system during
// installation. The legacy directory remains a compatible fallback for existing
// developer workstations that already contain it.
const ffmpegExecutable = process.env.MOBIUS_FFMPEG_PATH
  || portableBinary('ffmpeg-static')
  || legacyFfmpegExecutable;
const ffprobeExecutable = process.env.MOBIUS_FFPROBE_PATH
  || portableBinary('ffprobe-static', 'path')
  || legacyFfprobeExecutable;

const args = process.argv.slice(2);
const usage = 'Usage: node scripts/render-remotion.mjs <scenes.json> [--out-dir <directory>] [--concat] | --input <scenes.json> --output <file.mp4> [--concat]';

function fail(message) {
  console.error(`[render-remotion] ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    fail(`${usage}\nMissing value for ${option}.`);
  }
  return value;
}

function parseArguments(argv) {
  const positional = [];
  let configPath = null;
  let outputDirectory = null;
  let outputPath = null;
  let concat = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--input') {
      if (configPath) {
        fail(`${usage}\nProvide the input config only once.`);
      }
      configPath = optionValue(argv, index, '--input');
      index += 1;
    } else if (argument === '--output') {
      if (outputPath) {
        fail(`${usage}\nProvide the output file only once.`);
      }
      outputPath = optionValue(argv, index, '--output');
      index += 1;
    } else if (argument === '--out-dir') {
      if (outputDirectory) {
        fail(`${usage}\nProvide the output directory only once.`);
      }
      outputDirectory = optionValue(argv, index, '--out-dir');
      index += 1;
    } else if (argument === '--concat') {
      if (concat) {
        fail(`${usage}\nProvide --concat only once.`);
      }
      concat = true;
    } else if (argument.startsWith('--')) {
      fail(`${usage}\nUnknown option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }

  if (positional.length > 1 || (configPath && positional.length === 1) || (!configPath && positional.length !== 1)) {
    fail(`${usage}\nProvide exactly one JSON config path.`);
  }
  if (outputPath && outputDirectory) {
    fail(`${usage}\nUse either --output or --out-dir, not both.`);
  }

  return {
    configPath: configPath || positional[0],
    outputDirectory,
    outputPath,
    concat,
  };
}

function assertNonEmptyString(value, fieldName, sceneIndex) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`Scene ${sceneIndex + 1}: ${fieldName} must be a non-empty string.`);
  }
}

function isDocumentedBrandOutro(scene) {
  const plan = scene?.visualPlan;
  return plan?.primaryIntent === 'brand_outro'
    && plan?.coverageStatus === 'operator_override'
    && typeof plan?.operatorOverride?.reason === 'string'
    && plan.operatorOverride.reason.trim().length >= 3;
}

function normalizeImageUrls(scene, sceneIndex) {
  const allowGeneratedBrandOutro = isDocumentedBrandOutro(scene);
  if (scene.imageUrls !== undefined) {
    if (!Array.isArray(scene.imageUrls) || (scene.imageUrls.length === 0 && !allowGeneratedBrandOutro)) {
      fail(`Scene ${sceneIndex + 1}: imageUrls must be a non-empty array of image paths or URLs.`);
    }

    scene.imageUrls.forEach((imageUrl, imageIndex) => {
      assertNonEmptyString(imageUrl, `imageUrls[${imageIndex}]`, sceneIndex);
    });
    return scene.imageUrls;
  }

  if (allowGeneratedBrandOutro) return [];
  assertNonEmptyString(scene.imageUrl, 'imageUrl', sceneIndex);
  return [scene.imageUrl];
}

function validateScenes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('Render config must be a non-empty array of scenes.');
  }

  const ids = new Set();
  return value.map((scene, sceneIndex) => {
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) {
      fail(`Scene ${sceneIndex + 1}: scene must be an object.`);
    }

    const imageUrls = normalizeImageUrls(scene, sceneIndex);
    assertNonEmptyString(scene.id, 'id', sceneIndex);
    assertNonEmptyString(scene.narrationText, 'narrationText', sceneIndex);
    assertNonEmptyString(scene.sectionTitle, 'sectionTitle', sceneIndex);
    assertNonEmptyString(scene.themeBorderColor, 'themeBorderColor', sceneIndex);

    if (ids.has(scene.id)) {
      fail(`Scene ${sceneIndex + 1}: duplicate id "${scene.id}".`);
    }
    ids.add(scene.id);

    if (!Number.isInteger(scene.durationInFrames) || scene.durationInFrames <= 0) {
      fail(`Scene ${sceneIndex + 1}: durationInFrames must be a positive integer.`);
    }

    if (scene.audioFile !== undefined && (typeof scene.audioFile !== 'string' || scene.audioFile.trim() === '')) {
      fail(`Scene ${sceneIndex + 1}: audioFile must be an omitted or non-empty string.`);
    }
    if (scene.backgroundMusicFile !== undefined
      && (typeof scene.backgroundMusicFile !== 'string' || scene.backgroundMusicFile.trim() === '')) {
      fail(`Scene ${sceneIndex + 1}: backgroundMusicFile must be an omitted or non-empty string.`);
    }
    if (scene.backgroundMusicStartFrom !== undefined
      && (!Number.isInteger(scene.backgroundMusicStartFrom) || scene.backgroundMusicStartFrom < 0)) {
      fail(`Scene ${sceneIndex + 1}: backgroundMusicStartFrom must be an omitted or non-negative integer.`);
    }
    if (scene.backgroundMusicVolume !== undefined
      && (typeof scene.backgroundMusicVolume !== 'number'
        || scene.backgroundMusicVolume < 0
        || scene.backgroundMusicVolume > 1)) {
      fail(`Scene ${sceneIndex + 1}: backgroundMusicVolume must be a number between 0 and 1 when provided.`);
    }

    return { ...scene, imageUrl: imageUrls[0], imageUrls };
  });
}

function mimeTypeFor(filePath, assetType) {
  const extension = extname(filePath).toLowerCase();
  const types = {
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
  };
  const mimeType = types[extension];
  if (!mimeType || !mimeType.startsWith(`${assetType}/`)) {
    fail(`Unsupported ${assetType} asset extension "${extension || '(none)'}" for ${filePath}.`);
  }
  return mimeType;
}

function isPreservedUrl(value) {
  return /^(?:https?:|data:)/i.test(value);
}

function resolveAssetSource(value, configDirectory, assetType, sceneId) {
  if (isPreservedUrl(value)) {
    return value;
  }

  const configuredAssetPath = resolve(configDirectory, value);
  const projectRelativeAssetPath = resolve(projectDirectory, value);
  const assetPath = existsSync(configuredAssetPath) ? configuredAssetPath : projectRelativeAssetPath;
  if (!existsSync(assetPath) || !statSync(assetPath).isFile()) {
    fail(`Scene "${sceneId}": ${assetType} asset not found: ${value}`);
  }

  const mimeType = mimeTypeFor(assetPath, assetType);
  const contents = readFileSync(assetPath).toString('base64');
  return `data:${mimeType};base64,${contents}`;
}

function safeOutputName(sceneId) {
  const safeId = sceneId
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!safeId) {
    fail(`Scene id "${sceneId}" cannot be converted to a safe output filename.`);
  }

  return `${safeId}.mp4`;
}

function assertFfmpegBinaries() {
  if (!existsSync(ffmpegExecutable) || !existsSync(ffprobeExecutable)) {
    fail('FFmpeg and FFprobe are required for --concat rendering. Install the portable project dependencies or configure MOBIUS_FFMPEG_PATH and MOBIUS_FFPROBE_PATH.');
  }
}

async function runExecutable(executable, executableArgs, description) {
  try {
    return await execFileAsync(executable, executableArgs, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    fail(`${description} failed${stderr ? `: ${stderr}` : '.'}`);
  }
}

async function segmentHasAudio(segmentPath) {
  const { stdout } = await runExecutable(
    ffprobeExecutable,
    [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_type',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      segmentPath,
    ],
    `Inspecting ${basename(segmentPath)}`,
  );
  return stdout.trim() === 'audio';
}

async function normalizeSegmentAudio(rawSegmentPath, normalizedSegmentPath) {
  const hasAudio = await segmentHasAudio(rawSegmentPath);
  const ffmpegArgs = [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', rawSegmentPath,
  ];

  if (!hasAudio) {
    ffmpegArgs.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  }

  ffmpegArgs.push(
    '-map', '0:v:0',
    '-map', hasAudio ? '0:a:0' : '1:a:0',
    '-c:v', 'copy',
    ...(hasAudio ? ['-filter:a', 'apad'] : []),
    '-c:a', 'aac',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    normalizedSegmentPath,
  );

  await runExecutable(ffmpegExecutable, ffmpegArgs, `Normalizing ${basename(rawSegmentPath)}`);
}

function concatManifestLine(segmentPath) {
  return `file '${segmentPath.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`;
}

async function concatenateSegments(segmentPaths, outputLocation, segmentDirectory) {
  const manifestPath = join(segmentDirectory, 'concat.txt');
  writeFileSync(manifestPath, `${segmentPaths.map(concatManifestLine).join('\n')}\n`, 'utf8');
  await runExecutable(
    ffmpegExecutable,
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', manifestPath,
      '-c', 'copy',
      outputLocation,
    ],
    'Concatenating rendered scenes',
  );
}

async function renderConcatenatedScenes(serveUrl, scenes, segmentDirectory, outputLocation) {
  const segmentPaths = [];

  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const prefix = String(index + 1).padStart(2, '0');
    const rawSegmentPath = join(segmentDirectory, `${prefix}-${safeOutputName(scene.id).replace(/\.mp4$/, '')}-raw.mp4`);
    const normalizedSegmentPath = join(segmentDirectory, `${prefix}-${safeOutputName(scene.id)}`);
    console.log(`[render-remotion] Rendering isolated scene ${index + 1}/${scenes.length}: ${scene.id}`);

    const composition = await selectComposition({
      serveUrl,
      id: SCENE_COMPOSITION_ID,
      inputProps: scene,
      logLevel: 'warn',
    });
    await renderMedia({
      serveUrl,
      composition,
      inputProps: scene,
      codec: 'h264',
      audioCodec: 'aac',
      pixelFormat: 'yuv420p',
      outputLocation: rawSegmentPath,
      overwrite: true,
      concurrency: 1,
      logLevel: 'warn',
    });

    await normalizeSegmentAudio(rawSegmentPath, normalizedSegmentPath);
    segmentPaths.push(normalizedSegmentPath);
  }

  console.log(`[render-remotion] Concatenating ${segmentPaths.length} isolated scene MP4s…`);
  await concatenateSegments(segmentPaths, outputLocation, segmentDirectory);
}

async function main() {
  const { configPath, outputDirectory, outputPath, concat } = parseArguments(args);
  const resolvedConfigPath = resolve(process.cwd(), configPath);
  if (!existsSync(resolvedConfigPath)) {
    fail(`Config file not found: ${configPath}`);
  }

  let parsedConfig;
  try {
    parsedConfig = JSON.parse(readFileSync(resolvedConfigPath, 'utf8'));
  } catch (error) {
    fail(`Could not parse JSON config: ${error.message}`);
  }

  const configDirectory = dirname(resolvedConfigPath);
  const scenes = validateScenes(parsedConfig).map((scene) => {
    const imageUrls = scene.imageUrls.map((imageUrl) => (
      resolveAssetSource(imageUrl, configDirectory, 'image', scene.id)
    ));

    return {
      ...scene,
      imageUrl: imageUrls[0],
      imageUrls,
      ...(scene.audioFile
        ? { audioFile: resolveAssetSource(scene.audioFile, configDirectory, 'audio', scene.id) }
        : {}),
      ...(scene.backgroundMusicFile
        ? { backgroundMusicFile: resolveAssetSource(scene.backgroundMusicFile, configDirectory, 'audio', scene.id) }
        : {}),
    };
  });
  const containsMultipleSceneAudio = scenes.length > 1
    && scenes.some((scene) => Boolean(scene.audioFile || scene.backgroundMusicFile));
  if (containsMultipleSceneAudio && !concat) {
    fail('Multi-scene configs with narration or background music require --concat so audio is rendered sequentially without transition overlap.');
  }

  const isTimeline = scenes.length > 1 && !concat;
  const inputProps = isTimeline ? { scenes } : scenes[0];
  const compositionId = isTimeline ? TIMELINE_COMPOSITION_ID : SCENE_COMPOSITION_ID;
  const defaultOutputDirectory = resolve(projectDirectory, outputDirectory || 'out/remotion');
  const outputLocation = outputPath
    ? resolve(projectDirectory, outputPath)
    : join(
      defaultOutputDirectory,
      (isTimeline || concat) ? TIMELINE_OUTPUT_NAME : safeOutputName(scenes[0].id),
    );
  mkdirSync(dirname(outputLocation), { recursive: true });
  const bundleDirectory = join(tmpdir(), `mobius-remotion-bundle-${process.pid}-${Date.now()}`);
  mkdirSync(bundleDirectory, { recursive: true });

  try {
    console.log(`[render-remotion] Bundling ${basename(entryPoint)}…`);
    const serveUrl = await bundle({ entryPoint, outDir: bundleDirectory });

    if (concat) {
      assertFfmpegBinaries();
      const segmentDirectory = join(bundleDirectory, 'segments');
      mkdirSync(segmentDirectory, { recursive: true });
      await renderConcatenatedScenes(serveUrl, scenes, segmentDirectory, outputLocation);
    } else {
      console.log(`[render-remotion] Rendering ${isTimeline ? 'transition-enabled timeline' : scenes[0].id}`);
      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
        logLevel: 'warn',
      });

      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        codec: 'h264',
        audioCodec: 'aac',
        pixelFormat: 'yuv420p',
        outputLocation,
        overwrite: true,
        concurrency: 1,
        logLevel: 'warn',
      });
    }

    console.log(`[render-remotion] Complete: ${outputLocation}`);
  } finally {
    rmSync(bundleDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[render-remotion] ${error.message}`);
  process.exitCode = 1;
});
