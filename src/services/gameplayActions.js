import fs from 'node:fs';
import path from 'node:path';

export const GAMEPLAY_ACTIONS_CONTRACT_VERSION = 'mobius-gameplay-actions-v1';

const ACTION_PATTERNS = [
  { pattern: /\b(jouez|jouer|play(?:ing)?|play)\b[^.\n]{0,100}\b(cartes?|cards?)\b/i, name: 'Jouer une carte', category: 'card' },
  { pattern: /\b(utilisez?|utiliser|use|using)\b[^.\n]{0,100}\b(projets?|projects?)\b/i, name: 'Utiliser un projet', category: 'board' },
  { pattern: /\b(placez|placer|place|placing)\b[^.\n]{0,100}\b(tuiles?|tiles?)\b/i, name: 'Placer une tuile', category: 'tile' },
  { pattern: /\b(choisissez|choisir|choisit|choisis|choose|select)\b[^.\n]{0,100}\b(cartes?|cards?)\b/i, name: 'Choisir une carte', category: 'card' },
  { pattern: /\b(acquérez?|acquérir|prendre|prenez|acquire|take)\b[^.\n]{0,100}\b(cartes?|cards?)\b/i, name: 'Acquérir une carte', category: 'card' },
  { pattern: /\b(construisez|construire|build|building)\b[^.\n]{0,100}\b(cité|ville|city|wonder)\b/i, name: 'Développer sa cité', category: 'card' },
];

const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const slug = (value) => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'action';

function cloneSources(sources = []) {
  return sources.filter((source) => source && typeof source === 'object').map((source) => ({
    page: Number.isInteger(Number(source.page)) ? Number(source.page) : null,
    sourceImage: source.sourceImage || null,
    quote: source.quote || null,
    section: Number.isInteger(Number(source.section)) ? Number(source.section) : null,
    startOffset: Number.isInteger(Number(source.startOffset)) ? Number(source.startOffset) : null,
    endOffset: Number.isInteger(Number(source.endOffset)) ? Number(source.endOffset) : null,
    uncertainty: source.uncertainty || null,
  })).filter((source) => (source.section && source.startOffset !== null && source.endOffset !== null) || source.page);
}

/**
 * Keep the three state-transition atoms compact so the content-aware
 * presentation solver can preserve readable type and panel containment.
 */
export function formatGameplayTransition(transition = {}) {
  return [
    `AVANT — ${String(transition.before || '').trim()}`,
    `ACTION — ${String(transition.action || '').trim()}`,
    `APRÈS — ${String(transition.after || '').trim()}`,
  ].filter((line) => !/—\s*$/.test(line)).join('\n');
}

function sectionText(section) {
  const directions = Array.isArray(section?.visualDirections) ? section.visualDirections : [];
  return clean([section?.title, section?.spokenText, section?.narration, ...directions.map((direction) => direction?.onScreenText || direction?.instruction)].filter(Boolean).join(' '));
}

function splitEvidenceSentences(text) {
  return clean(text).split(/(?<=[.!?])\s+|\s*;\s*/).map(clean).filter(Boolean);
}

function findActionEvidence(sections, rule) {
  const candidates = [];
  for (const section of sections) {
    const title = clean(section?.title).toLocaleLowerCase('fr-CA');
    const titleScore = rule.name === 'Placer une tuile'
      ? (/placement|tuile|tile/.test(title) ? 3 : 0)
      : (/action|tour|game turn|constru/.test(title) ? 3 : 0);
    for (const sentence of splitEvidenceSentences(sectionText(section))) {
      if (rule.pattern.test(sentence)) candidates.push({ section, sentence, score: titleScore + (sentence.length < 180 ? 1 : 0) });
    }
  }
  return candidates.sort((a, b) => b.score - a.score)[0] || null;
}

function resolvePhaseNames(text) {
  const match = text.match(/(?:phases?|phases)\s*:\s*([^.!?]+)/i);
  if (!match) return [];
  return match[1].split(/\s*(?:→|->|,|\bet\b|and)\s*/i).map(clean).filter(Boolean);
}

