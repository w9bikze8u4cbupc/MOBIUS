import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Mock the ingest modules to avoid actual PDF processing and API calls
const mockExtractTextAndChunks = jest.fn().mockResolvedValue({
  text: 'Sample PDF text',
  chunks: [{ pageNumber: 1, text: 'Sample PDF text' }],
  pages: [{ pageNumber: 1, text: 'Sample PDF text' }],
  toc: null
});

const mockFetchBGG = jest.fn().mockResolvedValue({
  title: 'Test Game',
  year: 2023,
  designers: ['Designer One'],
  players: '2-4',
  time: '60',
  age: '10+'
});

const mockBuildStoryboard = jest.fn().mockResolvedValue({
  id: 'test-storyboard',
  chapters: [{ id: 'chapter-1', title: 'Chapter 1' }],
  meta: { totalChapters: 1, totalChunks: 1, tocDetected: false }
});

jest.unstable_mockModule('../../src/ingest/pdf.js', () => ({
  extractTextAndChunks: mockExtractTextAndChunks
}));

jest.unstable_mockModule('../../src/ingest/bgg.js', () => ({
  fetchBGG: mockFetchBGG
}));

jest.unstable_mockModule('../../src/ingest/storyboard.js', () => ({
  buildStoryboard: mockBuildStoryboard
}));

// Mock the multer upload middleware
const mockUpload = {
  single: jest.fn().mockImplementation(() => {
    return (req, res, next) => {
      // Mock the file upload
      req.file = {
        filename: 'test-fixture.txt',
        size: 39,
        path: path.join(process.cwd(), 'test-data', 'uploads', 'test-fixture.txt')
      };
      req.body = {};
      next();
    };
  })
};

// Mock the express app
const mockApp = {
  post: jest.fn()
};

// Mock the modules that the route handler depends on
jest.unstable_mockModule('express', () => ({
  default: () => mockApp
}));

jest.unstable_mockModule('multer', () => ({
  default: () => mockUpload
}));

jest.unstable_mockModule('../../src/config/paths.js', () => ({
  getDirs: () => ({
    root: process.cwd(),
    uploads: path.join(process.cwd(), 'test-data', 'uploads')
  }),
  resolveDataPath: (...args) => path.join(process.cwd(), 'test-data', ...args)
}));

jest.unstable_mockModule('../../src/logging/logger.js', () => ({
  requestLoggerMiddleware: (req, res, next) => {
    req.logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    next();
  }
}));

jest.unstable_mockModule('../../src/metrics/metrics.js', () => ({
  Metrics: {
    inc: jest.fn()
  }
}));

describe('Ingest route handler', () => {
  let routeHandler;

  beforeAll(async () => {
    // Set environment variables
    process.env.PORT = '5002'; // Use a different port for testing
    process.env.DATA_DIR = path.join(process.cwd(), 'test-data');
    process.env.NODE_ENV = 'test';
    
    // Create test data directory
    const dataDir = process.env.DATA_DIR;
    const uploadsDir = path.join(dataDir, 'uploads');
    const outputDir = path.join(dataDir, 'output');
    
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
    
    // Create a test file
    const testFilePath = path.join(uploadsDir, 'test-fixture.txt');
    fs.writeFileSync(testFilePath, 'This is a test fixture for ingestion');
    
    // Import the route handler
    const apiModule = await import('../../src/api/index.js');
    // Find the route handler in the mockApp.post calls
    const postCalls = mockApp.post.mock.calls;
    const ingestRoute = postCalls.find(call => call[0] === '/api/ingest');
    routeHandler = ingestRoute ? ingestRoute[2] : null; // The handler is the 3rd argument
  });

  afterAll(async () => {
    // Clean up test data directory
    const dataDir = process.env.DATA_DIR;
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('should process a file successfully', async () => {
    if (!routeHandler) {
      fail('Route handler not found');
      return;
    }
    
    // Create mock request and response objects
    const req = {
      file: {
        filename: 'test-fixture.txt',
        size: 39,
        path: path.join(process.env.DATA_DIR, 'uploads', 'test-fixture.txt')
      },
      body: {
        bggId: '12345'
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    await routeHandler(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    
    const response = res.json.mock.calls[0][0];
    expect(response.ok).toBe(true);
    expect(response.id).toBeDefined();
    expect(response.file).toBe('test-fixture.txt');
    expect(response.storyboardPath).toBeDefined();
  });

  it('should return 400 when no file is uploaded', async () => {
    if (!routeHandler) {
      fail('Route handler not found');
      return;
    }
    
    // Create mock request and response objects
    const req = {
      file: null,
      body: {},
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    await routeHandler(req, res);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalled();
    
    const response = res.json.mock.calls[0][0];
    expect(response.error).toBe('No file uploaded');
  });

  it('should still succeed when BGG fetch fails', async () => {
    if (!routeHandler) {
      fail('Route handler not found');
      return;
    }
    
    // Mock BGG fetch to fail
    mockFetchBGG.mockRejectedValueOnce(new Error('BGG API Error'));
    
    // Create mock request and response objects
    const req = {
      file: {
        filename: 'test-fixture.txt',
        size: 39,
        path: path.join(process.env.DATA_DIR, 'uploads', 'test-fixture.txt')
      },
      body: {
        bggId: 'invalid'
      },
      logger: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };
    
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    await routeHandler(req, res);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalled();
    
    const response = res.json.mock.calls[0][0];
    expect(response.ok).toBe(true);
    expect(response.bgg).toBeNull();
  });
});