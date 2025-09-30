// CI Mock API Server
// Lightweight HTTP server for deterministic container validation
// Only runs when NODE_ENV=ci or MOCK_MODE=true

import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 5001;

// CORS configuration
app.use(cors({
  origin: '*',
  credentials: false
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mode: 'ci-mock'
  });
});

// Mock API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    service: 'MOBIUS CI Mock API',
    version: '1.0.0',
    mode: 'mock',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/explain-chunk', (req, res) => {
  const { chunk, language } = req.body;
  res.json({
    explanation: `[MOCK] Explanation for chunk in ${language || 'en'}: ${chunk ? chunk.substring(0, 50) : 'empty'}...`,
    mock: true
  });
});

app.post('/api/extract-bgg-html', (req, res) => {
  const { url } = req.body;
  res.json({
    success: true,
    metadata: {
      title: '[MOCK] Board Game',
      designer: '[MOCK] Designer',
      publisher: '[MOCK] Publisher',
      year: '2023',
      mock: true
    }
  });
});

app.post('/api/generate-script', (req, res) => {
  res.json({
    success: true,
    script: '[MOCK] Generated script content',
    mock: true
  });
});

app.post('/api/extract-images', (req, res) => {
  res.json({
    success: true,
    images: [],
    totalFound: 0,
    mock: true
  });
});

// Catch-all for undefined routes
app.all('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method,
    mock: true
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    mock: true
  });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`🧪 CI Mock API Server running on port ${port}`);
  console.log(`📍 Health check: http://localhost:${port}/health`);
  console.log(`🔧 Mode: CI Mock (no external dependencies)`);
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
