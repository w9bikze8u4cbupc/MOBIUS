/**
 * Shared editorial contract for MOBIUS tutorials.
 * Policy and deterministic text/layout helpers only; provider calls and
 * rendering remain in their existing pipeline modules.
 */

const EDITORIAL_CONTRACT_VERSION = 'mobius-professional-editorial-v5';
const PROFESSIONAL_RELEASE_GATE_VERSION = 'mobius-professional-release-gate-v1';

const NARRATION_PRESETS = Object.freeze({
  'warm-engaging-fr-ca': Object.freeze({
    id: 'warm-engaging-fr-ca',
    version: '2',
    language: 'fr-CA',
    modelId: 'eleven_multilingual_v2',
    voiceSettings: Object.freeze({
      stability: 0.34,
      similarity_boost: 0.78,
      style: 0.32,
      use_speaker_boost: true,
    }),
    description: 'Warm, engaged, conversational French Canadian narration.',
  }),
});

const DEFAULT_NARRATION_PRESET = 'warm-engaging-fr-ca';

const BRAND_AUDIO_CONTRACT = Object.freeze({
  id: 'mobius-cafe-game-night-v2',
  version: '2',
  durationSec: 8.2,
  transitionBedSec: 5.8,
  sampleRate: 48000,
  channels: 2,
  layers: Object.freeze([
    Object.freeze({ id: 'signature-motif', kind: 'synthesized-music', gainDb: -22 }),
    Object.freeze({ id: 'room-murmur', kind: 'filtered-ambient-noise', gainDb: -27, intelligibleSpeech: false }),
    Object.freeze({ id: 'cafe-tableware', kind: 'subtle-cup-and-tabletop-sfx', gainDb: -24, intelligibleSpeech: false }),
    Object.freeze({ id: 'water-jet-ambience', kind: 'filtered-water-ambience', gainDb: -30, intelligibleSpeech: false }),
  ]),
  transition: Object.freeze({ fadeInSec: 0.18, fadeOutSec: 0.72, carryoverSec: 5.8, narrationDuckDb: -6 }),
});

const BRAND_VISUAL_CONTRACT = Object.freeze({
  asset: 'src/assets/branding/les-jeux-mobius-banner.png',
  sha256: '9f63df856527e6639706d2fb793bb74ed4b8c6eb1483a44d44ddec50d31df219',
  placement: 'canonical-bookends',
});

const BRAND_STYLE_CONTRACT = Object.freeze({
  version: 'mobius-banner-style-v1',
  palette: Object.freeze({ background: '#101416', primary: '#b7ef59', accent: '#f6d36b', text: '#ffffff', muted: '#c8d0d0' }),
  typography: Object.freeze({ heading: 'Inter SemiBold', body: 'Inter', fallbacks: ['Arial', 'sans-serif'] }),
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

function prepareNarrationText(value) {
  let text = clean(value);
  for (const [pattern, replacement] of ORDINAL_REPLACEMENTS) text = text.replace(pattern, replacement);
  return text
    .replace(/\s*:\s*/g, ': ')
    .replace(/\s*—\s*/g, ' — ')
    .replace(/\s*\|\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .trim();
}

function buildThematicWelcome({ gameName = 'ce jeu', firstNarration = '' } = {}) {
  const name = clean(gameName) || 'ce jeu';
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
    `Bienvenue chez Les Jeux Mobius! Installez-vous: ${name}${hook ? ` — ${hook}` : ''}. On se lance!`,
  ].join(' ');
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
      panelWidthRatio: 0.22,
      visualWidthRatio: 0.72,
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
  getEditorialContract,
  estimateTeachingLayout,
  isConciseSupportText,
  classifyVisualLanguage,
  BRAND_VISUAL_CONTRACT,
  BRAND_STYLE_CONTRACT,
  buildThematicWelcome,
  PROFESSIONAL_RELEASE_GATE_VERSION,
  evaluateProfessionalReleaseGate,
};
