import axios from 'axios';
import * as xml2js from 'xml2js';

async function testBGGAPI() {
  // Try a few different games to see if any have component information
  const gameIds = ['13', '12345', '167791']; // Catan, Twilight Imperium, Wingspan

  for (const gameId of gameIds) {
    try {
      const apiUrl = `https://boardgamegeek.com/xmlapi2/thing?id=${gameId}`;
      console.log(`\n=== Fetching BGG data for game ID: ${gameId} ===`);

      const response = await axios.get(apiUrl, { timeout: 8000 });
      console.log('Response status:', response.status);

      const parser = new xml2js.Parser({ explicitArray: false });
      const parsed = await parser.parseStringPromise(response.data);

      if (parsed && parsed.items && parsed.items.item) {
        const item = parsed.items.item;

        // Handle different name structures
        let gameName = 'Unknown';
        if (typeof item.name === 'string') {
          gameName = item.name;
        } else if (item.name && item.name.$ && item.name.$.value) {
          gameName = item.name.$.value;
        } else if (Array.isArray(item.name)) {
          // Find the primary name
          const primaryName = item.name.find((n) => n.$ && n.$.type === 'primary');
          gameName = primaryName ? primaryName.$.value : item.name[0].$.value;
        }

        console.log('Game title:', gameName);

        // Get the full description
        const description = item.description || '';
        console.log('Description length:', description.length);

        // Try to extract components using the same function as in the API
        console.log('\nTrying to extract components from description...');

        // This is the same logic as in extractComponentsFromDescription function
        if (description) {
          const cleanText = description.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ');

          const patterns = [
            new RegExp(
              'components?:\\s*([\\s\\S]+?)(?:\\n\\n|\\r\\n\\r\\n|setup|gameplay|overview|$)',
              'i',
            ),
            new RegExp(
              'contents?:\\s*([\\s\\S]+?)(?:\\n\\n|\\r\\n\\r\\n|setup|gameplay|overview|$)',
              'i',
            ),
            new RegExp(
              'includes?:\\s*([\\s\\S]+?)(?:\\n\\n|\\r\\n\\r\\n|setup|gameplay|overview|$)',
              'i',
            ),
            new RegExp(
              'game contains?:\\s*([\\s\\S]+?)(?:\\n\\n|\\r\\n\\r\\n|setup|gameplay|overview|$)',
              'i',
            ),
          ];

          let found = false;
          for (const pattern of patterns) {
            const match = cleanText.match(pattern);
            if (match) {
              console.log('Found match with pattern:', pattern);
              console.log('Matched content length:', match[1].length);
              console.log('Matched content preview:', match[1].substring(0, 300) + '...');
              found = true;
              break;
            }
          }

          if (!found) {
            console.log('No components found with regex patterns');
          }
        }
      } else {
        console.log('No game data found');
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }
}

testBGGAPI();
