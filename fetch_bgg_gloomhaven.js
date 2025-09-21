import { promises as fs } from 'fs';

import axios from 'axios';

async function fetchBGGData() {
  try {
    const response = await axios.get('https://boardgamegeek.com/xmlapi2/thing?id=174430', {
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
      },
      decompress: true,
    });

    console.log('Response data length:', response.data.length);

    // Save to file
    await fs.writeFile('bgg_gloomhaven.xml', response.data, 'utf8');
    console.log('Data saved to bgg_gloomhaven.xml');

    // Look for description
    const descriptionMatch = response.data.match(/<description>([\s\S]*?)<\/description>/);
    if (descriptionMatch) {
      console.log('Description found, length:', descriptionMatch[1].length);
      // Look for components/contents patterns
      const componentsMatch = descriptionMatch[1].match(
        /components?:([\s\S]*?)(?:\n\n|setup|gameplay|overview|$)/i,
      );
      if (componentsMatch) {
        console.log('Components section found:', componentsMatch[1]);
      } else {
        console.log('No components section found in description');
      }
    } else {
      console.log('No description found');
    }
  } catch (error) {
    console.error('Error fetching BGG data:', error.message);
  }
}

fetchBGGData();
