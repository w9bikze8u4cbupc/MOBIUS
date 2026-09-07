#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { solvePresentationLayout } from '../src/services/presentationDesignSystem.cjs';

const root = resolve(process.cwd());
const outputPath = resolve(process.argv[2] || 'out/mission-01/presentation-r2/layout-qa.json');
const games = {
  'terraforming-mars': 'out/mission-01/terraforming-mars/render-config.json',
  '7-wonders-duel': 'out/mission-01/7-wonders-duel/render-config.json',
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const lineCount = (text, maxChars) => String(text || '').split(/\r?\n/).reduce((n, line) => n + Math.max(1, Math.ceil(line.trim().length / Math.max(1, maxChars))), 0);
const scenes = [];
const violations = [];

for (const [game, configPath] of Object.entries(games)) {
  const config = JSON.parse(readFileSync(resolve(root, configPath), 'utf8'));
  const width = Number(config.width || config.resolution?.width || 1920);
  const height = Number(config.height || config.resolution?.height || 1080);
  for (const scene of config.scenes || []) {
    if (scene.layout?.mode !== 'split-teaching') continue;
    const overlays = scene.overlays || [];
    const find = (type, position) => overlays.find((overlay) => overlay.type === type && (!position || overlay.position === position))?.text || '';
    const body = find('body', 'panel-body');
    const image = scene.background?.image ? { width: Number(scene.background.width || 1), height: Number(scene.background.height || 1) } : null;
    const solved = solvePresentationLayout({
      width,
      height,
      sceneType: scene.layout.metadataCard ? 'metadata' : (scene.layout.presentationLayout?.contentType === 'list' ? 'list' : 'teaching'),
      imageAspect: image ? image.width / Math.max(1, image.height) : 1,
      title: find('title', 'metadata-title'),
      heading: find('heading', 'panel-heading'),
      body,
      tags: find('tags', 'panel-tags'),
      reference: find('reference'),
      itemCount: Math.max(1, body.split(/\r?\n/).filter(Boolean).length),
      preferredImageProminence: Number(scene.layout.visualWidthRatio) || 0.56,
      preferredFontPx: scene.layout.metadataCard ? 50 : null,
      minimumFontPx: scene.layout.metadataCard ? 44 : null,
      textSide: scene.layout.textSide === 'right' ? 'right' : 'left',
      imageSide: scene.layout.imageSide === 'left' ? 'left' : 'right',
    });
    const checks = [];
    const add = (name, text, x, y, font, lineHeight) => {
      if (!String(text || '').trim()) return;
      const lines = lineCount(text, Math.max(12, Math.floor(solved.textWidth / Math.max(1, font * 0.52))));
      const box = { left: solved.panelX + solved.padding, right: solved.panelX + solved.padding + solved.textWidth, top: y, bottom: y + (lines * lineHeight) };
      const valid = box.left >= solved.panelX && box.right <= solved.panelX + solved.panelWidth && box.top >= solved.panelY && box.bottom <= solved.panelY + solved.panelHeight;
      checks.push({ name, valid, box, lines });
      if (!valid) violations.push({ id: `DET-${String(violations.length + 1).padStart(3, '0')}`, game, scene_id: scene.id, type: 'owned_content_outside_panel', element: name, box, panel: solved.containment });
    };
    add('title', find('title', 'metadata-title'), solved.panelX + solved.padding, solved.titleY, solved.titleFontPx, Math.round(solved.titleFontPx * 1.12));
    add('heading', find('heading', 'panel-heading'), solved.panelX + solved.padding, solved.headingY, solved.headingFontPx, Math.round(solved.headingFontPx * 1.18));
    add('body', body, solved.panelX + solved.padding, solved.bodyY, solved.bodyFontPx, solved.bodyLineHeightPx);
    add('tags', find('tags', 'panel-tags'), solved.panelX + solved.padding, solved.tagsY, solved.tagsFontPx, Math.round(solved.tagsFontPx * 1.25));
    add('reference', find('reference'), solved.panelX + solved.padding, solved.referenceY, solved.referenceFontPx, Math.round(solved.referenceFontPx * 1.2));
    if (solved.failedHardConstraints) violations.push({ id: `DET-${String(violations.length + 1).padStart(3, '0')}`, game, scene_id: scene.id, type: 'solver_no_valid_candidate' });
    scenes.push({ game, scene_id: scene.id, candidate_count: solved.candidateCount, valid_candidate_count: solved.validCandidateCount, selected_family: scene.layout.presentationLayout?.layoutFamily || null, panel: solved.containment, image: { left: solved.imageX, top: solved.imageY, right: solved.imageX + solved.imageWidth, bottom: solved.imageY + solved.imageHeight }, checks, hard_constraints_satisfied: solved.hardConstraintsSatisfied });
  }
}

const evidence = {
  schema_version: 'mobius-presentation-layout-qa-v1',
  model: 'content-aware-solver-bounds',
  generated_at: new Date().toISOString(),
  input_configs: Object.fromEntries(Object.entries(games).map(([game, file]) => [game, { path: resolve(root, file), sha256: hash(readFileSync(resolve(root, file))) }])),
  scenes,
  violations,
  violation_count: violations.length,
  verdict: violations.length === 0 ? 'PASS' : 'FAIL',
  note: 'Deterministic model-level containment evidence; physical frame inspection remains separate editorial evidence.',
};
mkdirSync(resolve(outputPath, '..'), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ outputPath, verdict: evidence.verdict, violationCount: evidence.violation_count }, null, 2));
process.exitCode = violations.length ? 1 : 0;
