// ESM module: src/ingest/bgg.js
// Responsibilities:
// - Fetch metadata for a BGG game by ID or URL
// - Parse the XML response into a structured JSON object
// - Handle errors gracefully and return partial data when possible
// - Add defensive parsing and source attribution for confidence scoring

import { parseStringPromise } from 'xml2js';
import { spawnSync } from 'child_process';
import { cacheGet, cacheSet, isFresh } from '../services/cache.js';
import { validateBGGId, validateBGGUrl } from '../utils/validation.js';
import { calculateBGGFieldConfidence } from '../utils/confidence.js';

const TTL = Number(process.env.BGG_CACHE_TTL_MS || 86400000);
const QPS = Number(process.env.BGG_RATE_LIMIT_QPS || 2);
let lastCall = 0;

function rateLimit() {
  const minGap = 1000 / QPS;
  const now = Date.now();
  const delta = now - lastCall;
  const wait = delta >= minGap ? 0 : (minGap - delta);
  return new Promise((r) => setTimeout(() => { lastCall = Date.now(); r(); }, wait));
}

async function fetchWithTimeout(url, timeout = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function fetchBggMetadata(bggIdOrUrl, opts = {}) {
  const warnings = [];
  
  // Extract ID from URL if needed
  let bggId = bggIdOrUrl;
  if (typeof bggIdOrUrl === 'string' && bggIdOrUrl.includes('boardgamegeek.com')) {
    // Validate URL first
    const urlValidation = validateBGGUrl(bggIdOrUrl);
    if (!urlValidation.isValid) {
      throw new Error(`Invalid BGG URL: ${urlValidation.errors.map(e => e.message).join(', ')}`);
    }
    warnings.push(...urlValidation.warnings.map(w => w.message));
    
    const match = bggIdOrUrl.match(/\/boardgame\/(\d+)/);
    if (match) {
      bggId = match[1];
    }
  }

  // Validate ID
  const idValidation = validateBGGId(bggId);
  if (!idValidation.isValid) {
    throw new Error(`Invalid BGG ID: ${idValidation.errors.map(e => e.message).join(', ')}`);
  }
  warnings.push(...idValidation.warnings.map(w => w.message));

  // Construct API URL with timeout
  const apiUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`;
  const timeout = opts.timeout || 10000; // 10 second default

  try {
    // Fetch XML data with timeout
    const response = await fetchWithTimeout(apiUrl, timeout);
    
    if (!response.ok) {
      warnings.push(`BGG API returned status ${response.status}`);
      throw new Error(`BGG API request failed with status ${response.status}`);
    }

    const xmlData = await response.text();
    
    // Defensive: Check for empty or invalid XML
    if (!xmlData || xmlData.trim().length === 0) {
      throw new Error('BGG API returned empty response');
    }
    
    // Parse XML to JSON
    const jsonData = await parseStringPromise(xmlData, { explicitArray: false });
    
    // Extract relevant fields
    const item = jsonData?.items?.item;
    if (!item) {
      throw new Error('Invalid BGG API response: no item found');
    }

    // Context for confidence calculation
    const context = {
      yearPublished: item.yearpublished ? parseInt(item.yearpublished.$.value, 10) : null,
      usersRated: item.statistics?.ratings?.usersrated ? parseInt(item.statistics.ratings.usersrated.$.value, 10) : 0
    };

    // Helper to safely extract and score fields
    const extractField = (value, fieldName) => {
      const confidence = calculateBGGFieldConfidence(value, context);
      return {
        value,
        source: 'bgg_api',
        confidence,
        extractedAt: new Date().toISOString()
      };
    };

    // Normalize the data structure with confidence scoring
    const normalized = {
      id: extractField(item.$.id, 'id'),
      type: extractField(item.$.type, 'type'),
      name: extractField(extractPrimaryName(item.name), 'name'),
      description: extractField(item.description || '', 'description'),
      yearPublished: extractField(
        item.yearpublished ? parseInt(item.yearpublished.$.value, 10) : null,
        'yearPublished'
      ),
      minPlayers: extractField(
        item.minplayers ? parseInt(item.minplayers.$.value, 10) : null,
        'minPlayers'
      ),
      maxPlayers: extractField(
        item.maxplayers ? parseInt(item.maxplayers.$.value, 10) : null,
        'maxPlayers'
      ),
      playingTime: extractField(
        item.playingtime ? parseInt(item.playingtime.$.value, 10) : null,
        'playingTime'
      ),
      minPlayTime: extractField(
        item.minplaytime ? parseInt(item.minplaytime.$.value, 10) : null,
        'minPlayTime'
      ),
      maxPlayTime: extractField(
        item.maxplaytime ? parseInt(item.maxplaytime.$.value, 10) : null,
        'maxPlayTime'
      ),
      minAge: extractField(
        item.minage ? parseInt(item.minage.$.value, 10) : null,
        'minAge'
      ),
      thumbnail: extractField(item.thumbnail || null, 'thumbnail'),
      image: extractField(item.image || null, 'image'),
      categories: extractField(extractLinks(item.link, 'boardgamecategory'), 'categories'),
      mechanics: extractField(extractLinks(item.link, 'boardgamemechanic'), 'mechanics'),
      families: extractField(extractLinks(item.link, 'boardgamefamily'), 'families'),
      expansions: extractField(extractLinks(item.link, 'boardgameexpansion'), 'expansions'),
      designers: extractField(extractLinks(item.link, 'boardgamedesigner'), 'designers'),
      artists: extractField(extractLinks(item.link, 'boardgameartist'), 'artists'),
      publishers: extractField(extractLinks(item.link, 'boardgamepublisher'), 'publishers'),
      ratings: extractField({
        usersRated: item.statistics?.ratings?.usersrated ? parseInt(item.statistics.ratings.usersrated.$.value, 10) : 0,
        average: item.statistics?.ratings?.average ? parseFloat(item.statistics.ratings.average.$.value) : 0,
        bayesAverage: item.statistics?.ratings?.bayesaverage ? parseFloat(item.statistics.ratings.bayesaverage.$.value) : 0,
        stddev: item.statistics?.ratings?.stddev ? parseFloat(item.statistics.ratings.stddev.$.value) : 0,
        median: item.statistics?.ratings?.median ? parseFloat(item.statistics.ratings.median.$.value) : 0,
        owned: item.statistics?.ratings?.owned ? parseInt(item.statistics.ratings.owned.$.value, 10) : 0,
        trading: item.statistics?.ratings?.trading ? parseInt(item.statistics.ratings.trading.$.value, 10) : 0,
        wanting: item.statistics?.ratings?.wanting ? parseInt(item.statistics.ratings.wanting.$.value, 10) : 0,
        wishing: item.statistics?.ratings?.wishing ? parseInt(item.statistics.ratings.wishing.$.value, 10) : 0,
        numComments: item.statistics?.ratings?.numcomments ? parseInt(item.statistics.ratings.numcomments.$.value, 10) : 0,
        numWeights: item.statistics?.ratings?.numweights ? parseInt(item.statistics.ratings.numweights.$.value, 10) : 0,
        averageWeight: item.statistics?.ratings?.averageweight ? parseFloat(item.statistics.ratings.averageweight.$.value) : 0,
      }, 'ratings'),
      _metadata: {
        warnings,
        fetchedAt: new Date().toISOString(),
        source: 'bgg_api',
        apiUrl
      }
    };

    return normalized;
  } catch (error) {
    // Return a minimal object with the ID and error details
    console.error('BGG fetch error:', error.message);
    return {
      id: { value: bggId, source: 'input', confidence: { score: 1.0, level: 'high', warnings: [] } },
      error: error.message,
      _metadata: {
        warnings: [...warnings, error.message],
        fetchedAt: new Date().toISOString(),
        source: 'error',
        failed: true
      }
    };
  }
}

// New fetchBGG function for the ingestion pipeline
export async function fetchBGG({ bggId, bggUrl, titleGuess }) {
  const key = bggId || bggUrl || (titleGuess ? `title:${titleGuess.toLowerCase()}` : null);
  if (key) {
    const cached = cacheGet(safeKey(key));
    if (cached && isFresh(cached, TTL)) return cached.data;
  }

  await rateLimit();

  // Try XML API first
  let data = null;
  try {
    data = await fetchViaXml({ bggId, bggUrl, titleGuess });
  } catch {
    // Fallback to DOM scrape
    data = await fetchViaScrape({ bggId, bggUrl, titleGuess });
  }

  const normalized = normalize(data);
  if (key) cacheSet(safeKey(key), { __ts: Date.now(), data: normalized });
  return normalized;
}

function safeKey(k) { return k.replace(/[^\w.\-]+/g, '_'); }

function normalize(raw) {
  // normalize fields: title, year, designers[], publisher, players, time, age, box_art_url, categories, mechanics
  return raw;
}

async function fetchViaXml({ bggId, bggUrl, titleGuess }) {
  const idOrUrl = bggId || bggUrl || titleGuess;
  if (!idOrUrl) return null;
  
  try {
    const result = await fetchBggMetadata(idOrUrl);
    
    // Return normalized data structure for the pipeline
    return {
      title: result.name,
      year: result.yearPublished,
      designers: result.designers?.map(d => d.value) || [],
      artists: result.artists?.map(a => a.value) || [],
      publisher: result.publishers?.map(p => p.value) || [],
      players: result.minPlayers && result.maxPlayers ? 
        `${result.minPlayers}-${result.maxPlayers}` : 
        (result.minPlayers || result.maxPlayers || 'N/A'),
      time: result.playingTime || 
        (result.minPlayTime && result.maxPlayTime ? 
          `${result.minPlayTime}-${result.maxPlayTime}` : 
          'N/A'),
      age: result.minAge ? `${result.minAge}+` : 'N/A',
      categories: result.categories?.map(c => c.value) || [],
      mechanics: result.mechanics?.map(m => m.value) || [],
      description: result.description || '',
      image: result.image || '',
      thumbnail: result.thumbnail || '',
      bggId: result.id
    };
  } catch (error) {
    throw new Error(`Failed to fetch BGG metadata: ${error.message}`);
  }
}

async function fetchViaScrape({ bggId, bggUrl, titleGuess }) {
  // Placeholder for scraping implementation
  // In a real implementation, this would scrape the BGG website
  return null;
}

function extractPrimaryName(names) {
  if (!names) return null;
  
  // Handle both array and single object cases
  const nameArray = Array.isArray(names) ? names : [names];
  
  // Find the primary name (type="primary")
  const primary = nameArray.find(n => n.$.type === 'primary');
  if (primary) return primary.$.value;
  
  // Fallback to the first name
  return nameArray[0] ? nameArray[0].$.value : null;
}

function extractLinks(links, type) {
  if (!links) return [];
  
  // Handle both array and single object cases
  const linkArray = Array.isArray(links) ? links : [links];
  
  // Filter by type and extract values
  return linkArray
    .filter(link => link.$.type === type)
    .map(link => ({
      id: link.$.id,
      value: link.$.value
    }));
}

export default { fetchBggMetadata, fetchBGG };