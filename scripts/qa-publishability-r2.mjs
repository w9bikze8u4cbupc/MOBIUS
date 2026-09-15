#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import ffprobeStatic from 'ffprobe-static';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PRESENTATION_TOKENS } = require('../src/services/presentationDesignSystem.cjs');
const root = path.resolve(process.cwd());
const gameDir = path.join(root, 'out', 'publishability-r2', '7-wonders-duel');
const configPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'out', 'publishability-r2', 'full-tutorial-r3', '7-wonders-duel', 'full-tutorial-config.json');
const videoPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(gameDir, '7-wonders-duel-full-tutorial-r2.mp4');
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function exists(file) { return Boolean(file && fs.existsSync(file)); }
async function imageCheck(file) { if (!exists(file)) return { exists: false }; const m = await sharp(file).metadata(); return { exists: true, format: m.format, width: m.width, height: m.height, sha256: sha(file) }; }
function videoInfo(file) { const raw = execFileSync(ffprobeStatic.path, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' }); return JSON.parse(raw); }
async function main() {
  const config = readJson(configPath);
  const manifestPath = path.join(gameDir, 'native-visual-manifest.json');
  const manifest = readJson(manifestPath);
  const violations = [];
  const visualChecks = [];
  const seenVisuals = new Map();
  for (const scene of config.scenes) {
    const visual = await imageCheck(scene.background?.image);
    if (scene.background?.image && !visual.exists) violations.push({ id: 'DET-PUB-001', sceneId: scene.id, issue: 'missing visual' });
    if (scene.id !== 'brand-signature' && scene.id !== 'brand-outro' && scene.id.includes('metadata') === false && scene.background?.image?.includes('rulebook-images')) violations.push({ id: 'DET-PUB-002', sceneId: scene.id, issue: 'page raster remains where generator selected native visual' });
    if (scene.background?.provenance?.nativeMaster && scene.background.provenance.sourceDimensions?.width && scene.background.provenance.sourceDimensions?.height && scene.background.provenance.sourceDimensions.width !== manifest.assets.find((a) => a.id === scene.background.provenance.assetId)?.width) violations.push({ id: 'DET-PUB-003', sceneId: scene.id, issue: 'native dimensions not preserved' });
    const badge = scene.overlays?.find((o) => o.type === 'badge');
    if (badge && PRESENTATION_TOKENS.layout.sectionBadgeMinPx1080 < 42) violations.push({ id: 'DET-PUB-004', sceneId: scene.id, issue: 'badge minimum below 42px contract' });
    if (scene.visualBinding?.sourceLabel && scene.visualBinding.displayLabelFrCa === scene.visualBinding.sourceLabel && /Age I Cards|Coins/.test(scene.visualBinding.sourceLabel)) violations.push({ id: 'DET-PUB-005', sceneId: scene.id, issue: 'raw English component label reaches user-facing config' });
    if (scene.outroCompletionGuard && scene.outroCompletionGuard.valid !== true) violations.push({ id: 'DET-PUB-006', sceneId: scene.id, issue: 'outro tail guard invalid' });
    if (scene.background?.provenance?.assetId) { const id = scene.background.provenance.assetId; seenVisuals.set(id, (seenVisuals.get(id) || 0) + 1); }
    visualChecks.push({ sceneId: scene.id, sourceClass: scene.background?.provenance?.nativeMaster ? 'NATIVE_EMBEDDED' : 'OTHER', visual });
  }
  const reuse = [...seenVisuals.entries()].filter(([, count]) => count > 4).map(([assetId, count]) => ({ assetId, count }));
  if (reuse.length) violations.push({ id: 'DET-PUB-007', issue: 'excessive semantic visual reuse', assets: reuse });
  if (!exists(videoPath)) violations.push({ id: 'DET-PUB-008', issue: 'rendered video missing' });
  const report = { schema_version: 'mobius-publishability-r2-qa-v1', generatedAt: new Date().toISOString(), configPath, videoPath, videoSha256: exists(videoPath) ? sha(videoPath) : null, video: exists(videoPath) ? videoInfo(videoPath) : null, nativeManifest: manifestPath, nativeMasterCount: manifest.assets.filter((asset) => asset.hdQualityCandidate).length, nativeAssetCount: manifest.assets.length, sectionBadge: { minPx1080: PRESENTATION_TOKENS.layout.sectionBadgeMinPx1080, preferredPx1080: PRESENTATION_TOKENS.layout.sectionBadgePreferredPx1080, pass: PRESENTATION_TOKENS.layout.sectionBadgeMinPx1080 >= 42 }, visualChecks, violations, violationCount: violations.length, status: violations.length ? 'FAIL' : 'PASS' };
  fs.writeFileSync(path.join(gameDir, 'qa-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, violationCount: report.violationCount, report: path.join(gameDir, 'qa-report.json') }, null, 2));
  if (violations.length) process.exitCode = 1;
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
