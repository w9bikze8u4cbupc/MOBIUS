import fs from 'node:fs';
import path from 'node:path';

export const SCORING_ENDGAME_CONTRACT_VERSION = 'mobius-scoring-endgame-v1';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const slug = (value) => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

function sourceRefs(sources = []) {
  return (Array.isArray(sources) ? sources : []).filter((source) => source && typeof source === 'object').map((source) => ({
    page: Number.isInteger(Number(source.page)) && Number(source.page) > 0 ? Number(source.page) : null,
    section: Number.isInteger(Number(source.section)) && Number(source.section) > 0 ? Number(source.section) : null,
    startOffset: Number.isInteger(Number(source.startOffset)) && Number(source.startOffset) >= 0 ? Number(source.startOffset) : null,
    endOffset: Number.isInteger(Number(source.endOffset)) && Number(source.endOffset) >= 0 ? Number(source.endOffset) : null,
    sourceImage: source.sourceImage || null,
    quote: source.quote || null,
    uncertainty: source.uncertainty || null,
  })).filter((source) => source.page || (source.section && source.startOffset !== null && source.endOffset !== null));
}

function sectionText(section = {}) {
  return clean([section.title, section.spokenText, section.narration, section.on_screen_text, section.onScreenText].filter(Boolean).join(' '));
}

function findEndSection(sections = []) {
  return sections.find((section) => /end.?game|game end|fin de partie|fin du jeu|termin|fin/i.test(sectionText(section))) || null;
}

function findScoringSection(sections = []) {
  return sections.find((section) => /scor|point|victo|winning|winner|décompte|decompte/i.test(sectionText(section))) || null;
}

function findSentence(text, pattern) {
  return clean(text.split(/(?<=[.!?])\s+/).find((sentence) => pattern.test(sentence)) || '');
}

function safeReviewState(value, confidence, visualsPresent) {
  if (value === 'rejected') return 'rejected';
  if (value === 'accepted' && visualsPresent && Number(confidence) >= 0.75) return 'accepted';
  return 'needs_review';
}

function visualExists(visual) {
  const candidate = visual?.path || visual?.renderPath || visual?.sourceImage;
  return Boolean(candidate && fs.existsSync(candidate));
}

function buildVisualBindings(category, hint = {}, evidence = null) {
  const supplied = Array.isArray(hint.visuals) ? hint.visuals : [];
  const acceptedEvidence = new Map((evidence?.acceptedVisuals || []).map((asset) => [String(asset.id), asset]));
  const ids = Array.isArray(hint.visualAssetIds) ? hint.visualAssetIds.map(String) : [];
  const visuals = supplied.length ? supplied : ids.map((id) => acceptedEvidence.get(id)).filter(Boolean).map((asset) => ({
    id: asset.id,
    path: asset.renderPath || asset.sourceImage,
    sourcePage: asset.pageNumber,
    sourceImage: asset.sourceImage,
    provenance: asset.provenance || null,
  }));
  if (!visuals.length) return [];
  const bindings = visuals.map((visual) => {
    const valid = visualExists(visual);
    const page = Number.isInteger(Number(visual.sourcePage)) ? Number(visual.sourcePage) : null;
    return {
      scoringCategoryId: category.id,
      componentRefs: Array.isArray(category.componentRefs) ? category.componentRefs : [],
      visualAssetIds: [String(visual.id || `${category.id}-visual`)],
      sourceRefs: sourceRefs([...(category.sourceRefs || []), ...(page ? [{ page, sourceImage: visual.sourceImage || visual.path }] : [])]),
      confidence: valid ? category.confidence : 0,
      reviewState: safeReviewState(category.reviewState, category.confidence, valid),
      reviewRequired: !valid || category.reviewState !== 'accepted',
      provenance: { ...(visual.provenance || {}), sourcePage: page, renderPath: visual.path || visual.renderPath || visual.provenance?.renderPath || null, sourceImage: visual.sourceImage || visual.provenance?.sourceImage || null },
    };
  });
  return bindings;
}

