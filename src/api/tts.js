// src/api/tts.js
// Endpoint for text-to-speech generation

import express from 'express';
import fs from 'fs';
import path from 'path';
import { getDirs } from '../config/paths.js';

const router = express.Router();

// Mock TTS implementation - in a real implementation, this would use a service like ElevenLabs
const VOICE_OPTIONS = [
  { name: "English - Haseeb", id: "dllHSct4GokGc1AH9JwT", language: "english" },
  { name: "English - Stephanie", id: "oAoF4NpW2Aqxplg9HdYB", language: "english" },
  { name: "French - Patrick", id: "XTyroWkQl32ZSd3rRVZ1", language: "french" },
  { name: "French - Louis", id: "j9RedbMRSNQ74PyikQwD", language: "french" },
  { name: "French - Anna", id: "gCux0vt1cPsEXPNSbchu", language: "french" }
];

/**
 * Generate audio from text using TTS
 */
router.post('/', async (req, res) => {
  try {
    const { text, voice, language, gameName } = req.body;
    
    // Validate required fields
    if (!text) {
      return res.status(400).json({ 
        success: false, 
        error: 'Text is required' 
      });
    }
    
    // Generate request ID for tracing
    const requestId = Math.random().toString(36).substring(2, 15) + 
                     Math.random().toString(36).substring(2, 15);
    
    console.log(`[${requestId}] Generating TTS for: ${gameName || 'Unknown Game'}`);
    
    // Validate voice selection
    const selectedVoice = VOICE_OPTIONS.find(v => v.id === voice);
    if (!selectedVoice) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid voice selection' 
      });
    }
    
    // Validate language
    if (language !== 'english' && language !== 'french') {
      return res.status(400).json({ 
        success: false, 
        error: 'Unsupported language' 
      });
    }
    
    // In a real implementation, we would call an actual TTS service here
    // For now, we'll generate a mock audio file
    
    // Create a mock audio buffer (in a real implementation, this would be actual audio data)
    const audioBuffer = generateMockAudio(text, selectedVoice, language);
    
    // Set appropriate headers for audio response
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Content-Disposition': 'inline; filename="tts-audio.mp3"'
    });
    
    // Send the audio data
    res.send(audioBuffer);
    
    console.log(`[${requestId}] TTS generation completed successfully`);
    
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Generate mock audio data for testing purposes
 * In a real implementation, this would call an actual TTS service
 */
function generateMockAudio(text, voice, language) {
  // Create a simple mock audio buffer
  // In a real implementation, this would be actual audio data from a TTS service
  const textLength = text.length;
  const duration = Math.min(30000, Math.max(1000, textLength * 50)); // 50ms per character, max 30 seconds
  
  // Create a simple waveform pattern based on the text
  const sampleRate = 22050; // Hz
  const durationSeconds = duration / 1000;
  const numSamples = Math.floor(sampleRate * durationSeconds);
  
  // Create a simple sine wave pattern
  const buffer = Buffer.alloc(numSamples);
  const frequency = 440; // Hz (A4 note)
  
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const amplitude = Math.sin(2 * Math.PI * frequency * t);
    buffer[i] = Math.floor((amplitude + 1) * 127.5); // Convert to 0-255 range
  }
  
  return buffer;
}

export default router;