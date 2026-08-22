const DEFAULT_BRAND = Object.freeze({
  channelName: 'Les Jeux Mobius',
  language: 'fr-CA',
  narration: Object.freeze({
    provider: 'elevenlabs',
    voiceName: 'Amélie',
    voiceIdEnv: 'ELEVENLABS_VOICE_ID_AMELIE',
  }),
  introText: 'Bienvenue sur la chaîne Mobius.',
  outroText: 'Si vous avez aimé cette vidéo, laissez un pouce et abonnez-vous à la chaîne. Vos suggestions de jeux et vos questions sont toujours les bienvenues dans les commentaires. Merci d’avoir regardé cette vidéo des Jeux Mobius.',
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
    durationSec: 5,
    narrationText: brand.introText,
    audio,
    background: bannerPath ? { image: bannerPath } : { color: '#151a21' },
    layout: { mode: 'brand', visualSide: 'center' },
    overlays: [
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
    durationSec: 18,
    narrationText: brand.outroText,
    audio,
    background: bannerPath ? { image: bannerPath } : { color: '#151a21' },
    layout: { mode: 'brand', visualSide: 'center' },
    overlays: [
      { type: 'title', text: 'Merci d’avoir joué avec nous !', position: 'brand-title' },
      { type: 'body', text: 'Aimez, abonnez-vous et proposez votre prochain jeu en commentaire.', position: 'brand-subtitle' },
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
  const normalizedCallouts = Array.isArray(callouts) ? callouts : [];
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
      panelWidthRatio: 0.34,
      completedSteps: completedSteps.map(Number).filter((step) => Number.isInteger(step) && step > 0),
      visualFocus: derivedFocus,
    },
    callouts: normalizedCallouts,
    motion: buildTeachingMotion({ visualKind, visualFocus: derivedFocus, durationSec }),
    overlays: [
      { type: 'badge', text: stepLabel, position: 'top', fontColor: '#f5d76e' },
      { type: 'heading', text: normalizedSection, position: 'panel-heading', fontColor: '#ffffff' },
      { type: 'body', text: cleanText(onScreenText), position: 'panel-body', fontColor: '#ffffff' },
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
};
