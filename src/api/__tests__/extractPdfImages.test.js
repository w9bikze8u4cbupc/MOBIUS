/**
 * Test for the extract-pdf-images endpoint
 */

import request from 'supertest';
import express from 'express';
// Import the actual app or create a minimal version for testing
import { app } from '../index.js';

// Mock the validateUrl function to allow our test URLs
jest.mock('../../utils/urlValidator.js', () => ({
  validateUrl: jest.fn().mockResolvedValue({ valid: true }),
  isAllowedUrl: jest.fn().mockReturnValue(true)
}));

// Mock the axios module to avoid actual HTTP requests
jest.mock('axios', () => ({
  default: jest.fn()
}));

// Mock the child_process module to avoid actually running pdfimages
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    stderr: { on: jest.fn() },
    on: jest.fn().mockImplementation((event, callback) => {
      if (event === 'close') {
        // Simulate successful completion
        setTimeout(() => callback(0), 0);
      }
    })
  })
}));

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn().mockReturnValue([]),
  unlink: jest.fn()
}));

// Mock image-size module
jest.mock('image-size', () => ({
  default: jest.fn().mockReturnValue({ width: 100, height: 100, type: 'png' })
}));

describe('POST /api/extract-pdf-images', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should return 400 if no pdfUrl is provided', async () => {
    const response = await request(app)
      .post('/api/extract-pdf-images')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('No PDF URL provided (field name "pdfUrl")');
  });

  test('should return 400 if invalid URL is provided', async () => {
    // Mock validateUrl to return invalid for this test
    const urlValidator = await import('../../utils/urlValidator.js');
    urlValidator.validateUrl.mockResolvedValueOnce({ valid: false, reason: 'Invalid URL' });

    const response = await request(app)
      .post('/api/extract-pdf-images')
      .send({ pdfUrl: 'invalid-url' })
      .expect(400);

    expect(response.body.code).toBe('url_disallowed');
    expect(response.body.message).toBe('URL not allowed by policy');
  });

  test('should return 200 with empty array when no images are extracted', async () => {
    // Mock readdirSync to return empty array (no images found)
    const fs = await import('fs');
    fs.readdirSync.mockReturnValueOnce([]);

    // Mock axios to return a successful response
    const axios = (await import('axios')).default;
    axios.mockResolvedValueOnce({
      data: {
        pipe: jest.fn(),
        on: jest.fn()
      }
    });

    const response = await request(app)
      .post('/api/extract-pdf-images')
      .send({ pdfUrl: 'https://example.com/test.pdf' })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.images).toEqual([]);
  });

  test('should handle SSRF protection correctly', async () => {
    // Mock validateUrl to simulate SSRF protection
    const urlValidator = await import('../../utils/urlValidator.js');
    urlValidator.validateUrl.mockResolvedValueOnce({ 
      valid: false, 
      reason: 'SSRF protection: private IP addresses not allowed' 
    });

    const response = await request(app)
      .post('/api/extract-pdf-images')
      .send({ pdfUrl: 'http://192.168.1.1/private.pdf' })
      .expect(400);

    expect(response.body.code).toBe('url_disallowed');
    expect(response.body.message).toBe('URL not allowed by policy');
  });
});