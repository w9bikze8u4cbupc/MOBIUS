/**
 * Shared editorial contract for MOBIUS tutorials.
 * Policy and deterministic text/layout helpers only; provider calls and
 * rendering remain in their existing pipeline modules.
 */

const EDITORIAL_CONTRACT_VERSION = 'mobius-professional-editorial-v6';
const PROFESSIONAL_RELEASE_GATE_VERSION = 'mobius-professional-release-gate-v1';
const { sanitizeSpokenGameName: sanitizeIdentitySpokenGameName, spokenRepresentation } = require('./gameIdentity.cjs');
const { PRESENTATION_TOKENS } = require('./presentationDesignSystem.cjs');

const NARRATION_PRESETS = Object.freeze({
  'warm-engaging-fr-ca': Object.freeze({
    id: 'warm-engaging-fr-ca',
    version: '4',
    language: 'fr-CA',
    modelId: 'eleven_multilingual_v2',
    voiceSettings: Object.freeze({
      stability: 0.34,
      similarity_boost: 0.78,
      style: 0.32,
      use_speaker_boost: true,
    }),
    openingVoiceSettings: Object.freeze({
      stability: 0.42,
      similarity_boost: 0.78,
      style: 0.22,
      use_speaker_boost: true,
    }),
    teachingWarmR6VoiceSettings: Object.freeze({
      stability: 0.25,
      similarity_boost: 0.80,
      style: 0.28,
      use_speaker_boost: true,
      speed: 1.03,
    }),
    teachingWarmR10VoiceSettings: Object.freeze({
      stability: 0.27,
      similarity_boost: 0.86,
      style: 0.42,
      use_speaker_boost: true,
      speed: 1.04,
    }),
    description: 'Warm, engaged, conversational French Canadian narration.',
    deliveryProfiles: Object.freeze({
      AMELIE_OPENING: Object.freeze({ energy: 'calm-warm', pauseStyle: 'short-natural', voiceSettingsKey: 'openingVoiceSettings', speedFactor: 1 }),
      AMELIE_METADATA: Object.freeze({ energy: 'clear-warm', pauseStyle: 'compact-natural', voiceSettingsKey: 'voiceSettings', speedFactor: 1.08, contract: 'metadata-only-delivery-v1' }),
      AMELIE_TEACHING: Object.freeze({ energy: 'clear-lively', pauseStyle: 'natural', voiceSettingsKey: 'voiceSettings', speedFactor: 1 }),
      AMELIE_TEACHING_WARM_R6: Object.freeze({ energy: 'joyful-table-host', pauseStyle: 'warm-conversational', voiceSettingsKey: 'teachingWarmR6VoiceSettings', speedFactor: 1, contract: 'amelie-teaching-warm-r6-v1' }),
      AMELIE_TEACHING_WARM_R10: Object.freeze({ energy: 'smiling-cafe-teacher', pauseStyle: 'warm-consistent-conversational', voiceSettingsKey: 'teachingWarmR10VoiceSettings', speedFactor: 1, contract: 'amelie-teaching-warm-r10-v1' }),
      AMELIE_OUTRO: Object.freeze({ energy: 'smiling-inviting', pauseStyle: 'short-natural', voiceSettingsKey: 'outroVoiceSettings', speedFactor: 1 }),
    }),
    outroVoiceSettings: Object.freeze({
      stability: 0.32,
      similarity_boost: 0.78,
      style: 0.38,
      use_speaker_boost: true,
    }),
  }),
});

const DEFAULT_NARRATION_PRESET = 'warm-engaging-fr-ca';

const COMPONENT_LABELS_FR_CA = Object.freeze({
  'Age I Cards': 'Cartes de l’Âge I',
  'Age II Cards': 'Cartes de l’Âge II',
  'Age III Cards': 'Cartes de l’Âge III',
  'Wonder Cards': 'Cartes Merveille',
  'Coins': 'Pièces',
  'Military Track': 'Piste militaire',
  'Science Tokens': 'Jetons Science',
  'Progress Tokens': 'Jetons Progrès',
  'Game Board': 'Plateau de jeu',
  'Tiles & Markers': 'Tuiles et marqueurs',
  'Player Boards': 'Plateaux individuels',
  'The generation marker measures': 'Le marqueur de génération indique',
  'Ocean Tiles': 'Tuiles Océan',
  'Corporation Boards': 'Plateaux de corporation',
  'Resource Cubes': 'Cubes de ressources',
  'Project Cards': 'Cartes Projet',
});

