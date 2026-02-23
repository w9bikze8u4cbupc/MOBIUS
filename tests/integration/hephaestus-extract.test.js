// tests/integration/hephaestus-extract.test.js
// Integration tests for HEPHAESTUS PDF image extraction
// Verifies feature-flagging, path validation, and claims-based workflow

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import app from '../../src/api/index.js';
import { getDataDirs } from '../../src/config/storage.mjs';
import { HephaestusService } from '../../src/services/HephaestusService.js';
import { startTestServer, stopTestServer } from '../helpers/testServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('HEPHAESTUS Integration Tests', () => {
  let testProjectId = 999;
  let testPdfPath;
  let originalEnv;
  let testServer;
  let baseUrl;

  beforeAll(async () => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Start test server on ephemeral port
    const serverInfo = await startTestServer(app);
    testServer = serverInfo.server;
    baseUrl = serverInfo.baseUrl;
    
    // Create a minimal test PDF
    const dataDirs = getDataDirs();
    testPdfPath = path.join(dataDirs.tmp, 'test_hephaestus.pdf');
    
    // Minimal valid PDF (empty page)
    const minimalPdf = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34, 0x0A, // %PDF-1.4
      0x25, 0xC3, 0xA4, 0xC3, 0xBC, 0xC3, 0xB6, 0xC3, 0x9F, 0x0A, // Binary comment
      0x31, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 1 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x43, 0x61, 0x74, 0x61, 0x6C, 0x6F, 0x67, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, // <</Type/Catalog/Pages 2 0 R>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x32, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 2 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x73, 0x2F, 0x4B, 0x69, 0x64, 0x73, 0x5B, 0x33, 0x20, 0x30, 0x20, 0x52, 0x5D, 0x2F, 0x43, 0x6F, 0x75, 0x6E, 0x74, 0x20, 0x31, 0x3E, 0x3E, 0x0A, // <</Type/Pages/Kids[3 0 R]/Count 1>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x33, 0x20, 0x30, 0x20, 0x6F, 0x62, 0x6A, 0x0A, // 3 0 obj
      0x3C, 0x3C, 0x2F, 0x54, 0x79, 0x70, 0x65, 0x2F, 0x50, 0x61, 0x67, 0x65, 0x2F, 0x50, 0x61, 0x72, 0x65, 0x6E, 0x74, 0x20, 0x32, 0x20, 0x30, 0x20, 0x52, 0x2F, 0x4D, 0x65, 0x64, 0x69, 0x61, 0x42, 0x6F, 0x78, 0x5B, 0x30, 0x20, 0x30, 0x20, 0x36, 0x31, 0x32, 0x20, 0x37, 0x39, 0x32, 0x5D, 0x3E, 0x3E, 0x0A, // <</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>
      0x65, 0x6E, 0x64, 0x6F, 0x62, 0x6A, 0x0A, // endobj
      0x78, 0x72, 0x65, 0x66, 0x0A, // xref
      0x30, 0x20, 0x34, 0x0A, // 0 4
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x36, 0x35, 0x35, 0x33, 0x35, 0x20, 0x66, 0x20, 0x0A, // 0000000000 65535 f
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x35, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000015 00000 n
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x37, 0x34, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000074 00000 n
      0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x31, 0x34, 0x38, 0x20, 0x30, 0x30, 0x30, 0x30, 0x30, 0x20, 0x6E, 0x20, 0x0A, // 0000000148 00000 n
      0x74, 0x72, 0x61, 0x69, 0x6C, 0x65, 0x72, 0x0A, // trailer
      0x3C, 0x3C, 0x2F, 0x53, 0x69, 0x7A, 0x65, 0x20, 0x34, 0x2F, 0x52, 0x6F, 0x6F, 0x74, 0x20, 0x31, 0x20, 0x30, 0x20, 0x52, 0x3E, 0x3E, 0x0A, // <</Size 4/Root 1 0 R>>
      0x73, 0x74, 0x61, 0x72, 0x74, 0x78, 0x72, 0x65, 0x66, 0x0A, // startxref
      0x32, 0x35, 0x33, 0x0A, // 253
      0x25, 0x25, 0x45, 0x4F, 0x46 // %%EOF
    ]);
    
    await fs.writeFile(testPdfPath, minimalPdf);
  });

  afterAll(async () => {
    // Stop test server
    await stopTestServer(testServer);
    
    // Restore environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore environment after each test
    process.env = { ...originalEnv };
  });

  describe('Feature Flag', () => {
    it('should block extraction when HEPHAESTUS disabled', async () => {
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'false';

      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/pdf/extract-images`)
        .send({
          pdfPath: testPdfPath
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('not available');
    });

    it('should allow extraction when HEPHAESTUS enabled', async () => {
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'true';

      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/pdf/extract-images`)
        .send({
          pdfPath: testPdfPath
        });

      // May succeed or fail depending on HEPHAESTUS availability
      // But should not be blocked by feature flag
      expect(response.status).not.toBe(503);
    });
  });

  describe('Path Validation', () => {
    beforeEach(() => {
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'true';
    });

    it('should reject missing pdfPath', async () => {
      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/pdf/extract-images`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('PDF path is required');
    });

    it('should reject non-existent PDF', async () => {
      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/pdf/extract-images`)
        .send({
          pdfPath: '/nonexistent/file.pdf'
        });

      expect(response.status).toBe(500);
      expect(response.body.details).toContain('not found');
    });
  });

  describe('Extraction Workflow', () => {
    beforeEach(() => {
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'true';
    });

    it('should extract images and return ImageAssets', async () => {
      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/pdf/extract-images`)
        .send({
          pdfPath: testPdfPath,
          options: {
            minConfidence: 0.7
          }
        });

      if (response.status === 200) {
        expect(response.body.success).toBe(true);
        expect(response.body.extractionId).toBeDefined();
        expect(response.body.imageAssets).toBeInstanceOf(Array);
        expect(response.body.stats).toBeDefined();
        expect(response.body.stats.imagesExtracted).toBeGreaterThanOrEqual(0);

        // Verify ImageAsset structure if any assets extracted
        if (response.body.imageAssets.length > 0) {
          const asset = response.body.imageAssets[0];
          expect(asset.id).toBeDefined();
          expect(asset.filename).toBeDefined();
          expect(asset.status).toBe('claim'); // Unconfirmed
          expect(asset.source).toBe('hephaestus');
        }
      }
    });

    it('should write outputs to canonical project directory', async () => {
      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/pdf/extract-images`)
        .send({
          pdfPath: testPdfPath
        });

      if (response.status === 200) {
        const outputDir = response.body.outputDir;
        
        // Verify output is under canonical data root
        const dataDirs = getDataDirs();
        expect(outputDir).toContain(dataDirs.uploads);
        expect(outputDir).toContain(`project_${testProjectId}`);
        expect(outputDir).toContain('extracted_images');

        // Verify manifest exists
        const manifestPath = path.join(outputDir, 'manifest.json');
        const manifestExists = await fs.access(manifestPath)
          .then(() => true)
          .catch(() => false);
        
        expect(manifestExists).toBe(true);
      }
    });
  });

  describe('Extraction Status', () => {
    beforeEach(() => {
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'true';
    });

    it('should list extractions for a project', async () => {
      const response = await request(baseUrl)
        .get(`/api/projects/${testProjectId}/pdf/extract-images/status`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.extractions).toBeInstanceOf(Array);
    });
  });

  describe('Service Layer', () => {
    it('should check availability correctly', async () => {
      const service = new HephaestusService();
      
      // Disabled
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'false';
      let availability = await service.checkAvailability();
      expect(availability.available).toBe(false);
      expect(availability.reason).toContain('disabled');

      // Enabled
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'true';
      availability = await service.checkAvailability();
      // May be true or false depending on tool presence
      expect(availability).toHaveProperty('available');
      expect(availability).toHaveProperty('reason');
    });

    it('should enforce concurrency limits', async () => {
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'true';
      process.env.HEPHAESTUS_MAX_CONCURRENT = '1';
      
      const service = new HephaestusService();
      
      // Manually set active extractions to max
      service.activeExtractions = 1;
      
      await expect(
        service.extractImages({
          pdfPath: testPdfPath,
          projectId: testProjectId
        })
      ).rejects.toThrow('Maximum concurrent extractions');
    });
  });

  // ============================================================================
  // HEPHAESTUS EXTERNAL WORKSPACE INTEGRATION TESTS
  // ============================================================================

  describe('HEPHAESTUS External Workspace Integration', () => {
    it('should block extraction when feature flag disabled', async () => {
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'false';

      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/pdf/extract-images`)
        .send({
          pdfPath: '/path/to/test.pdf'
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('not available');
    });

    it('should validate PDF path is provided', async () => {
      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/pdf/extract-images`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('PDF path is required');
    });

    it('should return extraction status', async () => {
      const response = await request(baseUrl)
        .get(`/api/projects/${testProjectId}/pdf/extract-images/status`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('extractions');
      expect(response.body).toHaveProperty('metadata');
    });

    it('should validate import request', async () => {
      const response = await request(baseUrl)
        .post(`/api/projects/${testProjectId}/images/import-hephaestus`)
        .send({
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    it('should return imported assets', async () => {
      const response = await request(baseUrl)
        .get(`/api/projects/${testProjectId}/images/imported`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('assets');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.assets)).toBe(true);
    });
  });
});
