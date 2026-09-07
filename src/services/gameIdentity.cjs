/**
 * Canonical game identity contract.
 *
 * A board-game title has several useful representations.  This module keeps
 * those representations together and makes the resolution order explicit so
 * filenames can never silently become product identity or narration.
 */

const GAME_IDENTITY_CONTRACT_VERSION = 'game-identity-v1';

const NUMBER_WORDS = Object.freeze({
  0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five',
  6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten',
  11: 'Eleven', 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen',
  15: 'Fifteen', 16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen',
  19: 'Nineteen', 20: 'Twenty',
});

// These are editorial aliases, not alternate product names. They prevent a
// translated rulebook summary from changing the identity spoken by Amélie.
const DEFAULT_TITLE_ALIASES = Object.freeze({
  'terraforming mars': Object.freeze(['Terraformation de Mars']),
  '7 wonders duel': Object.freeze(['Sept Wonders Duel', 'Sept Merveilles Duel', 'Seven Wonders Duel']),
});

function clean(value) {
  if (value === undefined || value === null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function firstText(...values) {
  return values.map(clean).find(Boolean) || '';
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  return text ? [text] : [];
}

function looksLikeTechnicalIdentity(value) {
  const text = clean(value);
  if (!text) return true;
  return /(?:^|[-_\s])(?:tm|bgg|rulebook|rules|project|source|zero[-_ ]state|eng|english|fr|french)(?:$|[-_\s])/i.test(text)
    || /\b[a-f0-9]{12,}\b/i.test(text)
    || /(?:\.pdf|\.json|\.mp4)$/i.test(text)
    || /^\d+$/.test(text);
}

function titleFromFilename(filename) {
  const base = clean(filename).replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  const withoutTechnical = base
    .replace(/\b(?:rulebook|rules|zero state|source|eng|english|fr|french|bgg)\b/gi, ' ')
    .replace(/\b[a-f0-9]{12,}\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withoutTechnical || looksLikeTechnicalIdentity(withoutTechnical)) return '';
  return withoutTechnical;
}

function titleFromRulebook(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const patterns = [
    /\bIn\s+([A-Z0-9][A-Za-z0-9'’:&-]*(?:\s+[A-Z0-9][A-Za-z0-9'’:&-]*){0,6}),\s+you\s+(?:control|play|are)\b/,
    /\bWelcome\s+to\s+([A-Z0-9][A-Za-z0-9'’:&-]*(?:\s+[A-Z0-9][A-Za-z0-9'’:&-]*){0,6})\b/i,
    /\bDans\s+([A-ZÀ-ÖØ-Þ0-9][^,.!?]{1,64}),\s+vous\b/i,
  ];
  for (const pattern of patterns) {
    const candidate = clean(source.match(pattern)?.[1]).replace(/[\s,:;]+$/g, '');
    if (candidate && candidate.length <= 80 && !looksLikeTechnicalIdentity(candidate)) return candidate;
  }
  return '';
}

function bggTitle(bgg = {}) {
  const names = bgg.names || bgg.name;
  const primaryName = Array.isArray(names)
    ? names.find((item) => item?.type === 'primary' || item?.$?.type === 'primary')?.value
      || names.find((item) => item?.value || item?.$?.value)?.value
      || names.find((item) => item?.$?.value)?.$?.value
    : names?.value || names?.$?.value || names;
  return firstText(bgg.gameName, bgg.title, primaryName);
}

function getExplicitIdentity(projectMetadata = {}) {
  const identity = projectMetadata.identity || projectMetadata.gameIdentity || {};
  const explicit = projectMetadata.operatorIdentity || projectMetadata.identityOverride || {};
  return {
    ...identity,
    ...explicit,
    displayName: firstText(explicit.displayName, explicit.gameName, identity.displayName, identity.gameName,
      projectMetadata.displayName, projectMetadata.officialEditionTitle, projectMetadata.gameName),
    officialEditionTitle: firstText(explicit.officialEditionTitle, identity.officialEditionTitle, projectMetadata.officialEditionTitle),
    spokenName: firstText(explicit.spokenName, identity.spokenName, projectMetadata.spokenName),
    pronunciationOverride: explicit.pronunciationOverride || identity.pronunciationOverride || projectMetadata.pronunciationOverride,
    operatorConfirmed: explicit.operatorConfirmed === true || identity.operatorConfirmed === true || projectMetadata.identityConfirmed === true,
  };
}

