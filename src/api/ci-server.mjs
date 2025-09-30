#!/usr/bin/env node
/**
 * CI-only mock API server for deterministic container validation
 * Runs in mock mode without requiring secrets (OpenAI, external APIs)
 * Provides health checks and mock endpoints for smoke testing
 */

import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 5001;
const startTime = Date.now();

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health endpoint - primary readiness check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'mock',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    port: port
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'mock',
    message: 'CI mock server running - no real API calls made',
    endpoints: [
      'GET /health',
      'GET /api/status',
      'POST /api/explain-chunk',
      'POST /api/extract-bgg-html',
      'POST /api/extract-components',
      'POST /summarize',
      'POST /upload-pdf',
      'GET /load-project/:id'
    ]
  });
});

// Mock endpoints for smoke testing
app.post('/api/explain-chunk', (req, res) => {
  const { chunk, language = 'en' } = req.body;
  if (!chunk) {
    return res.status(400).json({ error: 'No text chunk provided.' });
  }
  res.json({
    explanation: `[MOCK] Explanation for chunk in ${language}: This is a mock response for CI testing.`,
    mode: 'mock'
  });
});

app.post('/api/extract-bgg-html', (req, res) => {
  const { url } = req.body;
  if (!url || !url.match(/^https?:\/\/boardgamegeek\.com\/boardgame\/\d+/)) {
    return res.status(400).json({ error: 'Invalid or missing BGG boardgame URL' });
  }
  res.json({
    success: true,
    mode: 'mock',
    metadata: {
      title: 'Mock Board Game',
      publisher: ['Mock Publisher'],
      player_count: '2-4',
      play_time: '30-60',
      min_age: '10+',
      theme: 'Strategy',
      mechanics: ['Mock Mechanic'],
      designers: ['Mock Designer'],
      artists: ['Mock Artist'],
      description: 'This is a mock game description for CI testing.',
      average_rating: '7.5',
      bgg_rank: '1000',
      bgg_id: '12345',
      cover_image: 'https://example.com/mock-image.jpg',
      thumbnail: 'https://example.com/mock-thumb.jpg'
    }
  });
});

app.post('/api/extract-components', (req, res) => {
  res.json({
    success: true,
    mode: 'mock',
    components: [
      { name: 'Mock Card', count: 52 },
      { name: 'Mock Token', count: 20 }
    ],
    extractionMethod: 'mock',
    message: 'Mock component extraction for CI testing'
  });
});

app.post('/summarize', (req, res) => {
  const { language = 'english' } = req.body;
  res.json({
    summary: `[MOCK] Game summary in ${language}. This is a mock response for CI testing.`,
    mode: 'mock',
    metadata: {
      playerCount: '2-4',
      gameLength: '30-60 min',
      minimumAge: '10+',
      theme: 'Strategy',
      edition: 'Mock Edition'
    },
    components: []
  });
});

app.post('/upload-pdf', (req, res) => {
  res.json({
    success: true,
    mode: 'mock',
    message: 'PDF upload mocked for CI testing',
    filename: 'mock-rulebook.pdf'
  });
});

app.get('/load-project/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    success: true,
    mode: 'mock',
    project: {
      id: id,
      name: 'Mock Project',
      created_at: new Date().toISOString()
    }
  });
});

// Catch-all for undefined routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    mode: 'mock',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    mode: 'mock',
    message: err.message
  });
});

// Graceful shutdown handler
const shutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
const server = app.listen(port, () => {
  console.log(`🚀 CI Mock API Server running on port ${port}`);
  console.log(`📱 Mode: MOCK (no real API calls, no secrets required)`);
  console.log(`🏥 Health check: http://localhost:${port}/health`);
  console.log(`📊 Status: http://localhost:${port}/api/status`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
});

export default app;
