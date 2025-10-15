// ESM module: src/ingest/bgg.js
// Responsibilities:
// - Fetch metadata for a BGG game by ID or URL
// - Parse the XML response into a structured JSON object
// - Handle errors gracefully and return partial data when possible

import { parseStringPromise } from 'xml2js';
import { spawnSync } from 'child_process';
import { cacheGet, cacheSet, isFresh } from '../services/cache.js';

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
  // Extract ID from URL if needed
  let bggId = bggIdOrUrl;
  if (typeof bggIdOrUrl === 'string' && bggIdOrUrl.includes('boardgamegeek.com')) {
    const match = bggIdOrUrl.match(/\/boardgame\/(\d+)/);
    if (match) {
      bggId = match[1];
    }
  }

  // Validate ID
  if (!bggId || isNaN(parseInt(bggId, 10))) {
    throw new Error(`Invalid BGG ID: ${bggId}`);
  }

  // Construct API URL
  const apiUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`;

  try {
    // Fetch XML data
    const response = await fetchWithTimeout(apiUrl, opts.timeout || 5000);
    
    if (!response.ok) {
      throw new Error(`BGG API request failed with status ${response.status}`);
    }

    const xmlData = await response.text();
    
    // Parse XML to JSON
    const jsonData = await parseStringPromise(xmlData, { explicitArray: false });
    
    // Extract relevant fields
    const item = jsonData?.items?.item;
    if (!item) {
      throw new Error('Invalid BGG API response: no item found');
    }

    // Normalize the data structure
    const normalized = {
      id: item.$.id,
      type: item.$.type,
      name: extractPrimaryName(item.name),
      description: item.description || '',
      yearPublished: item.yearpublished ? parseInt(item.yearpublished.$.value, 10) : null,
      minPlayers: item.minplayers ? parseInt(item.minplayers.$.value, 10) : null,
      maxPlayers: item.maxplayers ? parseInt(item.maxplayers.$.value, 10) : null,
      playingTime: item.playingtime ? parseInt(item.playingtime.$.value, 10) : null,
      minPlayTime: item.minplaytime ? parseInt(item.minplaytime.$.value, 10) : null,
      maxPlayTime: item.maxplaytime ? parseInt(item.maxplaytime.$.value, 10) : null,
      minAge: item.minage ? parseInt(item.minage.$.value, 10) : null,
      thumbnail: item.thumbnail || null,
      image: item.image || null,
      categories: extractLinks(item.link, 'boardgamecategory'),
      mechanics: extractLinks(item.link, 'boardgamemechanic'),
      families: extractLinks(item.link, 'boardgamefamily'),
      expansions: extractLinks(item.link, 'boardgameexpansion'),
      designers: extractLinks(item.link, 'boardgamedesigner'),
      artists: extractLinks(item.link, 'boardgameartist'),
      publishers: extractLinks(item.link, 'boardgamepublisher'),
      ratings: {
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
      }
    };

    return normalized;
  } catch (error) {
    // Return a minimal object with the ID if we can't fetch the full data
    return {
      id: bggId,
      error: error.message,
      fetchedAt: new Date().toISOString()
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