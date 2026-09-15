#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'out/publishability-r8/baseline');
const FFPROBE = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const rel = (file) => path.relative(ROOT, file).replace(/\\/g, '/');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const evidence = (relativePath, expectedSha256 = null) => {
  const file = path.join(ROOT, relativePath);
  if (!fs.existsSync(file)) throw new Error(`Missing immutable baseline artifact: ${file}`);
  const sha256 = hash(file);
  return { path: rel(file), absolutePath: file, sha256, bytes: fs.statSync(file).size, expectedSha256, matchesExpected: expectedSha256 ? sha256 === expectedSha256 : null };
};
const media = (relativePath, expectedSha256) => {
  const base = evidence(relativePath, expectedSha256);
  const probe = JSON.parse(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels', '-of', 'json', base.absolutePath], { encoding: 'utf8' }));
  return { ...base, durationSec: Number(probe.format.duration), streams: probe.streams };
};

const report = {
  contract: 'mobius-publishability-r8-baseline-v1',
  generatedAt: new Date().toISOString(),
  repository: {
    cwd: ROOT,
    branch: git('branch', '--show-current'),
    head: git('rev-parse', 'HEAD'),
    originMain: git('rev-parse', 'origin/main'),
    remoteBranchHead: git('rev-parse', 'origin/fix/terraforming-mars-quality-regression-restore'),
    dirtyEntries: git('status', '--porcelain=v1', '-uall').split(/\r?\n/).filter(Boolean),
    destructiveAlignmentPerformed: false,
  },
  immutableBaselines: {
    r4: media('out/publishability-r4/7-wonders-duel/7-wonders-duel-full-tutorial-r4.mp4', '179d03b9f4632af57b96df8b004082573f5efd486a3cf6ba153e39bf4c169edf'),
    r5: {
      ...media('out/publishability-r5/7-wonders-duel/7-wonders-duel-full-tutorial-r5.mp4', '89bbd2ec308e92ff9558b619c4aaa4de6bf8efd3f42d1a717a3dfac3bb96a543'),
      directorStatus: 'HUMAN_PUBLISHABLE_GOLD_BASELINE',
      published: false,
    },
    r6: media('out/publishability-r6/7-wonders-duel/7-wonders-duel-full-tutorial-r6.mp4', '0b30bf91f973acdb1918cf297d9355e2363760dc8c39745a604c7920acf22bac'),
    r7: media('out/publishability-r7/7-wonders-duel/7-wonders-duel-full-tutorial-r7.mp4', '77ee3802cb5e19a4fd388f400f86f120e9fcfec36871412731c6b9f23d2a41e1'),
  },
  r7State: {
    visualPlan: evidence('config/projects/7-wonders-duel/visual-plan.r7.json'),
    tutorialAssembly: evidence('config/projects/7-wonders-duel/tutorial-assembly.r7.json'),
    fullConfig: evidence('out/publishability-r7/7-wonders-duel/full-tutorial-config.json'),
    narrationManifest: evidence('out/publishability-r7/7-wonders-duel/narration-assets.json'),
    visualManifest: evidence('out/publishability-r7/7-wonders-duel/visual-storyboard/manifest.json'),
  },
};
report.status = report.repository.branch === 'fix/terraforming-mars-quality-regression-restore'
  && report.immutableBaselines.r4.matchesExpected
  && report.immutableBaselines.r5.matchesExpected
  && report.immutableBaselines.r6.matchesExpected
  && report.immutableBaselines.r7.matchesExpected ? 'PASS' : 'FAIL';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'repository-and-baseline-preflight.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ status: report.status, branch: report.repository.branch, head: report.repository.head, dirtyEntries: report.repository.dirtyEntries.length, baselines: Object.fromEntries(Object.entries(report.immutableBaselines).map(([id, item]) => [id, item.sha256])) }, null, 2)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;
