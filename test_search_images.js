import fs from 'fs';

import axios from 'axios';

async function testSearchImages() {
  try {
    console.log('Searching for images for "Catan"...');
    const response = await axios.post(
      'http://127.0.0.1:5001/api/search-images',
      {
        gameName: 'Catan',
        limit: 40,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('Search Images Response:', response.data);

    // Save to file
    const workDir = './work';
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    fs.writeFileSync('./work/images.search.json', JSON.stringify(response.data, null, 2));
    console.log('Images search results saved to ./work/images.search.json');

    // Show first 10 results if any
    if (
      response.data.images &&
      Array.isArray(response.data.images) &&
      response.data.images.length > 0
    ) {
      console.log('First 10 image results:');
      console.log(
        response.data.images.slice(0, 10).map((img) => ({
          id: img.id,
          path: img.path,
          name: img.name,
        })),
      );
    } else {
      console.log('No images found');
    }
  } catch (error) {
    console.error('Error searching images:', error.response?.data || error.message);
  }
}

testSearchImages();
