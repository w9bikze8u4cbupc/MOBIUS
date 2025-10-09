import { jest } from '@jest/globals';
import fs from 'fs';

// Mock pdf-parse to avoid issues in test environment
const mockPdfParse = jest.fn().mockResolvedValue({
  text: 'Sample PDF text content',
  numpages: 1,
  info: {},
  metadata: {},
  version: '1.10.100'
});

// Since we're using ESM, we need to mock the import
jest.unstable_mockModule('pdf-parse', () => ({
  default: mockPdfParse
}));

describe('ingestPdf', () => {
  it('throws when file missing', async () => {
    // We need to import the function after mocking
    const { ingestPdf } = await import('../../src/ingest/pdf.js');
    await expect(ingestPdf('nonexistent.pdf')).rejects.toThrow();
  });
});