function resolveCanonicalGameIdentity({
  explicitOverride = {},
  projectMetadata = {},
  bgg = {},
  rulebook = {},
  filename = '',
  locale = 'fr-CA',
  sourceLanguage = 'en',
} = {}) {
  const explicit = {
    ...getExplicitIdentity(projectMetadata),
    ...(explicitOverride && typeof explicitOverride === 'object' ? explicitOverride : {}),
  };
  const directOverrideSupplied = explicitOverride && typeof explicitOverride === 'object'
    && ['sourceTitle', 'officialEditionTitle', 'displayName', 'gameName', 'spokenName', 'pronunciationOverride', 'pronunciationRepresentation']
      .some((key) => clean(explicitOverride[key]));
  const bggName = bggTitle(bgg);
  const rulebookName = firstText(rulebook.gameName, rulebook.title, rulebook.sourceTitle, titleFromRulebook(rulebook.text));
  const filenameName = titleFromFilename(filename);

  const explicitName = firstText(
    explicit.displayName,
    explicit.officialEditionTitle,
    explicit.sourceTitle,
  );
  const candidates = (explicit.operatorConfirmed || directOverrideSupplied) && explicitName
    ? [{ name: explicitName, source: 'operator-confirmed', confidence: 'confirmed' }]
    : bggName
      ? [{ name: bggName, source: 'bgg', confidence: 'authoritative' }]
      : rulebookName
        ? [{ name: rulebookName, source: 'rulebook', confidence: 'grounded' }]
        : explicitName
          ? [{ name: explicitName, source: 'project-metadata', confidence: 'review' }]
          : filenameName
            ? [{ name: filenameName, source: 'filename-fallback', confidence: 'provisional' }]
            : [];
  const selected = candidates[0] || { name: 'Unknown Game', source: 'safe-fallback', confidence: 'low' };
  const displayName = clean(selected.name) || 'Unknown Game';
  const preserveOriginalTitle = explicit.preserveOriginalTitle !== false;
  const pronunciationOverride = explicit.pronunciationOverride || explicit.pronunciation || null;
  const overrideSpoken = typeof pronunciationOverride === 'string'
    ? pronunciationOverride
    : firstText(pronunciationOverride?.spokenName, pronunciationOverride?.representation, pronunciationOverride?.text);
  const explicitSpoken = firstText(explicit.spokenName, overrideSpoken);
  const spokenName = sanitizeSpokenGameName(explicitSpoken || spokenRepresentation(displayName), displayName);
  const pronunciationRepresentation = sanitizeSpokenGameName(
    firstText(explicit.pronunciationRepresentation, spokenName),
    spokenName,
  );
  const pronunciationStatus = explicitSpoken || explicit.pronunciationRepresentation
    ? 'operator-override'
    : spokenName !== displayName ? 'deterministic-representation' : 'preserved-original';
  const officialEditionTitle = firstText(
    explicit.officialEditionTitle,
    bggTitle(bgg),
    rulebook.officialEditionTitle,
    displayName,
  );
  const sourceTitle = firstText(
    explicit.sourceTitle,
    rulebook.sourceTitle,
    rulebook.gameName,
    rulebook.title,
    bggName,
    displayName,
  );

  return {
    version: GAME_IDENTITY_CONTRACT_VERSION,
    sourceTitle,
    officialEditionTitle,
    displayName,
    spokenName,
    locale: clean(explicit.locale) || locale,
    sourceLanguage: clean(explicit.sourceLanguage) || sourceLanguage,
    bggId: firstText(explicit.bggId, bgg.bggId, bgg.bgg_id, bgg.id) || null,
    edition: firstText(explicit.edition, bgg.edition, bgg.version, rulebook.edition) || null,
    versionName: firstText(explicit.versionName, bgg.versionName, bgg.version, rulebook.versionName, rulebook.version) || null,
    pronunciationOverride: pronunciationOverride || null,
    pronunciationRepresentation,
    pronunciationStatus,
    preserveOriginalTitle,
    titleAliases: [...new Set([
      ...(Array.isArray(explicit.titleAliases) ? explicit.titleAliases : []),
      ...(DEFAULT_TITLE_ALIASES[displayName.toLowerCase()] || []),
    ].map(clean).filter(Boolean))],
    provenance: {
      source: selected.source,
      confidence: selected.confidence,
      filenameUsed: selected.source === 'filename-fallback',
      authoritative: selected.source === 'operator-confirmed' || selected.source === 'bgg',
    },
  };
}

