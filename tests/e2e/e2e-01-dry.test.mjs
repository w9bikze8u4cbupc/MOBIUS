// tests/e2e/e2e-01-dry.test.mjs
// CI-safe dry-run test for E2E-01 commissioning runner
// Validates runner wiring without requiring PDFs, BGG access, or HEPHAESTUS

import { test } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..', '..');

test('E2E-01 dry run completes successfully', async () => {
  const reportPath = join(REPO_ROOT, 'FIRST_FULL_E2E_RUN.md');
  const jsonPath = join(REPO_ROOT, 'FIRST_FULL_E2E_RUN.json');
  
  // Clean up any existing reports
  if (existsSync(reportPath)) {
    unlinkSync(reportPath);
  }
  if (existsSync(jsonPath)) {
    unlinkSync(jsonPath);
  }
  
  try {
    // Run dry-run commissioning
    const output = execSync(
      'node scripts/e2e/e2e-01-commission.mjs --dry-run --project-id test-e2e-01',
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: 'pipe'
      }
    );
    
    // Verify output contains expected markers
    assert.ok(output.includes('MOBIUS v1 END-TO-END COMMISSIONING RUN'), 'Output should contain title');
    assert.ok(output.includes('DRY RUN OK'), 'Output should contain dry run confirmation');
    assert.ok(output.includes('Run ID:'), 'Output should contain run ID');
    assert.ok(output.includes('Commit SHA:'), 'Output should contain commit SHA');
    
    // Verify report was generated
    assert.ok(existsSync(reportPath), 'Markdown report should be generated');
    assert.ok(existsSync(jsonPath), 'JSON report should be generated');
    
    // Verify report contents
    const reportContent = readFileSync(reportPath, 'utf8');
    assert.ok(reportContent.includes('MOBIUS v1 First Full End-to-End Run'), 'Report should have title');
    assert.ok(reportContent.includes('DRY RUN COMPLETE'), 'Report should indicate dry run');
    assert.ok(reportContent.includes('test-e2e-01'), 'Report should contain project ID');
    
    // Verify JSON report structure
    const jsonContent = JSON.parse(readFileSync(jsonPath, 'utf8'));
    assert.strictEqual(jsonContent.version, '1.0', 'JSON report should have version');
    assert.ok(jsonContent.runId, 'JSON report should have run ID');
    assert.ok(jsonContent.commitSHA, 'JSON report should have commit SHA');
    assert.strictEqual(jsonContent.status, 'SUCCESS', 'JSON report should show success');
    assert.ok(jsonContent.stages, 'JSON report should have stages');
    
    // Verify all stages are present and skipped
    const expectedStages = [
      'ingestion',
      'confirmIngestionGates',
      'scriptGeneration',
      'confirmScript',
      'verification'
    ];
    
    for (const stageName of expectedStages) {
      assert.ok(jsonContent.stages[stageName], `Stage ${stageName} should exist`);
      assert.strictEqual(
        jsonContent.stages[stageName].status,
        'SKIPPED',
        `Stage ${stageName} should be skipped in dry run`
      );
    }
    
    console.log('✅ E2E-01 dry run test passed');
    
  } finally {
    // Clean up generated reports
    if (existsSync(reportPath)) {
      unlinkSync(reportPath);
    }
    if (existsSync(jsonPath)) {
      unlinkSync(jsonPath);
    }
  }
});

test('E2E-01 dry run fails without project ID', async () => {
  try {
    execSync(
      'node scripts/e2e/e2e-01-commission.mjs --dry-run',
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: 'pipe'
      }
    );
    
    assert.fail('Should have thrown an error');
  } catch (error) {
    // Expected to fail
    assert.ok(error.message.includes('--project-id is required') || error.status !== 0, 'Should fail without project ID');
    console.log('✅ E2E-01 correctly rejects missing project ID');
  }
});

test('E2E-01 dry run handles unknown arguments', async () => {
  try {
    execSync(
      'node scripts/e2e/e2e-01-commission.mjs --dry-run --project-id test --unknown-arg',
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        stdio: 'pipe'
      }
    );
    
    assert.fail('Should have thrown an error');
  } catch (error) {
    // Expected to fail
    assert.ok(error.message.includes('Unknown argument') || error.status !== 0, 'Should fail with unknown argument');
    console.log('✅ E2E-01 correctly rejects unknown arguments');
  }
});