function localizeComponentLabel(value, { locale = 'fr-CA' } = {}) {
  const sourceLabel = clean(value);
  if (!sourceLabel || locale !== 'fr-CA') return { sourceLabel, displayLabelFrCa: sourceLabel, spokenLabel: sourceLabel };
  const displayLabelFrCa = COMPONENT_LABELS_FR_CA[sourceLabel] || sourceLabel
    .replace(/\bCoins\b/gi, 'Pièces')
    .replace(/\bAge I Cards\b/gi, 'Cartes de l’Âge I');
  return { sourceLabel, displayLabelFrCa, spokenLabel: normalizeSpokenRomanNumerals(displayLabelFrCa) };
}

function localizeComponentLabels(values = [], options = {}) {
  return values.map((value) => localizeComponentLabel(value, options));
}

const BRAND_AUDIO_CONTRACT = Object.freeze({
  id: 'mobius-cafe-game-night-v4',
  version: '7',
  durationSec: 3.6,
  transitionBedSec: 3.0,
  sampleRate: 48000,
  channels: 2,
  layers: Object.freeze([
    Object.freeze({ id: 'room-murmur', kind: 'recorded-cafe-room-murmur', source: 'cafe-ambience-freesound-25813.mp3', gainDb: 0, selectedExcerptSec: Object.freeze([20, 23.6]), intelligibleSpeech: false, continuityRequired: true }),
    // Water is deliberately absent from the identity contour: the Director
    // rejected the previous waterfall-dominant mix. It may be reintroduced as
    // a subordinate texture only after a separate human review.
    Object.freeze({ id: 'cafe-cup-saucer', kind: 'recorded-continuous-coffee-pour-into-cup', source: 'kettle-pour-into-cup-cc0-60394.mp3', gainDb: -7.5, selectedExcerptSec: Object.freeze([0.15, 3.0]), minimumContinuousPourSec: 2.2, intelligibleSpeech: false, isolatedDropForbidden: true, license: 'CC0-1.0' }),
    Object.freeze({ id: 'dice-roll-landing', kind: 'recorded-dice-roll-and-landing-cue', gainDb: -8.5, intelligibleSpeech: false }),
  ]),
  transition: Object.freeze({ fadeInSec: 0.08, fadeOutSec: 0.18, carryoverSec: 3.0, narrationDuckDb: -6, roomBedContinuousAcrossSignature: true }),
});

const BRAND_VISUAL_CONTRACT = Object.freeze({
  asset: 'src/assets/branding/les-jeux-mobius-banner-canonical.png',
  sha256: '015235b6edb90e73b7ad9f0575f72786e1a450366e4f959dd110bdc07b682969',
  referenceDesignSha256: 'd94c2a9e9f5a2f5584db31a87c54277e577ab87f2bbff8b0954baa1e0b911671',
  historicalSourceSha256: 'b067ba4bab66316c5a644ad8f77258cf2230e9b07fe02b2a78155f87325379c8',
  placement: 'canonical-bookends',
  source: 'director-approved-historical-local-banner-cropped',
});

const BRAND_STYLE_CONTRACT = Object.freeze({
  version: 'mobius-banner-style-v1',
  palette: Object.freeze({
    background: PRESENTATION_TOKENS.colors.brandInk,
    primary: PRESENTATION_TOKENS.colors.brandGreen,
    accent: PRESENTATION_TOKENS.colors.panelHighlight,
    text: PRESENTATION_TOKENS.colors.brandCream,
    muted: PRESENTATION_TOKENS.colors.muted,
  }),
  typography: Object.freeze({
    heading: PRESENTATION_TOKENS.typography.display.family,
    body: PRESENTATION_TOKENS.typography.body.family,
    fallbacks: ['Arial', 'sans-serif'],
  }),
});