function deriveFallbackCategory(section, index) {
  const text = sectionText(section);
  const sentence = findSentence(text, /score|point|victo|gagne|winner|comptez|count/i);
  if (!sentence) return null;
  return {
    id: 'final-points',
    label: 'Points finaux',
    description: sentence,
    componentRefs: [],
    visualAssetIds: [],
    calculationType: 'source-described',
    sourceRefs: sourceRefs(section?.sources || []),
    confidence: 0.45,
    reviewState: 'needs_review',
    reviewRequired: true,
    evidenceLevel: 'source-text-only',
    ordinal: index + 1,
  };
}

function deriveCategoriesFromScoringText(section) {
  const text = sectionText(section);
  const sentence = findSentence(text, /score|point|comptez|count/i);
  const match = sentence.match(/(?:points?|points de victoire|victory points?)\s+(?:de|from)\s+(.+?)(?:\.|$)/i);
  if (!match) return [];
  const labels = match[1].replace(/\([^)]*\)/g, '').split(/,|\bet\b|\band\b/i).map(clean).filter((label) => label.length >= 2 && label.length <= 70);
  return labels.map((label, index) => ({
    id: `scoring-${slug(label)}-${index + 1}`,
    label: label.charAt(0).toLocaleUpperCase('fr-CA') + label.slice(1),
    description: `Compter les points liés à ${label}, selon la source.`,
    sourceRefs: sourceRefs(section?.sources || []),
    confidence: 0.55,
    reviewState: 'needs_review',
    reviewRequired: true,
    evidenceLevel: 'source-text-derived',
  }));
}

function normalizeVictoryCondition(condition, index) {
  const confidence = Math.max(0, Math.min(1, Number(condition?.confidence ?? 0.5)));
  const refs = sourceRefs(condition?.sourceRefs || []);
  const state = condition?.reviewState || 'needs_review';
  return {
    id: clean(condition?.id || `immediate-victory-${index + 1}`),
    label: clean(condition?.label || 'Victoire immédiate'),
    description: clean(condition?.description || ''),
    spokenText: clean(condition?.spokenText || condition?.description || ''),
    componentRefs: Array.isArray(condition?.componentRefs) ? condition.componentRefs.map(String).filter(Boolean) : [],
    visualAssetIds: Array.isArray(condition?.visualAssetIds) ? condition.visualAssetIds.map(String).filter(Boolean) : [],
    visuals: Array.isArray(condition?.visuals) ? condition.visuals : [],
    sourceRefs: refs,
    confidence,
    reviewState: state,
    reviewRequired: condition?.reviewRequired !== false && state !== 'accepted',
  };
}

function buildCategory(hint, fallback, index, evidence) {
  const candidate = hint || fallback || {};
  const confidence = Math.max(0, Math.min(1, Number(candidate.confidence ?? (candidate.sourceRefs?.length ? 0.8 : 0.35))));
  const category = {
    id: clean(candidate.id || `${slug(candidate.label || 'final-points')}-${index + 1}`),
    label: clean(candidate.label || 'Points finaux'),
    description: clean(candidate.description || ''),
    spokenText: clean(candidate.spokenText || candidate.description || ''),
    componentRefs: Array.isArray(candidate.componentRefs) ? candidate.componentRefs.map(String).filter(Boolean) : [],
    visualAssetIds: Array.isArray(candidate.visualAssetIds) ? candidate.visualAssetIds.map(String).filter(Boolean) : [],
    calculationType: clean(candidate.calculationType || 'source-described'),
    sourceRefs: sourceRefs(candidate.sourceRefs || []),
    confidence,
    reviewState: candidate.reviewState || 'needs_review',
    reviewRequired: candidate.reviewRequired !== false,
    evidenceLevel: candidate.evidenceLevel || 'source-referenced',
  };
  const bindings = buildVisualBindings(category, candidate, evidence);
  const accepted = bindings.length > 0 && bindings.every((binding) => binding.reviewState === 'accepted');
  category.reviewState = safeReviewState(category.reviewState, confidence, accepted);
  category.reviewRequired = category.reviewState !== 'accepted';
  return { category, bindings };
}

