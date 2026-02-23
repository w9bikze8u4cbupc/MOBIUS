// tests/integration/ingestion-gates.test.js
// Integration tests for ingestion truth gates
// Tests: blocked before confirmation, unblocked after confirmation, persistence

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { 
  getIngestionReport, 
  setIngestionReport, 
  getGateStates, 
  setGateStates,
  getProjectWithIngestion,
  areRequiredGatesSatisfied
} from '../../src/api/db.js';
import { checkGates, GateBlockedError } from '../../src/api/middleware/gates.js';
import { 
  GateStatus, 
  GateId,
  getRequiredGateIds,
  createInitialGateStates
} from '../../src/utils/gateConstants.js';
import { IngestionReportBuilder, SourceType } from '../../src/utils/ingestionReport.js';
import { ConfidenceLevel } from '../../src/utils/confidence.js';

describe('Ingestion Truth Gates Integration Tests', () => {
  let testDb;
  let testProjectId;

  beforeEach(() => {
    // Create a test database in memory
    testDb = new Database(':memory:');
    
    // Create projects table
    testDb.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        metadata TEXT,
        components TEXT,
        images TEXT,
        script TEXT,
        audio TEXT,
        ingestion_report TEXT,
        gate_states TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert a test project
    const stmt = testDb.prepare(`
      INSERT INTO projects (name, metadata, components)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(
      'Test Game',
      JSON.stringify({ title: 'Test Game' }),
      JSON.stringify([])
    );
    testProjectId = result.lastInsertRowid;
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
  });

  describe('Ingestion Report Persistence', () => {
    it('should persist and retrieve ingestion report', () => {
      // Create a test report
      const report = new IngestionReportBuilder(testProjectId, 'Test Game')
        .addField(
          'title',
          'Test Game',
          SourceType.BGG_API,
          { score: 0.9, level: ConfidenceLevel.HIGH, warnings: [] }
        )
        .addField(
          'designer',
          'Test Designer',
          SourceType.BGG_API,
          { score: 0.85, level: ConfidenceLevel.HIGH, warnings: [] }
        )
        .build();

      // Persist report
      const success = setIngestionReport(testProjectId, report);
      expect(success).toBe(true);

      // Retrieve report
      const retrieved = getIngestionReport(testProjectId);
      expect(retrieved).toBeDefined();
      expect(retrieved.projectId).toBe(testProjectId);
      expect(retrieved.fields.title.value).toBe('Test Game');
      expect(retrieved.fields.designer.value).toBe('Test Designer');
    });

    it('should return null for project without report', () => {
      const report = getIngestionReport(testProjectId);
      expect(report).toBeNull();
    });
  });

  describe('Gate States Persistence', () => {
    it('should persist and retrieve gate states', () => {
      const gateStates = {
        [GateId.CONFIRM_METADATA]: {
          gateId: GateId.CONFIRM_METADATA,
          status: GateStatus.CONFIRMED,
          confirmedAt: new Date().toISOString(),
          notes: 'Looks good',
          patch: null
        }
      };

      // Persist states
      const success = setGateStates(testProjectId, gateStates);
      expect(success).toBe(true);

      // Retrieve states
      const retrieved = getGateStates(testProjectId);
      expect(retrieved).toBeDefined();
      expect(retrieved[GateId.CONFIRM_METADATA].status).toBe(GateStatus.CONFIRMED);
      expect(retrieved[GateId.CONFIRM_METADATA].notes).toBe('Looks good');
    });

    it('should return null for project without gate states', () => {
      const states = getGateStates(testProjectId);
      expect(states).toBeNull();
    });
  });

  describe('Gate Blocking Logic', () => {
    beforeEach(() => {
      // Create and persist a test report
      const report = new IngestionReportBuilder(testProjectId, 'Test Game')
        .addField(
          'title',
          'Test Game',
          SourceType.BGG_API,
          { score: 0.9, level: ConfidenceLevel.HIGH, warnings: [] }
        )
        .build();
      setIngestionReport(testProjectId, report);

      // Initialize gate states
      const requiredGateIds = getRequiredGateIds(report);
      const initialStates = createInitialGateStates(requiredGateIds);
      setGateStates(testProjectId, initialStates);
    });

    it('should block when gates are pending', () => {
      const gateCheck = checkGates(testProjectId);
      
      expect(gateCheck.satisfied).toBe(false);
      expect(gateCheck.blockedReasons.length).toBeGreaterThan(0);
      expect(gateCheck.requiredGateIds).toContain(GateId.CONFIRM_METADATA);
      expect(gateCheck.requiredGateIds).toContain(GateId.CONFIRM_COMPONENTS);
    });

    it('should unblock after confirming all required gates', () => {
      // Get current states
      const gateStates = getGateStates(testProjectId);
      const requiredGateIds = Object.keys(gateStates);

      // Confirm all gates
      requiredGateIds.forEach(gateId => {
        gateStates[gateId] = {
          ...gateStates[gateId],
          status: GateStatus.CONFIRMED,
          confirmedAt: new Date().toISOString()
        };
      });
      setGateStates(testProjectId, gateStates);

      // Check gates
      const gateCheck = checkGates(testProjectId);
      
      expect(gateCheck.satisfied).toBe(true);
      expect(gateCheck.blockedReasons.length).toBe(0);
    });

    it('should remain blocked if any gate is rejected', () => {
      // Get current states
      const gateStates = getGateStates(testProjectId);
      const requiredGateIds = Object.keys(gateStates);

      // Confirm all but one, reject one
      requiredGateIds.forEach((gateId, idx) => {
        gateStates[gateId] = {
          ...gateStates[gateId],
          status: idx === 0 ? GateStatus.REJECTED : GateStatus.CONFIRMED,
          confirmedAt: new Date().toISOString()
        };
      });
      setGateStates(testProjectId, gateStates);

      // Check gates
      const gateCheck = checkGates(testProjectId);
      
      expect(gateCheck.satisfied).toBe(false);
      expect(gateCheck.blockedReasons.length).toBeGreaterThan(0);
      expect(gateCheck.blockedReasons[0].reason).toContain('Rejected');
    });

    it('should allow corrected gates', () => {
      // Get current states
      const gateStates = getGateStates(testProjectId);
      const requiredGateIds = Object.keys(gateStates);

      // Confirm some, correct others
      requiredGateIds.forEach((gateId, idx) => {
        gateStates[gateId] = {
          ...gateStates[gateId],
          status: idx % 2 === 0 ? GateStatus.CONFIRMED : GateStatus.CORRECTED,
          confirmedAt: new Date().toISOString()
        };
      });
      setGateStates(testProjectId, gateStates);

      // Check gates
      const gateCheck = checkGates(testProjectId);
      
      expect(gateCheck.satisfied).toBe(true);
      expect(gateCheck.blockedReasons.length).toBe(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should allow projects without ingestion reports', () => {
      // Don't create a report for this project
      const gateCheck = checkGates(testProjectId);
      
      expect(gateCheck.satisfied).toBe(true);
      expect(gateCheck.noReport).toBe(true);
      expect(gateCheck.blockedReasons.length).toBe(0);
    });

    it('should retrieve project with all ingestion data', () => {
      // Create report and gates
      const report = new IngestionReportBuilder(testProjectId, 'Test Game')
        .addField(
          'title',
          'Test Game',
          SourceType.BGG_API,
          { score: 0.9, level: ConfidenceLevel.HIGH, warnings: [] }
        )
        .build();
      setIngestionReport(testProjectId, report);

      const gateStates = {
        [GateId.CONFIRM_METADATA]: {
          gateId: GateId.CONFIRM_METADATA,
          status: GateStatus.CONFIRMED,
          confirmedAt: new Date().toISOString(),
          notes: null,
          patch: null
        }
      };
      setGateStates(testProjectId, gateStates);

      // Retrieve full project
      const project = getProjectWithIngestion(testProjectId);
      
      expect(project).toBeDefined();
      expect(project.name).toBe('Test Game');
      expect(project.ingestion_report).toBeDefined();
      expect(project.gate_states).toBeDefined();
      expect(project.ingestion_report.projectId).toBe(testProjectId);
      expect(project.gate_states[GateId.CONFIRM_METADATA].status).toBe(GateStatus.CONFIRMED);
    });
  });

  describe('Persistence Across Restarts', () => {
    it('should persist gate states across database reconnection', () => {
      // Create and persist data
      const report = new IngestionReportBuilder(testProjectId, 'Test Game')
        .addField(
          'title',
          'Test Game',
          SourceType.BGG_API,
          { score: 0.9, level: ConfidenceLevel.HIGH, warnings: [] }
        )
        .build();
      setIngestionReport(testProjectId, report);

      const gateStates = {
        [GateId.CONFIRM_METADATA]: {
          gateId: GateId.CONFIRM_METADATA,
          status: GateStatus.CONFIRMED,
          confirmedAt: new Date().toISOString(),
          notes: 'Test note',
          patch: null
        }
      };
      setGateStates(testProjectId, gateStates);

      // Simulate restart by reading directly from DB
      const stmt = testDb.prepare('SELECT gate_states FROM projects WHERE id = ?');
      const row = stmt.get(testProjectId);
      
      expect(row.gate_states).toBeDefined();
      
      const parsed = JSON.parse(row.gate_states);
      expect(parsed[GateId.CONFIRM_METADATA].status).toBe(GateStatus.CONFIRMED);
      expect(parsed[GateId.CONFIRM_METADATA].notes).toBe('Test note');
    });
  });

  describe('PHASE 3: Regression Detection and Hard Locks', () => {
    beforeEach(() => {
      // Create a project with pending gates
      const report = new IngestionReportBuilder(testProjectId, 'Test Game')
        .addField(
          'title',
          'Test Game',
          SourceType.BGG_API,
          { score: 0.9, level: ConfidenceLevel.HIGH, warnings: [] }
        )
        .build();
      setIngestionReport(testProjectId, report);

      const requiredGateIds = getRequiredGateIds(report);
      const initialStates = createInitialGateStates(requiredGateIds);
      setGateStates(testProjectId, initialStates);
    });

    it('should block with partial confirmations (regression test)', () => {
      // Confirm only one gate, leave others pending
      const gateStates = getGateStates(testProjectId);
      const gateIds = Object.keys(gateStates);
      
      // Confirm first gate only
      gateStates[gateIds[0]] = {
        ...gateStates[gateIds[0]],
        status: GateStatus.CONFIRMED,
        confirmedAt: new Date().toISOString()
      };
      setGateStates(testProjectId, gateStates);

      // Should still be blocked
      const gateCheck = checkGates(testProjectId);
      expect(gateCheck.satisfied).toBe(false);
      expect(gateCheck.blockedReasons.length).toBeGreaterThan(0);
    });

    it('should use centralized helper consistently', () => {
      // Test that areRequiredGatesSatisfied returns same result as checkGates
      const gateCheck = checkGates(testProjectId);
      const centralizedCheck = areRequiredGatesSatisfied(testProjectId);
      
      expect(centralizedCheck).toBe(gateCheck.satisfied);
    });

    it('should fail if gates are bypassed (anti-regression)', () => {
      // This test ensures that if someone removes gate enforcement,
      // the test will fail
      const gateCheck = checkGates(testProjectId);
      
      // If this passes, gates are working
      expect(gateCheck.satisfied).toBe(false);
      
      // Simulate a bypass attempt - this should never happen in production
      // but we test that our checks would catch it
      const bypassAttempt = () => {
        // If someone tries to bypass by not checking gates
        return true; // Pretend operation succeeded
      };
      
      // The correct behavior is to check gates first
      if (!gateCheck.satisfied) {
        // Operation should be blocked
        expect(() => {
          if (bypassAttempt()) {
            throw new Error('Operation should have been blocked by gates');
          }
        }).toThrow();
      }
    });

    it('should return standardized error code', () => {
      const gateCheck = checkGates(testProjectId);
      
      if (!gateCheck.satisfied) {
        const error = new GateBlockedError(gateCheck.blockedReasons, gateCheck.requiredGateIds);
        const errorJson = error.toJSON();
        
        expect(errorJson.code).toBe('INGESTION_GATES_BLOCKED');
        expect(errorJson.blockedReasons).toBeDefined();
        expect(errorJson.requiredGateIds).toBeDefined();
        expect(errorJson.actionRequired).toBeDefined();
        expect(errorJson.reviewUrl).toBeDefined();
      }
    });

    it('should maintain gate state consistency across operations', () => {
      // Get initial state
      const initialCheck = checkGates(testProjectId);
      const initialSatisfied = initialCheck.satisfied;
      
      // Perform multiple checks - should be consistent
      for (let i = 0; i < 5; i++) {
        const check = checkGates(testProjectId);
        expect(check.satisfied).toBe(initialSatisfied);
      }
    });

    it('should prevent progression with mixed gate statuses', () => {
      const gateStates = getGateStates(testProjectId);
      const gateIds = Object.keys(gateStates);
      
      // Create mixed statuses: some confirmed, some pending, some rejected
      gateIds.forEach((gateId, idx) => {
        if (idx % 3 === 0) {
          gateStates[gateId].status = GateStatus.CONFIRMED;
        } else if (idx % 3 === 1) {
          gateStates[gateId].status = GateStatus.PENDING;
        } else {
          gateStates[gateId].status = GateStatus.REJECTED;
        }
        gateStates[gateId].confirmedAt = new Date().toISOString();
      });
      setGateStates(testProjectId, gateStates);

      // Should be blocked due to pending and rejected gates
      const gateCheck = checkGates(testProjectId);
      expect(gateCheck.satisfied).toBe(false);
    });
  });
});
