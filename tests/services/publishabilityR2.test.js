const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const editorialStandard = require('../../src/services/editorialStandard.cjs');
const presentation = require('../../src/services/presentationDesignSystem.cjs');

test('FR-CA component labels preserve source labels while localizing user-facing text', () => {
  assert.deepEqual(editorialStandard.localizeComponentLabel('Age I Cards'), {
    sourceLabel: 'Age I Cards',
    displayLabelFrCa: 'Cartes de l’Âge I',
    spokenLabel: 'Cartes de l’âge un',
  });
  assert.equal(editorialStandard.localizeComponentLabel('Coins').displayLabelFrCa, 'Pièces');
});

test('Roman Age numerals remain display text but become natural spoken numbers', () => {
  assert.equal(editorialStandard.normalizeSpokenRomanNumerals('Âge I / Âge II / Âge III'), 'âge un / âge deux / âge trois');
  assert.equal(editorialStandard.normalizeSpokenSymbols('Préparez l’Âge III.'), 'Préparez l’âge trois.');
});

test('metadata delivery profile is distinct and modestly quicker than teaching', () => {
  const teaching = editorialStandard.getNarrationDeliveryProfile('AMELIE_TEACHING');
  const metadata = editorialStandard.getNarrationDeliveryProfile('AMELIE_METADATA');
  assert.equal(metadata.contract, 'metadata-only-delivery-v1');
  assert.ok(metadata.speedFactor >= 1.08 && metadata.speedFactor <= 1.12);
  assert.equal(teaching.speedFactor, 1);
});

test('R6 warm teaching profile preserves identity controls and uses the selected audition settings', () => {
  const preset = editorialStandard.getNarrationPreset('warm-engaging-fr-ca');
  const profile = editorialStandard.getNarrationDeliveryProfile('AMELIE_TEACHING_WARM_R6');
  assert.equal(profile.contract, 'amelie-teaching-warm-r6-v1');
  assert.equal(profile.voiceSettingsKey, 'teachingWarmR6VoiceSettings');
  assert.deepEqual(preset.teachingWarmR6VoiceSettings, {
    stability: 0.25,
    similarity_boost: 0.80,
    style: 0.28,
    use_speaker_boost: true,
    speed: 1.03,
  });
});

test('section badges meet the mobile readability floor', () => {
  assert.ok(presentation.PRESENTATION_TOKENS.layout.sectionBadgeMinPx1080 >= 42);
  assert.ok(presentation.PRESENTATION_TOKENS.layout.sectionBadgePreferredPx1080 >= presentation.PRESENTATION_TOKENS.layout.sectionBadgeMinPx1080);
});

test('native 7WD manifest preserves native masters and provenance', () => {
  const file = path.join(process.cwd(), 'out', 'publishability-r2', '7-wonders-duel', 'native-visual-manifest.json');
  if (!fs.existsSync(file)) return;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(manifest.extractionMethod, 'pymupdf-native-master');
  assert.equal(manifest.nativeMastersPreserved, true);
  assert.ok(manifest.assets.every((asset) => asset.filePath && asset.page && asset.extractionMethod));
});
