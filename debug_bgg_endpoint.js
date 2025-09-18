import axios from 'axios';
import * as xml2js from 'xml2js';

// Mock the bggMetadataCache
const bggMetadataCache = new Map();

function extractGameIdFromBGGUrl(url) {
  const match = url.match(/\/boardgame\/(\d+)/);
  return match ? match[1] : null;
}

async function extractBGGMetadataFromAPI(gameId) {
  try {
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;
    const { data: xml } = await axios.get(url, {
      headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
      timeout: 10000
    });
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);
    if (!result.items || !result.items.item) {
      throw new Error('Game not found in BGG API');
    }
    const item = result.items.item;
    const gameName = Array.isArray(item.name)
      ? item.name.find(n => n.$.type === 'primary')?.$.value || item.name[0].$.value
      : item.name.$.value;

    const linksArr = item.link ? (Array.isArray(item.link) ? item.link : [item.link]) : [];
    const publishers = linksArr.filter(link => link.$.type === 'boardgamepublisher').map(link => link.$.value);
    const designers = linksArr.filter(link => link.$.type === 'boardgamedesigner').map(link => link.$.value);
    const artists = linksArr.filter(link => link.$.type === 'boardgameartist').map(link => link.$.value);
    const categories = linksArr.filter(link => link.$.type === 'boardgamecategory').map(link => link.$.value);
    const mechanics = linksArr.filter(link => link.$.type === 'boardgamemechanic').map(link => link.$.value);

    return {
      title: gameName || '',
      publisher: publishers,
      player_count: `${item.minplayers?.$.value || '?'}-${item.maxplayers?.$.value || '?'}`,
      play_time: `${item.playingtime?.$.value || item.maxplaytime?.$.value || '?'} min`,
      min_age: `${item.minage?.$.value || '?'}+`,
      theme: categories,
      mechanics,
      designers,
      artists,
      description: item.description || '',
      average_rating: item.statistics?.ratings?.average?.$.value ? parseFloat(item.statistics.ratings.average.$.value).toFixed(1) : '',
      bgg_rank: item.statistics?.ratings?.ranks?.rank?.$?.value || '',
      bgg_id: gameId,
      year: item.yearpublished?.$.value || '',
      cover_image: item.image || '',
      thumbnail: item.thumbnail || item.image || ''
    };
  } catch (error) {
    console.error('Error extracting from BGG API:', error.message);
    throw error;
  }
}

async function debugExtractBGGHtml(url) {
  try {
    console.log(`Testing BGG HTML extraction for URL: ${url}`);
    
    // Validate URL format
    if (!url || !url.match(/^https?:\/\/boardgamegeek\.com\/boardgame\/\d+(\/.*)?$/)) {
      console.log('URL validation failed');
      return { error: 'Invalid or missing BGG boardgame URL' };
    }
    console.log('URL validation passed');
    
    // Check cache
    if (bggMetadataCache.has(url)) {
      console.log('Cache hit');
      return { success: true, metadata: bggMetadataCache.get(url) };
    }
    console.log('Cache miss');
    
    // Extract game ID
    const gameId = extractGameIdFromBGGUrl(url);
    console.log('Game ID extracted:', gameId);
    
    if (gameId) {
      try {
        console.log('Attempting BGG API extraction...');
        const apiData = await extractBGGMetadataFromAPI(gameId);
        bggMetadataCache.set(url, apiData);
        console.log('BGG API extraction successful');
        return { success: true, metadata: apiData };
      } catch (apiError) {
        console.log('BGG API failed; falling back to HTML + LLM...', apiError.message);
      }
    }
    
    // Fallback to HTML extraction (simulated)
    console.log('Attempting HTML extraction...');
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'BoardGameTutorialGenerator/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      timeout: 15000
    });
    
    // Simulate cheerio parsing
    console.log('HTML fetched, length:', html.length);
    
    // Check for OpenGraph data
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i);
    const ogDescriptionMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["'][^>]*>/i);
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["'][^>]*>/i);
    
    if (ogTitleMatch && ogDescriptionMatch) {
      const quickMetadata = {
        title: ogTitleMatch[1],
        publisher: [],
        player_count: '',
        play_time: '',
        min_age: '',
        theme: [],
        mechanics: [],
        designers: [],
        artists: [],
        description: ogDescriptionMatch[1],
        average_rating: '',
        bgg_rank: '',
        bgg_id: gameId || '',
        year: '',
        cover_image: ogImageMatch ? ogImageMatch[1] : '',
        thumbnail: ogImageMatch ? ogImageMatch[1] : ''
      };
      bggMetadataCache.set(url, quickMetadata);
      console.log('HTML extraction successful (OpenGraph)');
      return { success: true, metadata: quickMetadata };
    }
    
    // Look for main content
    const mainBodyMatch = html.match(/<div[^>]*id=["']mainbody["'][^>]*>([\s\S]*?)<\/div>/i);
    let mainContentText = mainBodyMatch ? mainBodyMatch[1] : '';
    
    if (!mainContentText) {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      mainContentText = bodyMatch ? bodyMatch[1] : '';
    }
    
    if (mainContentText && mainContentText.length > 30) {
      console.log('Main content found, length:', mainContentText.length);
      // This would normally call OpenAI API, but we'll simulate a response
      return { error: 'HTML extraction requires OpenAI API key' };
    }
    
    console.log('No extractable content found');
    return { error: 'No extractable content found on the page.' };
  } catch (error) {
    console.error('Error in debugExtractBGGHtml:', error.message);
    return { error: 'Failed to extract BGG metadata from HTML' };
  }
}

async function main() {
  try {
    console.log('=== Testing BGG HTML Extraction Endpoint ===');
    const result = await debugExtractBGGHtml('https://boardgamegeek.com/boardgame/13/catan');
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error in main:', error.message);
  }
}

main();