function findLoopSource(sections) {
  return sections.find((section) => /tour|turn|phase|round|round|âge|age|génération|generation|structure/i.test(sectionText(section))) || null;
}

function evidenceAssets(evidence) {
  return (evidence?.acceptedVisuals || []).filter((asset) => asset && asset.reviewState === 'accepted' && asset.renderPath && fs.existsSync(asset.renderPath));
}

function assetMatchesCategory(asset, category, terms = '') {
  const haystack = `${asset.componentName || ''} ${asset.category || ''}`.toLocaleLowerCase('fr-CA');
  if (category === 'card') return /card|carte/.test(haystack);
  if (category === 'tile') return /tile|tuile|ocean|greenery|city|ville/.test(haystack);
  if (category === 'token') return /token|marker|cube|jeton|marqueur/.test(haystack);
  return /board|plateau|zone|track|piste/.test(haystack);
}

function selectVisuals(action, evidence) {
  const assets = evidenceAssets(evidence);
  const preferred = Array.isArray(action.visualAssetIds)
    ? action.visualAssetIds.map(String).map((id) => assets.find((asset) => asset.id === id)).filter(Boolean)
    : [];
  const candidates = assets.filter((asset) => assetMatchesCategory(asset, action.category, action.name));
  const fallback = action.category === 'tile'
    ? assets.filter((asset) => ['token', 'board', 'focused-crop'].includes(asset.category))
    : action.category === 'card'
      ? assets.filter((asset) => ['card', 'focused-crop'].includes(asset.category))
      : assets;
  const selected = (preferred.length ? preferred : (candidates.length ? candidates : (fallback.length ? fallback : assets))).slice(0, 2);
  return selected.map((asset) => ({
    actionId: action.id,
    componentRefs: action.componentRefs,
    visualAssetIds: [asset.id],
    sourceRefs: asset.pageNumber ? [{ page: asset.pageNumber, sourceImage: asset.sourceImage || null }] : [],
    confidence: Math.min(Number(action.confidence) || 0, Number(asset.confidence) || 0),
    reviewState: asset.reviewState === 'accepted' && (Number(asset.confidence) || 0) >= 0.65 ? 'accepted' : 'needs_review',
    provenance: asset.provenance || null,
  }));
}

function parseCost(text) {
  const match = text.match(/(?:co[uû]t|pay(?:ez|ing)?|paie|paid|cost)\D{0,20}(\d+(?:[.,]\d+)?)\s*(M€|€|coins?|pi[eè]ces?)/i);
  return match ? { amount: Number(match[1].replace(',', '.')), unit: match[2] } : null;
}

function selectComponentRefs({ category, name, components = [] } = {}) {
  const matches = components.filter((component) => {
    const haystack = `${component.name || ''} ${component.category || ''}`.toLocaleLowerCase('fr-CA');
    return component.id && (category === 'card' ? /card|carte/.test(haystack) : category === 'tile' ? /tile|tuile|ocean|greenery|city|ville/.test(haystack) : category === 'token' ? /token|marker|cube|jeton|marqueur/.test(haystack) : /board|plateau|zone|track|piste/.test(haystack));
  }).sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0));
  return matches.slice(0, 2).map((component) => String(component.id));
}

