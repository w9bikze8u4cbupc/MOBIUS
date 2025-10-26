// Test script to check endpoint functionality
import fetch from 'node-fetch';

async function testEndpoints() {
    console.log('Testing endpoints...');
    
    try {
        // Test summarize endpoint
        console.log('Testing summarize endpoint...');
        const summarizeResponse = await fetch('http://localhost:5001/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                rulebookText: "This is a test rulebook text.",
                gameName: "Test Game"
            })
        });
        
        console.log('Summarize response status:', summarizeResponse.status);
        const summarizeData = await summarizeResponse.text();
        console.log('Summarize response data:', summarizeData);
    } catch (error) {
        console.error('Error testing summarize endpoint:', error.message);
    }
    
    try {
        // Test tts endpoint
        console.log('Testing TTS endpoint...');
        const ttsResponse = await fetch('http://localhost:5001/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: "This is a test.",
                voice: "dllHSct4GokGc1AH9JwT",
                language: "english",
                gameName: "Test Game"
            })
        });
        
        console.log('TTS response status:', ttsResponse.status);
        const ttsData = await ttsResponse.text();
        console.log('TTS response data:', ttsData);
    } catch (error) {
        console.error('Error testing TTS endpoint:', error.message);
    }
}

testEndpoints();