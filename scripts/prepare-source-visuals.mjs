#!/usr/bin/env node
/**
 * Build reviewable visual-selection sidecars for a source-grounded tutorial.
 *
 * This is intentionally terminal-first: it produces a quality report and a
 * scene-to-asset semantic report, both of which can be inspected or edited by
 * an operator before being supplied to build-source-grounded-preview.mjs.
 */
import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { generateFocusedPageCrops } from '../src/services/sourcePageVisuals.js';

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function required(name) {
  const value = arg(name);
  if (!value) throw new Error(`Missing required argument --${name}`);
  return resolve(value);
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  const scriptPath = required('script');
  const manifestPath = required('asset-manifest');
  const outputDir = resolve(required('output-dir'));
  const python = arg('python') || process.env.PYTHON || 'python3';
  if (!existsSync(scriptPath)) throw new Error(`Reviewed scene script not found: ${scriptPath}`);
  if (!existsSync(manifestPath)) throw new Error(`Asset manifest not found: ${manifestPath}`);

  await mkdir(outputDir, { recursive: true });
  const qualityPath = resolve(outputDir, 'source-visual-quality.json');
  const semanticPath = resolve(outputDir, 'source-visual-semantic-matches.json');
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const qualityScript = resolve(scriptDir, 'qualify-source-visuals.py');
  const semanticScript = resolve(scriptDir, 'match-scene-visuals.py');

  // A vision model can identify tighter regions, but a two-column spread has
  // enough authoritative layout evidence to produce useful, repeatable crops
  // locally. These candidates remain subject to the same quality and semantic
  // gates as extracted components.
  let visualManifestPath = manifestPath;
  const pageDir = arg('page-dir');
  const extractionPath = arg('extraction');
  if (pageDir && extractionPath && existsSync(resolve(extractionPath))) {
    const extraction = JSON.parse(readFileSync(resolve(extractionPath), 'utf8'));
    const cropManifestPath = resolve(outputDir, 'focused-page-crops.json');
    const cropDir = resolve(outputDir, 'focused-crops');
    const sourceSha256 = arg('source-sha256') || extraction.source?.sha256 || null;
    const cropManifest = await generateFocusedPageCrops({
      pageDir: resolve(pageDir),
      pages: extraction.pages || [],
      outputDir: cropDir,
      sourceSha256,
    });
    await writeFile(cropManifestPath, `${JSON.stringify(cropManifest, null, 2)}\n`, 'utf8');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    visualManifestPath = resolve(outputDir, 'source-visual-manifest.json');
    await writeFile(visualManifestPath, `${JSON.stringify({
      ...manifest,
      images: [...(manifest.images || []), ...(cropManifest.assets || [])],
      focusedCropManifest: cropManifestPath,
    }, null, 2)}\n`, 'utf8');
  }

  console.log('[prepare-source-visuals] Qualifying source components…');
  await run(python, [qualityScript, scriptPath, visualManifestPath, qualityPath]);
  console.log('[prepare-source-visuals] Matching approved components to tutorial scenes…');
  await run(python, [semanticScript, scriptPath, qualityPath, semanticPath]);
  console.log(JSON.stringify({
    script: scriptPath,
    assetManifest: visualManifestPath,
    focusedCropManifest: pageDir && extractionPath ? resolve(outputDir, 'focused-page-crops.json') : null,
    visualQualityReport: qualityPath,
    semanticVisualReport: semanticPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(`[prepare-source-visuals] ${error.message}`);
  process.exitCode = 1;
});
