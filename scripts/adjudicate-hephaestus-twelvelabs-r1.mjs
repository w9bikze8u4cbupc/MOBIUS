#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const base = path.join(root, 'out', 'hephaestus-recovery-r1', 'twelve-labs');
const decisions = {
  'terraforming-mars': {
    'TL-001': ['FALSE_POSITIVE', 'Frame inspection shows a sparse three-line panel with substantial breathing room; no density defect is established.'],
    'TL-002': ['PLAUSIBLE_EDITORIAL', 'The image/text balance can be refined, but the frame is contained and readable; no deterministic defect is established.'],
    'TL-003': ['PLAUSIBLE_EDITORIAL', 'The hard end-card cut is observable and may merit editorial smoothing, but it does not block the component/setup proof.'],
  },
  '7-wonders-duel': {
    'TL-001': ['CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO', 'The component list visibly repeats the same Age I Cards label; the display-level logical dedupe is applied before the repaired render.'],
    'TL-002': ['FALSE_POSITIVE', 'The single setup sentence has ample horizontal and vertical room in the inspected frame; no premature wrap is visible.'],
    'TL-003': ['PLAUSIBLE_EDITORIAL', 'The end-card cut is observable and may merit editorial smoothing, but it does not block the component/setup proof.'],
  },
  '7-wonders-duel-rerun': {
    'TL-001': ['FALSE_POSITIVE', 'Physical inspection of the source page confirms the page title “7 Wonders Duel”; the provider misclassified the game identity from the focused crop.'],
    'TL-002': ['FALSE_POSITIVE', 'The panel begins at the configured safe margin and the inspected frame shows no clipping or containment failure.'],
  },
};
for (const game of Object.keys(decisions)) {
  const dir = path.join(base, game); const parsedPath = path.join(dir, 'provider-response.parsed.json'); const rawPath = path.join(dir, 'provider-response.raw.json');
  const parsed = JSON.parse(fs.readFileSync(parsedPath, 'utf8')); const rawSha = crypto.createHash('sha256').update(fs.readFileSync(rawPath)).digest('hex');
  fs.writeFileSync(path.join(dir, 'adjudication.json'), `${JSON.stringify({ namespace: 'ADJ', provider: 'twelvelabs', model_name: 'pegasus1.5', sourceResponsePath: rawPath, sourceResponseSha256: rawSha, findings: (parsed.findings || []).map((finding) => { const [classification, rationale] = decisions[game][finding.id] || ['UNASSESSABLE', 'No independent adjudication rule was available.']; return { id: `ADJ-${String(finding.id).replace(/^TL-/, '')}`, sourceFindingId: finding.id, classification, rationale, provider: 'twelvelabs', model_name: 'pegasus1.5', sourceResponsePath: rawPath, sourceResponseSha256: rawSha }; }) }, null, 2)}\n`, 'utf8');
}
