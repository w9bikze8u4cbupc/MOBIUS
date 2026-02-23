// src/__tests__/eliteVerifierSkeleton.test.js
// Unit tests for Elite verifier skeleton (score computation + HARD_FAIL logic)

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

// Import verifier functions
// Note: Dynamic import needed for ESM in Jest
let evaluateRule, verifyElite;

beforeAll(async () => {
  const verifierModule = await import('../../scripts/elite/verify-pro-video-elite.mjs');
  evaluateRule = verifierModule.evaluateRule;
  verifyElite = verifierModule.verifyElite;
});

describe('Elite Verifier Skeleton', () => {
  let contract;
  let sampleMetrics;

  beforeAll(() => {
    // Load contract
    const contractPath = join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json');
    contract = JSON.parse(readFileSync(contractPath, 'utf8'));

    // Load sample metrics
    const metricsPath = join(REPO_ROOT, 'scripts/elite/sample-elite-metrics.json');
    sampleMetrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  });

  describe('Rule Evaluation', () => {
    test('evaluates == operator correctly', () => {
      const rule = {
        id: 'TEST1',
        threshold: { op: '==', target: true },
        scoring: { points: 10 },
        severity: 'HARD_FAIL'
      };

      const resultPass = evaluateRule(rule, { TEST1: { actual: true } });
      expect(resultPass.passed).toBe(true);
      expect(resultPass.points_awarded).toBe(10);

      const resultFail = evaluateRule(rule, { TEST1: { actual: false } });
      expect(resultFail.passed).toBe(false);
      expect(resultFail.points_awarded).toBe(0);
    });

    test('evaluates <= operator correctly', () => {
      const rule = {
        id: 'TEST2',
        threshold: { op: '<=', target: -1.0 },
        scoring: { points: 20 },
        severity: 'HARD_FAIL'
      };

      const resultPass = evaluateRule(rule, { TEST2: { actual: -1.2 } });
      expect(resultPass.passed).toBe(true);
      expect(resultPass.points_awarded).toBe(20);

      const resultFail = evaluateRule(rule, { TEST2: { actual: -0.5 } });
      expect(resultFail.passed).toBe(false);
      expect(resultFail.points_awarded).toBe(0);
    });

    test('evaluates >= operator correctly', () => {
      const rule = {
        id: 'TEST3',
        threshold: { op: '>=', target: 18 },
        scoring: { points: 15 },
        severity: 'SOFT_WARN'
      };

      const resultPass = evaluateRule(rule, { TEST3: { actual: 20 } });
      expect(resultPass.passed).toBe(true);
      expect(resultPass.points_awarded).toBe(15);

      const resultFail = evaluateRule(rule, { TEST3: { actual: 15 } });
      expect(resultFail.passed).toBe(false);
      expect(resultFail.points_awarded).toBe(0);
    });

    test('evaluates within_tolerance operator correctly', () => {
      const rule = {
        id: 'TEST4',
        threshold: { op: 'within_tolerance', target: -14.0, tolerance: 0.5 },
        scoring: { points: 30 },
        severity: 'HARD_FAIL'
      };

      const resultPass1 = evaluateRule(rule, { TEST4: { actual: -14.1 } });
      expect(resultPass1.passed).toBe(true);

      const resultPass2 = evaluateRule(rule, { TEST4: { actual: -13.8 } });
      expect(resultPass2.passed).toBe(true);

      const resultFail = evaluateRule(rule, { TEST4: { actual: -15.0 } });
      expect(resultFail.passed).toBe(false);
    });

    test('evaluates within_range operator correctly', () => {
      const rule = {
        id: 'TEST5',
        threshold: { op: 'within_range', min: 120, max: 210 },
        scoring: { points: 25 },
        severity: 'SOFT_WARN'
      };

      const resultPass = evaluateRule(rule, { TEST5: { actual: 180 } });
      expect(resultPass.passed).toBe(true);

      const resultFail = evaluateRule(rule, { TEST5: { actual: 250 } });
      expect(resultFail.passed).toBe(false);
    });

    test('evaluates matches_sequence operator correctly', () => {
      const rule = {
        id: 'TEST6',
        threshold: {
          op: 'matches_sequence',
          required_sequence: ['a', 'b', 'c']
        },
        scoring: { points: 40 },
        severity: 'HARD_FAIL'
      };

      const resultPass = evaluateRule(rule, { TEST6: { actual: ['a', 'b', 'c'] } });
      expect(resultPass.passed).toBe(true);

      const resultFail = evaluateRule(rule, { TEST6: { actual: ['a', 'c', 'b'] } });
      expect(resultFail.passed).toBe(false);
    });

    test('evaluates intro_duration_lte_or_cold_open operator correctly', () => {
      const rule = {
        id: 'TEST7',
        threshold: { op: 'intro_duration_lte_or_cold_open', intro_max: 2 },
        scoring: { points: 35 },
        severity: 'HARD_FAIL'
      };

      const resultPass1 = evaluateRule(rule, { TEST7: { actual: { intro_duration: 1.5, cold_open: false } } });
      expect(resultPass1.passed).toBe(true);

      const resultPass2 = evaluateRule(rule, { TEST7: { actual: { intro_duration: 5, cold_open: true } } });
      expect(resultPass2.passed).toBe(true);

      const resultFail = evaluateRule(rule, { TEST7: { actual: { intro_duration: 5, cold_open: false } } });
      expect(resultFail.passed).toBe(false);
    });

    test('handles missing metrics', () => {
      const rule = {
        id: 'MISSING',
        threshold: { op: '==', target: true },
        scoring: { points: 10 },
        severity: 'HARD_FAIL'
      };

      const result = evaluateRule(rule, {});
      expect(result.passed).toBe(false);
      expect(result.points_awarded).toBe(0);
      expect(result.reason).toBe('metric_missing');
    });

    test('detects HARD_FAIL triggers', () => {
      const rule = {
        id: 'HARD',
        threshold: { op: '==', target: true },
        scoring: { points: 10 },
        severity: 'HARD_FAIL'
      };

      const result = evaluateRule(rule, { HARD: { actual: false } });
      expect(result.hard_fail_triggered).toBe(true);
    });

    test('does not trigger HARD_FAIL for SOFT_WARN', () => {
      const rule = {
        id: 'SOFT',
        threshold: { op: '==', target: true },
        scoring: { points: 10 },
        severity: 'SOFT_WARN'
      };

      const result = evaluateRule(rule, { SOFT: { actual: false } });
      expect(result.hard_fail_triggered).toBe(false);
    });
  });

  describe('Score Computation', () => {
    test('all-pass fixture yields eliteScore === 1000', () => {
      const report = verifyElite(contract, sampleMetrics);
      expect(report.eliteScore).toBe(1000);
      expect(report.hardFailCount).toBe(0);
      expect(report.softWarnCount).toBe(0);
      expect(report.passed_elite_threshold).toBe(true);
    });

    test('eliteScore equals sum of awarded points', () => {
      const report = verifyElite(contract, sampleMetrics);
      const sumPoints = report.rules.reduce((sum, r) => sum + r.points_awarded, 0);
      expect(report.eliteScore).toBe(sumPoints);
    });

    test('eliteScore never exceeds 1000', () => {
      const report = verifyElite(contract, sampleMetrics);
      expect(report.eliteScore).toBeLessThanOrEqual(1000);
    });

    test('single HARD_FAIL rule fails increments hardFailCount', () => {
      // Create metrics with one HARD_FAIL rule failing (A1)
      const modifiedMetrics = { ...sampleMetrics };
      modifiedMetrics.A1 = { actual: -20.0 }; // Way out of tolerance

      const report = verifyElite(contract, modifiedMetrics);
      expect(report.hardFailCount).toBeGreaterThanOrEqual(1);
      expect(report.passed_elite_threshold).toBe(false);
    });

    test('failing HARD_FAIL does not award points', () => {
      const modifiedMetrics = { ...sampleMetrics };
      modifiedMetrics.A1 = { actual: -20.0 };

      const report = verifyElite(contract, modifiedMetrics);
      const a1Result = report.rules.find(r => r.id === 'A1');
      expect(a1Result.passed).toBe(false);
      expect(a1Result.points_awarded).toBe(0);
    });

    test('failing SOFT_WARN increments softWarnCount', () => {
      const modifiedMetrics = { ...sampleMetrics };
      modifiedMetrics.A5 = { actual: 10 }; // Below threshold (18 dB)

      const report = verifyElite(contract, modifiedMetrics);
      expect(report.softWarnCount).toBeGreaterThanOrEqual(1);
    });

    test('score below threshold but no HARD_FAIL still fails elite', () => {
      // Create metrics where many SOFT_WARN rules fail
      const modifiedMetrics = { ...sampleMetrics };
      modifiedMetrics.A5 = { actual: 10 }; // SOFT_WARN fail
      modifiedMetrics.C1 = { actual: 250 }; // SOFT_WARN fail
      modifiedMetrics.C2 = { actual: 50 }; // SOFT_WARN fail
      modifiedMetrics.S2 = { actual: 350 }; // SOFT_WARN fail
      modifiedMetrics.S3 = { actual: 40 }; // SOFT_WARN fail

      const report = verifyElite(contract, modifiedMetrics);
      
      // Should have no HARD_FAIL but score may be below threshold
      expect(report.hardFailCount).toBe(0);
      
      // If score is below threshold, should not pass
      if (report.eliteScore < report.elite_threshold_score) {
        expect(report.passed_elite_threshold).toBe(false);
      }
    });
  });

  describe('Report Structure', () => {
    test('report contains required fields', () => {
      const report = verifyElite(contract, sampleMetrics);
      expect(report).toHaveProperty('contract_id');
      expect(report).toHaveProperty('contract_version');
      expect(report).toHaveProperty('eliteScore');
      expect(report).toHaveProperty('score_total');
      expect(report).toHaveProperty('elite_threshold_score');
      expect(report).toHaveProperty('hardFailCount');
      expect(report).toHaveProperty('softWarnCount');
      expect(report).toHaveProperty('passed_elite_threshold');
      expect(report).toHaveProperty('rules');
    });

    test('rules are sorted by ID', () => {
      const report = verifyElite(contract, sampleMetrics);
      const ids = report.rules.map(r => r.id);
      const sortedIds = [...ids].sort();
      expect(ids).toEqual(sortedIds);
    });

    test('each rule result has required fields', () => {
      const report = verifyElite(contract, sampleMetrics);
      report.rules.forEach(rule => {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('passed');
        expect(rule).toHaveProperty('points_awarded');
        expect(rule).toHaveProperty('severity');
      });
    });

    test('report is deterministic', () => {
      const report1 = verifyElite(contract, sampleMetrics);
      const report2 = verifyElite(contract, sampleMetrics);
      expect(JSON.stringify(report1)).toBe(JSON.stringify(report2));
    });
  });

  describe('S4 Combinatorial Compression', () => {
    test('evaluates combinatorial_compression_required operator correctly', () => {
      const rule = contract.rules.find(r => r.id === 'S4');
      expect(rule).toBeDefined();
      expect(rule.threshold.op).toBe('combinatorial_compression_required');

      // Test: No subsystem exceeds thresholds - should pass
      const metricsPass = {
        S4: {
          actual: {
            max_branch_count: 3,
            max_exception_layers: 2,
            max_interaction_variables: 3,
            max_projected_runtime_seconds: 180,
            subsystems_with_referral: []
          }
        }
      };
      const resultPass = evaluateRule(rule, metricsPass);
      expect(resultPass.passed).toBe(true);
      expect(resultPass.points_awarded).toBe(50);

      // Test: Subsystem exceeds branch count threshold without referral - should fail
      const metricsFail = {
        S4: {
          actual: {
            max_branch_count: 6, // Exceeds threshold of 5
            max_exception_layers: 2,
            max_interaction_variables: 3,
            max_projected_runtime_seconds: 180,
            subsystems_with_referral: [] // No referral provided
          }
        }
      };
      const resultFail = evaluateRule(rule, metricsFail);
      expect(resultFail.passed).toBe(false);
      expect(resultFail.points_awarded).toBe(0);

      // Test: Subsystem exceeds threshold but has referral - should pass
      const metricsPassWithReferral = {
        S4: {
          actual: {
            max_branch_count: 6,
            max_exception_layers: 2,
            max_interaction_variables: 3,
            max_projected_runtime_seconds: 180,
            subsystems_with_referral: ['combat_system'] // Referral provided
          }
        }
      };
      const resultPassWithReferral = evaluateRule(rule, metricsPassWithReferral);
      expect(resultPassWithReferral.passed).toBe(true);
      expect(resultPassWithReferral.points_awarded).toBe(50);
    });

    test('S4 included in sample metrics and passes', () => {
      const report = verifyElite(contract, sampleMetrics);
      const s4Result = report.rules.find(r => r.id === 'S4');
      expect(s4Result).toBeDefined();
      expect(s4Result.passed).toBe(true);
      expect(s4Result.points_awarded).toBe(50);
    });

    test('S4 triggers on any threshold exceeded', () => {
      const rule = contract.rules.find(r => r.id === 'S4');

      // Test each trigger independently
      const triggers = [
        { max_branch_count: 5, max_exception_layers: 2, max_interaction_variables: 3, max_projected_runtime_seconds: 180 },
        { max_branch_count: 3, max_exception_layers: 3, max_interaction_variables: 3, max_projected_runtime_seconds: 180 },
        { max_branch_count: 3, max_exception_layers: 2, max_interaction_variables: 4, max_projected_runtime_seconds: 180 },
        { max_branch_count: 3, max_exception_layers: 2, max_interaction_variables: 3, max_projected_runtime_seconds: 240 }
      ];

      triggers.forEach((triggerData, idx) => {
        const metricsNoReferral = {
          S4: {
            actual: {
              ...triggerData,
              subsystems_with_referral: []
            }
          }
        };
        const result = evaluateRule(rule, metricsNoReferral);
        expect(result.passed).toBe(false); // Should fail without referral
      });
    });
  });

  describe('Contract Integration', () => {
    test('evaluates all contract rules', () => {
      const report = verifyElite(contract, sampleMetrics);
      expect(report.rules.length).toBe(contract.rules.length);
    });

    test('contract_id matches', () => {
      const report = verifyElite(contract, sampleMetrics);
      expect(report.contract_id).toBe(contract.contract_id);
    });

    test('score_total matches contract', () => {
      const report = verifyElite(contract, sampleMetrics);
      expect(report.score_total).toBe(contract.score_total);
    });

    test('elite_threshold_score matches contract', () => {
      const report = verifyElite(contract, sampleMetrics);
      expect(report.elite_threshold_score).toBe(contract.elite_threshold_score);
    });
  });
});
