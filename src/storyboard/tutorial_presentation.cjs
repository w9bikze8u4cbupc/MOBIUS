const {
  DEFAULT_NARRATION_PRESET,
  BRAND_AUDIO_CONTRACT,
  buildEditorialSupport,
  buildSetupCallouts,
  getEditorialContract,
  buildThematicWelcome,
  formatOpeningMetadataNarration,
  prepareNarrationText,
  sectionLabelForContent,
} = require('../services/editorialStandard.cjs');
const { PRESENTATION_TOKENS, resolvePresentationLayout, resolvePanelStyle } = require('../services/presentationDesignSystem.cjs');

const DEFAULT_BRAND = Object.freeze({
  channelName: 'Les Jeux Mobius',
  language: 'fr-CA',
  bannerPath: 'src/assets/branding/les-jeux-mobius-banner-canonical.png',
  narration: Object.freeze({
    provider: 'elevenlabs',
    voiceName: 'Amélie',
    voiceIdEnv: 'ELEVENLABS_VOICE_ID_AMELIE',
    preset: DEFAULT_NARRATION_PRESET,
  }),
  introText: '',
  outroText: 'Merci d’avoir joué avec moi! Si la vidéo vous a aidés, pensez à vous abonner à la chaîne Les Jeux Mobius et à laisser un petit pouce. Activez les notifications, puis dites-moi en commentaire quel jeu vous aimeriez qu’on découvre ensemble la prochaine fois!',
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
  const contiguous = pages.every((page, index) => index === 0 || page === pages[index - 1] + 1);
  if (contiguous && pages.length > 1) return `Livret p. ${pages[0]}–${pages.at(-1)}`;
  return `Livret p. ${pages.join(', ')}`;
}

function buildBrandIntro({ bannerPath = DEFAULT_BRAND.bannerPath, audio = null, brand = DEFAULT_BRAND, gameName = null, themeHook = '' } = {}) {
  const ambientAudio = audio && audio.ambientFile ? {
    ambientFile: audio.ambientFile,
    ambientGain: audio.ambientGain,
    ambientFadeOutSec: audio.ambientFadeOutSec,
    preMastered: true,
    audioRole: 'café-ludique sonic signature',
    speechRequired: false,
  } : { audioRole: 'café-ludique sonic signature', speechRequired: false };
  return {
    id: 'brand-intro',
    type: 'brand_intro',
    chapterTitle: 'Bienvenue',
    durationSec: brand.audioSignature?.durationSec || BRAND_AUDIO_CONTRACT.durationSec,
    narrationText: '',
    spokenNarration: 'NONE',
    ttsGenerated: false,
    audio: ambientAudio,
    background: bannerPath ? { image: bannerPath, kind: 'brand-banner' } : { color: '#151a21' },
    layout: { mode: 'brand', visualSide: 'center', brandBanner: true },
    editorial: getEditorialContract({ narrationPreset: brand.narration.preset }),
    // The approved banner already carries the complete Mobius identity.
    // Additional title/slogan overlays made the signature visually redundant.
    overlays: [],
  };
}

function buildBrandOutro({ bannerPath = DEFAULT_BRAND.bannerPath, audio = null, brand = DEFAULT_BRAND } = {}) {
  return {
    id: 'brand-outro',
    type: 'brand_outro',
    chapterTitle: 'Merci et à bientôt',
    durationSec: brand.audioSignature?.durationSec || BRAND_AUDIO_CONTRACT.durationSec,
    narrationText: brand.outroText,
    audio,
    background: bannerPath ? { image: bannerPath, kind: 'brand-banner' } : { color: '#151a21' },
    layout: { mode: 'brand', visualSide: 'center', brandBanner: true },
    editorial: getEditorialContract({ narrationPreset: brand.narration.preset }),
    overlays: [],
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
  preserveLineBreaks = false,
}) {
  const current = Number(index) + 1;
  const normalizedSection = cleanText(section) || 'Tutoriel';
  const imageSide = current % 2 === 1 ? 'right' : 'left';
  const textSide = imageSide === 'right' ? 'left' : 'right';
  const reference = sourceReference(sourcePages);
  const editorialSupport = buildEditorialSupport({ section, narration, onScreenText });
  const displayText = Array.isArray(onScreenText)
    ? onScreenText.map(cleanText).filter(Boolean).join('\n')
    : String(onScreenText || '');
  const isPresentation = /présentation|presentation/i.test(normalizedSection);
  const supportText = !isPresentation && preserveLineBreaks && displayText.includes('\n') ? displayText : editorialSupport.text;
  const stepLabel = sectionLabelForContent(normalizedSection, supportText, 'Tutoriel');
  const normalizedCallouts = buildSetupCallouts(editorialSupport.labels, Array.isArray(callouts) ? callouts : []);
  const derivedFocus = visualFocus || normalizedCallouts.find((callout) => callout?.target)?.target || null;
  const layoutSpec = resolvePresentationLayout({
    itemCount: String(supportText || '').split(/\r?\n/).filter(Boolean).length || 1,
    maxItemLength: Math.max(...String(supportText || '').split(/\r?\n/).map((line) => line.length), 24),
    contentType: preserveLineBreaks ? 'list' : 'body',
    adjacentVisualRatio: preserveLineBreaks ? 0.56 : 0.58,
  });
  // Short right-hand presentations read best as a centered callout, while
  // longer instructional copy remains left aligned inside the panel.
  const bodyAlign = textSide === 'right' && String(supportText || '').length < 110
    ? 'center'
    : 'left';

  return {
    id,
    type: 'teaching',
    chapterTitle: stepLabel,
    narrationText: prepareNarrationText(narration),
    audio,
    background,
    layout: {
      mode: 'split-teaching',
      imageSide,
      textSide,
      panelWidthRatio: layoutSpec.panelWidthRatio,
      visualWidthRatio: layoutSpec.visualWidthRatio,
      panelVariant: 'WARM_DARK',
      headingAlign: textSide === 'right' ? 'right' : 'left',
      bodyAlign,
      presentationLayout: layoutSpec,
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
      { type: 'badge', text: stepLabel, position: 'top', fontColor: PRESENTATION_TOKENS.colors.sectionAccent },
      ...(stepLabel.toLocaleLowerCase('fr-CA') === normalizedSection.toLocaleLowerCase('fr-CA')
        ? []
        : [{ type: 'heading', text: normalizedSection, position: 'panel-heading', fontColor: PRESENTATION_TOKENS.colors.brandCream }]),
      { type: 'body', text: supportText, position: 'panel-body', fontColor: PRESENTATION_TOKENS.colors.brandCream },
      ...(reference ? [{ type: 'reference', text: reference, position: 'reference-bottom-left', fontColor: PRESENTATION_TOKENS.colors.muted }] : []),
    ],
  };
}

function buildMetadataScene({
  gameName,
  identity = null,
  metadata = {},
  narration,
  sourcePages = [1],
  background,
  audio = null,
  visualKind = '',
  durationSec = 0,
}) {
  const displayName = cleanText(identity?.displayName || gameName) || 'le jeu';
  const spokenName = cleanText(identity?.pronunciationRepresentation || identity?.spokenName || displayName);
  const identitySpokenName = cleanText(identity?.spokenName || displayName);
  const formatDuration = (value) => cleanText(value).replace(/\bmin\b/gi, 'minutes');
  const formatAge = (value) => {
    const age = cleanText(value);
    return age && /\+$/.test(age) ? age : (age ? `${age}+` : '');
  };
  const formatWeight = (value) => {
    const weight = cleanText(value);
    const localized = weight.replace('.', ',');
    return localized && /\/\s*5$/.test(localized) ? localized.replace(/\s*\/\s*/, ' / ') : (localized ? `${localized} / 5` : '');
  };
  const primaryDetails = [
    metadata.playerCount && `Joueurs : ${metadata.playerCount}`,
    metadata.gameLength && `Durée : ${formatDuration(metadata.gameLength)}`,
    Array.isArray(metadata.designers) && metadata.designers.length ? `Auteurs : ${metadata.designers.join(' et ')}` : null,
    metadata.publisher && `Éditeur : ${metadata.publisher}`,
  ].filter(Boolean);
  const secondaryDetails = [
    metadata.minimumAge && `Âge minimum : ${formatAge(metadata.minimumAge)}`,
    metadata.weight && `Complexité : ${formatWeight(metadata.weight)}`,
    metadata.yearPublished && `Année : ${metadata.yearPublished}`,
    metadata.edition && `Édition : ${metadata.edition}`,
  ].filter(Boolean);
  const mechanics = [...(Array.isArray(metadata.mechanics) ? metadata.mechanics : []), ...(Array.isArray(metadata.categories) ? metadata.categories : [])]
    .map(cleanText).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).slice(0, 4);
  const details = [...primaryDetails, ...secondaryDetails];
  const scene = buildTeachingScene({
    id: 'metadata-card',
    index: 0,
    total: 1,
    section: 'À propos du jeu',
    narration: narration || formatOpeningMetadataNarration({ identity: { ...identity, displayName, spokenName }, metadata }),
    onScreenText: details.join('\n') || 'Les informations essentielles pour commencer',
    sourcePages,
    background,
    audio,
    visualKind,
    durationSec,
  });
  const layoutSpec = resolvePresentationLayout({
    itemCount: details.length || 1,
    maxItemLength: Math.max(...details.map((line) => line.length), 24),
    contentType: 'metadata',
    adjacentVisualRatio: 0.56,
    preferredFontPx: 48,
    minimumFontPx: 40,
  });
  scene.layout.panelWidthRatio = layoutSpec.panelWidthRatio;
  scene.layout.visualWidthRatio = layoutSpec.visualWidthRatio;
  scene.layout.presentationLayout = layoutSpec;
  scene.layout.panelVariant = 'WARM_DARK';
  scene.layout.metadataCard = true;
  const bodyOverlay = scene.overlays.find((overlay) => overlay.type === 'body');
  if (bodyOverlay) bodyOverlay.text = details.join('\n') || 'Les informations essentielles pour commencer';
  scene.overlays = [
    { type: 'title', text: displayName, position: 'metadata-title', fontColor: PRESENTATION_TOKENS.colors.brandCream },
    ...scene.overlays,
    ...(mechanics.length ? [{ type: 'tags', text: `Mécanismes : ${mechanics.join('  ·  ')}`, position: 'panel-tags', fontColor: PRESENTATION_TOKENS.colors.sectionAccent }] : []),
  ];
  scene.identity = identity || { displayName, spokenName: identitySpokenName, pronunciationRepresentation: spokenName };
  scene.metadataFields = {
    primary: primaryDetails,
    secondary: secondaryDetails,
    mechanics,
  };
  return scene;
}

function buildChapters(scenes = []) {
  let cursorSec = 0;
  return scenes.map((scene, index) => {
    const durationSec = Number(scene?.durationSec) || 0;
    const chapter = {
      index: index + 1,
      startSec: Number(cursorSec.toFixed(3)),
      title: cleanText(scene?.chapterTitle) || 'Tutoriel',
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