function deriveImmediateVictoryConditions(section, hints = []) {
  if (Array.isArray(hints) && hints.length) return hints;
  const text = sectionText(section);
  const candidates = text.split(/(?<=[.!?])\s+/).filter((sentence) => /immediate|immediately|instant|instantly|suprématie|supremacy|victoire/i.test(sentence));
  return candidates.map((sentence, index) => ({
    id: `immediate-victory-${index + 1}`,
    label: clean(sentence.split(/[:,.]/)[0] || 'Victoire immédiate'),
    description: clean(sentence),
    sourceRefs: sourceRefs(section?.sources || []),
    confidence: 0.55,
    reviewState: 'needs_review',
    reviewRequired: true,
  }));
}

export function buildEndgameModel({ projectId, gameIdentity = {}, sections = [], evidence = null, endgame = {}, scoringCategories = [], tieBreakers = [] } = {}) {
  const endSection = findEndSection(sections) || sections[0] || {};
  const scoringSection = findScoringSection(sections) || endSection;
  const endText = sectionText(endSection);
  const trigger = clean(endgame.trigger || findSentence(endText, /termin|end|ends/i) || 'La condition de fin doit être confirmée dans la source.');
  const immediateHintsProvided = Array.isArray(endgame.immediateVictoryConditions);
  const immediateVictoryConditions = (immediateHintsProvided ? endgame.immediateVictoryConditions : deriveImmediateVictoryConditions(endSection)).map(normalizeVictoryCondition);
  const victoryVisualBindings = immediateVictoryConditions.flatMap((condition) => buildVisualBindings({
    id: condition.id,
    componentRefs: condition.componentRefs,
    sourceRefs: condition.sourceRefs,
    confidence: condition.confidence,
    reviewState: condition.reviewState,
  }, condition, evidence));
  const endSources = sourceRefs(endgame.sourceRefs || endSection.sources || []);
  const finalPhase = clean(endgame.finalPhase || (/(production|final round|derni[eè]re phase)/i.test(endText) ? 'Résoudre la phase finale indiquée par la source.' : 'La phase finale doit être confirmée dans la source.'));
  const finishCurrentUnitRule = clean(endgame.finishCurrentUnitRule || (/(after that generation|après cette génération|finish.*round|fin.*tour)/i.test(endText) ? findSentence(endText, /after|après|finish|fin/i) : 'La règle de fin de l’unité courante doit être confirmée dans la source.'));
  const categoryHints = Array.isArray(scoringCategories) ? scoringCategories : [];
  const derivedCategories = categoryHints.length ? [] : deriveCategoriesFromScoringText(scoringSection);
  const fallback = categoryHints.length || derivedCategories.length ? derivedCategories : [deriveFallbackCategory(scoringSection, 0)].filter(Boolean);
  const categoryResults = [...categoryHints, ...fallback].map((hint, index) => buildCategory(hint, null, index, evidence));
  const normalizedTieBreakers = (Array.isArray(tieBreakers) ? tieBreakers : []).map((tie, index) => ({
    order: Number.isInteger(Number(tie.order)) ? Number(tie.order) : index + 1,
    rule: clean(tie.rule),
    sourceRefs: sourceRefs(tie.sourceRefs || []),
    confidence: Math.max(0, Math.min(1, Number(tie.confidence ?? 0.5))),
    reviewState: tie.reviewState || 'needs_review',
    reviewRequired: tie.reviewRequired !== false,
  }));
  const scoringRequired = endgame.scoringRequired !== undefined ? Boolean(endgame.scoringRequired) : Boolean(categoryResults.length || /score|point|victo/i.test(endText));
  const scoringAccepted = categoryResults.length > 0 && categoryResults.every(({ category }) => category.reviewState === 'accepted');
  const confidenceCandidates = [Number(endgame.confidence), ...categoryResults.map(({ category }) => category.confidence), ...normalizedTieBreakers.map((tie) => tie.confidence)].filter(Number.isFinite);
  const confidence = confidenceCandidates.length ? Number(Math.min(...confidenceCandidates).toFixed(3)) : 0.42;
  const reviewRequired = !endSources.length || immediateVictoryConditions.some((condition) => condition.reviewState !== 'accepted') || victoryVisualBindings.some((binding) => binding.reviewState !== 'accepted') || !scoringAccepted || normalizedTieBreakers.some((tie) => tie.reviewState !== 'accepted');
  return {
    contract: SCORING_ENDGAME_CONTRACT_VERSION,
    projectId: projectId || null,
    gameIdentity: { displayName: gameIdentity.displayName || gameIdentity.name || null, sourceTitle: gameIdentity.sourceTitle || null, locale: gameIdentity.locale || 'fr-CA' },
    endGameModel: {
      trigger,
      spokenText: clean(endgame.spokenText || trigger),
      scoringOverviewText: clean(endgame.scoringOverviewText || ''),
      winnerText: clean(endgame.winnerText || ''),
      immediateVictoryConditions,
      finishCurrentUnitRule,
      finalPhase,
      scoringRequired,
      sourceRefs: endSources,
      confidence,
      reviewState: reviewRequired ? 'needs_review' : 'accepted',
      reviewRequired,
    },
    scoringCategories: categoryResults.map(({ category }) => category),
    tieBreakers: normalizedTieBreakers,
    victoryVisualBindings,
    visualBindings: categoryResults.flatMap(({ bindings }) => bindings),
    sourceRefs: [...endSources, ...categoryResults.flatMap(({ category }) => category.sourceRefs), ...normalizedTieBreakers.flatMap((tie) => tie.sourceRefs)],
    confidence,
    reviewState: reviewRequired ? 'needs_review' : 'accepted',
    reviewRequired,
    generatedBy: 'mobius-scoring-endgame-generator',
  };
}

