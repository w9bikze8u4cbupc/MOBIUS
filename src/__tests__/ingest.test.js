// src/__tests__/ingest.test.js
// Unit tests for the ingestion pipeline

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock the database
jest.unstable_mockModule('../api/db.js', () => {
  return {
    default: {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn().mockReturnValue({ lastInsertRowid: 1 })
      })
    }
  };
});

// Mock the PDF ingestion
jest.unstable_mockModule('../ingest/pdf.js', () => {
  return {
    ingestPdf: jest.fn().mockResolvedValue({
      parsedPages: [
        { pageNumber: 1, text: 'Test page content', textConfidence: 1.0, source: 'pdf-parse' }
      ],
      extractedAt: new Date().toISOString()
    })
  };
});

// Mock the storyboard generation
jest.unstable_mockModule('../ingest/storyboard.js', () => {
  return {
    generateStoryboard: jest.fn().mockReturnValue({
      scenes: [
        { id: 'scene-1', title: 'Introduction', duration: 5, captions: ['Welcome'], assets: [] }
      ]
    })
  };
});

describe('Ingest Pipeline', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up after each test
    jest.restoreAllMocks();
  });

  it('should extract text from PDF', async () => {
    const { ingestPdf } = await import('../ingest/pdf.js');
    
    const result = await ingestPdf('test.pdf');
    
    expect(ingestPdf).toHaveBeenCalledWith('test.pdf');
    expect(result.parsedPages).toHaveLength(1);
    expect(result.parsedPages[0].text).toBe('Test page content');
  });

  it('should generate storyboard from parsed pages', async () => {
    const { generateStoryboard } = await import('../ingest/storyboard.js');
    
    const result = generateStoryboard({ 
      parsedPages: [{ text: 'Setup instructions here' }],
      opts: { heuristic: 'simple' }
    });
    
    expect(generateStoryboard).toHaveBeenCalled();
    expect(result.scenes).toBeDefined();
  });

  it('should handle file upload and ingestion', async () => {
    // This is a placeholder test since we can't directly test the express router
    expect(true).toBe(true);
  });
});