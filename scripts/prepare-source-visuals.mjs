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
import { generateFocusedPageCrops, materializeHighDetailSourcePages, sourceLocalizationPages } from '../src/services/sourcePageVisuals.js';
import { getAiConfig } from '../src/config/aiConfig.js';
import evidenceBoundCropService from '../src/services/evidenceBoundVisualCrop.cjs';
import sourceAssetResolver from '../src/services/sourceAssetResolver.cjs';
import { buildComponentDiscoveryScenes } from '../src/services/sourceVisualSelection.js';

const { appendEvidenceBoundCrops } = evidenceBoundCropService;
const { authorizedCandidatesForVisualAnalysis } = sourceAssetResolver;

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function required(name) {
  const value = arg(name);
  if (!value) throw new Error(`Missing required argument --${name}`);
  return resolve(value);
}

function args(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === `--${name}` && process.argv[index + 1]) values.push(resolve(process.argv[index + 1]));
  }
  return values;
}

export function assertRequiredVisualBudgetEnvironment(env = process.env) {
  if (String(env.MOBIUS_VISUAL_REQUIRE_BUDGET_LEDGER || '').toLowerCase() === 'true'
    && !String(env.MOBIUS_VISUAL_BUDGET_LEDGER || '').trim()) {
    throw new Error('VISUAL_BUDGET_LEDGER_REQUIRED_BEFORE_PROVIDER_CALL');
  }
}

