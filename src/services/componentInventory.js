import { getAiConfig, getAiModel, getGenerationOptions } from '../config/aiConfig.js';

const COMPONENT_CATEGORIES = [
  'board',
  'card',
  'token',
  'tile',
  'dice',
  'marker',
  'miniature',
  'currency',
  'other',
];

const COMPONENT_TERMS = {
  board: ['board', 'boards', 'plateau', 'plateaux', 'player board', 'game board', 'mat', 'mats'],
  card: ['card', 'cards', 'carte', 'cartes', 'lord', 'lords', 'ally', 'allies'],
  token: ['token', 'tokens', 'jeton', 'jetons', 'counter', 'counters', 'chip', 'chips', 'cube', 'cubes', 'key', 'keys'],
  tile: ['tile', 'tiles', 'tuile', 'tuiles', 'location', 'locations'],
  dice: ['die', 'dice', 'dé', 'dés', 'dado', 'dados'],
  marker: ['marker', 'markers', 'marqueur', 'marqueurs', 'track', 'tracks', 'tracker', 'trackers'],
  miniature: ['miniature', 'miniatures', 'figurine', 'figurines', 'meeple', 'meeples', 'pawn', 'pawns', 'pion', 'pions', 'standee', 'standees'],
  currency: ['coin', 'coins', 'money', 'currency', 'monnaie', 'pièce', 'pièces', 'pearl', 'pearls'],
  other: ['cup', 'cups'],
};

const COMPONENT_HEADINGS = [
  'components', 'component list', 'contents', 'contents & setup', 'contents and setup', 'game contents', 'what’s in the box', "what's in the box",
  'what is in the box', 'box contents', 'materials', 'game materials', 'included', 'game includes',
  'setup components', 'material', 'materials', 'composants', 'matériel', 'matériels', 'matériel de jeu', 'contenu',
  'contenu de la boîte', 'éléments du jeu',
];

const STOP_HEADINGS = [
  'setup', 'game setup', 'preparation', 'preparing for play', 'gameplay', 'game play', 'how to play', 'game overview', 'object of the game',
  'rules', 'rulebook', 'objective', 'objectives', 'goal', 'introduction', 'overview', 'contents',
  'mise en place', 'déroulement', 'règles', 'objectif', 'préparation',
];

const PLACEHOLDER_NAMES = new Set([
  '', 'unknown', 'unknown component', 'component', 'components', 'item', 'items', 'n/a', 'none', 'null',
]);

const GENERIC_COMPONENT_NAMES = new Set([
  'card', 'cards', 'tile', 'tiles', 'token', 'tokens', 'track', 'tracks', 'board', 'boards',
  'marker', 'markers', 'other', 'icon', 'icons', 'number', 'numbers',
]);

const ACTION_PREFIX = /^(?:place|shuffle|turn|then|take|form|put|draw|move|each|randomly|discard|attach|play|reveal|resolve|activate|select|choose|gain|spend|return|remove|deal|collect|roll|pay|build|use|claim|pass|start|end)\b/i;
const ACTION_PHRASE_PATTERN = /^[A-Za-zÀ-ÿ]+\s+(?:a|an|the|your|each|any|all|one|two|three|\d+)\b/i;
const VISUAL_LABEL_PATTERN = /\b(?:front|back|court|council|exploration track|threat track)\b/i;