function buildAction({ hint, section, sentence, category, name, index, evidence, components = [] }) {
  const sourceRefs = cloneSources(hint?.sourceRefs || section?.sources || []);
  const evidenceText = clean(sentence || hint?.evidence || sectionText(section));
  const action = {
    id: `action-${slug(hint?.name || name)}-${index + 1}`,
    name: clean(hint?.name || name),
    purpose: clean(hint?.purpose || evidenceText),
    prerequisites: Array.isArray(hint?.prerequisites) ? hint.prerequisites.map(clean).filter(Boolean) : (/(prérequis|prerequisite)/i.test(evidenceText) ? ['Vérifier les prérequis indiqués par la source.'] : []),
    cost: hint?.cost || parseCost(evidenceText),
    componentRefs: Array.isArray(hint?.componentRefs) ? hint.componentRefs.map(String).filter(Boolean) : selectComponentRefs({ category, name, components }),
    visualAssetIds: Array.isArray(hint?.visualAssetIds) ? hint.visualAssetIds.map(String).filter(Boolean) : [],
    sourceRefs,
    stateChange: {
      before: clean(hint?.before || 'État de jeu avant l’action, tel que décrit par la source.'),
      action: clean(hint?.action || evidenceText),
      after: clean(hint?.after || 'Le composant ou la zone indiquée par la source est modifié(e).'),
    },
    nextState: clean(hint?.nextState || ''),
    confidence: Math.max(0, Math.min(1, Number(hint?.confidence ?? (sourceRefs.length ? 0.82 : 0.35)))),
    reviewState: sourceRefs.length ? 'needs_review' : 'needs_review',
    reviewRequired: true,
    evidenceLevel: sourceRefs.length ? 'source-referenced' : 'insufficient-source-reference',
    category,
  };
  const bindings = selectVisuals(action, evidence);
  const best = bindings.sort((a, b) => b.confidence - a.confidence)[0] || null;
  if (best && best.reviewState === 'accepted') {
    action.reviewState = action.confidence >= 0.75 ? 'accepted' : 'needs_review';
    action.reviewRequired = action.reviewState !== 'accepted';
  }
  return { action, bindings };
}

export function deriveGameplayActions({ sections = [], evidence = null, actionHints = [], components = [] } = {}) {
  const results = [];
  const seen = new Set();
  const hints = Array.isArray(actionHints) ? actionHints : [];
  for (const section of sections) {
    for (const rule of ACTION_PATTERNS) {
      const evidenceMatch = findActionEvidence(sections, rule);
      const sentence = evidenceMatch?.sentence || null;
      const hint = hints.find((candidate) => rule.pattern.test(`${candidate?.name || ''} ${candidate?.evidence || ''}`) || clean(candidate?.name).toLocaleLowerCase('fr-CA') === rule.name.toLocaleLowerCase('fr-CA'));
      if (!sentence && !hint) continue;
      const name = hint?.name || rule.name;
      const key = slug(name);
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(buildAction({ hint, section: evidenceMatch?.section || section, sentence, category: rule.category, name, index: results.length, evidence, components }));
    }
  }
  for (const hint of hints) {
    const key = slug(hint?.name);
    if (!key || seen.has(key)) continue;
    const section = sections.find((candidate) => cloneSources(candidate?.sources || []).some((source) => cloneSources(hint.sourceRefs || []).some((ref) => ref.section === source.section))) || sections[0] || {};
    const result = buildAction({ hint, section, sentence: hint.evidence, category: hint.category || 'board', name: hint.name, index: results.length, evidence, components });
    results.push(result);
    seen.add(key);
  }
  return results;
}

function deriveLoop({ sections = [], loopHint = null } = {}) {
  const source = findLoopSource(sections) || sections[0] || {};
  const text = sectionText(source);
  const phases = Array.isArray(loopHint?.phases) && loopHint.phases.length ? loopHint.phases.map(clean).filter(Boolean) : resolvePhaseNames(text);
  const loopUnit = loopHint?.loopUnit || (/génération|generation/i.test(text) ? 'generation' : (/âge|age/i.test(text) ? 'age' : (/round/i.test(text) ? 'round' : 'turn')));
  const active = clean(loopHint?.activePlayerRule || text.match(/[^.!?]*(?:chaque joueur|each player|players take turns|joueurs.*tour)[^.!?]*[.!?]?/i)?.[0] || 'Le joueur actif suit la règle d’alternance explicitée par la source.');
  const repeat = clean(loopHint?.repeatRule || text.match(/[^.!?]*(?:chaque joueur|each player|repeat|répét)[^.!?]*[.!?]?/i)?.[0] || 'Répéter la séquence pour les joueurs et phases indiqués par la source.');
  const advance = clean(loopHint?.advanceRule || (phases.length ? `Après la résolution, passer à la phase suivante : ${phases.join(' → ')}.` : 'La condition de passage à l’état suivant doit être confirmée dans la source.'));
  const sourceRefs = cloneSources(loopHint?.sourceRefs || source.sources || []);
  const confidence = sourceRefs.length && (phases.length || loopHint) ? 0.86 : 0.42;
  return { loopUnit, phases, activePlayerRule: active, repeatRule: repeat, advanceRule: advance, sourceRefs, confidence, reviewState: confidence >= 0.75 ? 'accepted' : 'needs_review', reviewRequired: confidence < 0.75 };
}

