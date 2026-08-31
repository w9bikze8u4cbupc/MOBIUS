const {
  DEFAULT_NARRATION_PRESET,
  BRAND_AUDIO_CONTRACT,
  buildEditorialSupport,
  buildSetupCallouts,
  getEditorialContract,
} = require('../services/editorialStandard.cjs');

const DEFAULT_BRAND = Object.freeze({
  channelName: 'Les Jeux Mobius',
  language: 'fr-CA',
  narration: Object.freeze({
    provider: 'elevenlabs',
    voiceName: 'Amélie',
    voiceIdEnv: 'ELEVENLABS_VOICE_ID_AMELIE',
    preset: DEFAULT_NARRATION_PRESET,
  }),
  introText: 'Bienvenue chez Les Jeux Mobius. Prenons un moment pour jouer mieux, ensemble.',
  outroText: 'Merci d’avoir joué avec Les Jeux Mobius. À bientôt pour une nouvelle partie.',
  audioSignature: BRAND_AUDIO_CONTRACT,
});

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sourceReference(sourcePages = []) {
  const pages = [...new Set((Array.isArray(sourcePages) ? sourcePages : [])
    .map(Number)
    .filter((page) => Number.isInteger(page) && page > 0))];
  if (pages.length === 0) return '';
  return pages.length === 1 ? `Livret p. ${pages[0]}` : `Livret pp. ${pages.join(', ')}`;
}

function buildBrandIntro({ bannerPath = null, audio = null, brand = DEFAULT_BRAND } = {}) {
  return {
    id: 'brand-intro',
    type: 'brand_intro',
    chapterTitle: 'Bienvenue',
    durationSec: 4.2,
    narrationText: brand.introText,
    audio,
    background: bannerPath ? { image: bannerPath } : { color: '#151a21' },
    layout: { mode: 'brand', visualSide: 'center' },
    editorial: getEditorialContract({ narrationPreset: brand.narration.preset }),
    overlays: [
      { type: 'kicker', text: 'LES JEUX', position: 'brand-kicker', fontColor: '#d9f6ff' },
      { type: 'title', text: brand.channelName, position: 'brand-title' },
      { type: 'body', text: 'Des tutoriels clairs pour jouer avec plaisir.', position: 'brand-subtitle' },
    ],
  };
}

function buildBrandOutro({ bannerPath = null, audio = null, brand = DEFAULT_BRAND } = {}) {
  return {
    id: 'brand-outro',
    type: 'brand_outro',
    chapterTitle: 'Merci et à bientôt',
    durationSec: 4.2,
    narrationText: brand.outroText,
    audio,
    background: bannerPath ? { image: bannerPath } : { color: '#151a21' },
    layout: { mode: 'brand', visualSide: 'center' },
    editorial: getEditorialContract({ narrationPreset: brand.narration.preset }),
    overlays: [
      { type: 'kicker', text: 'LES JEUX', position: 'brand-kicker', fontColor: '#d9f6ff' },
      { type: 'title', text: 'Merci d’avoir joué avec nous !', position: 'brand-title' },
      { type: 'body', text: 'À bientôt pour une nouvelle partie.', position: 'brand-subtitle' },
    ],
  };
}

function buildTeachingMotion({ visualKind = '', visualFocus = null, durationSec = 0 } = {}) {
  const rawAnchor = visualFocus?.anchor || visualFocus || {};
  const anchor = {
    x: Math.min(0.85, Math.max(0.15, Number(rawAnchor.x) || 0.5)),
    y: Math.min(0.85, Math.max(0.15, Number(rawAnchor.y) || 0.5)),
  };
  const canMove = Number(durationSec) >= 2.5;
  const isComponent = ['component', 'explicit-asset'].includes(visualKind);
  if (!canMove || !isComponent) return { type: 'hold', anchor };
  return {
    type: visualFocus ? 'focus-zoom' : 'slow-zoom',
    anchor,
    startScale: 1,
    endScale: visualFocus ? 1.08 : 1.045,
  };
}

function buildTeachingScene({
  id,
  index,
  total,
  section,
  narration,
  onScreenText,
  sourcePages = [],
  background,
  audio = null,
  callouts = [],
  completedSteps = [],
  visualKind = '',
  visualFocus = null,
  durationSec = 0,
}) {
  const current = Number(index) + 1;
  const normalizedSection = cleanText(section) || `Étape ${current}`;
  const stepLabel = `Étape ${current}/${total}`;
  const imageSide = current % 2 === 1 ? 'right' : 'left';
  const textSide = imageSide === 'right' ? 'left' : 'right';
  const reference = sourceReference(sourcePages);
  const editorialSupport = buildEditorialSupport({ section, narration, onScreenText });
  const normalizedCallouts = buildSetupCallouts(editorialSupport.labels, Array.isArray(callouts) ? callouts : []);
  const derivedFocus = visualFocus || normalizedCallouts.find((callout) => callout?.target)?.target || null;

  return {
    id,
    type: 'teaching',
    chapterTitle: normalizedSection,
    narrationText: cleanText(narration),
    audio,
    background,
    layout: {
      mode: 'split-teaching',
      imageSide,
      textSide,
      panelWidthRatio: 0.28,
      visualWidthRatio: 0.66,
      editorial: {
        contract: getEditorialContract({ narrationPreset: DEFAULT_NARRATION_PRESET }),
        visualDominant: true,
        groupedSetup: editorialSupport.grouped,
        supportTextChars: editorialSupport.text.length,
      },
      completedSteps: completedSteps.map(Number).filter((step) => Number.isInteger(step) && step > 0),
      visualFocus: derivedFocus,
    },
    callouts: normalizedCallouts,
    motion: buildTeachingMotion({ visualKind, visualFocus: derivedFocus, durationSec }),
    overlays: [
      { type: 'badge', text: stepLabel, position: 'top', fontColor: '#f5d76e' },
      { type: 'heading', text: normalizedSection, position: 'panel-heading', fontColor: '#ffffff' },
      { type: 'body', text: editorialSupport.text, position: 'panel-body', fontColor: '#ffffff' },
      ...(reference ? [{ type: 'reference', text: reference, position: 'reference-bottom', fontColor: '#d9e2ec' }] : []),
    ],
  };
}

function buildChapters(scenes = []) {
  let cursorSec = 0;
  return scenes.map((scene, index) => {
    const durationSec = Number(scene?.durationSec) || 0;
    const chapter = {
      index: index + 1,
      startSec: Number(cursorSec.toFixed(3)),
      title: cleanText(scene?.chapterTitle) || `Étape ${index + 1}`,
      sceneId: scene?.id || `scene-${index + 1}`,
    };
    cursorSec += Math.max(0, durationSec);
    return chapter;
  });
}

module.exports = {
  DEFAULT_BRAND,
  sourceReference,
  buildBrandIntro,
  buildBrandOutro,
  buildTeachingScene,
  buildTeachingMotion,
  buildChapters,
  buildEditorialSupport,
  buildSetupCallouts,
};
