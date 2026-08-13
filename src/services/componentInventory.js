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
  card: ['card', 'cards', 'carte', 'cartes', 'lord', 'lords'],
  token: ['token', 'tokens', 'jeton', 'jetons', 'counter', 'counters', 'chip', 'chips', 'cube', 'cubes'],
  tile: ['tile', 'tiles', 'tuile', 'tuiles', 'location', 'locations'],
  dice: ['die', 'dice', 'dé', 'dés', 'dado', 'dados'],
  marker: ['marker', 'markers', 'marqueur', 'marqueurs', 'track', 'tracks', 'tracker', 'trackers'],
  miniature: ['miniature', 'miniatures', 'figurine', 'figurines', 'meeple', 'meeples', 'pawn', 'pawns', 'pion', 'pions', 'standee', 'standees'],
  currency: ['coin', 'coins', 'money', 'currency', 'monnaie', 'pièce', 'pièces'],
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
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCategory(value, name = '') {
  const text = fold(`${value || ''} ${name}`);
  for (const category of COMPONENT_CATEGORIES) {
    if (text.includes(category)) return category;
  }
  if (/\b(cartes?|cards?)\b/.test(text)) return 'card';
  if (/\b(jetons?|tokens?|cubes?|counters?)\b/.test(text)) return 'token';
  if (/\b(plateau|plateaux|boards?|mats?)\b/.test(text)) return 'board';
  if (/\b(tuiles?|tiles?|locations?)\b/.test(text)) return 'tile';
  if (/\b(lords?)\b/.test(text)) return 'card';
  if (/\b(des?|dice|dé|dés)\b/.test(text)) return 'dice';
  if (/\b(marker|markers|marqueur|marqueurs)\b/.test(text)) return 'marker';
  if (/\b(meeples?|pawns?|pions?|figurines?|miniatures?|standees?)\b/.test(text)) return 'miniature';
  if (/\b(coins?|money|currency|monnaie|pièces?)\b/.test(text)) return 'currency';
  return 'other';
}

function headingKey(value) {
  return fold(value).replace(/[:\-–—]+$/g, '').trim();
}

function isHeading(line, candidates) {
  const key = headingKey(line);
  return candidates.some((candidate) => key === headingKey(candidate));
}

function findComponentSection(text) {
  const lines = String(text || '').split(/\r?\n/);
  let start = -1;
  let heading = '';
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (isHeading(line, COMPONENT_HEADINGS)) {
      start = index + 1;
      heading = line;
      break;
    }
  }

  if (start < 0) {
    return { found: false, heading: null, startLine: null, endLine: null, lines: [] };
  }

  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line && isHeading(line, STOP_HEADINGS) && !isHeading(line, COMPONENT_HEADINGS)) {
      end = index;
      break;
    }
    if (line && isHeading(line, COMPONENT_HEADINGS) && index > start) {
      end = index;
      break;
    }
  }

  return { found: true, heading, startLine: start, endLine: end, lines: lines.slice(start, end) };
}