const NUMBER_WORDS = {
  one: 1, un: 1, une: 1, two: 2, deux: 2, three: 3, trois: 3, four: 4, quatre: 4,
  five: 5, cinq: 5, six: 6, sept: 7, seven: 7, eight: 8, huit: 8, nine: 9, neuf: 9,
  ten: 10, dix: 10, eleven: 11, onze: 11, twelve: 12, douze: 12,
};

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[|]/g, ' ')
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(value) {
  const original = String(value || '');
  const hasFrenchDice = /\bdés\b/i.test(original);
  return fold(value)
    .replace(/\bcartes?\b/g, 'card')
    .replace(/\bjetons?\b/g, 'token')
    .replace(/\bplateaux?\b/g, 'board')
    .replace(/\btuiles?\b/g, 'tile')
    .replace(/\bmarqueurs?\b/g, 'marker')
    .replace(/\bfigurines?\b/g, 'miniature')
    .replace(/\bpieces?\b/g, 'currency')
    .replace(/\bdes\b/g, hasFrenchDice ? 'dice' : ' ')
    .replace(/\b(a|an|the|un|une|de|du|les|le|la)\b/g, ' ')
    .replace(/\b(cards?|tokens?|boards?|tiles?)\b/g, (word) => word.replace(/s$/, ''))
    .replace(/\blords?\b/g, 'lord')
    .replace(/\blocations?\b/g, 'location')
    .replace(/\blord card\b/g, 'lord')
    .replace(/\blocation tile\b/g, 'location')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCategory(value, name = '') {
  const text = fold(`${value || ''} ${name}`);
  for (const category of COMPONENT_CATEGORIES) {
    if (text.includes(category)) return category;
  }
  if (/\b(cartes?|cards?|allies?)\b/.test(text)) return 'card';
  if (/\b(jetons?|tokens?|cubes?|counters?|keys?)\b/.test(text)) return 'token';
  if (/\b(plateau|plateaux|boards?|mats?)\b/.test(text)) return 'board';
  if (/\b(tuiles?|tiles?|locations?)\b/.test(text)) return 'tile';
  if (/\b(lords?)\b/.test(text)) return 'card';
  if (/\b(des?|dice|dé|dés)\b/.test(text)) return 'dice';
  if (/\b(marker|markers|marqueur|marqueurs)\b/.test(text)) return 'marker';
  if (/\b(meeples?|pawns?|pions?|figurines?|miniatures?|standees?)\b/.test(text)) return 'miniature';
  if (/\b(coins?|money|currency|monnaie|pièces?|pearls?)\b/.test(text)) return 'currency';
  return 'other';
}

function headingKey(value) {
  return fold(value)
    .replace(/\b(?:page|p)\s*\d+\b/g, '')
    .replace(/[:\-–—]+$/g, '')
    .trim();
}

function isHeading(line, candidates) {
  const key = headingKey(line);
  return candidates.some((candidate) => key === headingKey(candidate));
}

function isStopHeading(line) {
  const key = headingKey(line);
  return isHeading(line, STOP_HEADINGS) || STOP_HEADINGS.some((candidate) => {
    const normalizedCandidate = headingKey(candidate);
    return key.startsWith(`${normalizedCandidate} `)
      || (normalizedCandidate.length >= 8 && key.includes(normalizedCandidate));
  });
}

function normalizeSourceInput(input) {
  if (typeof input === 'string') {
    return input.split(/\r?\n/).map((text, index) => ({
      id: `line-${index + 1}`,
      text: String(text || '').trim(),
      sourcePage: null,
      sourceIndex: index,
    }));
  }

  const pages = Array.isArray(input) ? input : input?.pages;
  if (!Array.isArray(pages)) return [];

  const lines = [];
  for (const page of pages) {
    const sourcePage = Number.isInteger(page?.number) ? page.number : null;
    const textLines = typeof page?.text === 'string'
      ? page.text.split(/\r\n?|\n/)
      : (Array.isArray(page?.blocks)
        ? page.blocks.flatMap((block) => String(block?.text || '').split(/\r\n?|\n/))
        : []);
    for (const text of textLines) {
      lines.push({
        id: `line-${lines.length + 1}`,
        text: String(text || '').trim(),
        sourcePage,
        sourceIndex: lines.length,
      });
    }
  }
  return lines;
}

function findComponentSections(input) {
  const lines = normalizeSourceInput(input);
  const headings = [];
  const sections = [];
  const pageHasStopHeading = new Map();

  for (const line of lines) {
    if (!Number.isInteger(line.sourcePage)) continue;
    const current = pageHasStopHeading.get(line.sourcePage) || false;
    pageHasStopHeading.set(line.sourcePage, current || isStopHeading(line.text));
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.text || !isHeading(line.text, COMPONENT_HEADINGS)) continue;

    headings.push({
      heading: line.text,
      sourcePage: line.sourcePage,
      sourceLine: index + 1,
    });

    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = lines[cursor];
      if (!candidate.text) continue;
      if (Number.isInteger(line.sourcePage)
        && Number.isInteger(candidate.sourcePage)
        && candidate.sourcePage !== line.sourcePage
        && pageHasStopHeading.get(candidate.sourcePage)) {
        end = cursor;
        break;
      }
      if (isHeading(candidate.text, COMPONENT_HEADINGS) || isStopHeading(candidate.text)) {
        end = cursor;
        break;
      }
    }

    sections.push({
      found: true,
      heading: line.text,
      sourcePage: line.sourcePage,
      startLine: index + 1,
      endLine: end,
      lines: lines.slice(index + 1, end),
    });
    index = end - 1;
  }

  return { lines, headings, sections };
}

