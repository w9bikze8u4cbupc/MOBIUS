import axios from 'axios';
import { promises as fs } from 'fs';

async function fetchBGGData() {
  try {
    const response = await axios.get('https://boardgamegeek.com/xmlapi2/thing?id=13', {
      headers: {
        'Accept-Encoding': 'gzip, deflate, br'
      },
      decompress: true
    });
    
    console.log('Response headers:', response.headers);
    console.log('Response data:', response.data);
    
    // Save to file
    await fs.writeFile('bgg_catan.xml', response.data, 'utf8');
    console.log('Data saved to bgg_catan.xml');
  } catch (error) {
    console.error('Error fetching BGG data:', error.message);
  }
}

fetchBGGData();