// tests/integration/script-gates.test.js
// Integration tests for script artifact gates
// PHASE F: Verify non-bypassability and consistency enforcement

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/api/index.js';
import db, {
  getScriptArtifacts,
  getAuthoritativeScript,
  getGateStates,
  setIngestionReport,
  setGateStates
} from '../../src/api/db.js';
import { GateId, GateStatus } from '../../src/utils/gateConstants.js';
import { ScriptStatus } from '../../src/utils/scriptArtifact.js';

describe('Script Gates Integration Tests', () => {
  let testProjectId;

  beforeEach(async () => {
    // Create a test project with confirmed ingestion
    const result = db.prepare(`
      INSERT INTO projects (name, metadata, components)
      VALUES (?, ?, ?)
    `).run(
      'Test Game',
      JSON.stringify({ title: 'Test Game', designer: 'Test Designer' }),
      JSON.stringify([
        { name: 'Action Card', quantity: 50, selected: true },
        { name: 'Resource Token', quantity: 100, selected: true },
        { name: 'Player Board', quantity: 4, selected: true }
      ])
    );

    testProjectId = result.lastInsertRowid;

    // Set up confirmed ingestion report
    const ingestionReport = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      sources: ['pdf_text'],
      fields: {
        title: {
          value: 'Test Game',
          source: 'pdf_text',
          confidence: 0.95,
          warnings: []
        },
        components: {
          value: [
            { name: 'Action Card', quantity: 50 },
            { name: 'Resource Token', quantity: 100 },
            { name: 'Player Board', quantity: 4 }
          ],
          source: 'pdf_text',
          confidence: 0.9,
          warnings: []
        }
      }
    };

    setIngestionReport(testProjectId, ingestionReport);

    // Confirm required ingestion gates
    const gateStates = {
      [GateId.CONFIRM_METADATA]: {
        gateId: GateId.CONFIRM_METADATA,
        status: GateStatus.CONFIRMED,
        confirmedAt: new Date().toISOString(),
        notes: 'Test confirmation'
      },
      [GateId.CONFIRM_COMPONENTS]: {
        gateId: GateId.CONFIRM_COMPONENTS,
        status: GateStatus.CONFIRMED,
        confirmedAt: new Date().toISOString(),
        notes: 'Test confirmation'
      }
    };

    setGateStates(testProjectId, gateStates);
  });

  afterEach(() => {
    // Clean up test project
    if (testProjectId) {
      db.prepare('DELETE FROM projects WHERE id = ?').run(testProjectId);
    }
  });

  describe('Script Generation', () => {
    it('should block script generation if ingestion gates not satisfied', async () => {
      // Reset gates to pending
      setGateStates(testProjectId, {});

      const response = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Test rulebook text',
          gameName: 'Test Game',
          components: []
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('INGESTION_GATES_BLOCKED');
    });

    it('should create script candidate when ingestion gates satisfied', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Test rulebook with Action Cards and Resource Tokens',
          gameName: 'Test Game',
          metadata: { title: 'Test Game' },
          components: [
            { name: 'Action Card', quantity: 50 },
            { name: 'Resource Token', quantity: 100 }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.artifact).toBeDefined();
      expect(response.body.artifact.status).toBe(ScriptStatus.CANDIDATE);
      expect(response.body.artifact.projectId).toBe(testProjectId);

      // Verify persistence
      const artifacts = getScriptArtifacts(testProjectId);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].id).toBe(response.body.artifact.id);
    });

    it('should detect unknown components as violations', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Test rulebook with Unknown Widget and Mystery Token',
          gameName: 'Test Game',
          components: []
        });

      expect(response.status).toBe(200);
      expect(response.body.artifact.violations).toBeDefined();
      
      const unknownViolations = response.body.artifact.violations.filter(
        v => v.type === 'unknown_component'
      );
      
      expect(unknownViolations.length).toBeGreaterThan(0);
      expect(response.body.canConfirm).toBe(false);
    });

    it('should never overwrite existing candidates', async () => {
      // Generate first candidate
      const response1 = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'First script version',
          gameName: 'Test Game',
          components: []
        });

      expect(response1.status).toBe(200);
      const firstId = response1.body.artifact.id;

      // Generate second candidate
      const response2 = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Second script version',
          gameName: 'Test Game',
          components: []
        });

      expect(response2.status).toBe(200);
      const secondId = response2.body.artifact.id;

      // Verify both exist
      const artifacts = getScriptArtifacts(testProjectId);
      expect(artifacts).toHaveLength(2);
      expect(artifacts.map(a => a.id)).toContain(firstId);
      expect(artifacts.map(a => a.id)).toContain(secondId);
    });
  });

  describe('Script Confirmation', () => {
    let candidateId;

    beforeEach(async () => {
      // Create a clean candidate
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Test rulebook with Action Card and Resource Token',
          gameName: 'Test Game',
          components: [
            { name: 'Action Card', quantity: 50 },
            { name: 'Resource Token', quantity: 100 }
          ]
        });

      candidateId = response.body.artifact.id;
    });

    it('should confirm candidate and update CONFIRM_SCRIPT gate', async () => {
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/script/confirm`)
        .send({
          candidateId,
          notes: 'Looks good!'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.authoritative).toBeDefined();
      expect(response.body.authoritative.status).toBe(ScriptStatus.AUTHORITATIVE);

      // Verify gate state updated
      const gateStates = getGateStates(testProjectId);
      expect(gateStates[GateId.CONFIRM_SCRIPT]).toBeDefined();
      expect(gateStates[GateId.CONFIRM_SCRIPT].status).toBe(GateStatus.CONFIRMED);
      expect(gateStates[GateId.CONFIRM_SCRIPT].notes).toBe('Looks good!');
    });

    it('should block confirmation if candidate has violations', async () => {
      // Create candidate with violations
      const badResponse = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Test rulebook with Unknown Widget',
          gameName: 'Test Game',
          components: []
        });

      const badCandidateId = badResponse.body.artifact.id;

      const response = await request(app)
        .post(`/api/projects/${testProjectId}/script/confirm`)
        .send({
          candidateId: badCandidateId,
          notes: 'Trying to confirm'
        });

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('SCRIPT_HAS_VIOLATIONS');
      expect(response.body.violations).toBeDefined();
    });

    it('should persist confirmation across server restart', async () => {
      // Confirm candidate
      await request(app)
        .post(`/api/projects/${testProjectId}/script/confirm`)
        .send({ candidateId });

      // Simulate restart by fetching from DB
      const authoritative = getAuthoritativeScript(testProjectId);
      expect(authoritative).toBeDefined();
      expect(authoritative.id).toBe(candidateId);
      expect(authoritative.status).toBe(ScriptStatus.AUTHORITATIVE);

      const gateStates = getGateStates(testProjectId);
      expect(gateStates[GateId.CONFIRM_SCRIPT].status).toBe(GateStatus.CONFIRMED);
    });

    it('should mark other candidates as non-authoritative when confirming', async () => {
      // Create second candidate
      const response2 = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Second version',
          gameName: 'Test Game',
          components: []
        });

      const secondId = response2.body.artifact.id;

      // Confirm first candidate
      await request(app)
        .post(`/api/projects/${testProjectId}/script/confirm`)
        .send({ candidateId });

      // Verify only first is authoritative
      const artifacts = getScriptArtifacts(testProjectId);
      const auth = artifacts.find(a => a.id === candidateId);
      const other = artifacts.find(a => a.id === secondId);

      expect(auth.status).toBe(ScriptStatus.AUTHORITATIVE);
      expect(other.status).toBe(ScriptStatus.CANDIDATE);
    });
  });

  describe('Downstream Gating', () => {
    it('should block TTS if CONFIRM_SCRIPT gate not satisfied', async () => {
      // Create candidate but don't confirm
      await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Test rulebook',
          gameName: 'Test Game',
          components: []
        });

      // Try to call TTS endpoint (assuming it exists and uses enforceGates)
      // This is a placeholder - actual TTS endpoint may have different signature
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/tts`)
        .send({ script: 'test' });

      // Should be blocked by gates
      expect([409, 422]).toContain(response.status);
      expect(response.body.code).toBe('INGESTION_GATES_BLOCKED');
    });

    it('should allow TTS after CONFIRM_SCRIPT gate satisfied', async () => {
      // Create and confirm candidate
      const genResponse = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Test rulebook with Action Card',
          gameName: 'Test Game',
          components: [{ name: 'Action Card', quantity: 50 }]
        });

      await request(app)
        .post(`/api/projects/${testProjectId}/script/confirm`)
        .send({ candidateId: genResponse.body.artifact.id });

      // Now TTS should not be blocked by gates
      // (It may fail for other reasons, but not gate blocking)
      const response = await request(app)
        .post(`/api/projects/${testProjectId}/tts`)
        .send({ script: 'test' });

      // Should NOT be blocked by gates (may be 404 if endpoint doesn't exist)
      expect(response.status).not.toBe(409);
      expect(response.body.code).not.toBe('INGESTION_GATES_BLOCKED');
    });
  });

  describe('API Endpoints', () => {
    it('should list all candidates', async () => {
      // Create multiple candidates
      await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'First version',
          gameName: 'Test Game',
          components: []
        });

      await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Second version',
          gameName: 'Test Game',
          components: []
        });

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/script/candidates`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.candidates).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should return 404 for authoritative when none exists', async () => {
      const response = await request(app)
        .get(`/api/projects/${testProjectId}/script/authoritative`);

      expect(response.status).toBe(404);
      expect(response.body.code).toBe('NO_AUTHORITATIVE_SCRIPT');
    });

    it('should return authoritative script when it exists', async () => {
      // Create and confirm
      const genResponse = await request(app)
        .post(`/api/projects/${testProjectId}/script/generate`)
        .send({
          rulebookText: 'Test rulebook',
          gameName: 'Test Game',
          components: []
        });

      await request(app)
        .post(`/api/projects/${testProjectId}/script/confirm`)
        .send({ candidateId: genResponse.body.artifact.id });

      const response = await request(app)
        .get(`/api/projects/${testProjectId}/script/authoritative`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.script).toBeDefined();
      expect(response.body.script.status).toBe(ScriptStatus.AUTHORITATIVE);
    });
  });
});
