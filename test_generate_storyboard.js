import axios from 'axios';
import fs from 'fs';

async function testGenerateStoryboard() {
  try {
    // Read the components and images data we saved earlier
    const componentsData = JSON.parse(fs.readFileSync('./work/components.json', 'utf8'));
    const imagesData = JSON.parse(fs.readFileSync('./work/images.search.json', 'utf8'));
    
    // Also read the BGG metadata
    const bggData = JSON.parse(fs.readFileSync('./work/bgg.html.extract.json', 'utf8'));
    
    console.log('Generating storyboard...');
    
    // Prepare the request data
    const requestData = {
      metadata: bggData.metadata || {},
      images: imagesData.images || [],
      components: componentsData.components || [],
      language: "en",
      voice: null,
      compImageOverrides: {},
      compImageMulti: {}
    };
    
    console.log('Request data:', JSON.stringify(requestData, null, 2));
    
    const response = await axios.post('http://127.0.0.1:5001/api/generate-storyboard', requestData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Storyboard Response:', JSON.stringify(response.data, null, 2));
    
    // Save to file
    const workDir = './work';
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    
    fs.writeFileSync('./work/script.en.json', JSON.stringify(response.data, null, 2));
    console.log('Storyboard saved to ./work/script.en.json');
    
    if (response.data.storyboard && response.data.storyboard.scenes) {
      console.log('Storyboard scene count:', response.data.storyboard.scenes.length);
    } else if (response.data.storyboard) {
      console.log('Storyboard:', response.data.storyboard);
    }
  } catch (error) {
    console.error('Error generating storyboard:', error.response?.data || error.message);
  }
}

testGenerateStoryboard();