export function writeEndgameModel(filePath, model) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  return filePath;
}

export function buildEndgameTeachingPlan(model) {
  const end = model.endGameModel;
  const scenes = [
    { id: 'endgame-trigger', semanticRole: 'endgame-trigger', title: 'Quand la partie se termine', body: end.trigger, spokenText: end.spokenText || end.trigger, sourceRefs: end.sourceRefs, visualBindings: [] },
  ];
  if (end.immediateVictoryConditions.length) scenes.push({ id: 'immediate-victory', semanticRole: 'immediate-victory', title: 'Victoires immédiates', items: end.immediateVictoryConditions.map((condition) => condition.description), spokenText: end.immediateVictoryConditions.map((condition) => condition.spokenText || condition.description).join(' '), sourceRefs: end.immediateVictoryConditions.flatMap((condition) => condition.sourceRefs), visualBindings: model.victoryVisualBindings || [] });
  scenes.push({ id: 'final-phase', semanticRole: 'final-phase', title: 'Avant le décompte', body: end.finishCurrentUnitRule || end.finalPhase, spokenText: end.finalPhase || end.finishCurrentUnitRule, sourceRefs: end.sourceRefs, visualBindings: [] });
  if (end.scoringRequired) {
    scenes.push({ id: 'scoring-overview', semanticRole: 'scoring-overview', title: 'Ce qu’on compte', body: end.scoringOverviewText || 'Regrouper les points par catégories vérifiées.', spokenText: end.scoringOverviewText || 'Pour le décompte final, additionnez les catégories de points vérifiées par la source.', sourceRefs: model.sourceRefs, visualBindings: [] });
    for (const category of model.scoringCategories) scenes.push({ id: `scoring-${category.id}`, semanticRole: 'scoring-category', title: category.label, body: category.description, spokenText: category.spokenText || category.description, componentRefs: category.componentRefs, visualAssetIds: category.visualAssetIds, sourceRefs: category.sourceRefs, visualBindings: model.visualBindings.filter((binding) => binding.scoringCategoryId === category.id) });
  }
  scenes.push({ id: 'winner-resolution', semanticRole: 'winner-resolution', title: 'Qui gagne?', body: end.winnerText || 'Le vainqueur et les départages suivent uniquement les règles vérifiées par la source.', spokenText: end.winnerText || 'Le vainqueur est déterminé par la règle de victoire vérifiée par la source.', sourceRefs: model.sourceRefs, tieBreakers: model.tieBreakers, visualBindings: [] });
  return { contract: SCORING_ENDGAME_CONTRACT_VERSION, scenes, sourceRefs: model.sourceRefs, reviewRequired: model.reviewRequired };
}