const ORDINAL_REPLACEMENTS = [
  [/\bpremièrement\s*,?\s*/gi, 'D’abord, '],
  [/\bdeuxièmement\s*,?\s*/gi, 'Ensuite, '],
  [/\btroisièmement\s*,?\s*/gi, 'Puis, '],
  [/\bquatrièmement\s*,?\s*/gi, 'Ensuite, '],
  [/\bcinquièmement\s*,?\s*/gi, 'Puis, '],
  [/\bsixièmement\s*,?\s*/gi, 'Ensuite, '],
  [/\bseptièmement\s*,?\s*/gi, 'Puis, '],
  [/\bhuitièmement\s*,?\s*/gi, 'Enfin, '],
  [/\bneuvièmement\s*,?\s*/gi, 'Pour terminer, '],
];

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keep file/source identities out of spoken copy.  These values are useful to
 * the pipeline but are never useful to a viewer listening to Amélie.
 */
function sanitizeSpokenGameName(value, fallback = 'ce jeu') {
  return sanitizeIdentitySpokenGameName(value, fallback);
}

const SECTION_LABELS = [
  [/objectif|but|mission/i, 'Objectif'],
  [/composant|matériel|materiel/i, 'Composants'],
  [/mise en place|préparation|preparation|installation|setup/i, 'Mise en place'],
  [/tour|manche|round|déroulement|deroulement/i, 'Tour de jeu'],
  [/action|jouer|phase principale/i, 'Actions'],
  [/placement|poser|installer/i, 'Placement'],
  [/fin|termin|condition/i, 'Fin de partie'],
  [/score|point|décompte|decompte|victoire/i, 'Calcul des points'],
  [/conseil|variante|solo|exception/i, 'Conseils et variantes'],
  [/introduction|présentation|presentation|bienvenue/i, 'Présentation'],
  [/conclusion|résumé|resume/i, 'Conclusion'],
];

function sectionLabelFor(value, fallback = 'Tutoriel') {
  const section = clean(value);
  const match = SECTION_LABELS.find(([pattern]) => pattern.test(section));
  return match ? match[1] : (section || fallback);
}

function sectionLabelForContent(value, content = '', fallback = 'Tutoriel') {
  const label = sectionLabelFor(value, fallback);
  const itemCount = String(content || '').split(/\r?\n/).map(clean).filter(Boolean).length;
  return label === 'Objectif' && itemCount > 1 ? 'Objectifs' : label;
}

function prepareNarrationText(value) {
  let text = clean(value);
  for (const [pattern, replacement] of ORDINAL_REPLACEMENTS) text = text.replace(pattern, replacement);
  text = text
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*—\s*/g, ' — ')
    .replace(/\s*\|\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .trim();
  return normalizeSpokenSymbols(text);
}

const FRENCH_NUMBERS = Object.freeze({
  0: 'zéro', 1: 'un', 2: 'deux', 3: 'trois', 4: 'quatre', 5: 'cinq',
  6: 'six', 7: 'sept', 8: 'huit', 9: 'neuf', 10: 'dix', 11: 'onze',
  12: 'douze', 13: 'treize', 14: 'quatorze', 15: 'quinze', 16: 'seize',
  17: 'dix-sept', 18: 'dix-huit', 19: 'dix-neuf', 20: 'vingt',
  30: 'trente', 40: 'quarante', 50: 'cinquante', 60: 'soixante',
  70: 'soixante-dix', 80: 'quatre-vingts', 90: 'quatre-vingt-dix', 100: 'cent', 120: 'cent vingt',
});

function frenchNumber(value) {
  const number = Number(value);
  if (FRENCH_NUMBERS[number]) return FRENCH_NUMBERS[number];
  if (number > 20 && number < 70) {
    const tens = Math.floor(number / 10) * 10;
    const units = number % 10;
    return `${FRENCH_NUMBERS[tens]}${units ? `-${FRENCH_NUMBERS[units]}` : ''}`;
  }
  return String(value);
}

function normalizeSpokenSymbols(value) {
  return normalizeContextualRomanNumerals(String(value || ''))
    .replace(/(Âge|Age)\s+III\b/gi, 'âge trois')
    .replace(/(Âge|Age)\s+II\b/gi, 'âge deux')
    .replace(/(Âge|Age)\s+I\b/gi, 'âge un')
    .replace(/\+(\d+)\s*°\s*C/gi, (_, number) => `plus ${frenchNumber(number)} degrés Celsius`)
    .replace(/(\d+)\s*°\s*C/gi, (_, number) => `${frenchNumber(number)} degrés Celsius`)
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, (_, number) => `${frenchNumber(String(number).replace(',', '.'))} pour cent`)
    .replace(/\b(\d+)\s+(tuiles?|océans?|cartes?|joueurs?)\b/gi, (_, number, noun) => `${frenchNumber(number)} ${noun}`)
    .replace(/\b(tuiles?|océans?|cartes?)\s*:\s*(\d+)\b/gi, (_, noun, number) => `${noun}: ${frenchNumber(number)}`);
}

