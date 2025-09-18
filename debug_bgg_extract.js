import axios from 'axios';
import * as xml2js from 'xml2js';

async function extractBGGMetadataFromAPI(gameId) {
  try {
    console.log(`Fetching BGG data for game ID: ${gameId}`);
    const url = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}&stats=1`;
    const { data: xml } = await axios.get(url, {
      headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
      timeout: 10000
    });
    console.log('BGG API request successful');
    
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(xml);
    console.log('XML parsing successful');
    
    if (!result.items || !result.items.item) {
      throw new Error('Game not found in BGG API');
    }
    
    const item = result.items.item;
    console.log('Item found in BGG API response');
    
    const gameName = Array.isArray(item.name)
      ? item.name.find(n => n.$.type === 'primary')?.$.value || item.name[0].$.value
      : item.name.$.value;
    console.log('Game name extracted:', gameName);

    const linksArr = item.link ? (Array.isArray(item.link) ? item.link : [item.link]) : [];
    const publishers = linksArr.filter(link => link.$.type === 'boardgamepublisher').map(link => link.$.value);
    const designers = linksArr.filter(link => link.$.type === 'boardgamedesigner').map(link => link.$.value);
    const artists = linksArr.filter(link => link.$.type === 'boardgameartist').map(link => link.$.value);
    const categories = linksArr.filter(link => link.$.type === 'boardgamecategory').map(link => link.$.value);
    const mechanics = linksArr.filter(link => link.$.type === 'boardgamemechanic').map(link => link.$.value);

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
      average_rating: item.statistics?.ratings?.average?.$.value ? parseFloat(item.statistics.ratings.average.$.value).toFixed(1) : '',
      bgg_rank: item.statistics?.ratings?.ranks?.rank?.$?.value || '',
      bgg_id: gameId,
      year: item.yearpublished?.$.value || '',
      cover_image: item.image || '',
      thumbnail: item.thumbnail || item.image || ''
    };
    
    console.log('Metadata extracted successfully');
    return metadata;
  } catch (error) {
    console.error('Error extracting from BGG API:', error.message);
    throw error;
  }
}

async function debugBGGExtract() {
  try {
    console.log('Testing BGG metadata extraction for Catan (ID: 13)...');
    const metadata = await extractBGGMetadataFromAPI('13');
    console.log('Extracted metadata:', JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error in debugBGGExtract:', error.message);
    console.error('Error stack:', error.stack);
  }
}

debugBGGExtract();