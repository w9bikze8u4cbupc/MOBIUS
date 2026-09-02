const {
  DEFAULT_NARRATION_PRESET,
  BRAND_AUDIO_CONTRACT,
  buildEditorialSupport,
  buildSetupCallouts,
  getEditorialContract,
  buildThematicWelcome,
  sectionLabelFor,
} = require('../services/editorialStandard.cjs');

const DEFAULT_BRAND = Object.freeze({
  channelName: 'Les Jeux Mobius',
  language: 'fr-CA',
  bannerPath: 'src/assets/branding/les-jeux-mobius-banner.png',
  narration: Object.freeze({
    provider: 'elevenlabs',
    voiceName: 'Amélie',
    voiceIdEnv: 'ELEVENLABS_VOICE_ID_AMELIE',
    preset: DEFAULT_NARRATION_PRESET,
  }),
  introText: 'Bienvenue chez Les Jeux Mobius! Installez-vous autour de la table: on découvre le jeu ensemble.',
  outroText: 'Merci d’avoir joué avec Les Jeux Mobius! Si le tutoriel vous a aidé, aimez la vidéo, abonnez-vous, activez les notifications et dites-nous en commentaire comment s’est passée votre partie.',
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

function buildBrandIntro({ bannerPath = DEFAULT_BRAND.bannerPath, audio = null, brand = DEFAULT_BRAND, gameName = null, themeHook = '' } = {}) {
  return {
    id: 'brand-intro',
    type: 'brand_intro',
    chapterTitle: 'Bienvenue',
    durationSec: brand.audioSignature?.durationSec || 8.2,
    narrationText: gameName ? buildThematicWelcome({ gameName, firstNarration: themeHook }) : brand.introText,
    audio,
    background: bannerPath ? { image: bannerPath, kind: 'brand-banner' } : { color: '#151a21' },
    layout: { mode: 'brand', visualSide: 'center', brandBanner: true },
    editorial: getEditorialContract({ narrationPreset: brand.narration.preset }),
    overlays: [
      { type: 'kicker', text: 'LES JEUX', position: 'brand-kicker', fontColor: '#b7ef59' },
      { type: 'title', text: brand.channelName, position: 'brand-title' },
      { type: 'body', text: 'On s’installe, on écoute, puis on joue.', position: 'brand-subtitle' },
    ],
  };
}

function buildBrandOutro({ bannerPath = DEFAULT_BRAND.bannerPath, audio = null, brand = DEFAULT_BRAND } = {}) {
  return {
    id: 'brand-outro',
    type: 'brand_outro',
    chapterTitle: 'Merci et à bientôt',
    durationSec: brand.audioSignature?.durationSec || 8.2,
    narrationText: brand.outroText,
    audio,
    background: bannerPath ? { image: bannerPath, kind: 'brand-banner' } : { color: '#151a21' },
    layout: { mode: 'brand', visualSide: 'center', brandBanner: true },
    editorial: getEditorialContract({ narrationPreset: brand.narration.preset }),
    overlays: [
      { type: 'kicker', text: 'LES JEUX', position: 'brand-kicker', fontColor: '#b7ef59' },
      { type: 'title', text: 'Merci d’avoir joué avec nous !', position: 'brand-title' },
      { type: 'body', text: 'Aimez • Abonnez-vous • Activez les notifications • Commentez', position: 'brand-subtitle' },
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
  const isDemonstration = ['component', 'explicit-asset', 'focused-page-crop', 'focused-page-region'].includes(visualKind);
  if (!canMove || !isDemonstration) return { type: 'hold', anchor };
  return {
    type: visualFocus ? 'focus-zoom' : 'slow-zoom',
    anchor,
    startScale: 1,
    endScale: visualFocus ? 1.08 : (['focused-page-crop', 'focused-page-region'].includes(visualKind) ? 1.07 : 1.055),
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
  const normalizedSection = cleanText(section) || `Section ${current}`;
  const stepLabel = sectionLabelFor(normalizedSection, `Section ${current}`);
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
      panelWidthRatio: 0.22,
      visualWidthRatio: 0.72,
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
      { type: 'badge', text: stepLabel, position: 'top', fontColor: '#b7ef59' },
      { type: 'heading', text: normalizedSection, position: 'panel-heading', fontColor: '#ffffff' },
      { type: 'body', text: editorialSupport.text, position: 'panel-body', fontColor: '#ffffff' },
      ...(reference ? [{ type: 'reference', text: reference, position: 'reference-bottom-left', fontColor: '#b8c2cc' }] : []),
    ],
  };
}

function buildMetadataScene({
  gameName,
  metadata = {},
  narration,
  sourcePages = [1],
  background,
  audio = null,
  visualKind = '',
  durationSec = 0,
}) {
  const details = [
    metadata.playerCount && `Joueurs: ${metadata.playerCount}`,
    metadata.gameLength && `Durée: ${metadata.gameLength}`,
    metadata.minimumAge && `Âge: ${metadata.minimumAge}`,
    metadata.publisher && `Éditeur: ${metadata.publisher}`,
    Array.isArray(metadata.designers) && metadata.designers.length ? `Auteur: ${metadata.designers.join(', ')}` : null,
    metadata.weight && `Complexité: ${metadata.weight}`,
  ].filter(Boolean);
  return buildTeachingScene({
    id: 'metadata-card',
    index: 0,
    total: 1,
    section: 'À propos du jeu',
    narration: narration || `Avant de commencer, voici ${cleanText(gameName) || 'le jeu'} et les informations essentielles pour vous installer à la table.`,
    onScreenText: details.join(' • ') || 'Les informations essentielles pour commencer',
    sourcePages,
    background,
    audio,
    visualKind,
    durationSec,
  });
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
  buildMetadataScene,
  buildTeachingMotion,
  buildChapters,
  buildEditorialSupport,
  buildSetupCallouts,
};
