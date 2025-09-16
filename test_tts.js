import axios from 'axios';
import fs from 'fs';

async function testTTS() {
  try {
    // Read the storyboard data we saved earlier
    const storyboardData = JSON.parse(fs.readFileSync('./work/script.en.json', 'utf8'));
    
    console.log('Generating TTS for English script...');
    
    // Extract text from the storyboard segments
    let textEn = '';
    if (storyboardData.storyboard && storyboardData.storyboard.scenes) {
      storyboardData.storyboard.scenes.forEach(scene => {
        if (scene.segments) {
          scene.segments.forEach(segment => {
            if (segment.textEn) {
              textEn += segment.textEn + ' ';
            }
          });
        }
      });
    }
    
    // If we don't have segments, use a simple welcome message
    if (!textEn) {
      textEn = "Welcome to the Catan tutorial. In this video, we'll learn how to play the popular board game Catan.";
    }
    
    // Limit the text length for testing
    textEn = textEn.substring(0, 500);
    
    console.log('Text for TTS (first 500 chars):', textEn);
    
    // Prepare the request data
    const requestData = {
      text: textEn,
      lang: "en",
      voice: "default", // Changed from voiceId to voice
      gameName: "CATAN"
    };
    
    console.log('Request data:', JSON.stringify(requestData, null, 2));
    
    const response = await axios.post('http://127.0.0.1:5001/tts', requestData, {
      headers: {
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer' // Important for audio data
    });
    
    console.log('TTS Response status:', response.status);
    
    // Save the audio file
    const workDir = './work';
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    
    const outputPath = './work/tts.en.mp3';
    fs.writeFileSync(outputPath, response.data);
    console.log('TTS audio saved to', outputPath);
    
    // Also save the request data for reference
    fs.writeFileSync('./work/tts.en.json', JSON.stringify(requestData, null, 2));
    console.log('TTS request data saved to ./work/tts.en.json');
    
  } catch (error) {
    console.error('Error generating TTS:', error.response?.data || error.message);
    
    // Save error info for debugging
    const errorInfo = {
      error: error.message,
      responseStatus: error.response?.status,
      responseData: error.response?.data ? error.response.data.toString() : null
    };
    
    fs.writeFileSync('./work/tts.error.json', JSON.stringify(errorInfo, null, 2));
    console.log('Error info saved to ./work/tts.error.json');
  }
}

testTTS();