// Test the exact BGG API function from the server code
import axios from 'axios';
import * as xml2js from 'xml2js';

async function extractBGGMetadataFromAPI(gameId) {
  try {
    console.log(`Calling BGG API for game ID: ${gameId}`);
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;
    console.log(`URL: ${url}`);

    const { data: xml } = await axios.get(url, {
      headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
      timeout: 10000,
    });

    console.log('BGG API response received, parsing XML...');
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);

    console.log('XML parsed successfully');
    console.log('Result keys:', Object.keys(result));
    console.log('Items exist:', !!result.items);
    if (result.items) {
      console.log('Item exists:', !!result.items.item);
    }

    if (!result.items || !result.items.item) {
      throw new Error('Game not found in BGG API');
    }

    const item = result.items.item;
    console.log('Item found, extracting data...');

    // Log the name structure to understand the format
    console.log('Name type:', typeof item.name);
    console.log('Name value:', item.name);
    if (Array.isArray(item.name)) {
      console.log('Name array length:', item.name.length);
      console.log('First name item:', JSON.stringify(item.name[0]));
    } else if (item.name && typeof item.name === 'object') {
      console.log('Name object keys:', Object.keys(item.name));
      if (item.name.$) {
        console.log('Name object $ keys:', Object.keys(item.name.$));
      }
    }

    const gameName = Array.isArray(item.name)
      ? item.name.find((n) => n.$.type === 'primary')?.$.value || item.name[0].$.value
      : item.name.$.value;

    console.log('Game name extracted:', gameName);

    const linksArr = item.link ? (Array.isArray(item.link) ? item.link : [item.link]) : [];
    console.log('Links array length:', linksArr.length);

    const publishers = linksArr
      .filter((link) => link.$.type === 'boardgamepublisher')
      .map((link) => link.$.value);
    const designers = linksArr
      .filter((link) => link.$.type === 'boardgamedesigner')
      .map((link) => link.$.value);
    const artists = linksArr
      .filter((link) => link.$.type === 'boardgameartist')
      .map((link) => link.$.value);
    const categories = linksArr
      .filter((link) => link.$.type === 'boardgamecategory')
      .map((link) => link.$.value);
    const mechanics = linksArr
      .filter((link) => link.$.type === 'boardgamemechanic')
      .map((link) => link.$.value);

    console.log('Extracting other fields...');

    const metadata = {
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
      average_rating: item.statistics?.ratings?.average?.$.value
        ? parseFloat(item.statistics.ratings.average.$.value).toFixed(1)
        : '',
      bgg_rank: item.statistics?.ratings?.ranks?.rank?.$?.value || '',
      bgg_id: gameId,
      year: item.yearpublished?.$.value || '',
      cover_image: item.image || '',
      thumbnail: item.thumbnail || item.image || '',
    };

    console.log('Metadata extracted successfully');
    return metadata;
  } catch (error) {
    console.error('Error in extractBGGMetadataFromAPI:', error.message);
    console.error('Error stack:', error.stack);
    throw error;
  }
}

async function main() {
  try {
    console.log('=== Testing BGG API Function Directly ===');
    const result = await extractBGGMetadataFromAPI('13');
    console.log('Success! Extracted metadata:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

main();
