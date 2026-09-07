#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'scoring-endgame-r1', 'twelve-labs');
const ffprobe = process.env.MOBIUS_FFPROBE_PATH || ffprobeStatic.path || 'ffprobe';
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const probe = (file) => { const data = JSON.parse(execFileSync(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=width,height,codec_name,codec_type', '-of', 'json', file], { encoding: 'utf8' })); const video = data.streams?.find((s) => s.codec_type === 'video'); return { durationSec: Number(data.format?.duration || 0), resolution: `${video?.width}x${video?.height}`, videoCodec: video?.codec_name || null }; };

for (const [game, displayTitle, spokenTitle] of [['terraforming-mars', 'Terraforming Mars', 'Terraforming Mars'], ['7-wonders-duel', '7 Wonders Duel', 'Seven Wonders Duel']]) {
  const dir = path.join(root, 'out', 'scoring-endgame-r1', game);
  const config = read(path.join(dir, 'preview-config.json'));
  const model = read(path.join(dir, 'scoring-endgame.json'));
  const videoPath = path.join(dir, 'scoring-endgame-preview.mp4');
  const media = probe(videoPath);
  let cursor = 0;
  const scenes = config.scenes.map((scene) => {
    const start = Number(cursor.toFixed(3));
    cursor += Number(scene.durationSec || 0);
    const end = Number(cursor.toFixed(3));
    const exact = scene.narrationText || 'NONE';
    return {
      scene_id: scene.id,
      start_sec: start,
      end_sec: end,
      purpose: scene.id === 'brand-signature' ? 'Signature visuelle et sonore sans narration.' : scene.id === 'end-card' ? 'Fermeture visuelle.' : `Enseigner ${scene.semanticRole || scene.id} avec une règle de fin ou de décompte source-grounded.`,
      exact_narration_text: exact,
      expected_visual_role: scene.id === 'brand-signature' ? 'Bannière canonique et signature sonore; aucune parole.' : `Visuel source-grounded associé à la scène ${scene.id}.`,
      semantic_role: scene.semanticRole || null,
      source_refs: scene.sourceRefs || [],
    };
  });
  const context = {
    schema_version: 'mobius-scoring-endgame-expected-context-v1',
    identity: { display_title: displayTitle, spoken_title: spokenTitle, locale: 'fr-CA', pronunciation_guidance: 'Les titres anglais restent reconnaissables et sont prononcés naturellement dans une phrase française québécoise; ne pas jouer un accent anglophone.' },
    video: { path: videoPath, sha256: sha256(videoPath), duration_sec: media.durationSec, resolution: media.resolution },
    scenes,
    intentional_intro_silence: { start_sec: 0, end_sec: 3.6, reason: 'La signature de marque est volontairement sans narration Amélie.' },
    expected_visual_role: 'Expliquer la fin de partie, les victoires immédiates lorsqu’elles existent, le décompte et le gagnant avec des visuels de source vérifiée.',
    expected_brand_rules: ['Aucune parole pendant les 3,6 premières secondes.', 'Les victoires immédiates doivent rester distinctes du décompte final.', 'Les visuels doivent appuyer l’atome de fin ou de score annoncé.'],
    endgame_model: { contract: model.contract, trigger: model.endGameModel.trigger, immediate_victory_conditions: model.endGameModel.immediateVictoryConditions.map((condition) => ({ id: condition.id, label: condition.label, source_refs: condition.sourceRefs })), scoring_categories: model.scoringCategories.map((category) => ({ id: category.id, label: category.label, source_refs: category.sourceRefs })), tie_breakers: model.tieBreakers },
    local_deterministic_findings: { namespace: 'DET', evidence_path: path.join(root, 'out', 'scoring-endgame-r1', 'qa-report.json'), note: 'Les mesures déterministes sont fournies séparément et ne constituent pas des faits à confirmer dans l’analyse perceptuelle.' },
  };
  write(path.join(outRoot, game, 'expected-context.json'), context);
  console.log(JSON.stringify({ game, context: path.join(outRoot, game, 'expected-context.json'), video: context.video }, null, 2));
}