function findComponentSection(input) {
  const { headings, sections } = findComponentSections(input);
  const first = sections[0];
  if (!first) {
    return {
      found: false,
      heading: null,
      startLine: null,
      endLine: null,
      lines: [],
      headings,
      sections: [],
    };
  }
  return { ...first, headings, sections };
}

function parseQuantity(rawLine) {
  const line = rawLine.trim().replace(/^[•●▪◦*-]+\s*/, '').replace(/\s+/g, ' ');
  let match = line.match(/^(\d+)\s+(?:of each|de chaque)\s+(.+)$/i);
  if (match) return { name: match[2], quantity: Number(match[1]), qualifier: 'of each', confidence: 0.82, method: 'of-each' };

  match = line.match(/^(\d+)\s+(.+?)\s+(?:per player|par joueur)$/i);
  if (match) return { name: match[2], quantity: Number(match[1]), qualifier: 'per player', confidence: 0.82, method: 'per-player' };

  match = line.match(/^(\d+)\s*[–-]\s*(\d+)\s+(.+)$/i);
  if (match) return { name: match[3], quantity: null, quantityRange: [Number(match[1]), Number(match[2])], confidence: 0.78, method: 'quantity-range' };

  match = line.match(/^(\d+)\s*(?:x|×)?\s+(.+)$/i);
  if (match) return { name: match[2], quantity: Number(match[1]), confidence: 0.96, method: 'quantity-first' };

  match = line.match(/^(.+?)\s*(?:\((\d+)\)|[:–—-]\s*(\d+)|\s+x\s*(\d+))$/i);
  if (match) return { name: match[1], quantity: Number(match[2] || match[3] || match[4]), confidence: 0.92, method: 'quantity-suffix' };

  match = line.match(/^(.+?)\s+(\d+)\s+(?:per player|par joueur)$/i);
  if (match) return { name: match[1], quantity: Number(match[2]), qualifier: 'per player', confidence: 0.82, method: 'per-player' };

  match = line.match(/^(\d+)\s+sets?\s+of\s+(.+)$/i);
  if (match) return { name: match[2], quantity: Number(match[1]), qualifier: 'sets', confidence: 0.8, method: 'sets-of' };

  match = line.match(/^(.+?)\s+(\d+)$/);
  if (match) return { name: match[1], quantity: Number(match[2]), confidence: 0.78, method: 'quantity-trailing' };

  match = line.match(/^(?:a|an|un|une)\s+(.+)$/i);
  if (match) return { name: match[1], quantity: 1, confidence: 0.68, method: 'indefinite-one' };

  return { name: line, quantity: null, confidence: 0.42, method: 'name-only' };
}

function splitParentheticalDetails(name) {
  const match = String(name || '').match(/^(.*?)\s*\(([^)]+)\)\s*[:.]?\s*$/);
  if (!match) return { name, details: '' };
  return { name: match[1], details: match[2] };
}

