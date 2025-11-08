import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Mock pdf-parse to avoid issues in test environment
const mockPdfParse = jest.fn().mockResolvedValue({
  text: 'Sample PDF text content\n\fSecond page content',
  numpages: 2,
  info: {},
  metadata: {},
  version: '1.10.100'
});

// Since we're using ESM, we need to mock the import
jest.unstable_mockModule('pdf-parse', () => ({
  default: mockPdfParse
}));

describe('extractTextAndChunks', () => {
  it('returns chunks for the redacted fixture', async () => {
    // Create a temporary test file
    const testFilePath = path.join(process.cwd(), 'test-fixture.pdf');
    fs.writeFileSync(testFilePath, 'test content');
    
    // We need to import the function after mocking
    const { extractTextAndChunks } = await import('../../src/ingest/pdf.js');
    
    const result = await extractTextAndChunks(testFilePath);
    
    expect(result).toBeDefined();
    expect(result.text).toBeDefined();
    expect(result.chunks).toBeDefined();
    expect(result.chunks.length).toBeGreaterThan(0);
    
    // Clean up
    fs.unlinkSync(testFilePath);
  });

  it('handles empty PDF gracefully', async () => {
    // Mock pdf-parse to return empty text
    mockPdfParse.mockResolvedValueOnce({
      text: '',
      numpages: 0,
      info: {},
      metadata: {},
      version: '1.10.100'
    });
    
    // Create a temporary test file
    const testFilePath = path.join(process.cwd(), 'empty-fixture.pdf');
    fs.writeFileSync(testFilePath, 'test content');
    
    // We need to import the function after mocking
    const { extractTextAndChunks } = await import('../../src/ingest/pdf.js');
    
    await expect(extractTextAndChunks(testFilePath)).rejects.toThrow();
    
    // Clean up
    fs.unlinkSync(testFilePath);
  });
});