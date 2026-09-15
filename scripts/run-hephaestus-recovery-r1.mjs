#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { extractWithHephaestus } from '../src/services/hephaestusService.js';
import { buildHephaestusEvidence, writeHephaestusEvidence } from '../src/services/hephaestusEvidence.js';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'hephaestus-recovery-r1');
const tmDir = path.join(outRoot, 'terraforming-mars');
const wdDir = path.join(outRoot, '7-wonders-duel');
const tmPdf = path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'source', 'rulebook.pdf');
const tmSource = path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'source', 'source.json');
const tmExistingExtraction = path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'production', 'zero-state-extraction.json');
const tmFocused = path.join(root, 'data', 'tm-eng-bgg-fa0678822223', 'production', 'source-visual-review', 'focused-page-crops.json');

function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function readJson(filePath, fallback = null) { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return fallback; } }
function mkdir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function writeJson(filePath, value) { mkdir(path.dirname(filePath)); fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function localPath(value) {
  if (!value) return null;
  const direct = path.resolve(value);
  if (fs.existsSync(direct)) return direct;
  const runtimePrefix = 'C:\\mobius-games-tutorial-runtime';
  const normalized = String(value).replace(/^C:\\mobius-games-tutorial-runtime/i, root);
  return fs.existsSync(normalized) ? path.resolve(normalized) : direct;
}
function copyAssetPaths(manifest) {
  return { ...manifest, images: (manifest.images || []).map((asset) => ({ ...asset, file_path: localPath(asset.file_path), thumbnail_path: localPath(asset.thumbnail_path) })) };
}

async function contactSheet(assets, outputPath, title) {
  const selected = assets.filter((asset) => asset.renderPath && fs.existsSync(asset.renderPath)).slice(0, 12);
  const cellW = 300; const cellH = 240; const cols = 4; const rows = Math.max(1, Math.ceil(selected.length / cols));
  const canvas = sharp({ create: { width: cellW * cols, height: cellH * rows + 52, channels: 4, background: '#f2ead8' } });
  const composites = [];
  for (let i = 0; i < selected.length; i += 1) {
    const input = await sharp(selected[i].renderPath, { limitInputPixels: false }).resize({ width: 270, height: 180, fit: 'inside', background: '#ffffff' }).png().toBuffer();
    composites.push({ input, left: (i % cols) * cellW + 15, top: Math.floor(i / cols) * cellH + 42 });
  }
  await canvas.composite(composites).png().toFile(outputPath);
  const metadata = await sharp(outputPath).metadata();
  if (!metadata.width || !metadata.height || !fs.statSync(outputPath).size) throw new Error(`Invalid contact sheet: ${outputPath}`);
  return { path: outputPath, width: metadata.width, height: metadata.height, count: selected.length, title };
}

function setupStepsFromComponents(components) {
  return components.slice(0, 5).map((component, index) => ({
    id: `setup-component-${index + 1}`,
    text: `Préparer ${component.name}${component.quantity ? ` (${component.quantity})` : ''}.`,
    componentRefs: [component.id],
  }));
}

async function runTm() {
  mkdir(tmDir);
  const source = readJson(tmSource, {});
  const extraction = readJson(tmExistingExtraction, {});
  const existingManifestPath = path.join(tmDir, 'hephaestus', 'manifest.json');
  const result = await extractWithHephaestus(tmPdf, path.dirname(existingManifestPath), { minWidth: 16, minHeight: 16 });
  const focused = readJson(tmFocused, { assets: [] });
  const combined = copyAssetPaths({ ...result, images: [...(result.images || []), ...(focused.assets || [])] });
  const combinedPath = path.join(tmDir, 'recovered-manifest.json');
  writeJson(combinedPath, combined);
  const components = extraction.components?.components || extraction.components || [];
  const evidence = buildHephaestusEvidence({
    manifestPath: combinedPath,
    projectId: 'tm-eng-bgg-fa0678822223',
    sourcePdfSha256: source.sha256,
    gameIdentity: { displayName: 'Terraforming Mars', sourceTitle: 'Terraforming Mars', locale: 'fr-CA' },
    components,
    setupSteps: setupStepsFromComponents(components),
  });
  writeJson(path.join(tmDir, 'baseline-current.json'), {
    path: 'current-simplified-ingestion', projectId: 'tm-eng-bgg-fa0678822223', sourcePdfSha256: source.sha256,
    componentCount: components.length, focusedVisualCount: 0, setupBindingCount: 0,
    limitations: ['text component sections only', 'no canonical accepted component visual binding', 'no focused crop provenance in component state'],
  });
  writeJson(path.join(tmDir, 'recovered.json'), evidence);
  writeJson(path.join(tmDir, 'setup-evidence.json'), { contract: evidence.contract, sourcePdfSha256: source.sha256, bindings: evidence.setupBindings, reviewQueueCount: evidence.reviewQueue.length });
  writeJson(path.join(tmDir, 'provenance.json'), { projectId: 'tm-eng-bgg-fa0678822223', sourcePdfSha256: source.sha256, sourcePdf: tmPdf, sourcePdfExists: fs.existsSync(tmPdf), sourcePdfBytes: fs.statSync(tmPdf).size, sourceJson: tmSource, sourceJsonSha256: sha256File(tmSource), extractionManifest: combinedPath, extractionManifestSha256: sha256File(combinedPath), extractionMethod: 'HEPHAESTUS native PyMuPDF plus existing layout-derived focused crop assets' });
  const currentAssets = [{ renderPath: path.join(root, 'data', 'rulebook-images', 'tm-eng-bgg-fa0678822223', 'page-1.png') }];
  writeJson(path.join(tmDir, 'comparison.json'), { baseline: { componentCount: components.length, acceptedVisuals: 0, setupBindings: 0 }, recovered: { componentCount: components.length, acceptedVisuals: evidence.acceptedVisuals.length, focusedVisuals: evidence.acceptedVisuals.filter((x) => x.extractionMethod.includes('focused')).length, setupBindings: evidence.setupBindings.length }, improvement: { focusedVisualsAdded: evidence.acceptedVisuals.filter((x) => x.extractionMethod.includes('focused')).length, provenanceAdded: true, reviewStateAdded: true, deduplication: evidence.curationStats.duplicateCount } });
  await contactSheet(currentAssets, path.join(tmDir, 'contact-sheet-current.png'), 'Current');
  await contactSheet(evidence.acceptedVisuals, path.join(tmDir, 'contact-sheet-recovered.png'), 'Recovered');
  return { dir: tmDir, evidence };
}

async function runSecondGame() {
  mkdir(wdDir);
  const cropDir = path.join(root, 'data', 'component-crops', '7-wonders-duel');
  const files = fs.readdirSync(cropDir).filter((file) => file.toLowerCase().endsWith('.png'));
  const seen = new Set(); const images = [];
  for (const file of files) {
    const filePath = path.join(cropDir, file); const hash = sha256File(filePath);
    if (seen.has(hash)) continue;
    seen.add(hash);
    const page = Number(file.match(/^page(\d+)/i)?.[1] || 0) || null;
    const label = file.replace(/-\d+\.png$/i, '').replace(/^page\d+-/i, '').replace(/_/g, ' ');
    const dimensions = await sharp(filePath).metadata();
    images.push({ id: `legacy-crop-${images.length + 1}`, file_name: file, file_path: filePath, source_page: page, type: label.toLowerCase().includes('coin') ? 'currency' : label.toLowerCase().includes('card') ? 'card' : 'board', classification: 'legacy-project-focused-crop', visual_kind: 'focused-page-crop', is_component: true, confidence: 0.78, label, dimensions: { width: Number(dimensions.width || 0), height: Number(dimensions.height || 0) }, sourcePdfSha256: null, provenance: { extraction: 'existing-project-component-crop', sourcePage: page, sourceUrl: null } });
    if (images.length >= 18) break;
  }
  const manifestPath = path.join(wdDir, 'recovered-manifest.json');
  writeJson(manifestPath, { success: true, projectId: '7-wonders-duel', source_pdf: null, images, stats: { total_items: images.length, sourceMode: 'existing-project-crops' } });
  const components = [
    { id: '7wd-component-cards', name: 'Age I Cards', category: 'card', quantity: null, sourcePage: 2, sourceQuote: 'Existing project crop filename evidence', confidence: 0.78, reviewRequired: true },
    { id: '7wd-component-coins', name: 'Coins', category: 'currency', quantity: null, sourcePage: 6, sourceQuote: 'Existing project crop filename evidence', confidence: 0.78, reviewRequired: true },
  ];
  const evidence = buildHephaestusEvidence({ manifestPath, projectId: '7-wonders-duel', sourcePdfSha256: null, gameIdentity: { displayName: '7 Wonders Duel', sourceTitle: '7 Wonders Duel', locale: 'fr-CA' }, components, setupSteps: setupStepsFromComponents(components) });
  writeJson(path.join(wdDir, 'baseline-current.json'), { path: 'existing rulebook-page/component-crop path', projectId: '7-wonders-duel', focusedVisualCount: 0, componentCount: components.length, note: 'No PDF is present in the current worktree; existing project crops are used without new acquisition.' });
  writeJson(path.join(wdDir, 'recovered.json'), evidence);
  writeJson(path.join(wdDir, 'setup-evidence.json'), { contract: evidence.contract, bindings: evidence.setupBindings, sourceMode: 'existing-project-crops', lowConfidenceRequiresCockpitReview: true });
  writeJson(path.join(wdDir, 'provenance.json'), { projectId: '7-wonders-duel', sourcePdfSha256: null, sourcePdf: null, sourceMaterial: [path.join(root, 'data', 'rulebook-images', '7-wonders-duel'), cropDir], extractionMethod: 'same canonical evidence adapter over existing project focused-crop artifacts', note: 'A current 7 Wonders Duel PDF was not found; no claim of fresh PDF extraction is made.' });
  writeJson(path.join(wdDir, 'comparison.json'), { baseline: { focusedVisuals: 0, setupBindings: 0 }, recovered: { focusedVisuals: evidence.acceptedVisuals.length, setupBindings: evidence.setupBindings.length }, improvement: { focusedVisualsAdded: evidence.acceptedVisuals.length, canonicalEvidenceContract: true, reviewGate: true } });
  await contactSheet([], path.join(wdDir, 'contact-sheet-current.png'), 'Current');
  await contactSheet(evidence.acceptedVisuals, path.join(wdDir, 'contact-sheet-recovered.png'), 'Recovered');
  return { dir: wdDir, evidence };
}

const tm = await runTm();
const second = await runSecondGame();
writeJson(path.join(outRoot, 'recovery-summary.json'), {
  contract: 'hephaestus-recovery-r1',
  audit: path.join(outRoot, 'recovery-audit.json'),
  benchmark: { terraformMars: { projectId: 'tm-eng-bgg-fa0678822223', acceptedVisuals: tm.evidence.acceptedVisuals.length, setupBindings: tm.evidence.setupBindings.length, deterministicValidation: tm.evidence.validation }, secondGame: { projectId: '7-wonders-duel', acceptedVisuals: second.evidence.acceptedVisuals.length, setupBindings: second.evidence.setupBindings.length, sourceMode: 'existing-project-crops' } },
  generatorNativeIntegration: { normalWorkflowStage: 'run-rulebook-production:hephaestus -> source-visual-review -> loadSourceVisualCatalog -> boundScenes', evidenceAdapter: 'src/services/hephaestusEvidence.js' },
});
console.log(JSON.stringify({ tm: tm.evidence.validation, tmAccepted: tm.evidence.acceptedVisuals.length, secondAccepted: second.evidence.acceptedVisuals.length }, null, 2));
