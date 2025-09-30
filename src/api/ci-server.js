/**
 * CI Mock API Server
 * 
 * Lightweight Express server for CI/CD testing that mimics the MOBIUS API
 * without requiring external dependencies, secrets, or database connections.
 * 
 * Purpose: Validates containerization, routing, and basic API health checks
 * in CI environments without executing full application logic.
 */

const express = require('express');
const app = express();

// Configuration
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'ci';

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    mode: 'ci-mock',
    uptime: process.uptime()
  });
});

// Mock API endpoints for smoke testing
app.get('/api/status', (req, res) => {
  res.json({
    api: 'mobius-ci-mock',
    version: '1.0.0',
    status: 'operational',
    endpoints: [
      '/health',
      '/api/status',
      '/api/games',
      '/api/ping'
    ]
  });
});

app.get('/api/ping', (req, res) => {
  res.json({ 
    message: 'pong',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/games', (req, res) => {
  res.json({
    games: [
      { id: 1, name: 'Hanamikoji', status: 'available' },
      { id: 2, name: 'Love Letter', status: 'available' },
      { id: 3, name: 'Sushi Go', status: 'available' }
    ],
    total: 3
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
    message: 'CI mock API - endpoint not implemented'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    mode: 'ci-mock'
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('  MOBIUS CI Mock API Server');
  console.log('='.repeat(60));
  console.log(`  Environment: ${NODE_ENV}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Mode: CI Testing (No external dependencies)`);
  console.log(`  Health: http://localhost:${PORT}/health`);
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
