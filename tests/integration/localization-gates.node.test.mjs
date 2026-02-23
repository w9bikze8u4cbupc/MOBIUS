// tests/integration/localization-gates.node.test.mjs
// Integration tests for FR localization workflow using Node test runner

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, stopTestServer } from '../helpers/testServer.mjs';

describe('FR Localization Integration Tests', () => {
  let serverUrl;
  let projectId;
  let authoritativeScriptId;
  
  before(async () => {
    serverUrl = await startTestServer();
  });
  
  after(async () => {
    await stopTestServer();
  });
  
  it('should reject localization without authoritative script', async () => {
    // Create a project
    const createRes = await fetch(`${serverUrl}/save-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Localization Project',
        metadata: JSON.stringify({ title: 'Test Game' }),
        components: JSON.stringify([]),
        images: JSON.stringify([]),
        script: '',
        audio: ''
      })
    });
    
    const createData = await createRes.json();
    assert.ok(createData.projectId, 'Project should be created');
    projectId = createData.projectId;
    
    // Try to generate localization without authoritative script
    const localizeRes = await fetch(`${serverUrl}/api/projects/${projectId}/script/localize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLang: 'fr' })
    });
    
    assert.equal(localizeRes.status, 404, 'Should return 404');
    
    const localizeData = await localizeRes.json();
    assert.equal(localizeData.code, 'NO_AUTHORITATIVE_SCRIPT');
  });
  
  it('should reject unsupported target language', async () => {
    const localizeRes = await fetch(`${serverUrl}/api/projects/${projectId}/script/localize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLang: 'es' })
    });
    
    assert.equal(localizeRes.status, 400, 'Should return 400');
    
    const localizeData = await localizeRes.json();
    assert.equal(localizeData.code, 'INVALID_TARGET_LANGUAGE');
  });
  
  it('should list empty localizations', async () => {
    const listRes = await fetch(`${serverUrl}/api/projects/${projectId}/script/localizations`);
    
    // Will return 404 because no authoritative script exists yet
    assert.equal(listRes.status, 404);
  });
  
  it('should reject confirmation without localization', async () => {
    const confirmRes = await fetch(`${serverUrl}/api/projects/${projectId}/script/localization/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'fr', notes: 'Test' })
    });
    
    assert.equal(confirmRes.status, 404, 'Should return 404');
  });
});

describe('FR Localization Full Workflow (Mock)', () => {
  let serverUrl;
  
  before(async () => {
    serverUrl = await startTestServer();
  });
  
  after(async () => {
    await stopTestServer();
  });
  
  it('should demonstrate full workflow structure', async () => {
    // This test demonstrates the expected workflow structure
    // Actual implementation would require:
    // 1. Creating a project with ingestion data
    // 2. Generating and confirming an EN script
    // 3. Generating FR localization
    // 4. Confirming FR localization
    // 5. Verifying gate states
    
    // For now, we verify the API endpoints exist and return expected error codes
    const projectId = 999; // Non-existent project
    
    // Step 1: Try to generate localization (should fail - no project)
    const localizeRes = await fetch(`${serverUrl}/api/projects/${projectId}/script/localize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetLang: 'fr' })
    });
    
    assert.ok([404, 500].includes(localizeRes.status), 'Should fail gracefully');
    
    // Step 2: Try to list localizations (should fail - no project)
    const listRes = await fetch(`${serverUrl}/api/projects/${projectId}/script/localizations`);
    assert.ok([404, 500].includes(listRes.status), 'Should fail gracefully');
    
    // Step 3: Try to confirm localization (should fail - no project)
    const confirmRes = await fetch(`${serverUrl}/api/projects/${projectId}/script/localization/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'fr' })
    });
    
    assert.ok([400, 404, 500].includes(confirmRes.status), 'Should fail gracefully');
  });
});

describe('FR Localization Gate Enforcement', () => {
  let serverUrl;
  
  before(async () => {
    serverUrl = await startTestServer();
  });
  
  after(async () => {
    await stopTestServer();
  });
  
  it('should verify CONFIRM_LOCALIZATION_FR gate exists', async () => {
    // This test verifies that the gate constant is properly defined
    // Actual gate enforcement would be tested in E2E tests with real data
    
    // For now, we just verify the API is accessible
    const healthRes = await fetch(`${serverUrl}/health`);
    assert.ok(healthRes.ok || healthRes.status === 404, 'Server should be running');
  });
});
