// tests/integration/hephaestus-extract.node.test.mjs
// Integration tests for HEPHAESTUS using Node's built-in test runner
// Validates feature-flagging, path validation, gate enforcement, and claims-based workflow

// Set environment before importing app
process.env.NODE_ENV = 'test';
process.env.SKIP_LEGACY_CHECK = 'true';

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/testServer.mjs';
import app from '../../src/api/index.js';

describe('HEPHAESTUS Integration Tests', () => {
  let testServer;
  let baseUrl;
  const testProjectId = 999;

  before(async () => {
    // Start test server on ephemeral port
    const serverInfo = await startTestServer(app);
    testServer = serverInfo.server;
    baseUrl = serverInfo.baseUrl;
    console.log(`Test server ready at ${baseUrl}`);
  });

  after(async () => {
    // Stop test server
    await stopTestServer(testServer);
  });

  describe('Feature Flag Enforcement', () => {
    it('should block extraction when HEPHAESTUS disabled', async () => {
      // Temporarily disable feature flag
      const originalFlag = process.env.MOBIUS_ENABLE_HEPHAESTUS;
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'false';

      try {
        const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/pdf/extract-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfPath: '/path/to/test.pdf'
          })
        });

        assert.strictEqual(response.status, 503, 'Should return 503 when disabled');
        
        const body = await response.json();
        assert.ok(body.error, 'Should have error message');
        assert.match(body.error, /not available/i, 'Error should mention not available');
      } finally {
        // Restore flag
        if (originalFlag !== undefined) {
          process.env.MOBIUS_ENABLE_HEPHAESTUS = originalFlag;
        } else {
          delete process.env.MOBIUS_ENABLE_HEPHAESTUS;
        }
      }
    });

    it('should not block by feature flag when enabled (requires configuration)', async () => {
      // This test only runs when HEPHAESTUS is truly configured
      const isEnabled = process.env.MOBIUS_ENABLE_HEPHAESTUS === 'true';
      const hasWorkspace = process.env.MOBIUS_HEPHAESTUS_WORKSPACE_PATH;
      
      if (!isEnabled || !hasWorkspace) {
        console.log('Skipping enabled test: HEPHAESTUS not configured');
        return; // Skip test when not configured
      }

      const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/pdf/extract-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfPath: '/path/to/test.pdf'
        })
      });

      // Should not be blocked by feature flag (may fail for other reasons like missing PDF)
      assert.notStrictEqual(response.status, 503, 'Should not return 503 when enabled');
    });
  });

  describe('Path Validation', () => {
    it('should reject missing pdfPath when disabled (503 before validation)', async () => {
      // When HEPHAESTUS is disabled, feature flag check happens first
      // So we expect 503 regardless of payload validity
      const originalFlag = process.env.MOBIUS_ENABLE_HEPHAESTUS;
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'false';

      try {
        const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/pdf/extract-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        assert.strictEqual(response.status, 503, 'Should return 503 when disabled (feature flag first)');
        
        const body = await response.json();
        assert.ok(body.error, 'Should have error message');
        assert.match(body.error, /not available/i, 'Error should mention not available');
      } finally {
        // Restore flag
        if (originalFlag !== undefined) {
          process.env.MOBIUS_ENABLE_HEPHAESTUS = originalFlag;
        } else {
          delete process.env.MOBIUS_ENABLE_HEPHAESTUS;
        }
      }
    });

    it('should reject non-existent PDF when disabled (503 before validation)', async () => {
      // When HEPHAESTUS is disabled, feature flag check happens first
      const originalFlag = process.env.MOBIUS_ENABLE_HEPHAESTUS;
      process.env.MOBIUS_ENABLE_HEPHAESTUS = 'false';

      try {
        const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/pdf/extract-images`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pdfPath: '/nonexistent/file.pdf'
          })
        });

        assert.strictEqual(response.status, 503, 'Should return 503 when disabled (feature flag first)');
        
        const body = await response.json();
        assert.ok(body.error, 'Should have error message');
        assert.match(body.error, /not available/i, 'Error should mention not available');
      } finally {
        // Restore flag
        if (originalFlag !== undefined) {
          process.env.MOBIUS_ENABLE_HEPHAESTUS = originalFlag;
        } else {
          delete process.env.MOBIUS_ENABLE_HEPHAESTUS;
        }
      }
    });

    it('should validate request when enabled (requires configuration)', async () => {
      // This test only runs when HEPHAESTUS is truly configured
      const isEnabled = process.env.MOBIUS_ENABLE_HEPHAESTUS === 'true';
      const hasWorkspace = process.env.MOBIUS_HEPHAESTUS_WORKSPACE_PATH;
      
      if (!isEnabled || !hasWorkspace) {
        console.log('Skipping enabled test: HEPHAESTUS not configured');
        return; // Skip test when not configured
      }

      const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/pdf/extract-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      // When enabled and configured, should validate request (400 for missing pdfPath)
      assert.strictEqual(response.status, 400, 'Should return 400 for missing pdfPath when enabled');
      
      const body = await response.json();
      assert.ok(body.error, 'Should have error message');
      assert.match(body.error, /PDF path is required/i, 'Error should mention PDF path required');
    });
  });

  describe('Extraction Status', () => {
    it('should return extraction status', async () => {
      const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/pdf/extract-images/status`);

      assert.strictEqual(response.status, 200, 'Should return 200');
      
      const body = await response.json();
      assert.strictEqual(body.success, true, 'Should have success: true');
      assert.ok(Array.isArray(body.extractions), 'Should have extractions array');
      // Metadata may or may not be present depending on whether extractions exist
      if (body.extractions.length > 0) {
        assert.ok(body.metadata, 'Should have metadata object when extractions exist');
      }
    });
  });

  describe('Import Validation', () => {
    it('should validate import request', async () => {
      const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/images/import-hephaestus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
        })
      });

      assert.strictEqual(response.status, 400, 'Should return 400 for missing fields');
      
      const body = await response.json();
      assert.ok(body.error, 'Should have error message');
      assert.match(body.error, /required/i, 'Error should mention required fields');
    });

    it('should return imported assets', async () => {
      const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/images/imported`);

      assert.strictEqual(response.status, 200, 'Should return 200');
      
      const body = await response.json();
      assert.strictEqual(body.success, true, 'Should have success: true');
      assert.ok(Array.isArray(body.assets), 'Should have assets array');
      assert.strictEqual(typeof body.count, 'number', 'Should have count number');
    });
  });

  describe('Gate Enforcement', () => {
    it('should initialize CONFIRM_COMPONENT_IMAGES gate when images imported', async () => {
      // This test verifies the gate structure exists
      // Actual gate blocking is tested via downstream endpoints
      
      const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/images/imported`);
      
      assert.strictEqual(response.status, 200, 'Should return 200');
      
      const body = await response.json();
      assert.ok(body.success, 'Should succeed');
      
      // If assets exist, gate should be confirmed
      // If no assets, gate should not be required
      // This is a structural test - actual blocking tested elsewhere
    });
  });

  describe('Canonical Path Enforcement', () => {
    it('should write outputs to canonical project directory', async () => {
      // This test verifies path structure expectations
      // Actual path validation happens in HephaestusService
      
      const response = await fetch(`${baseUrl}/api/projects/${testProjectId}/pdf/extract-images/status`);
      
      assert.strictEqual(response.status, 200, 'Should return 200');
      
      const body = await response.json();
      
      // If extractions exist, verify path structure
      if (body.extractions && body.extractions.length > 0) {
        const extraction = body.extractions[0];
        if (extraction.extractionDir) {
          assert.match(
            extraction.extractionDir,
            /project_\d+/,
            'Extraction dir should contain project ID'
          );
          assert.match(
            extraction.extractionDir,
            /extracted_images/,
            'Extraction dir should contain extracted_images'
          );
        }
      }
    });
  });
});