export function buildGameplayModel({ projectId, gameIdentity = {}, sections = [], evidence = null, components = [], actionHints = [], loopHint = null } = {}) {
  const actionResults = deriveGameplayActions({ sections, evidence, components, actionHints });
  const actions = actionResults.map(({ action }) => action);
  const visualBindings = actionResults.flatMap(({ bindings }) => bindings);
  const loop = deriveLoop({ sections, loopHint });
  actions.forEach((action) => {
    if (!action.nextState) action.nextState = loop.advanceRule;
  });
  const allSourceRefs = [...loop.sourceRefs, ...actions.flatMap((action) => action.sourceRefs)].filter(Boolean);
  const acceptedBindings = new Set(visualBindings.filter((binding) => binding.reviewState === 'accepted').map((binding) => binding.actionId));
  const confidence = actions.length && loop.confidence >= 0.75 && acceptedBindings.size === actions.length
    ? Math.min(loop.confidence, ...actions.map((action) => action.confidence))
    : Math.min(loop.confidence, 0.59);
  return {
    contract: GAMEPLAY_ACTIONS_CONTRACT_VERSION,
    projectId: projectId || null,
    gameIdentity: { displayName: gameIdentity.displayName || gameIdentity.name || null, sourceTitle: gameIdentity.sourceTitle || null, locale: gameIdentity.locale || 'fr-CA' },
    gameLoop: { ...loop, sourceRefs: loop.sourceRefs },
    phases: loop.phases,
    actions,
    visualBindings,
    sourceRefs: allSourceRefs,
    confidence,
    reviewState: confidence >= 0.75 && actions.length ? 'accepted' : 'needs_review',
    reviewRequired: confidence < 0.75 || actions.some((action) => action.reviewRequired),
    generatedBy: 'mobius-gameplay-actions-generator',
  };
}

export function readHephaestusEvidence(filePath) {
  return filePath && fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : null;
}

export function writeGameplayModel(filePath, model) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  return filePath;
}

export function buildGameplayPreviewAtoms(model) {
  return model.actions.map((action) => ({
    id: action.id,
    title: action.name,
    body: action.purpose,
    componentRefs: action.componentRefs,
    sourceRefs: action.sourceRefs,
    visualAssetIds: model.visualBindings.filter((binding) => binding.actionId === action.id).flatMap((binding) => binding.visualAssetIds),
    transition: { before: action.stateChange.before, action: action.stateChange.action, after: action.stateChange.after },
  }));
}

/**
 * Canonical storyboard-facing plan. The normal production workflow persists
 * this beside the existing storyboard so Autopilot and Cockpit consume the
 * same source-grounded loop/action teaching atoms.
 */
export function buildGameplayTeachingPlan(model) {
  const atoms = buildGameplayPreviewAtoms(model);
  return {
    contract: GAMEPLAY_ACTIONS_CONTRACT_VERSION,
    loopUnit: model.gameLoop.loopUnit,
    sourceRefs: model.gameLoop.sourceRefs,
    scenes: [
      {
        id: 'gameplay-loop',
        semanticRole: 'game-loop',
        phaseNames: model.gameLoop.phases,
        sourceRefs: model.gameLoop.sourceRefs,
        visualBindings: [],
      },
      ...atoms.map((atom, index) => ({
        id: `gameplay-action-${index + 1}`,
        semanticRole: 'player-action',
        actionId: atom.id,
        componentRefs: atom.componentRefs,
        visualAssetIds: atom.visualAssetIds,
        sourceRefs: atom.sourceRefs,
        transition: atom.transition,
      })),
      {
        id: 'gameplay-advance',
        semanticRole: 'state-advance',
        advanceRule: model.gameLoop.advanceRule,
        sourceRefs: model.gameLoop.sourceRefs,
      },
    ],
  };
}
