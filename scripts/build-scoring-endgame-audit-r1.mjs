import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, 'out', 'scoring-endgame-r1');
const exists = (file) => fs.existsSync(path.join(root, file));
const fileRecord = (file, capability) => ({ file, exists: exists(file), capability });

const audit = {
  mission: 'MOBIUS_SCORING_ENDGAME_VISUAL_TEACHING_R1',
  generatedBy: 'scripts/build-scoring-endgame-audit-r1.mjs',
  generatedAt: new Date().toISOString(),
  status: 'AUDIT_COMPLETE',
  sourceEvidence: {
    terraformingMars: {
      projectId: 'tm-eng-bgg-fa0678822223',
      sourcePdfSha256: 'fa06788222239dccf57e2d40d1cf6ccafb91ecba04ea25f52e7d037e60f7a1ee',
      extractedRulebook: 'data/tm-eng-bgg-fa0678822223/production/zero-state-extraction.json',
      relevantSourcePages: [3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14],
      verifiedSignals: ['three global parameters end the game after the generation production phase', 'winner has most VPs', 'VPs from TR, board tiles, awards, milestones and played cards', 'tie uses most money in current recovered script; requires source reconciliation']
    },
    sevenWondersDuel: {
      projectId: '7-wonders-duel',
      localRulebookPages: 'data/rulebook-images/7-wonders-duel/page-*.png',
      relevantSourcePages: [12, 13, 14, 15, 16, 17, 18, 19, 20],
      verifiedSignals: ['military supremacy can end the game immediately', 'scientific supremacy can end the game immediately', 'civilian victory is resolved at the end of Age III if no supremacy occurred', 'page 13 lists civilian victory-point sources; exact tie-break wording remains source-review sensitive']
    }
  },
  capabilityClassification: [
    { capability: 'Rulebook text/page extraction and source offsets', classification: 'REUSE', evidence: [fileRecord('src/services/rulebookChunker.js', 'chunking'), fileRecord('data/tm-eng-bgg-fa0678822223/production/zero-state-extraction.json', 'TM extracted text/pages')] },
    { capability: 'Existing endgame/scoring script sections', classification: 'RECONNECT', evidence: [fileRecord('data/tm-eng-bgg-fa0678822223/production/production-script.json', 'TM sections Fin de partie and Calcul des points'), fileRecord('data/tm-eng-bgg-fa0678822223/production/zero-state-script-package.json', 'canonical script sections')] },
    { capability: 'HEPHAESTUS accepted component visuals and provenance', classification: 'REUSE', evidence: [fileRecord('src/services/hephaestusEvidence.js', 'canonical evidence contract'), fileRecord('out/hephaestus-recovery-r1/terraforming-mars/recovered.json', 'TM accepted visuals'), fileRecord('out/hephaestus-recovery-r1/7-wonders-duel/recovered.json', '7WD accepted visuals')] },
    { capability: 'Gameplay contract and visual binding state', classification: 'REUSE', evidence: [fileRecord('src/services/gameplayActions.js', 'canonical loop/action model'), fileRecord('out/gameplay-actions-r1/terraforming-mars/gameplay-actions.json', 'TM loop/action bindings'), fileRecord('out/gameplay-actions-r1/7-wonders-duel/gameplay-actions.json', '7WD loop/action bindings')] },
    { capability: 'Semantic storyboard and Presentation Design System', classification: 'REUSE', evidence: [fileRecord('src/storyboard/tutorial_presentation.cjs', 'semantic scene generation'), fileRecord('src/services/presentationDesignSystem.cjs', 'layout/panel system')] },
    { capability: 'Generic AI prose treated as scoring truth', classification: 'SUPERSEDE', evidence: [fileRecord('src/services/tutorialScriptGenerator.cjs', 'script generation source, not authoritative rule truth')] },
    { capability: 'Old game-specific scoring manifests', classification: 'ARCHIVE', evidence: [fileRecord('data/tm-eng-bgg-fa0678822223/production/render-config-editorial-fix.json', 'historical rendered configuration')] },
    { capability: 'Cockpit/Autopilot persistence', classification: 'RECONNECT', evidence: [fileRecord('scripts/run-rulebook-production.mjs', 'normal production state/checkpoints')] },
    { capability: 'Twelve Labs advisory validation', classification: 'REUSE', evidence: [fileRecord('scripts/qa-twelvelabs.mjs', 'existing external reviewer runner'), fileRecord('config/qa/mobius-twelvelabs-editorial-qa-v1.1.schema.json', 'strict response schema')] }
  ],
  gapsBeforeImplementation: [
    'No canonical EndGameModel/ScoringCategory/TieBreaker service or schema is persisted by the normal production path.',
    'TM endgame prose exists but is not connected to accepted scoring visuals through one canonical model.',
    '7 Wonders Duel has source page imagery and opening victory labels, but no persisted endgame/scoring teaching model.',
    'No bounded endgame/scoring preview or deterministic scoring-specific QA exists.'
  ],
  implementationConstraint: 'Do not invent unsupported calculations. Ambiguous sources remain review-required.'
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'recovery-audit.json'), `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
const classificationMarkdown = audit.capabilityClassification.map((item) => `- **${item.classification}** — ${item.capability}`).join('\n');
fs.writeFileSync(path.join(outDir, 'recovery-audit.md'), `# Scoring & Endgame R1 — recovery audit\n\nStatus: **AUDIT_COMPLETE**\n\nThe current repository has extracted source text, TM endgame/scoring prose, HEPHAESTUS accepted visuals, gameplay bindings, semantic storyboard generation and Cockpit-compatible checkpoint persistence. It does not yet persist one canonical endgame/scoring model or connect those rules to focused scoring visuals.\n\n## Classification\n\n${classificationMarkdown}\n\n## Source boundary\n\nTerraforming Mars is grounded in source SHA ${audit.sourceEvidence.terraformingMars.sourcePdfSha256}. 7 Wonders Duel uses the existing local rulebook page images, including pages 12–20 for supremacy, civilian victory and card/score references. Any ambiguous tie-break or calculation remains review-required.\n`, 'utf8');
console.log(JSON.stringify({ auditPath: path.join(outDir, 'recovery-audit.json'), status: audit.status, classifications: audit.capabilityClassification.length }, null, 2));