function normalizeContextualRomanNumerals(value) {
  // Roman numerals remain untouched in display copy. In narration, normalize
  // only when nearby semantics prove they are numbered game labels. This
  // avoids globally rewriting a legitimate letter I or a proper name.
  return String(value || '')
    .replace(/\b((?:dos|paquets?|decks?|cartes?|âges?|ages?|phases?|chapitres?)[^.!?]{0,48}?[:：]?\s*)I\s*,\s*II\s+(et|ou)\s+III\b/gi,
      (_, prefix, conjunction) => `${prefix}un, deux ${conjunction.toLowerCase()} trois`)
    .replace(/\b((?:âge|age|phase|chapitre)\s+)III\b/gi, '$1trois')
    .replace(/\b((?:âge|age|phase|chapitre)\s+)II\b/gi, '$1deux')
    .replace(/\b((?:âge|age|phase|chapitre)\s+)I\b/gi, '$1un');
}

function normalizeSpokenRomanNumerals(value) {
  return normalizeContextualRomanNumerals(value)
    .replace(/(Âge|Age)\s+III\b/gi, 'âge trois')
    .replace(/(Âge|Age)\s+II\b/gi, 'âge deux')
    .replace(/(Âge|Age)\s+I\b/gi, 'âge un');
}

function formatPlayerCount(value) {
  const raw = clean(value).replace(/[–—]/g, '-');
  const range = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) return `${frenchNumber(range[1])} à ${frenchNumber(range[2])} joueurs`;
  return raw ? `${frenchNumber(raw.replace(/\D/g, ''))} joueur${raw === '1' ? '' : 's'}` : '';
}

function formatOpeningMetadataNarration({ identity = {}, metadata = {}, themeHook = '' } = {}) {
  const name = sanitizeSpokenGameName(identity.pronunciationRepresentation || identity.spokenName || identity.displayName);
  const sentences = [`Bienvenue sur la chaîne Les Jeux Mobius. Aujourd’hui, nous allons découvrir ensemble ${name}.`];
  const players = formatPlayerCount(metadata.playerCount);
  const duration = clean(metadata.gameLength).replace(/\bmin\b/gi, 'minutes');
  const durationRange = duration.match(/(\d+)\s*(?:-|–|à)\s*(\d+)/);
  const durationNumber = duration.match(/\d+/)?.[0];
  const durationPhrase = durationRange
    ? `${frenchNumber(durationRange[1])} à ${frenchNumber(durationRange[2])} minutes`
    : (durationNumber ? `${frenchNumber(durationNumber)} minutes` : '');
  const practical = [];
  if (players) practical.push(`C’est un jeu pour ${players}`);
  if (durationPhrase) practical.push(`d’une durée d’environ ${durationPhrase}`);
  if (practical.length) sentences.push(`${practical.join(', ')}.`);
  const designer = Array.isArray(metadata.designers) ? metadata.designers.filter(Boolean).join(' et ') : clean(metadata.designer);
  const publisher = clean(metadata.publisher);
  if (designer || publisher) {
    if (designer && publisher) sentences.push(`Il a été conçu par ${designer} et publié par ${publisher}.`);
    else if (designer) sentences.push(`Il a été conçu par ${designer}.`);
    else if (publisher) sentences.push(`Il a été publié par ${publisher}.`);
  }
  const identityAliases = [
    identity.displayName,
    identity.officialEditionTitle,
    identity.sourceTitle,
    ...(Array.isArray(identity.titleAliases) ? identity.titleAliases : []),
  ].filter(Boolean);
  let hook = clean(themeHook).split(/(?<=[.!?])\s+/)[0]
    .replace(/^Bienvenue dans l’univers de [^,]+,\s*/i, '')
    .replace(/^Bienvenue dans l'univers de [^,]+,\s*/i, '')
    .trim();
  for (const alias of identityAliases) {
    hook = hook.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), name);
  }
  if (/^un jeu\b/i.test(hook)) hook = `C’est ${hook}`;
  if (hook) sentences.push(hook.charAt(0).toUpperCase() + hook.slice(1));
  return sentences.join(' ');
}

