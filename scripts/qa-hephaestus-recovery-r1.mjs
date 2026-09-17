#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'hephaestus-recovery-r1');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const games = ['terraforming-mars', '7-wonders-duel'];
function read(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function media(p) { return JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels', '-of', 'json', p], { encoding: 'utf8' })); }
const reports = [];
for (const game of games) {
  const dir = path.join(outRoot, game);
  const evidence = read(path.join(dir, 'recovered.json'));
  const config = read(path.join(dir, 'components-setup-preview-config.json'));
  const video = path.join(dir, 'components-setup-preview.mp4');
  const probe = media(video);
  const stream = probe.streams.find((item) => item.codec_type === 'video');
  const failures = [];
  const checks = [];
  const accepted = evidence.acceptedVisuals || [];
  for (const asset of accepted) {
    const exists = Boolean(asset.renderPath && fs.existsSync(asset.renderPath) && fs.statSync(asset.renderPath).size > 0);
    checks.push({ id: `DET-${checks.length + 1}`, assetId: asset.id, check: 'accepted-file-exists', pass: exists });
    if (!exists) failures.push(`accepted visual ${asset.id} has no readable file`);
    if (!Number.isInteger(asset.pageNumber)) failures.push(`accepted visual ${asset.id} has no source page`);
    if (!asset.provenance || !asset.provenance.manifestPath) failures.push(`accepted visual ${asset.id} has no provenance`);
    const box = asset.boundingBox;
    if (box && asset.sourcePageDimensions) {
      if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > asset.sourcePageDimensions.width || box.y + box.height > asset.sourcePageDimensions.height) failures.push(`asset ${asset.id} crop is outside source bounds`);
    }
  }
  const duplicateAccepted = accepted.filter((asset) => asset.dedupIdentity?.isDuplicate).length;
  if (duplicateAccepted) failures.push(`${duplicateAccepted} duplicate visual(s) marked accepted`);
  for (const binding of evidence.componentBindings || []) {
    if (binding.assetId && !accepted.some((asset) => asset.id === binding.assetId)) failures.push(`binding ${binding.componentId} points to non-accepted asset`);
  }
  for (const binding of evidence.setupBindings || []) {
    if (binding.reviewState !== 'blocked' && binding.componentRefs.length > 0 && binding.visualAssetIds.length === 0) failures.push(`setup ${binding.setupStepId} lacks a bound visual`);
  }
  if (stream?.width !== 1920 || stream?.height !== 1080) failures.push(`preview resolution is ${stream?.width}x${stream?.height}, expected 1920x1080`);
  const mediaDuration = Number(probe.format?.duration || 0);
  if (mediaDuration < 15) failures.push('bounded preview is shorter than its four scene contract');
  reports.push({ namespace: 'DET', projectId: evidence.projectId, videoPath: video, videoSha256: sha(video), media: { durationSec: mediaDuration, resolution: `${stream?.width}x${stream?.height}`, streams: probe.streams }, evidence: { acceptedVisualCount: accepted.length, setupBindingCount: (evidence.setupBindings || []).length, componentBindingCount: (evidence.componentBindings || []).length, duplicateAcceptedCount: duplicateAccepted, acceptedFilesExist: evidence.validation.acceptedFilesExist, provenanceComplete: evidence.validation.acceptedHaveProvenance }, configScenes: config.scenes.map((scene) => ({ id: scene.id, durationSec: scene.durationSec, background: scene.background?.image || null })), checks, findings: failures.map((observation, index) => ({ id: `DET-${index + 100}`, category: 'hephaestus_evidence', observation })), violationCount: failures.length, pass: failures.length === 0 });
}
const output = { namespace: 'DET', contract: 'hephaestus-recovery-qa-r1', generatedAt: new Date().toISOString(), games: reports, violationCount: reports.reduce((sum, report) => sum + report.violationCount, 0), pass: reports.every((report) => report.pass) };
fs.writeFileSync(path.join(outRoot, 'deterministic-qa.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ pass: output.pass, violationCount: output.violationCount, reports: reports.map((report) => ({ projectId: report.projectId, resolution: report.media.resolution, durationSec: report.media.durationSec, focusedVisuals: report.evidence.acceptedVisualCount, setupBindings: report.evidence.setupBindingCount })) }, null, 2));
if (!output.pass) process.exitCode = 1;
