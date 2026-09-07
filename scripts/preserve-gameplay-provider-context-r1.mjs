#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const base = path.join(root, 'out', 'gameplay-actions-r1', 'twelve-labs', 'terraforming-mars');
const contextPath = path.join(base, 'expected-context.json');
const providerPath = path.join(base, 'provider-provenance.json');
const context = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
const provider = JSON.parse(fs.readFileSync(providerPath, 'utf8'));
const finalContextPath = path.join(base, 'expected-context-final.json');
fs.writeFileSync(finalContextPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
context.video.sha256 = provider.video_sha256;
// The preserved provider response predates the post-review TM visual repair.
// Reconstruct the exact context used for that attributable call; the current
// final-video context remains in expected-context-final.json.
const project = context.gameplay_model.actions.find((action) => action.name === 'Utiliser un projet');
const tile = context.gameplay_model.actions.find((action) => action.name === 'Placer une tuile');
if (project) project.component_refs = ['comp-1', 'comp-3'];
if (tile) tile.component_refs = ['comp-7', 'comp-15'];
const projectScene = context.scenes.find((scene) => scene.action_id === project?.id);
const tileScene = context.scenes.find((scene) => scene.action_id === tile?.id);
if (projectScene) projectScene.expected_visual_role = 'Visuel source-grounded associé à Utiliser un projet; composant(s): comp-1, comp-3.';
if (tileScene) tileScene.expected_visual_role = 'Visuel source-grounded associé à Placer une tuile; composant(s): comp-7, comp-15.';
fs.writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ providerContextRestored: contextPath, finalContextPreserved: finalContextPath, providerContextSha256: provider.expected_context_sha256 }, null, 2));