function run(command, args, env = process.env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env, windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function sourceVisualEvidencePages(script = {}) {
  const requested = new Set();
  for (const scene of script.scenes || []) {
    if (scene.visualRequirement?.actualGameAssetRequired === false) continue;
    for (const page of scene.source_pages || []) if (Number.isInteger(Number(page)) && Number(page) > 0) requested.add(Number(page));
    for (const referent of scene.visualRequirement?.requiredObjects || []) {
      for (const evidence of script.componentTerms?.[referent]?.evidence || []) {
        if (Number.isInteger(Number(evidence?.page)) && Number(evidence.page) > 0) requested.add(Number(evidence.page));
      }
    }
  }
  return [...requested].sort((left, right) => left - right);
}

async function main() {
  assertRequiredVisualBudgetEnvironment();
  if (arg('composition-review')) {
    const input = JSON.parse(readFileSync(required('composition-review'), 'utf8'));
    const outputDir = required('output-dir');
    await mkdir(outputDir, { recursive: true });
    const script = resolve(outputDir, 'composition-script.json');
    const quality = resolve(outputDir, 'composition-input.json');
    const output = resolve(outputDir, 'composition-review.json');
    await writeFile(script, JSON.stringify({ scenes: [input.scene], componentTerms: input.componentTerms }));
    await writeFile(quality, JSON.stringify({ assets: [{ asset_id: input.scene.id, path: input.outputPath,
      asset_metadata: { visual_kind: 'instructional-composition', source_page: input.scene.source_pages?.[0], phonePath: input.phonePath,
        sequenceFrames: input.frames || [],
        materializerContract: input.materializerContract || null,
        sequenceContract: input.sequenceContract || null,
        semanticTeaching: input.semanticTeaching === true,
        instructionalDiagram: input.instructionalDiagram === true,
        sourceTeaching: input.sourceTeaching || null,
        dimensions: { width: 1920, height: 1080 } } }] }));
    const ai = getAiConfig();
    await run(arg('python') || process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
      [resolve(dirname(fileURLToPath(import.meta.url)), 'match-scene-visuals.py'), script, quality, output],
      { ...process.env, OPENAI_MODEL: ai.model || '', OPENAI_API_KEY: ai.apiKey || '', ...(ai.baseURL ? { OPENAI_BASE_URL: ai.baseURL } : {}), MOBIUS_VISUAL_MATCH_MAX_CALLS: '1' });
    return;
  }
  const scriptPath = required('script');
  const manifestPath = required('asset-manifest');
  const outputDir = resolve(required('output-dir'));
  const python = arg('python') || process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
  if (!existsSync(scriptPath)) throw new Error(`Reviewed scene script not found: ${scriptPath}`);
  if (!existsSync(manifestPath)) throw new Error(`Asset manifest not found: ${manifestPath}`);
  await mkdir(outputDir, { recursive: true });

  const inputScript = JSON.parse(readFileSync(scriptPath, 'utf8'));
  // Teaching citations establish a rule, but the component inventory can be
  // the authoritative page that names or pictures the referent.  Carry those
  // pages into bounded *candidate discovery* only.  This makes no identity,
  // crop, detail, or physical-state assertion; the object matcher remains the
  // sole pixel authority.
  const sourceEvidenceScript = {
    ...inputScript,
    sourceSearchContract: 'mobius-component-inventory-search-hypotheses-v1',
    scenes: (inputScript.scenes || []).map((scene) => {
      const pages = new Set(scene.source_pages || []);
      for (const referent of scene.visualRequirement?.requiredObjects || []) {
        const term = inputScript.componentTerms?.[referent] || {};
        for (const evidence of term.evidence || []) {
          if (Number.isInteger(Number(evidence?.page)) && Number(evidence.page) > 0) pages.add(Number(evidence.page));
        }
        if (Number.isInteger(Number(term.sourcePage)) && Number(term.sourcePage) > 0) pages.add(Number(term.sourcePage));
      }
      return { ...scene, source_pages: [...pages].sort((a, b) => a - b) };
    }),
  };
  const sourceEvidenceScriptPath = resolve(outputDir, 'source-evidence-visual-script.json');
  await writeFile(sourceEvidenceScriptPath, JSON.stringify(sourceEvidenceScript, null, 2), 'utf8');

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
    const sourcePdfPath = arg('source-pdf') || manifest.pdf_path || manifest.sourcePdfPath;
    const resolvedSourcePdfPath = sourcePdfPath && existsSync(resolve(sourcePdfPath)) ? resolve(sourcePdfPath) : null;
    // Local page rasters preserve authoritative PDF pixels at a useful search
    // resolution. They are source-localization hypotheses only; no crop,
    // component, or visual-plan acceptance is inferred from their creation.
    const highDetail = resolvedSourcePdfPath
      ? await materializeHighDetailSourcePages({
        sourcePdfPath: resolvedSourcePdfPath,
        sourceSha256,
        outputDir: resolve(pageDir, 'high-detail-pages'),
        pages: sourceVisualEvidencePages(sourceEvidenceScript),
        dpi: 300,
        python,
      })
      : null;
    const localizationPages = await sourceLocalizationPages({ pageDir: resolve(pageDir), pages: extraction.pages || [], sourceSha256, highDetailManifest: highDetail });
    if (sourcePdfPath && existsSync(resolve(sourcePdfPath))) {
      for (const candidate of localizationPages) candidate.sourcePdfPath = resolve(sourcePdfPath);
    }
    const pageContexts = new Map(localizationPages.map((p) => [p.source_page, p]));
    // The review manifest is written below production/, not beside the
    // HEPHAESTUS pixels. Rehydrate paths and source-grounded component terms
    // from canonical evidence so the QA sidecars see the same candidates as
    // the compiler.
    const evidencePath = arg('hephaestus-evidence');
    const evidence = evidencePath && existsSync(resolve(evidencePath))
      ? JSON.parse(readFileSync(resolve(evidencePath), 'utf8')) : null;
    const evidenceById = new Map((evidence?.assets || []).filter((asset) => asset?.id).map((asset) => [asset.id, asset]));
    const bindingsByAssetId = new Map();
    for (const binding of evidence?.componentBindings || []) {
      if (!binding?.assetId) continue;
      const bindings = bindingsByAssetId.get(binding.assetId) || [];
      bindings.push(binding);
      bindingsByAssetId.set(binding.assetId, bindings);
    }
    const authorized = authorizedCandidatesForVisualAnalysis(args('authorized-candidate-manifest'));
    const images = [...(manifest.images || []), ...authorized.assets].map((asset) => {
      const canonical = evidenceById.get(asset.id) || null;
      const bindings = bindingsByAssetId.get(asset.id) || [];
      const context = pageContexts.get(canonical?.pageNumber || asset.source_page);
      return {
        ...asset,
        file_path: canonical?.sourceImage || asset.file_path,
        source_page: canonical?.pageNumber || asset.source_page || null,
        // Page text is retrieval context, never a component identity/quality claim.
        layout_text: asset.layout_text || context?.layout_text || '',
        heading: asset.heading || context?.heading || '',
        retrieval_context: context ? { sourcePage: context.source_page, sourceSha256, role: 'PAGE_SEARCH_HYPOTHESIS' } : null,
        componentRefs: asset.componentRefs || [],
        semanticObjects: [...new Set([
          ...(asset.semanticObjects || []), asset.label, asset.category, canonical?.componentName, canonical?.category,
        ].filter(Boolean))],
        component_bindings: [...bindings.map((binding) => ({
          componentId: binding.componentId,
          componentName: binding.componentName,
          category: binding.category,
          confidence: binding.confidence,
          reviewState: binding.reviewState,
        })), ...(asset.component_bindings || [])],
      };
    });
    visualManifestPath = resolve(outputDir, 'source-visual-manifest.json');
    await writeFile(visualManifestPath, `${JSON.stringify({
      ...manifest,
      images: [...images, ...(cropManifest.assets || []), ...localizationPages],
      focusedCropManifest: cropManifestPath,
      highDetailSourcePages: highDetail ? { contract: highDetail.contract, sourceSha256: highDetail.sourceSha256, dpi: highDetail.dpi,
        pages: highDetail.pages.map((row) => ({ page: row.page, sha256: row.sha256, width: row.width, height: row.height })) } : null,
    }, null, 2)}\n`, 'utf8');
  }

  console.log('[prepare-source-visuals] Qualifying source components…');
  await run(python, [qualityScript, sourceEvidenceScriptPath, visualManifestPath, qualityPath]);
  const evidenceFile = arg('hephaestus-evidence');
  const terms = evidenceFile && existsSync(resolve(evidenceFile))
    ? JSON.parse(readFileSync(resolve(evidenceFile), 'utf8')).componentBindings || [] : [];
  const scopedScript = resolve(outputDir, 'object-evidence-script.json');
  const sceneObjects = new Set((inputScript.scenes || []).flatMap((scene) => scene.visualRequirement?.requiredObjects || []));
  const componentDiscoveryScenes = buildComponentDiscoveryScenes({ scenes: sourceEvidenceScript.scenes || [], componentTerms: inputScript.componentTerms || {} });
  await writeFile(scopedScript, JSON.stringify({
    ...sourceEvidenceScript,
    scenes: [...componentDiscoveryScenes, ...(sourceEvidenceScript.scenes || []), ...terms.filter((row) => !sceneObjects.has(row.componentId)).map((row) => ({
      id: `knowledge-component-${row.componentId}`, source_pages: row.sourcePage ? [row.sourcePage] : [],
      sourceRefs: row.sourcePage ? [{ page: row.sourcePage }] : [],
      visualRequirement: { requiredObjects: [row.componentId], purpose: 'component-identity-binding' },
    }))],
    componentTerms: { ...Object.fromEntries(terms.map((row) => [row.componentId, { name: row.componentName, category: row.category, sourcePage: row.sourcePage, status: 'TERM_HYPOTHESIS' }])),
      ...(inputScript.componentTerms || {}) },
  }), 'utf8');
  console.log('[prepare-source-visuals] Matching approved components to tutorial scenes…');
  const ai = getAiConfig();
  const previousSemanticReport = arg('previous-semantic-report') || semanticPath;
  await run(python, [semanticScript, scopedScript, qualityPath, semanticPath], {
    ...process.env,
    OPENAI_MODEL: ai.model || '',
    OPENAI_API_KEY: ai.apiKey || '',
    ...(ai.baseURL ? { OPENAI_BASE_URL: ai.baseURL } : {}),
    // Keep an immutable previous report available only to migrate exact
    // page-localization measurements when their identity context evolves.
    MOBIUS_VISUAL_PREVIOUS_REPORT: previousSemanticReport,
  });
  const semantic = JSON.parse(readFileSync(semanticPath, 'utf8'));
  if (semantic.generatedAssets?.length) {
    const manifest = JSON.parse(readFileSync(visualManifestPath, 'utf8'));
    const byId = new Map((manifest.images || []).map((a) => [a.id, a]));
    for (const asset of semantic.generatedAssets) byId.set(asset.id, asset);
    // Never rewrite the original HEPHAESTUS manifest.
    visualManifestPath = resolve(outputDir, 'source-visual-manifest.json');
    await writeFile(visualManifestPath, JSON.stringify({ ...manifest, images: [...byId.values()] }, null, 2), 'utf8');
  }
  visualManifestPath = await appendEvidenceBoundCrops({ semantic, visualManifestPath, outputDir });
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
