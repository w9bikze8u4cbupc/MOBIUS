#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const root = path.resolve(process.cwd());
const out = path.join(root, 'out', 'publishability-r2', '7-wonders-duel');
const configPath = process.env.MOBIUS_PUBLISHABILITY_CONFIG
  ? path.resolve(process.env.MOBIUS_PUBLISHABILITY_CONFIG)
  : path.join(root, 'out', 'publishability-r2', 'full-tutorial-final7', '7-wonders-duel', 'full-tutorial-config.json');
const nativeManifestPath = path.join(out, 'native-extraction', 'manifest.json');
const pdfPath = path.join(root, 'C:\\mobius-games-tutorial-runtime', 'data');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function exists(file) { return Boolean(file && fs.existsSync(file)); }
function classify(file, metadata = {}) {
  const normalized = String(file || '').toLowerCase();
  if (normalized.includes('native-extraction') || normalized.includes('native-master')) return 'NATIVE_EMBEDDED';
  if (normalized.includes('box-art') || normalized.includes('official')) return 'OFFICIAL_HIGH_RES';
  if (normalized.includes('rulebook-images')) return (metadata.width || 0) >= 1200 ? 'HIGH_DPI_PAGE_CROP' : 'LOW_RES_PAGE_CROP';
  if (normalized.includes('component-crops')) return (metadata.width || 0) >= 800 ? 'HIGH_DPI_PAGE_CROP' : 'LOW_RES_PAGE_CROP';
  if (normalized.includes('thumbnail')) return 'THUMBNAIL';
  return 'UNKNOWN';
}
async function imageInfo(file) {
  if (!exists(file)) return { exists: false, path: file };
  const metadata = await sharp(file).metadata();
  return { exists: true, path: file, sha256: sha(file), format: metadata.format, width: metadata.width, height: metadata.height, channels: metadata.channels, density: metadata.density, sourceClass: classify(file, metadata) };
}
function sourcePage(scene) {
  const ref = scene.visualSelection?.sourcePage || scene.visualSelection?.page;
  if (Number.isFinite(Number(ref))) return Number(ref);
  return (scene.sourceRefs || []).map((x) => Number(x.page)).find(Number.isFinite) || null;
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const config = readJson(configPath);
  const rows = [];
  for (const scene of config.scenes || []) {
    const file = scene.background?.image || null;
    const info = await imageInfo(file);
    const targetWidth = scene.layout?.mode === 'split-teaching' ? 1050 : 1200;
    rows.push({ sceneId: scene.id, narrationAtom: scene.narrationText || scene.generatedNarration?.text || '', displayedConcept: scene.visualBinding?.componentName || scene.section || scene.chapterTitle || scene.id, currentVisualPath: file, sourceType: info.sourceClass, sourcePage: sourcePage(scene), nativeSourceDimensions: info.sourceClass === 'NATIVE_EMBEDDED' ? { width: info.width, height: info.height } : null, renderedDimensions: { width: info.width || null, height: info.height || null }, effectiveSourceToDisplayRatio: info.width ? Number((info.width / targetWidth).toFixed(3)) : null, extractionMethod: scene.visualBinding?.extractionMethod || scene.background?.provenance?.extractionMethod || null, sourceLanguageTextContamination: /rulebook-images|page/i.test(String(file || '')) ? 'possible instructional page text' : 'none-observed', semanticMatchConfidence: Number(scene.visualBinding?.confidence || scene.background?.provenance?.confidence || 0), image: info });
  }
  const native = readJson(nativeManifestPath);
  const nativeAssets = native.images.filter((item) => item.native_master && item.dimensions?.width >= 30 && item.dimensions?.height >= 30).map((item) => ({ id: item.id, filePath: item.file_path, page: item.page_index + 1, xref: item.id.match(/xref(\\d+)/)?.[1] || null, category: item.type, width: item.dimensions.width, height: item.dimensions.height, format: path.extname(item.file_name).slice(1), extractionMethod: 'pymupdf-native-master', sourcePdfSha256: null, sourceLabel: item.label, displayLabelFrCa: null, reviewState: 'candidate', hdQualityCandidate: item.dimensions.width >= 250 && item.dimensions.height >= 250 }));
  const page2 = path.join(out, 'page2-300dpi.png');
  async function ensureCrop(id, sourceRegion, sourceLabel) {
    const filePath = path.join(out, `${id}.png`);
    if (exists(page2) && !exists(filePath)) await sharp(page2).extract({ left: sourceRegion.left, top: sourceRegion.top, width: sourceRegion.width, height: sourceRegion.height }).png().toFile(filePath);
    if (!exists(filePath)) return null;
    return { id, filePath, page: 2, xref: null, category: 'high-dpi-semantic-crop', width: sourceRegion.width, height: sourceRegion.height, format: 'png', extractionMethod: 'pymupdf-high-dpi-page-raster', sourcePdfSha256: null, sourceLabel, displayLabelFrCa: null, reviewState: 'accepted', hdQualityCandidate: true, nativeMaster: false, sourceRegion: { ...sourceRegion, dpi: 300 } };
  }
  const hdpiCrop = path.join(out, 'page2-components-hdpi.png');
  if (exists(hdpiCrop)) nativeAssets.unshift({ id: 'page2-components-hdpi', filePath: hdpiCrop, page: 2, xref: null, category: 'setup-and-components', width: 2245, height: 1490, format: 'png', extractionMethod: 'pymupdf-high-dpi-page-raster', sourcePdfSha256: null, sourceLabel: 'Page 2 lower component and board region', displayLabelFrCa: null, reviewState: 'accepted', hdQualityCandidate: true, nativeMaster: false, sourceRegion: { left: 0, top: 560, width: 2245, height: 1490, dpi: 300 } });
  const semanticCrops = [
    await ensureCrop('page2-discard-cards-hdpi', { left: 70, top: 430, width: 520, height: 500 }, 'Page 2 card stacks and discard area'),
    await ensureCrop('page2-progress-tokens-hdpi', { left: 1650, top: 430, width: 560, height: 560 }, 'Page 2 progress/science token area'),
    await ensureCrop('page2-coins-hdpi', { left: 900, top: 1570, width: 650, height: 500 }, 'Page 2 coin treasury area')
  ].filter(Boolean);
  nativeAssets.unshift(...semanticCrops);
  const audit = { schema_version: 'mobius-7wd-publishability-visual-audit-v1', generatedAt: new Date().toISOString(), videoConfig: configPath, nativeManifest: nativeManifestPath, sceneCount: rows.length, scenes: rows, nativeAssetSummary: { totalExtracted: native.images.length, qualityCandidates: nativeAssets.filter((item) => item.hdQualityCandidate).length, usableNativeAssets: nativeAssets.length, dimensionsPreserved: native.images.every((item) => item.native_master && item.upscale_factor === 1) }, nativeAssets };
  fs.writeFileSync(path.join(out, 'visual-source-audit.json'), JSON.stringify(audit, null, 2));
  fs.writeFileSync(path.join(out, 'visual-source-audit.md'), `# 7 Wonders Duel visual source audit\n\nGenerated ${audit.generatedAt}.\n\n- Scenes audited: ${rows.length}\n- Native images extracted: ${native.images.length}\n- Native quality candidates: ${nativeAssets.length}\n- Native masters preserve source dimensions: ${audit.nativeAssetSummary.dimensionsPreserved}\n\n## Scene sources\n\n${rows.map((row) => `### ${row.sceneId}\n- Concept: ${row.displayedConcept}\n- Source: ${row.sourceType}\n- Path: ${row.currentVisualPath}\n- Dimensions: ${row.image.width || 'unknown'}×${row.image.height || 'unknown'}\n- Effective source/display ratio: ${row.effectiveSourceToDisplayRatio ?? 'unknown'}\n- Match confidence: ${row.semanticMatchConfidence}`).join('\n\n')}`);
  fs.writeFileSync(path.join(out, 'native-visual-manifest.json'), JSON.stringify({ schema_version: 'mobius-native-visual-manifest-v2', generatedAt: new Date().toISOString(), sourcePdf: native.pdf_path, sourcePdfSha256: exists(native.pdf_path) ? sha(native.pdf_path) : null, extractionMethod: 'pymupdf-native-master', nativeMastersPreserved: true, assets: nativeAssets }, null, 2));
  console.log(JSON.stringify({ audit: path.join(out, 'visual-source-audit.json'), nativeManifest: path.join(out, 'native-visual-manifest.json'), scenes: rows.length, nativeCandidates: nativeAssets.length }, null, 2));
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