function parseQuantity(rawLine) {
  const line = rawLine.trim().replace(/^[•●▪◦*-]+\s*/, '').replace(/\s+/g, ' ');
  let match = line.match(/^(\d+)\s+(?:of each|de chaque)\s+(.+)$/i);
  if (match) return { name: match[2], quantity: Number(match[1]), qualifier: 'of each', confidence: 0.82, method: 'of-each' };

  match = line.match(/^(\d+)\s+(.+?)\s+(?:per player|par joueur)$/i);
  if (match) return { name: match[2], quantity: Number(match[1]), qualifier: 'per player', confidence: 0.82, method: 'per-player' };

  match = line.match(/^(\d+)\s*(?:x|×)?\s+(.+)$/i);
  if (match) return { name: match[2], quantity: Number(match[1]), confidence: 0.96, method: 'quantity-first' };

  match = line.match(/^(\d+)\s*[–-]\s*(\d+)\s+(.+)$/i);
  if (match) return { name: match[3], quantity: null, quantityRange: [Number(match[1]), Number(match[2])], confidence: 0.78, method: 'quantity-range' };

  match = line.match(/^(.+?)\s*(?:\((\d+)\)|[:–—-]\s*(\d+)|\s+x\s*(\d+))$/i);
  if (match) return { name: match[1], quantity: Number(match[2] || match[3] || match[4]), confidence: 0.92, method: 'quantity-suffix' };

  match = line.match(/^(\d+)\s+(?:of each|de chaque)\s+(.+)$/i);
  if (match) return { name: match[2], quantity: Number(match[1]), qualifier: 'of each', confidence: 0.82, method: 'of-each' };

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

function looksLikeComponent(name, rawLine) {
  const text = fold(`${name} ${rawLine}`);
  if (text.length < 3 || text.length > 180) return false;
  if (/^\d+$/.test(fold(name))) return false;
  if (/^(setup|rules?|gameplay|objective|contents?|components?)$/.test(fold(name))) return false;
  const hasTerm = Object.values(COMPONENT_TERMS).flat().some((term) => new RegExp(`\\b${fold(term).replace(/ /g, '\\s+')}\\b`, 'i').test(text));
  const hasQuantity = /\b\d+\b/.test(rawLine);
  return hasTerm || hasQuantity;
}

function cleanName(value) {
  return String(value || '')
    .replace(/^[•●▪◦*-]+\s*/, '')
    .replace(/[,:;]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePage(line) {
  const match = line.match(/(?:page|p\.)\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function isShortInventoryLabel(name, rawLine) {
  const foldedName = fold(name);
  const words = foldedName.split(/\s+/).filter(Boolean);
  if (words.length > 5 || /[.;!?]/.test(rawLine)) return false;
  if (/^(shuffle|then|place|each|randomly|when|if|and|to|your|you|on|the)\b/.test(foldedName)) return false;
  if (/^(back|front)\s+of\b/.test(foldedName)) return false;
  return true;
}

function toRecord(parsed, rawLine, index, sectionFound) {
  const name = cleanName(parsed.name);
  const normalizedName = normalizeName(name);
  const category = normalizeCategory('', name);
  const quantity = Number.isInteger(parsed.quantity) ? parsed.quantity : null;
  const reviewRequired = !sectionFound || quantity === null || parsed.confidence < 0.8 || category === 'other';
  return {
    id: `comp-${index + 1}`,
    name,
    normalizedName,
    category,
    quantity,
    sourcePage: parsePage(rawLine),
    sourceQuote: rawLine.trim(),
    confidence: parsed.confidence,
    reviewRequired,
    details: '',
    quantityRange: parsed.quantityRange || null,
    qualifier: parsed.qualifier || null,
  };
}

function deterministicInventory(text) {
  const section = findComponentSection(text);
  const sourceLines = section.found ? section.lines : String(text || '').split(/\r?\n/);
  const quantityOnlySection = section.found && /contents\s*(?:&|and)\s*setup/i.test(section.heading || '');
  const records = [];

  for (const line of sourceLines) {
    const trimmed = line.trim();
    if (!trimmed || isHeading(trimmed, STOP_HEADINGS)) continue;
    const parsed = parseQuantity(trimmed);
    if (!looksLikeComponent(parsed.name, trimmed)) continue;
    if (section.found && parsed.method === 'name-only' && !isShortInventoryLabel(parsed.name, trimmed)) continue;
    if (quantityOnlySection && parsed.method === 'name-only') continue;
    const record = toRecord(parsed, trimmed, records.length, section.found);
    if (!PLACEHOLDER_NAMES.has(fold(record.name))) records.push(record);
  }

  const deduped = [];
  const byName = new Map();
  for (const record of records) {
    const existing = byName.get(record.normalizedName);
    if (!existing) {
      byName.set(record.normalizedName, record);
      deduped.push(record);
    } else if (record.confidence > existing.confidence || (existing.quantity === null && record.quantity !== null)) {
      const position = deduped.indexOf(existing);
      deduped[position] = { ...record, id: existing.id };
      byName.set(record.normalizedName, deduped[position]);
    }
  }

  return {
    components: deduped,
    sectionFound: section.found,
    sectionHeading: section.heading,
    sectionStartLine: section.startLine,
    sectionEndLine: section.endLine,
    reviewRequired: !section.found || deduped.length === 0 || deduped.some((component) => component.reviewRequired),
    message: deduped.length === 0
      ? 'No named physical components were found; operator review is required.'
      : (!section.found ? 'No component-list heading was found; extracted candidates require review.' : null),
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

async function extractComponentInventory(text, { gameName = null, llm = null, llmConfigured = false } = {}) {
  const deterministic = deterministicInventory(text);
  const needsEnrichment = deterministic.components.length === 0 || deterministic.components.some((component) => component.reviewRequired);

  if (!needsEnrichment || !llmConfigured || !llm?.chat?.completions?.create) {
    return { ...deterministic, extractionMethod: 'deterministic' };
  }

  try {
    const response = await llm.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: `Extract only physical board-game component TYPES from this rulebook. Return ONLY a JSON array, never Markdown. Each object must contain name, category (${COMPONENT_CATEGORIES.join('|')}), quantity (integer or null), sourcePage (integer or null), sourceQuote, confidence (0 to 1). Do not invent components. Game: ${gameName || 'unknown'}\n\n${String(text || '').slice(0, 20000)}`,
      }],
      max_completion_tokens: 1800,
    });
    const llmComponents = normalizeLlmComponents(response.choices?.[0]?.message?.content, text);
    if (llmComponents.length > 0) {
      return {
        ...deterministic,
        components: llmComponents,
        reviewRequired: llmComponents.some((component) => component.reviewRequired),
        extractionMethod: 'deterministic-plus-llm',
        message: deterministic.components.length === 0 ? 'LLM supplied structured candidates; review is required.' : null,
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
  parseQuantity,
  normalizeName,
  normalizeCategory,
  deterministicInventory,
  extractComponentInventory,
};
