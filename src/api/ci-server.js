#!/usr/bin/env node

/**
 * Lightweight mock API server for CI testing
 * Provides endpoints that mimic the main API behavior without external dependencies
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 5001;
const mode = process.env.NODE_ENV || 'development';

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5001'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('uploads'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mode: 'ci-mock',
    uptime: process.uptime()
  });
});

// Mock PDF processing endpoint
app.post('/process-pdf', async (req, res) => {
  try {
    console.log('Mock PDF processing request received');
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));
    
    res.json({
      success: true,
      message: 'PDF processed successfully (mock)',
      data: {
        text: 'Mock extracted text from PDF document. This is a sample game rule that would normally be extracted from a real PDF.',
        metadata: {
          title: 'Mock Game Rules',
          pages: 5,
          extractedAt: new Date().toISOString()
        }
      }
    });
  } catch (error) {
    console.error('Mock PDF processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Mock PDF processing failed'
    });
  }
});

// Mock text analysis endpoint
app.post('/analyze-text', async (req, res) => {
  try {
    const { text, language = 'english' } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'No text provided'
      });
    }
    
    console.log(`Mock text analysis for ${text.length} characters in ${language}`);
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    res.json({
      success: true,
      data: {
        language: language,
        wordCount: text.split(' ').length,
        summary: 'This is a mock summary of the analyzed text. In a real scenario, this would contain AI-generated content.',
        components: [
          'Game board',
          'Player pieces', 
          'Cards',
          'Dice',
          'Rulebook'
        ],
        metadata: {
          publisher: 'Mock Publisher',
          playerCount: '2-4',
          gameLength: '30-45 minutes',
          minimumAge: '8+',
          theme: 'Strategy',
          edition: 'First Edition'
        }
      }
    });
  } catch (error) {
    console.error('Mock text analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Mock text analysis failed'
    });
  }
});

// Mock image processing endpoint
app.post('/process-images', async (req, res) => {
  try {
    const { images = [] } = req.body;
    
    console.log(`Mock image processing for ${images.length} images`);
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const processedImages = images.map((img, index) => ({
      id: `mock-image-${index}`,
      url: img.url || `mock://image-${index}`,
      processed: true,
      extractedText: `Mock extracted text from image ${index}`,
      confidence: 0.95
    }));
    
    res.json({
      success: true,
      data: {
        processedImages,
        totalProcessed: processedImages.length
      }
    });
  } catch (error) {
    console.error('Mock image processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Mock image processing failed'
    });
  }
});

// Mock TTS endpoint
app.post('/generate-tts', async (req, res) => {
  try {
    const { text, voice, language = 'english' } = req.body;
    
    if (!text) {
      return res.status(400).json({
        success: false,
        error: 'No text provided for TTS'
      });
    }
    
    console.log(`Mock TTS generation for ${text.length} characters with voice ${voice}`);
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 200));
    
    res.json({
      success: true,
      data: {
        audioUrl: `mock://tts-audio-${Date.now()}.mp3`,
        duration: Math.floor(text.length / 10), // Mock duration based on text length
        voice: voice || 'default-mock-voice',
        language: language,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Mock TTS error:', error);
    res.status(500).json({
      success: false,
      error: 'Mock TTS generation failed'
    });
  }
});

// Mock save project endpoint
app.post('/save-project', async (req, res) => {
  try {
    const { name, metadata, components, images, script, audio } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Project name required'
      });
    }
    
    console.log(`Mock project save: ${name}`);
    
    // Simulate save operation
    await new Promise(resolve => setTimeout(resolve, 100));
    
    res.json({
      success: true,
      data: {
        projectId: `mock-project-${Date.now()}`,
        name,
        savedAt: new Date().toISOString(),
        status: 'saved'
      }
    });
  } catch (error) {
    console.error('Mock project save error:', error);
    res.status(500).json({
      success: false,
      error: 'Mock project save failed'
    });
  }
});

// Mock list projects endpoint
app.get('/projects', async (req, res) => {
  try {
    console.log('Mock projects list request');
    
    res.json({
      success: true,
      data: [
        {
          id: 'mock-project-1',
          name: 'Mock Game Tutorial 1',
          createdAt: new Date(Date.now() - 86400000).toISOString(),
          status: 'completed'
        },
        {
          id: 'mock-project-2', 
          name: 'Mock Game Tutorial 2',
          createdAt: new Date(Date.now() - 172800000).toISOString(),
          status: 'in-progress'
        }
      ]
    });
  } catch (error) {
    console.error('Mock projects list error:', error);
    res.status(500).json({
      success: false,
      error: 'Mock projects list failed'
    });
  }
});

// Catch-all for API routes
app.use('/api/*', (req, res) => {
  console.log(`Mock API catch-all: ${req.method} ${req.path}`);
  res.json({
    success: true,
    message: `Mock response for ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
    mode: 'ci-mock'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Mock API error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error (mock)',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found (mock)',
    path: req.originalUrl,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Mock API server running on port ${port}`);
  console.log(`📱 Mode: ${mode}`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
  console.log(`📋 Available endpoints:`);
  console.log(`   POST /process-pdf`);
  console.log(`   POST /analyze-text`);
  console.log(`   POST /process-images`);
  console.log(`   POST /generate-tts`);
  console.log(`   POST /save-project`);
  console.log(`   GET  /projects`);
  console.log(`   GET  /health`);
});

module.exports = app;