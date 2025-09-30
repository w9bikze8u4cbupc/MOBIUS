#!/usr/bin/env node

/**
 * MOBIUS CI Mock API Server
 * 
 * Lightweight Express server that provides mock API endpoints for CI testing.
 * Simulates the main MOBIUS API without external dependencies or secrets.
 * 
 * Usage:
 *   node src/api/ci-server.js [--port 5001] [--host 0.0.0.0]
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

class MockApiServer {
  constructor(options = {}) {
    this.port = options.port || process.env.PORT || 5001;
    this.host = options.host || process.env.HOST || '0.0.0.0';
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.server = null;
  }

  setupMiddleware() {
    // CORS configuration
    this.app.use(cors({
      origin: ['http://localhost:3000', 'http://localhost:5001'],
      credentials: true
    }));

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Health check middleware
    this.app.use('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: Math.floor(Date.now() / 1000),
        service: 'mobius-ci-api',
        version: '1.0.0'
      });
    });
  }

  setupRoutes() {
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        message: 'MOBIUS CI Mock API Server',
        version: '1.0.0',
        status: 'running',
        endpoints: [
          'GET /',
          'GET /health',
          'GET /api/projects',
          'POST /api/projects',
          'GET /api/projects/:id',
          'PUT /api/projects/:id',
          'DELETE /api/projects/:id',
          'POST /api/extract-bgg-metadata',
          'POST /api/extract-components',
          'POST /api/explain-chunk',
          'POST /api/upload-pdf'
        ]
      });
    });

    // Projects API
    this.setupProjectsApi();

    // BGG Metadata API
    this.setupBggMetadataApi();

    // Components extraction API
    this.setupComponentsApi();

    // Text explanation API
    this.setupExplainApi();

    // File upload API
    this.setupUploadApi();

    // Error handling
    this.app.use((err, req, res, next) => {
      console.error('API Error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        timestamp: Math.floor(Date.now() / 1000)
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
        method: req.method,
        timestamp: Math.floor(Date.now() / 1000)
      });
    });
  }

  setupProjectsApi() {
    // Mock project data
    const mockProjects = [
      {
        id: 1,
        name: 'Sushi Go!',
        metadata: {
          title: 'Sushi Go!',
          designer: 'Phil Walker-Harding',
          publisher: 'Gamewright',
          year_published: '2013',
          min_players: 2,
          max_players: 5,
          play_time: 15
        },
        components: [
          { name: 'Sushi cards', quantity: 108, selected: true },
          { name: 'Scoring tokens', quantity: 24, selected: true },
          { name: 'Rulebook', quantity: 1, selected: true }
        ],
        images: [],
        script: null,
        audio: null,
        created_at: new Date().toISOString()
      },
      {
        id: 2,
        name: 'Love Letter',
        metadata: {
          title: 'Love Letter',
          designer: 'Seiji Kanai',
          publisher: 'AEG',
          year_published: '2012',
          min_players: 2,
          max_players: 4,
          play_time: 20
        },
        components: [
          { name: 'Character cards', quantity: 16, selected: true },
          { name: 'Reference cards', quantity: 4, selected: true },
          { name: 'Favor tokens', quantity: 20, selected: true },
          { name: 'Rulebook', quantity: 1, selected: true }
        ],
        images: [],
        script: null,
        audio: null,
        created_at: new Date().toISOString()
      }
    ];

    // GET /api/projects
    this.app.get('/api/projects', (req, res) => {
      res.json({
        success: true,
        projects: mockProjects,
        count: mockProjects.length
      });
    });

    // POST /api/projects
    this.app.post('/api/projects', (req, res) => {
      const { name, metadata = {}, components = [] } = req.body;
      
      if (!name) {
        return res.status(400).json({
          error: 'Project name is required'
        });
      }

      const newProject = {
        id: mockProjects.length + 1,
        name,
        metadata,
        components,
        images: [],
        script: null,
        audio: null,
        created_at: new Date().toISOString()
      };

      mockProjects.push(newProject);

      res.status(201).json({
        success: true,
        project: newProject
      });
    });

    // GET /api/projects/:id
    this.app.get('/api/projects/:id', (req, res) => {
      const id = parseInt(req.params.id);
      const project = mockProjects.find(p => p.id === id);

      if (!project) {
        return res.status(404).json({
          error: 'Project not found'
        });
      }

      res.json({
        success: true,
        project
      });
    });

    // PUT /api/projects/:id
    this.app.put('/api/projects/:id', (req, res) => {
      const id = parseInt(req.params.id);
      const projectIndex = mockProjects.findIndex(p => p.id === id);

      if (projectIndex === -1) {
        return res.status(404).json({
          error: 'Project not found'
        });
      }

      // Update project
      mockProjects[projectIndex] = {
        ...mockProjects[projectIndex],
        ...req.body,
        id, // Preserve ID
        updated_at: new Date().toISOString()
      };

      res.json({
        success: true,
        project: mockProjects[projectIndex]
      });
    });

    // DELETE /api/projects/:id
    this.app.delete('/api/projects/:id', (req, res) => {
      const id = parseInt(req.params.id);
      const projectIndex = mockProjects.findIndex(p => p.id === id);

      if (projectIndex === -1) {
        return res.status(404).json({
          error: 'Project not found'
        });
      }

      mockProjects.splice(projectIndex, 1);

      res.json({
        success: true,
        message: 'Project deleted successfully'
      });
    });
  }

  setupBggMetadataApi() {
    this.app.post('/api/extract-bgg-metadata', (req, res) => {
      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          error: 'BGG URL is required'
        });
      }

      // Mock BGG metadata response
      const mockMetadata = {
        title: 'Mock Board Game',
        designer: 'Mock Designer',
        publisher: 'Mock Publisher',
        year_published: '2024',
        min_players: 2,
        max_players: 4,
        play_time: 30,
        age: '10+',
        description: 'A mock board game for CI testing purposes.',
        mechanics: ['Mock Mechanic 1', 'Mock Mechanic 2'],
        categories: ['Strategy', 'Family'],
        average_rating: '7.5',
        bgg_rank: '1000',
        bgg_id: '12345',
        cover_image: '/static/mock-cover.jpg',
        thumbnail: '/static/mock-thumb.jpg'
      };

      // Simulate processing delay
      setTimeout(() => {
        res.json({
          success: true,
          metadata: mockMetadata
        });
      }, 100);
    });
  }

  setupComponentsApi() {
    this.app.post('/api/extract-components', (req, res) => {
      const { text, method = 'ai' } = req.body;

      if (!text) {
        return res.status(400).json({
          error: 'Text content is required'
        });
      }

      // Mock components extraction
      const mockComponents = [
        { name: 'Game board', quantity: 1, selected: true, confidence: 0.95 },
        { name: 'Player pieces', quantity: 4, selected: true, confidence: 0.90 },
        { name: 'Cards', quantity: 52, selected: true, confidence: 0.85 },
        { name: 'Dice', quantity: 2, selected: true, confidence: 0.80 },
        { name: 'Tokens', quantity: 20, selected: true, confidence: 0.75 },
        { name: 'Rulebook', quantity: 1, selected: true, confidence: 1.0 }
      ];

      res.json({
        success: true,
        components: mockComponents,
        method,
        processed_text_length: text.length
      });
    });
  }

  setupExplainApi() {
    this.app.post('/api/explain-chunk', (req, res) => {
      const { text, context = '' } = req.body;

      if (!text) {
        return res.status(400).json({
          error: 'Text chunk is required'
        });
      }

      // Mock explanation
      const mockExplanation = {
        summary: 'This is a mock explanation of the provided text chunk for CI testing.',
        key_points: [
          'Mock key point 1',
          'Mock key point 2',
          'Mock key point 3'
        ],
        complexity: 'medium',
        estimated_duration: 30,
        suggested_visuals: [
          'Diagram showing mock concept',
          'Example of mock gameplay'
        ]
      };

      res.json({
        success: true,
        explanation: mockExplanation,
        input_length: text.length,
        context_length: context.length
      });
    });
  }

  setupUploadApi() {
    this.app.post('/api/upload-pdf', (req, res) => {
      // Mock file upload response
      res.json({
        success: true,
        message: 'File upload simulated successfully',
        file: {
          filename: 'mock-rulebook.pdf',
          size: 1024000,
          type: 'application/pdf',
          uploaded_at: new Date().toISOString()
        },
        processing: {
          status: 'completed',
          extracted_text_length: 5000,
          components_found: 6,
          metadata_extracted: true
        }
      });
    });
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, this.host, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`🚀 MOBIUS CI Mock API Server running at http://${this.host}:${this.port}`);
          console.log(`📋 Health check: http://${this.host}:${this.port}/health`);
          console.log(`📚 API docs: http://${this.host}:${this.port}/`);
          resolve();
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }
}

// CLI interface
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
        if (i + 1 < args.length) {
          options.port = parseInt(args[++i]);
        }
        break;
      case '--host':
        if (i + 1 < args.length) {
          options.host = args[++i];
        }
        break;
      case '--help':
        console.log(`
MOBIUS CI Mock API Server

Usage: node src/api/ci-server.js [options]

Options:
  --port PORT     Server port (default: 5001)
  --host HOST     Server host (default: 0.0.0.0)
  --help          Show this help message
`);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Main execution
if (require.main === module) {
  const options = parseArgs();
  const server = new MockApiServer(options);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await server.stop();
    console.log('✅ Server stopped');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');
    await server.stop();
    process.exit(0);
  });

  // Start server
  server.start().catch(err => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = MockApiServer;