function buildThematicWelcome({ gameName = 'ce jeu', spokenName = '', firstNarration = '' } = {}) {
  const name = sanitizeSpokenGameName(spokenName || spokenRepresentation(gameName));
  const firstSentence = clean(firstNarration).split(/(?<=[.!?])\s+/)[0] || '';
  const sourceHook = firstSentence
    .replace(/^bienvenue\s+(?:dans|à)\s+/i, '')
    .replace(/^aujourd['’]hui,?\s*/i, '')
    .trim();
  const clauses = sourceHook.split(/[,:;]/).map(clean).filter(Boolean);
  const hookSource = clauses.find((clause) => !clause.toLocaleLowerCase('fr-CA').includes(name.toLocaleLowerCase('fr-CA'))) || clauses[0] || '';
  const conciseHook = hookSource
    .replace(/[.!?]+$/, '')
    .replace(/\s+pour\s+(?:deux|trois|quatre|cinq|six|de|la plupart).*$/i, '')
    .trim();
  const hook = conciseHook.length > 58 ? `${conciseHook.slice(0, 55).replace(/\s+\S*$/, '')}…` : conciseHook;
  return [
    `Bienvenue sur la chaîne Les Jeux Mobius. Aujourd’hui, nous allons découvrir ensemble ${name}${hook ? ` — ${hook}` : ''}.`,
  ].join(' ');
}

function buildPresentationMentalModel({ narration = '', onScreenText = '' } = {}) {
  const source = clean(narration);
  const nameLead = source
    .replace(/^(?:bienvenue\s+)?dans\s+[^,]+,\s*/i, '')
    .replace(/^aujourd['’]hui,?\s*/i, '');
  const atoms = nameLead
    .split(/(?<=[.!?])\s+|,\s+(?=(?:en|pour|afin|tout en|et)\b)/i)
    .map(clean)
    .filter(Boolean)
    .map((atom) => atom.replace(/\s+(?:et\s+)?(?:viser|chercher|obtenir|remporter)\b.*$/i, '').trim())
    .filter(Boolean)
    .filter((atom) => !/\b(?:victoire|gagner|gagne|objectif|but)\b/i.test(atom));
  const fallback = clean(onScreenText).split(/\r?\n|(?<=[.!?])\s+/).map(clean).filter(Boolean);
  const sourceAtoms = atoms.length >= 2 ? atoms : [...atoms, ...fallback];
  const selected = sourceAtoms
    .map((atom) => atom.replace(/[.!?]+$/, '').trim())
    .filter((atom, index, values) => values.findIndex((value) => value.toLocaleLowerCase('fr-CA') === atom.toLocaleLowerCase('fr-CA')) === index)
    .slice(0, 3)
    .map((atom) => atom ? atom.charAt(0).toLocaleUpperCase('fr-CA') + atom.slice(1) : atom);
  return selected.join('\n');
}

function setupLabelsFromNarration(narration) {
  const labels = [];
  const sentences = clean(narration).split(/(?<=[.!?])\s+/).filter(Boolean);
  for (const sentence of sentences) {
    const match = sentence.match(/\b(?:placez|mélangez|posez|révélez|formez|recevez|rangez|désignez|disposez|mettez|installez|préparez)\s+(?:les?|une?|un)?\s*([^,.]+)/i);
    if (!match) continue;
    let label = clean(match[1]);
    label = label.replace(/^.*?\bavec\s+(?:les?|une?|un)?\s*/i, (value) => /réserve/i.test(value) ? '' : value);
    label = label
      .replace(/\b(?:face cachée?|à proximité|sur leur piste|dans la cour|au centre de la table|sur la case de départ indiquée de sa piste|dans une coupelle).*$/i, '')
      .replace(/\s+(?:sur|dans|au|à|près de|face à)\s+.*$/i, '')
      .replace(/\s+(?:et|puis|afin de|pour)\s+.*$/i, '')
      .replace(/^aléatoirement\s+/i, '')
      .replace(/^(?:une?|un|les?|des|dix)\s+/i, '')
      .trim();
    if (label && !labels.some((item) => item.toLowerCase() === label.toLowerCase())) labels.push(label);
  }
  return labels.slice(0, 6);
}

function buildEditorialSupport({ section = '', narration = '', onScreenText = '' } = {}) {
  const normalizedSection = clean(section);
  const setup = /mise en place|setup|installation/i.test(normalizedSection);
  if (setup) {
    const labels = setupLabelsFromNarration(narration);
    if (labels.length > 0) {
      const visibleCount = buildSetupCallouts(labels).length || labels.length;
      const prefix = visibleCount > 1 ? `Repères 1 à ${visibleCount}` : 'Repère 1';
      return {
        text: `${prefix} — ${labels.slice(0, 3).join(' • ')}${labels.length > 3 ? '…' : ''}`,
        grouped: true,
        labels,
      };
    }
  }
  const source = clean(onScreenText);
  if (/présentation|presentation/i.test(normalizedSection)) {
    const model = buildPresentationMentalModel({ narration, onScreenText });
    if (model) return { text: model, grouped: false, labels: [], contentType: 'presentation-mental-model' };
  }
  const pieces = source.split(/\s*[|\n]\s*|(?<=[.!?])\s+/).map(clean).filter(Boolean);
  let concise = pieces[0] || source;
  const semanticBoundary = concise.search(/\b(?:Menace|Lieux|Pour les interactions)\b/i);
  if (semanticBoundary > 32) concise = concise.slice(0, semanticBoundary).trim();
  const maxChars = 80;
  const text = concise.length > maxChars
    ? `${concise.slice(0, maxChars).replace(/\s+\S*$/, '')}…`
    : concise;
  return { text: text.trim(), grouped: false, labels: [] };
}

function buildSetupCallouts(labels = [], existing = []) {
  if (Array.isArray(existing) && existing.length > 0) return existing;
  const safeLabels = labels.filter(Boolean).slice(0, 6);
  const semanticAnchor = (value) => {
    const normalized = clean(value).toLowerCase();
    if (/plateau|board|tableau/.test(normalized)) return { x: 0.56, y: 0.48 };
    if (/carte|deck|paquet|exploration/.test(normalized)) return { x: 0.16, y: 0.18 };
    if (/seigneur|cour|marché|market/.test(normalized)) return { x: 0.58, y: 0.72 };
    if (/menace|piste|track/.test(normalized)) return { x: 0.94, y: 0.28 };
    if (/clé|key|monstre|token|jeton/.test(normalized)) return { x: 0.94, y: 0.72 };
    if (/perle|coupelle|trésor|réserve|supply/.test(normalized)) return { x: 0.52, y: 0.88 };
    // No trustworthy generic anchor exists for abstract actions such as
    // choosing a first player or an object absent from the overview.
    return null;
  };
  let number = 0;
  return safeLabels.map((label) => {
    const target = semanticAnchor(label);
    if (!target) return null;
    number += 1;
    const x = target.x;
    const y = target.y;
    return {
      kind: 'arrow', number, label: String(number), caption: label,
      target: { x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) },
      lineFrom: { x: Number(Math.max(0.05, x - 0.12).toFixed(4)), y: Number(Math.min(0.9, y + 0.12).toFixed(4)) },
      appearSec: Number(((number - 1) * 0.55).toFixed(2)),
    };
  }).filter(Boolean);
}

function getNarrationPreset(id = DEFAULT_NARRATION_PRESET) {
  const preset = NARRATION_PRESETS[id];
  if (!preset) throw new Error(`Unknown MOBIUS narration preset '${id}'.`);
  return preset;
}

function getNarrationDeliveryProfile(profile = 'AMELIE_TEACHING', presetId = DEFAULT_NARRATION_PRESET) {
  const preset = getNarrationPreset(presetId);
  return preset.deliveryProfiles?.[profile] || preset.deliveryProfiles?.AMELIE_TEACHING;
}

function getEditorialContract({ narrationPreset = DEFAULT_NARRATION_PRESET } = {}) {
  const preset = getNarrationPreset(narrationPreset);
  return {
    version: EDITORIAL_CONTRACT_VERSION,
    narrationPreset: preset.id,
    narrationPresetVersion: preset.version,
    brandAudio: BRAND_AUDIO_CONTRACT,
    brandStyle: BRAND_STYLE_CONTRACT,
    visualPolicy: {
    visualDominant: true,
      panelWidthRatio: 0.30,
      visualWidthRatio: 0.62,
      maxSupportChars: 110,
      languageAware: true,
      citationPlacement: 'bottom-left',
      banner: BRAND_VISUAL_CONTRACT,
    },
  };
}

function estimateTeachingLayout({ width = 1920, height = 1080, panelWidthRatio = 0.22, visualWidthRatio = 0.72 } = {}) {
  const marginX = Math.round(width * 0.08);
  const contentWidth = width - (marginX * 2);
  const panelWidth = Math.round(contentWidth * Math.min(0.30, Math.max(0.18, panelWidthRatio)));
  const visualWidth = Math.round(contentWidth * Math.min(0.76, Math.max(0.62, visualWidthRatio)));
  const gap = Math.max(24, contentWidth - panelWidth - visualWidth);
  const panel = { x: marginX, y: Math.round(height * 0.15), width: panelWidth, height: Math.round(height * 0.68) };
  const visual = { x: marginX + panelWidth + gap, y: Math.round(height * 0.11), width: visualWidth, height: Math.round(height * 0.78) };
  return {
    panel,
    visual,
    overlap: !(panel.x + panel.width <= visual.x || visual.x + visual.width <= panel.x),
    visualAreaRatio: Number((visual.width / contentWidth).toFixed(4)),
  };
}

function isConciseSupportText(value, maxChars = 150) {
  return clean(value).length <= maxChars;
}

function classifyVisualLanguage({ visualKind = '', assetPath = '', metadata = {}, language = 'fr-CA' } = {}) {
  if (language !== 'fr-CA') return 'not-applicable';
  if (metadata.languageNeutral || metadata.physicalComponent) return 'language-neutral-component';
  if (metadata.textLanguage === 'fr') return 'french-localized';
  if (metadata.textLanguage === 'en' || metadata.foreignTextDensity > 0.25) return 'english-explanatory';
  if (visualKind === 'fallback' || /page[-_]/i.test(String(assetPath))) return 'english-source-uncertain';
  return 'language-unknown';
}

const CRITICAL_P2_CATEGORIES = new Set([
  'teaching_clarity', 'visual_relevance_and_variety', 'french_visual_coherence',
  'layout_and_legibility', 'audio_identity_and_continuity', 'screen_space_utilization',
]);

function findingIsConfirmed(finding) {
  // A partial disposition is evidence for editorial follow-up, but it is not
  // the same claim as a physically confirmed release blocker.  The release
  // gate must reflect the user's explicit confirmed/partial distinction.
  return finding?.physicalVerification?.status === 'confirmed'
    || finding?.status === 'confirmed';
}

/**
 * Deterministic MOBIUS release disposition. External critics are evidence only
 * after physical disposition; their raw score can never hard-fail a release.
 */
function evaluateProfessionalReleaseGate({
  deterministicPass = false,
  visuals = {},
  editorial = {},
  media = {},
  captions = {},
  chapters = {},
  narration = {},
  provenance = {},
  branding = {},
  physicalReview = {},
  calibration = {},
} = {}) {
  const blockers = [];
  if (!deterministicPass) blockers.push('deterministic-production-failed');
  if (Number(visuals.missing || 0) > 0) blockers.push('missing-visual-bindings');
  if (Number(editorial.layoutCollisions?.length || editorial.layoutCollisionCount || 0) > 0) blockers.push('layout-collision');
  // The production validator exposes `blocks`; accept its canonical shape as
  // well as the compact DTOs used by callers/tests.  A valid SRT must not be
  // downgraded merely because the gate used a different field name.
  if (Number(captions.blocks || captions.count || captions.cueCount || 0) <= 0 || captions.valid === false) blockers.push('caption-contract-failed');
  if (Number(chapters.count || 0) <= 0 || chapters.order === 'invalid') blockers.push('chapter-contract-failed');
  if (narration.complete === false || Number(narration.total || 0) <= 0) blockers.push('narration-incomplete');
  if (provenance.sourceGrounded === false || provenance.complete === false) blockers.push('provenance-incomplete');
  if (branding.bannerPresent === false || branding.introPresent === false || branding.outroPresent === false) blockers.push('brand-bookends-missing');
  if (media.valid === false || media.video?.width < 1920 || media.video?.height < 1080) blockers.push('media-contract-failed');

  const findings = Array.isArray(calibration.findings) ? calibration.findings : [];
  const confirmed = findings.filter(findingIsConfirmed);
  const confirmedP0 = confirmed.filter((finding) => finding.severity === 'P0');
  const confirmedP1 = confirmed.filter((finding) => finding.severity === 'P1');
  const confirmedCriticalP2 = confirmed.filter((finding) => finding.severity === 'P2' && CRITICAL_P2_CATEGORIES.has(finding.category));
  if (confirmedP0.length) blockers.push('confirmed-p0');
  if (confirmedP1.length) blockers.push('confirmed-p1');
  if (confirmedCriticalP2.length) blockers.push('confirmed-critical-p2');

  const physicalReviewCompleted = physicalReview.completed === true;
  if (!physicalReviewCompleted) blockers.push('physical-review-incomplete');
  const verifiedScore = Number(calibration.verified_external_qa_score_10 ?? calibration.verifiedScore ?? NaN);
  const scoreException = calibration.scoreException;
  const scorePass = Number.isFinite(verifiedScore) && verifiedScore >= 8.5;
  const exceptionPass = Boolean(scoreException?.accepted && String(scoreException.basis || '').trim().length >= 40);
  const hardBlocker = blockers.some((blocker) => !['physical-review-incomplete'].includes(blocker));
  let verdict = 'PUBLISHABLE';
  if (hardBlocker) verdict = 'NOT_READY';
  else if (!physicalReviewCompleted || (!scorePass && !exceptionPass)) verdict = 'PROFESSIONAL_CANDIDATE';
  return {
    version: PROFESSIONAL_RELEASE_GATE_VERSION,
    verdict,
    deterministicPass: Boolean(deterministicPass),
    verifiedScore: Number.isFinite(verifiedScore) ? verifiedScore : null,
    scoreRequirement: scorePass ? 'verified-score>=8.5' : exceptionPass ? 'exceptional-physical-justification' : 'verified-score>=8.5-required',
    scoreException: exceptionPass ? scoreException : null,
    confirmedCounts: {
      total: confirmed.length,
      p0: confirmedP0.length,
      p1: confirmedP1.length,
      criticalP2: confirmedCriticalP2.length,
    },
    rejectedCount: Number(calibration.finding_status_counts?.rejected || 0),
    partialCount: Number(calibration.finding_status_counts?.partially_confirmed || 0),
    unresolvedVerifiedBlockers: blockers,
    physicalReviewRequired: true,
    physicalReviewCompleted,
    hardGates: {
      deterministicPass: Boolean(deterministicPass),
      missingVisuals: Number(visuals.missing || 0),
      layoutCollisions: Number(editorial.layoutCollisions?.length || editorial.layoutCollisionCount || 0),
      confirmedP0: confirmedP0.length,
      confirmedP1: confirmedP1.length,
      confirmedCriticalP2: confirmedCriticalP2.length,
    },
  };
}

module.exports = {
  EDITORIAL_CONTRACT_VERSION,
  NARRATION_PRESETS,
  DEFAULT_NARRATION_PRESET,
  BRAND_AUDIO_CONTRACT,
  prepareNarrationText,
  buildEditorialSupport,
  buildSetupCallouts,
  getNarrationPreset,
  getNarrationDeliveryProfile,
  getEditorialContract,
  estimateTeachingLayout,
  isConciseSupportText,
  classifyVisualLanguage,
  BRAND_VISUAL_CONTRACT,
  BRAND_STYLE_CONTRACT,
  buildThematicWelcome,
  formatOpeningMetadataNarration,
  frenchNumber,
  normalizeSpokenSymbols,
  normalizeSpokenRomanNumerals,
  normalizeContextualRomanNumerals,
  sanitizeSpokenGameName,
  sectionLabelFor,
  sectionLabelForContent,
  localizeComponentLabel,
  localizeComponentLabels,
  PROFESSIONAL_RELEASE_GATE_VERSION,
  evaluateProfessionalReleaseGate,
};
