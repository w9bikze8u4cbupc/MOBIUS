import axios from 'axios';

async function debugBGG() {
  try {
    console.log('Testing BGG API directly...');
    const response = await axios.get('https://boardgamegeek.com/xmlapi2/thing?id=13&stats=1', {
      headers: { 'User-Agent': 'BoardGameTutorialGenerator/1.0' },
      timeout: 10000
    });
    console.log('BGG API Response Status:', response.status);
    console.log('BGG API Response Headers:', response.headers);
    console.log('BGG API Response Data Length:', response.data.length);
    
    // Try to parse the XML
    console.log('Testing XML parsing...');
    const xml2js = (await import('xml2js')).default;
    const parser = new xml2js.Parser({ explicitArray: false });
    const result = await parser.parseStringPromise(response.data);
    console.log('XML Parsing Successful');
    console.log('Parsed Data Keys:', Object.keys(result));
    
    if (result.items && result.items.item) {
      const item = result.items.item;
      console.log('Item found:', !!item);
      console.log('Item name type:', typeof item.name);
      if (Array.isArray(item.name)) {
        console.log('Item name array length:', item.name.length);
      } else if (item.name && item.name.$) {
        console.log('Item name value:', item.name.$.value);
      }
    }
  } catch (error) {
    console.error('Error in debugBGG:', error.message);
    console.error('Error stack:', error.stack);
  }
}

debugBGG();