function cleanName(value) {
  return String(value || '')
    .replace(/^[•●▪◦*-]+\s*/, '')
    .replace(/[,:;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasComponentTerm(value) {
  const text = fold(value);
  return Object.values(COMPONENT_TERMS).flat().some((term) => new RegExp(`\\b${fold(term).replace(/ /g, '\\s+')}\\b`, 'i').test(text));
}

function isGenericComponentName(name) {
  return GENERIC_COMPONENT_NAMES.has(fold(name));
}

function isLikelyVisualCaption(value) {
  const text = fold(value);
  return VISUAL_LABEL_PATTERN.test(text)
    || /^(?:the\s+)?(?:council|court)$/.test(text)
    || /^(?:merchant\s+)?lord of the lords?$/.test(text)
    || /^(monster tokens?)(\s+\1)+$/.test(text)
    || /^of the\s+/.test(text);
}

function isAllCapsDiagramLabel(value) {
  const cleaned = String(value || '').replace(/[^A-Za-z]/g, '');
  return cleaned.length > 2 && cleaned === cleaned.toUpperCase();
}

function isSentenceOrAction(value) {
  const text = String(value || '').trim();
  const words = fold(text).split(/\s+/).filter(Boolean);
  return ACTION_PREFIX.test(text) || ACTION_PHRASE_PATTERN.test(text) || words.length > 6 || /[.!?]/.test(text);
}

function hasControlledPhysicalObjectPattern(name) {
  const text = fold(name);
  if (!text || isGenericComponentName(text) || /\btracks?\b/.test(text)) return false;
  return hasComponentTerm(text);
}

/**
 * Deterministically decides whether a candidate is a named physical object.
 * Setup-prose objects are deliberately review-only; only quantified records in a
 * detected contents/material section are admitted as verified inventory entries.
 */
function validateComponentEligibility({ name, rawLine = '', parsed = {}, source = {}, inferred = false } = {}) {
  const clean = cleanName(name);
  const quantityIsExplicit = Number.isInteger(parsed.quantity) || Array.isArray(parsed.quantityRange);
  const inContentsSection = Number.isInteger(source.sectionIndex);

  if (!clean || PLACEHOLDER_NAMES.has(fold(clean))) {
    return { eligible: false, reviewRequired: true, reason: 'Excluded non-component evidence: empty or placeholder label.' };
  }
  if (isGenericComponentName(clean)) {
    return { eligible: false, reviewRequired: true, reason: 'Excluded non-component evidence: generic category label.' };
  }
  if (isLikelyVisualCaption(clean) || isAllCapsDiagramLabel(clean)) {
    return { eligible: false, reviewRequired: true, reason: 'Excluded non-component evidence: diagram label or visual caption.' };
  }
  if (isSentenceOrAction(clean)) {
    return { eligible: false, reviewRequired: true, reason: 'Excluded non-component evidence: instruction, sentence, or clause.' };
  }
  if (!hasControlledPhysicalObjectPattern(clean)) {
    return { eligible: false, reviewRequired: true, reason: 'Excluded non-component evidence: not a controlled physical-object name.' };
  }
  if (!inferred && inContentsSection && quantityIsExplicit) {
    return { eligible: true, reviewRequired: false, kind: 'contents', reason: null };
  }
  return {
    eligible: true,
    reviewRequired: true,
    kind: 'setup',
    reason: 'Setup-derived physical object; confirm this component before matching.',
  };
}

function isEligibleComponentForMatching(component) {
  if (!component || !String(component.name || '').trim()) return false;
  if (component.matchEligible === false || component.eligibility === 'excluded') return false;
  const isCanonicalSetupRecord = component.eligibility === 'setup'
    && component.inferenceReason === 'Setup-derived physical object; confirm this component before matching.';
  if (component.reviewRequired === true && !isCanonicalSetupRecord) return false;
  const parsed = { quantity: Number.isInteger(component.quantity) ? component.quantity : null };
  return validateComponentEligibility({
    name: component.name,
    rawLine: component.sourceQuote || component.name,
    parsed,
    source: { sectionIndex: component.eligibility === 'contents' ? 0 : null },
    inferred: isCanonicalSetupRecord,
  }).eligible;
}

function extractComponentPhrase(rawLine) {
  const cleaned = rawLine.replace(/^[•●▪◦*-]+\s*/, '').replace(/\s+/g, ' ').trim();
  if (isLikelyVisualCaption(cleaned) && !ACTION_PREFIX.test(cleaned)) return null;
  const terms = Object.values(COMPONENT_TERMS).flat()
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  const termPattern = `(?:${terms.join('|')})`;
  const qualifierPattern = '(?:exploration|monster|threat|key|location|lord|plastic|ally|allied|game|player)';
  const match = cleaned.match(new RegExp(`\\b((?:${qualifierPattern}\\s+)?${termPattern})\\b`, 'i'));
  if (!match) return null;

  const name = cleanName(match[1]);
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const quantityWord = cleaned.match(new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s+${escapedName}\\b`, 'i'));
  const perPlayer = /each player|per player|par joueur/i.test(cleaned);
  return {
    name,
    quantity: quantityWord ? NUMBER_WORDS[quantityWord[1].toLowerCase()] : (perPlayer && /\bone\s+/i.test(cleaned) ? 1 : null),
    qualifier: perPlayer ? 'per player' : null,
    confidence: 0.68,
    method: 'grounded-setup-inference',
    details: '',
  };
}

function splitRowFragments(sourceQuote) {
  return String(sourceQuote || '')
    .split(/\s*;\s*/)
    .flatMap((fragment) => fragment.split(/\s{2,}(?=\d+\s+)/))
    .map((fragment) => fragment.trim())
    .filter(Boolean);
}

function recordFromParsed(parsed, source, index, { inferred = false, eligibility } = {}) {
  const nameAndDetails = splitParentheticalDetails(parsed.name);
  const name = cleanName(nameAndDetails.name);
  const normalizedName = normalizeName(name);
  const category = normalizeCategory('', name);
  const quantity = Number.isInteger(parsed.quantity) ? parsed.quantity : null;
  const reviewRequired = Boolean(eligibility?.reviewRequired) || inferred || quantity === null || parsed.confidence < 0.8 || category === 'other';
  return {
    id: `comp-${index + 1}`,
    name,
    normalizedName,
    category,
    quantity,
    sourcePage: source.sourcePage,
    sourceQuote: source.text,
    confidence: parsed.confidence,
    reviewRequired,
    eligibility: eligibility?.kind || 'setup',
    matchEligible: true,
    details: parsed.details || nameAndDetails.details || '',
    quantityRange: parsed.quantityRange || null,
    qualifier: parsed.qualifier || null,
    inferenceReason: eligibility?.reason || (inferred ? 'Setup-derived physical object; confirm this component before matching.' : null),
  };
}

function parseSourceFragment(fragment, source, index, continuation = null) {
  const parsed = parseQuantity(fragment);
  const explicitName = splitParentheticalDetails(parsed.name).name;
  const explicitEligibility = validateComponentEligibility({ name: explicitName, rawLine: fragment, parsed, source, inferred: false });

  if (explicitEligibility.eligible) {
    const record = recordFromParsed(parsed, { ...source, text: fragment }, index, { inferred: false, eligibility: explicitEligibility });
    return { record, reason: null };
  }

  const inferred = extractComponentPhrase(fragment);
  if (inferred) {
    const inferredEligibility = validateComponentEligibility({ name: inferred.name, rawLine: fragment, parsed: inferred, source, inferred: true });
    if (inferredEligibility.eligible) {
      const record = recordFromParsed(inferred, { ...source, text: fragment }, index, { inferred: true, eligibility: inferredEligibility });
      return { record, reason: null };
    }
    return { record: null, reason: inferredEligibility.reason };
  }

  if (continuation
    && /^\d+\s+\S+\s*$/.test(fragment)
    && !/[.;:!?]$/.test(fragment.trim())
    && /^[A-Za-zÀ-ÿ]/.test(continuation.trim())) {
    const joined = `${fragment} ${continuation}`;
    const wrapped = parseSourceFragment(joined, source, index, null);
    if (wrapped.record) return wrapped;
  }

  return { record: null, reason: explicitEligibility.reason };
}

function preferRecord(existing, candidate) {
  if (existing.reviewRequired && !candidate.reviewRequired) return candidate;
  if (existing.quantity === null && candidate.quantity !== null) return candidate;
  if (candidate.confidence > existing.confidence) return candidate;
  return existing;
}

function deterministicInventory(input) {
  const source = findComponentSections(input);
  const sections = source.sections;
  const rawRows = [];
  const componentsByName = new Map();
  const componentOrder = [];
  let recordIndex = 0;

  const rows = sections.length > 0
    ? sections.flatMap((section, sectionIndex) => section.lines.map((line) => ({ ...line, sectionIndex })))
    : source.lines.filter((line) => line.text).map((line) => ({ ...line, sectionIndex: null }));

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const sourceLine = rows[rowIndex];
    if (!sourceLine.text) continue;
    const nextSourceLine = rows[rowIndex + 1];
    const continuation = nextSourceLine
      && nextSourceLine.sourcePage === sourceLine.sourcePage
      ? nextSourceLine.text
      : null;
    const fragments = splitRowFragments(sourceLine.text);
    for (let fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex += 1) {
      const fragment = fragments[fragmentIndex];
      const parsed = parseSourceFragment(fragment, sourceLine, recordIndex, fragments.length === 1 ? continuation : null);
      const rawRow = {
        id: `row-${rawRows.length + 1}`,
        sectionIndex: sourceLine.sectionIndex,
        sourcePage: sourceLine.sourcePage,
        sourceQuote: fragment,
        parsedComponentIds: [],
        status: 'ambiguous',
        reviewRequired: true,
        reason: parsed.reason,
      };

      if (parsed.record) {
        recordIndex += 1;
        const existing = componentsByName.get(parsed.record.normalizedName);
        if (!existing) {
          componentsByName.set(parsed.record.normalizedName, parsed.record);
          componentOrder.push(parsed.record.normalizedName);
          rawRow.parsedComponentIds.push(parsed.record.id);
        } else {
          const preferred = preferRecord(existing, parsed.record);
          if (preferred !== existing) {
            preferred.id = existing.id;
            const position = componentOrder.indexOf(existing.normalizedName);
            componentsByName.set(existing.normalizedName, preferred);
            rawRow.parsedComponentIds.push(existing.id);
            if (position >= 0) componentOrder[position] = existing.normalizedName;
          } else {
            rawRow.parsedComponentIds.push(existing.id);
          }
        }
        rawRow.status = 'parsed';
        rawRow.reviewRequired = Boolean(parsed.record.reviewRequired);
        rawRow.reason = parsed.record.inferenceReason || null;
      }
      rawRows.push(rawRow);
    }
  }

  const components = componentOrder.map((key) => componentsByName.get(key));
  const unparsedRows = rawRows.filter((row) => row.status !== 'parsed');
  const reviewRequiredRows = rawRows.filter((row) => row.reviewRequired);
  const nonComponentEvidenceRows = rawRows.filter((row) => String(row.reason || '').startsWith('Excluded non-component evidence:'));
  const coverage = {
    rawRowCount: rawRows.length,
    parsedRowCount: rawRows.filter((row) => row.status === 'parsed').length,
    reviewRequiredRowCount: reviewRequiredRows.length,
    unparsedRowCount: unparsedRows.length,
    nonComponentEvidenceCount: nonComponentEvidenceRows.length,
    validPhysicalComponentCount: components.filter((component) => component.eligibility === 'contents').length,
    setupDerivedComponentCount: components.filter((component) => component.eligibility === 'setup').length,
    silentlyDroppedRowCount: 0,
  };
  const firstSection = sections[0];
  const reviewRequired = !firstSection || components.length === 0 || reviewRequiredRows.length > 0 || components.some((component) => component.reviewRequired);

  return {
    components,
    rawRows,
    unparsedRows,
    candidateHeadings: source.headings,
    coverage,
    sectionFound: Boolean(firstSection),
    sectionHeading: firstSection?.heading || null,
    sectionStartLine: firstSection?.startLine ?? null,
    sectionEndLine: firstSection?.endLine ?? null,
    reviewRequired,
    message: !firstSection
      ? 'No component-list heading was found; all candidates require operator review.'
      : (reviewRequiredRows.length > 0
        ? `Inventory coverage is incomplete: ${reviewRequiredRows.length} source row${reviewRequiredRows.length === 1 ? '' : 's'} require operator review.`
        : null),
  };
}

function parseLlmJson(content) {
  const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return null;
  const parsed = JSON.parse(match[0]);
  return Array.isArray(parsed) ? parsed : null;
}

function normalizeLlmComponents(items, sourceText) {
  const parsedItems = typeof items === 'string' ? parseLlmJson(items) : items;
  if (!Array.isArray(parsedItems)) return [];
  return parsedItems.map((item, index) => {
    const name = cleanName(item?.name);
    const normalizedName = normalizeName(name);
    const numericQuantity = Number.isInteger(item?.quantity) ? item.quantity : null;
    const category = normalizeCategory(item?.category, name);
    const sourceQuote = item?.sourceQuote || name;
    return {
      id: `comp-${index + 1}`,
      name,
      normalizedName,
      category,
      quantity: numericQuantity,
      sourcePage: Number.isInteger(item?.sourcePage) ? item.sourcePage : null,
      sourceQuote,
      confidence: Math.max(0, Math.min(1, Number(item?.confidence) || 0.55)),
      reviewRequired: !name || PLACEHOLDER_NAMES.has(fold(name)) || numericQuantity === null || category === 'other',
      details: String(item?.details || ''),
      sourceText: sourceText ? 'llm' : undefined,
    };
  }).filter((item) => item.name && !PLACEHOLDER_NAMES.has(fold(item.name)));
}

async function extractComponentInventory(input, { gameName = null, llm = null, llmConfigured = false } = {}) {
  const deterministic = deterministicInventory(input);
  const needsEnrichment = deterministic.components.length === 0 || deterministic.components.some((component) => component.reviewRequired);

  if (!needsEnrichment || !llmConfigured || !llm?.chat?.completions?.create) {
    return { ...deterministic, extractionMethod: 'deterministic' };
  }

  try {
    const sourceText = typeof input === 'string'
      ? input
      : normalizeSourceInput(input).map((line) => line.text).join('\n');
    const response = await llm.chat.completions.create({
      model: getAiModel(),
      messages: [{
        role: 'user',
        content: `Extract only physical board-game component TYPES from this rulebook. Return ONLY a JSON array, never Markdown. Each object must contain name, category (${COMPONENT_CATEGORIES.join('|')}), quantity (integer or null), sourcePage (integer or null), sourceQuote, confidence (0 to 1). Do not invent components. Game: ${gameName || 'unknown'}\n\n${sourceText.slice(0, 20000)}`,
      }],
      ...getGenerationOptions(getAiConfig(), {
        max_completion_tokens: 1800,
      }),
    });
    const llmComponents = normalizeLlmComponents(response.choices?.[0]?.message?.content, sourceText);
    if (llmComponents.length > 0) {
      return {
        ...deterministic,
        components: llmComponents,
        reviewRequired: true,
        extractionMethod: 'deterministic-plus-llm',
        message: 'LLM supplied structured candidates; review is required.',
      };
    }
  } catch (error) {
    return {
      ...deterministic,
      extractionMethod: deterministic.components.length > 0 ? 'deterministic-llm-fallback' : 'deterministic-review-required',
      llmError: error.message,
    };
  }

  return { ...deterministic, extractionMethod: 'deterministic-review-required' };
}

export {
  COMPONENT_CATEGORIES,
  COMPONENT_HEADINGS,
  STOP_HEADINGS,
  findComponentSection,
  findComponentSections,
  parseQuantity,
  normalizeName,
  normalizeCategory,
  validateComponentEligibility,
  isEligibleComponentForMatching,
  deterministicInventory,
  extractComponentInventory,
};