function sanitizeNarrationGameIdentity(value, identity = {}) {
  let text = clean(value);
  const narrationName = clean(identity.pronunciationRepresentation || identity.spokenName || identity.displayName);
  if (!narrationName) return text;
  const namesToReplace = [identity.displayName, identity.officialEditionTitle, identity.sourceTitle,
    ...(Array.isArray(identity.titleAliases) ? identity.titleAliases : [])];
  for (const alias of namesToReplace) {
    if (clean(alias)) text = text.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'gi'), narrationName);
  }
  return text;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function spokenRepresentation(value) {
  return clean(value).replace(/\b(\d{1,2})(?=\s+[A-Za-zÀ-ÿ])/g, (match) => NUMBER_WORDS[Number(match)] || match);
}

function sanitizeSpokenGameName(value, fallback = 'ce jeu') {
  const original = clean(value);
  const sanitized = original
    .replace(/\.(?:pdf|json|mp4)$/i, '')
    .replace(/\b[a-f0-9]{12,}\b/gi, ' ')
    .replace(/(?:^|[-_\s])(?:rulebook|rules|source|project|bgg|zero[-_ ]state|english|french|eng|fr)(?=$|[-_\s])/gi, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized && !looksLikeTechnicalIdentity(sanitized) ? sanitized : clean(fallback) || 'ce jeu';
}

function asNumberText(value) {
  if (value === undefined || value === null || value === '') return '';
  return clean(String(value));
}

function resolveCanonicalGameMetadata({ explicit = {}, bgg = {}, rulebook = {} } = {}) {
  const bggPlayers = bgg.playerCount || (bgg.minPlayers || bgg.minplayers || bgg.maxPlayers || bgg.maxplayers
    ? `${bgg.minPlayers || bgg.minplayers || '?'}-${bgg.maxPlayers || bgg.maxplayers || '?'} players` : '');
  const bggLength = bgg.gameLength || bgg.playTime || bgg.playingtime || bgg.play_time
    || (bgg.minPlayTime || bgg.maxPlayTime ? `${bgg.minPlayTime || '?'}-${bgg.maxPlayTime || '?'} min` : '');
  const bggAge = bgg.minimumAge || bgg.minAge || bgg.minage;
  const result = {
    playerCount: firstText(explicit.playerCount, explicit.player_count, bggPlayers, rulebook.playerCount),
    gameLength: firstText(explicit.gameLength, explicit.play_time, bggLength, rulebook.gameLength),
    minimumAge: firstText(explicit.minimumAge, explicit.recommended_age, bggAge, rulebook.minimumAge),
    designers: asArray(explicit.designers || explicit.designer).length
      ? asArray(explicit.designers || explicit.designer)
      : asArray(bgg.designers || bgg.designer).length ? asArray(bgg.designers || bgg.designer) : asArray(rulebook.designers),
    publisher: firstText(explicit.publisher, bgg.publisher, rulebook.publisher),
    yearPublished: firstText(explicit.yearPublished, explicit.year_published, bgg.yearPublished, bgg.yearpublished, rulebook.yearPublished),
    weight: firstText(explicit.weight, explicit.averageWeight, explicit.complexity, bgg.weight, bgg.averageWeight, bgg.averageweight),
    mechanics: asArray(explicit.mechanics || explicit.mechanic).length
      ? asArray(explicit.mechanics || explicit.mechanic)
      : asArray(bgg.mechanics || bgg.mechanic).length ? asArray(bgg.mechanics || bgg.mechanic) : [],
    categories: asArray(explicit.categories || explicit.category).length
      ? asArray(explicit.categories || explicit.category)
      : asArray(bgg.categories || bgg.category).length ? asArray(bgg.categories || bgg.category) : [],
    theme: firstText(explicit.theme, bgg.theme, rulebook.theme),
    edition: firstText(explicit.edition, bgg.edition, rulebook.edition),
    coverImage: firstText(explicit.coverImage, explicit.cover_image, bgg.coverImage, bgg.cover_image, bgg.image),
    thumbnail: firstText(explicit.thumbnail, bgg.thumbnail),
    bggId: firstText(explicit.bggId, explicit.bgg_id, bgg.bggId, bgg.bgg_id, bgg.id) || null,
    bggUrl: firstText(explicit.bggUrl, explicit.bgg_url, bgg.bggUrl, bgg.bgg_url) || null,
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== '' && !(Array.isArray(value) && value.length === 0)));
}

module.exports = {
  GAME_IDENTITY_CONTRACT_VERSION,
  NUMBER_WORDS,
  sanitizeSpokenGameName,
  sanitizeNarrationGameIdentity,
  spokenRepresentation,
  titleFromFilename,
  titleFromRulebook,
  resolveCanonicalGameIdentity,
  resolveCanonicalGameMetadata,
};
