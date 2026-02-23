// tests/elite/elite-standard-contract.test.js
// Contract validation tests for MOBIUS Elite Video Standard v1

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

describe('Elite Standard Contract Validation', () => {
  let contract;
  let schema;

  beforeAll(() => {
    // Load contract
    const contractPath = join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json');
    contract = JSON.parse(readFileSync(contractPath, 'utf8'));

    // Load schema
    const schemaPath = join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.schema.json');
    schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  });

  describe('Contract Structure', () => {
    test('has required top-level fields', () => {
      expect(contract).toHaveProperty('contract_id');
      expect(contract).toHaveProperty('contract_version');
      expect(contract).toHaveProperty('created_at');
      expect(contract).toHaveProperty('elite_threshold_score');
      expect(contract).toHaveProperty('score_total');
      expect(contract).toHaveProperty('categories');
      expect(contract).toHaveProperty('rule_severity_order');
      expect(contract).toHaveProperty('rules');
    });

    test('contract_id is correct', () => {
      expect(contract.contract_id).toBe('MOBIUS_ELITE_VIDEO_STANDARD_v1');
    });

    test('contract_version follows semver', () => {
      expect(contract.contract_version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    test('elite_threshold_score is 900', () => {
      expect(contract.elite_threshold_score).toBe(900);
    });

    test('score_total is 1000', () => {
      expect(contract.score_total).toBe(1000);
    });

    test('rule_severity_order contains only HARD_FAIL and SOFT_WARN', () => {
      expect(contract.rule_severity_order).toEqual(['HARD_FAIL', 'SOFT_WARN']);
    });
  });

  describe('Categories', () => {
    test('categories is an array', () => {
      expect(Array.isArray(contract.categories)).toBe(true);
      expect(contract.categories.length).toBeGreaterThan(0);
    });

    test('each category has required fields', () => {
      contract.categories.forEach(category => {
        expect(category).toHaveProperty('id');
        expect(category).toHaveProperty('name');
        expect(category).toHaveProperty('weight');
        expect(typeof category.id).toBe('string');
        expect(typeof category.name).toBe('string');
        expect(typeof category.weight).toBe('number');
      });
    });

    test('category IDs are unique', () => {
      const ids = contract.categories.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('category IDs match pattern', () => {
      contract.categories.forEach(category => {
        expect(category.id).toMatch(/^[a-z_]+$/);
      });
    });

    test('category weights sum to 1000', () => {
      const totalWeight = contract.categories.reduce((sum, cat) => sum + cat.weight, 0);
      expect(totalWeight).toBe(1000);
    });

    test('expected categories are present', () => {
      const expectedCategories = ['audio', 'visual', 'pedagogy', 'retention', 'chapters', 'accessibility', 'trust'];
      const actualCategories = contract.categories.map(c => c.id);
      expectedCategories.forEach(expected => {
        expect(actualCategories).toContain(expected);
      });
    });
  });

  describe('Rules', () => {
    test('rules is an array', () => {
      expect(Array.isArray(contract.rules)).toBe(true);
      expect(contract.rules.length).toBeGreaterThan(0);
    });

    test('each rule has required fields', () => {
      contract.rules.forEach(rule => {
        expect(rule).toHaveProperty('id');
        expect(rule).toHaveProperty('category_id');
        expect(rule).toHaveProperty('title');
        expect(rule).toHaveProperty('severity');
        expect(rule).toHaveProperty('rationale');
        expect(rule).toHaveProperty('metric');
        expect(rule).toHaveProperty('threshold');
        expect(rule).toHaveProperty('scoring');
      });
    });

    test('rule IDs are unique', () => {
      const ids = contract.rules.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    test('rule IDs match pattern [A-Z]\\d+', () => {
      contract.rules.forEach(rule => {
        expect(rule.id).toMatch(/^[A-Z]\d+$/);
      });
    });

    test('rules are sorted by ID', () => {
      const ids = contract.rules.map(r => r.id);
      const sortedIds = [...ids].sort();
      expect(ids).toEqual(sortedIds);
    });

    test('all rule category_ids reference valid categories', () => {
      const validCategoryIds = contract.categories.map(c => c.id);
      contract.rules.forEach(rule => {
        expect(validCategoryIds).toContain(rule.category_id);
      });
    });

    test('all rule severities are valid', () => {
      const validSeverities = ['HARD_FAIL', 'SOFT_WARN'];
      contract.rules.forEach(rule => {
        expect(validSeverities).toContain(rule.severity);
      });
    });

    test('HARD_FAIL rules have hard_fail_blocks_release=true', () => {
      contract.rules
        .filter(r => r.severity === 'HARD_FAIL')
        .forEach(rule => {
          expect(rule.scoring.hard_fail_blocks_release).toBe(true);
        });
    });

    test('SOFT_WARN rules have hard_fail_blocks_release=false', () => {
      contract.rules
        .filter(r => r.severity === 'SOFT_WARN')
        .forEach(rule => {
          expect(rule.scoring.hard_fail_blocks_release).toBe(false);
        });
    });
  });

  describe('Metrics', () => {
    test('each rule metric has required fields', () => {
      contract.rules.forEach(rule => {
        expect(rule.metric).toHaveProperty('id');
        expect(rule.metric).toHaveProperty('unit');
        expect(rule.metric).toHaveProperty('extractor_hint');
        expect(typeof rule.metric.id).toBe('string');
        expect(typeof rule.metric.unit).toBe('string');
        expect(typeof rule.metric.extractor_hint).toBe('string');
      });
    });
  });

  describe('Thresholds', () => {
    test('each rule threshold has required fields', () => {
      contract.rules.forEach(rule => {
        expect(rule.threshold).toHaveProperty('op');
        expect(rule.threshold).toHaveProperty('unit');
        expect(typeof rule.threshold.op).toBe('string');
        expect(typeof rule.threshold.unit).toBe('string');
      });
    });

    test('threshold operators are valid', () => {
      const validOps = [
        '==', '<=', '>=', '<', '>',
        'within_tolerance', 'within_range',
        'matches_sequence', 'intro_duration_lte_or_cold_open'
      ];
      contract.rules.forEach(rule => {
        expect(validOps).toContain(rule.threshold.op);
      });
    });
  });

  describe('Scoring', () => {
    test('each rule scoring has required fields', () => {
      contract.rules.forEach(rule => {
        expect(rule.scoring).toHaveProperty('points');
        expect(rule.scoring).toHaveProperty('hard_fail_blocks_release');
        expect(typeof rule.scoring.points).toBe('number');
        expect(typeof rule.scoring.hard_fail_blocks_release).toBe('boolean');
      });
    });

    test('all rule points are non-negative', () => {
      contract.rules.forEach(rule => {
        expect(rule.scoring.points).toBeGreaterThanOrEqual(0);
      });
    });

    test('total rule points sum to 1000', () => {
      const totalPoints = contract.rules.reduce((sum, rule) => sum + rule.scoring.points, 0);
      expect(totalPoints).toBe(1000);
    });

    test('per-category rule points sum to category weight', () => {
      contract.categories.forEach(category => {
        const categoryRules = contract.rules.filter(r => r.category_id === category.id);
        const categoryPoints = categoryRules.reduce((sum, rule) => sum + rule.scoring.points, 0);
        expect(categoryPoints).toBe(category.weight);
      });
    });
  });

  describe('Schema Compliance', () => {
    test('contract matches expected structure', () => {
      // Basic schema validation without external library
      // Check that all schema-required fields are present
      expect(contract.contract_id).toBe(schema.properties.contract_id.const);
      expect(contract.score_total).toBe(schema.properties.score_total.const);
      expect(contract.elite_threshold_score).toBeGreaterThanOrEqual(0);
      expect(contract.elite_threshold_score).toBeLessThanOrEqual(1000);
    });

    test('no unexpected top-level properties', () => {
      const allowedProps = [
        'contract_id',
        'contract_version',
        'created_at',
        'description',
        'elite_threshold_score',
        'score_total',
        'categories',
        'rule_severity_order',
        'scoring_notes',
        'rules',
        'exit_codes',
        'measurement_notes'
      ];
      const actualProps = Object.keys(contract);
      actualProps.forEach(prop => {
        expect(allowedProps).toContain(prop);
      });
    });
  });

  describe('Determinism', () => {
    test('contract can be serialized and parsed identically', () => {
      const serialized = JSON.stringify(contract);
      const parsed = JSON.parse(serialized);
      expect(parsed).toEqual(contract);
    });

    test('rules maintain stable ordering', () => {
      // Rules should be sorted by ID for deterministic diffs
      const ids = contract.rules.map(r => r.id);
      const sortedIds = [...ids].sort();
      expect(ids).toEqual(sortedIds);
    });

    test('contract JSON is formatted with 2-space indentation', () => {
      const contractPath = join(REPO_ROOT, 'config/elite/MOBIUS_ELITE_VIDEO_STANDARD_v1.json');
      const rawContent = readFileSync(contractPath, 'utf8');
      
      // Check that it's properly formatted (2-space indent)
      const reformatted = JSON.stringify(contract, null, 2);
      expect(rawContent.trim()).toBe(reformatted);
    });

    test('rules are in strict lexicographic order by ID', () => {
      const ids = contract.rules.map(r => r.id);
      for (let i = 1; i < ids.length; i++) {
        const prev = ids[i - 1];
        const curr = ids[i];
        expect(prev.localeCompare(curr)).toBeLessThan(0);
      }
    });
  });

  describe('Specific Rule Validation', () => {
    test('A1 (Integrated Loudness) has correct structure', () => {
      const rule = contract.rules.find(r => r.id === 'A1');
      expect(rule).toBeDefined();
      expect(rule.category_id).toBe('audio');
      expect(rule.severity).toBe('HARD_FAIL');
      expect(rule.metric.id).toBe('integrated_lufs');
      expect(rule.threshold.op).toBe('within_tolerance');
      expect(rule.threshold.target).toBe(-14.0);
      expect(rule.threshold.tolerance).toBe(0.5);
    });

    test('V1 (Resolution) has correct structure', () => {
      const rule = contract.rules.find(r => r.id === 'V1');
      expect(rule).toBeDefined();
      expect(rule.category_id).toBe('visual');
      expect(rule.severity).toBe('HARD_FAIL');
      expect(rule.threshold.min_width).toBe(1920);
      expect(rule.threshold.min_height).toBe(1080);
    });

    test('S1 (Segment Order) has required sequence', () => {
      const rule = contract.rules.find(r => r.id === 'S1');
      expect(rule).toBeDefined();
      expect(rule.category_id).toBe('pedagogy');
      expect(rule.threshold.required_sequence).toBeDefined();
      expect(Array.isArray(rule.threshold.required_sequence)).toBe(true);
      expect(rule.threshold.required_sequence.length).toBeGreaterThan(0);
    });

    test('T1, T2, T3 (Trust rules) are all HARD_FAIL', () => {
      const trustRules = contract.rules.filter(r => r.category_id === 'trust');
      expect(trustRules.length).toBeGreaterThanOrEqual(3);
      trustRules.forEach(rule => {
        expect(rule.severity).toBe('HARD_FAIL');
      });
    });
  });
});
