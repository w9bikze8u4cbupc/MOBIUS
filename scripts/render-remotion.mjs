#!/usr/bin/env node

/**
 * Render a MOBIUS tutorial timeline with Remotion.
 *
 * Usage:
 *   node scripts/render-remotion.mjs <scenes.json> [--out-dir <directory>]
 *   node scripts/render-remotion.mjs --input <scenes.json> --output <file.mp4>
 *
 * The JSON document must be a non-empty array of scenes:
 * [{ id, narrationText, imageUrls?, imageUrl?, sectionTitle, themeBorderColor, audioFile?, durationInFrames }]
 *
 * `imageUrls` is the preferred gallery input. `imageUrl` remains supported for
 * existing callers and is normalized to a one-item imageUrls array. Multi-scene
 * renders use the transition-enabled timeline composition.
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCENE_COMPOSITION_ID = 'MobiusTutorialScene';
const TIMELINE_COMPOSITION_ID = 'MobiusTutorialTimeline';
const TIMELINE_OUTPUT_NAME = 'mobius-tutorial.mp4';
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, '..');
const entryPoint = resolve(projectDirectory, 'src', 'remotion', 'index.jsx');

const args = process.argv.slice(2);
const usage = 'Usage: node scripts/render-remotion.mjs <scenes.json> [--out-dir <directory>] | --input <scenes.json> --output <file.mp4>';

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
  };
}

function assertNonEmptyString(value, fieldName, sceneIndex) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`Scene ${sceneIndex + 1}: ${fieldName} must be a non-empty string.`);
  }
}

function normalizeImageUrls(scene, sceneIndex) {
  if (scene.imageUrls !== undefined) {
    if (!Array.isArray(scene.imageUrls) || scene.imageUrls.length === 0) {
      fail(`Scene ${sceneIndex + 1}: imageUrls must be a non-empty array of image paths or URLs.`);
    }

    scene.imageUrls.forEach((imageUrl, imageIndex) => {
      assertNonEmptyString(imageUrl, `imageUrls[${imageIndex}]`, sceneIndex);
    });
    return scene.imageUrls;
  }

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

async function main() {
  const { configPath, outputDirectory, outputPath } = parseArguments(args);
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
    };
  });
  const isTimeline = scenes.length > 1;
  const inputProps = isTimeline ? { scenes } : scenes[0];
  const compositionId = isTimeline ? TIMELINE_COMPOSITION_ID : SCENE_COMPOSITION_ID;
  const defaultOutputDirectory = resolve(projectDirectory, outputDirectory || 'out/remotion');
  const outputLocation = outputPath
    ? resolve(projectDirectory, outputPath)
    : join(
      defaultOutputDirectory,
      isTimeline ? TIMELINE_OUTPUT_NAME : safeOutputName(scenes[0].id),
    );
  mkdirSync(dirname(outputLocation), { recursive: true });
  const bundleDirectory = join(tmpdir(), `mobius-remotion-bundle-${process.pid}-${Date.now()}`);
  mkdirSync(bundleDirectory, { recursive: true });

  try {
    console.log(`[render-remotion] Bundling ${basename(entryPoint)}…`);
    const serveUrl = await bundle({ entryPoint, outDir: bundleDirectory });
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

    console.log(`[render-remotion] Complete: ${outputLocation}`);
  } finally {
    rmSync(bundleDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[render-remotion] ${error.message}`);
  process.exitCode = 1;
});
