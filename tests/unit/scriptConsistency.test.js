// tests/unit/scriptConsistency.test.js
// Unit tests for script consistency validation
// PHASE F: Verify unknown component detection and fuzzy matching

import { describe, it, expect } from '@jest/globals';
import { 
  validateScriptConsistency, 
  ViolationSeverity, 
  ViolationType 
} from '../../src/utils/scriptConsistency.js';

describe('Script Consistency Validation', () => {
  const createIngestionReport = (components) => ({
    version: '1.0',
    generatedAt: new Date().toISOString(),
    sources: ['pdf_text'],
    fields: {
      components: {
        value: components,
        source: 'pdf_text',
        confidence: 0.9,
        warnings: []
      }
    }
  });

  const createScriptCandidate = (scriptText) => ({
    id: 'test-script-1',
    projectId: 1,
    language: 'en',
    status: 'candidate',
    rawScript: scriptText,
    scriptSegments: [],
    violations: [],
    warnings: []
  });

  describe('Unknown Component Detection', () => {
    it('should detect unknown components', () => {
      const report = createIngestionReport([
        { name: 'Action Card', quantity: 50 },
        { name: 'Resource Token', quantity: 100 }
      ]);

      const script = createScriptCandidate(`
        In this game, you'll use Action Cards and Resource Tokens.
        You'll also need the Mystery Widget to play.
      `);

      const result = validateScriptConsistency(script, report);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      
      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      expect(unknownViolations.length).toBeGreaterThan(0);
      expect(unknownViolations[0].severity).toBe(ViolationSeverity.ERROR);
    });

    it('should not flag known components', () => {
      const report = createIngestionReport([
        { name: 'Action Card', quantity: 50 },
        { name: 'Resource Token', quantity: 100 },
        { name: 'Player Board', quantity: 4 }
      ]);

      const script = createScriptCandidate(`
        Each player gets a Player Board.
        Shuffle the Action Cards and place them face down.
        Put the Resource Tokens in a supply pile.
      `);

      const result = validateScriptConsistency(script, report);

      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      expect(unknownViolations.length).toBe(0);
    });

    it('should handle plural forms correctly', () => {
      const report = createIngestionReport([
        { name: 'Card', quantity: 50 },
        { name: 'Token', quantity: 100 }
      ]);

      const script = createScriptCandidate(`
        Shuffle the cards and deal 5 to each player.
        Place tokens in the supply.
      `);

      const result = validateScriptConsistency(script, report);

      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      // Should match despite plural/singular differences
      expect(unknownViolations.length).toBe(0);
    });

    it('should handle partial name matches', () => {
      const report = createIngestionReport([
        { name: 'Victory Point Token', quantity: 50 }
      ]);

      const script = createScriptCandidate(`
        Collect Victory Point Tokens to win.
        Each token is worth 1 point.
      `);

      const result = validateScriptConsistency(script, report);

      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      // Should match "Victory Point Token" even if script says "token"
      expect(unknownViolations.length).toBe(0);
    });

    it('should allow generic component terms', () => {
      const report = createIngestionReport([
        { name: 'Action Card', quantity: 50 }
      ]);

      const script = createScriptCandidate(`
        Draw a card from the deck.
        Place the card face up.
      `);

      const result = validateScriptConsistency(script, report);

      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      // Generic "card" should be allowed
      expect(unknownViolations.length).toBe(0);
    });
  });

  describe('Component Synonyms', () => {
    it('should match dice/die synonyms', () => {
      const report = createIngestionReport([
        { name: 'Six-sided Die', quantity: 2 }
      ]);

      const script = createScriptCandidate(`
        Roll the dice to determine movement.
      `);

      const result = validateScriptConsistency(script, report);

      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      expect(unknownViolations.length).toBe(0);
    });

    it('should match token/marker synonyms', () => {
      const report = createIngestionReport([
        { name: 'Resource Marker', quantity: 50 }
      ]);

      const script = createScriptCandidate(`
        Place a resource token on your board.
      `);

      const result = validateScriptConsistency(script, report);

      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      expect(unknownViolations.length).toBe(0);
    });
  });

  describe('Missing Components Warning', () => {
    it('should warn if component overview misses many components', () => {
      const report = createIngestionReport([
        { name: 'Action Card', quantity: 50 },
        { name: 'Resource Token', quantity: 100 },
        { name: 'Player Board', quantity: 4 },
        { name: 'Victory Point Marker', quantity: 20 },
        { name: 'First Player Token', quantity: 1 }
      ]);

      const script = createScriptCandidate(`
        Component Overview:
        This game includes Action Cards.
      `);
      
      script.scriptSegments = [
        {
          type: 'component_overview',
          content: 'This game includes Action Cards.'
        }
      ];

      const result = validateScriptConsistency(script, report);

      const missingWarnings = result.warnings.filter(
        w => w.type === ViolationType.MISSING_REQUIRED_COMPONENT
      );
      
      expect(missingWarnings.length).toBeGreaterThan(0);
      expect(missingWarnings[0].severity).toBe(ViolationSeverity.WARNING);
    });

    it('should not warn if most components are mentioned', () => {
      const report = createIngestionReport([
        { name: 'Action Card', quantity: 50 },
        { name: 'Resource Token', quantity: 100 },
        { name: 'Player Board', quantity: 4 }
      ]);

      const script = createScriptCandidate(`
        Component Overview:
        This game includes Action Cards, Resource Tokens, and Player Boards.
      `);
      
      script.scriptSegments = [
        {
          type: 'component_overview',
          content: 'This game includes Action Cards, Resource Tokens, and Player Boards.'
        }
      ];

      const result = validateScriptConsistency(script, report);

      const missingWarnings = result.warnings.filter(
        w => w.type === ViolationType.MISSING_REQUIRED_COMPONENT
      );
      
      expect(missingWarnings.length).toBe(0);
    });
  });

  describe('Backward Compatibility', () => {
    it('should pass validation if no confirmed components', () => {
      const report = createIngestionReport([]);

      const script = createScriptCandidate(`
        This script mentions Unknown Widget.
      `);

      const result = validateScriptConsistency(script, report);

      expect(result.valid).toBe(true);
      expect(result.violations.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0); // Should warn about missing components
    });

    it('should handle null/undefined inputs gracefully', () => {
      const result1 = validateScriptConsistency(null, null);
      expect(result1.valid).toBe(true);
      expect(result1.violations.length).toBe(0);

      const result2 = validateScriptConsistency(undefined, undefined);
      expect(result2.valid).toBe(true);
      expect(result2.violations.length).toBe(0);
    });
  });

  describe('Case Sensitivity', () => {
    it('should be case-insensitive for component matching', () => {
      const report = createIngestionReport([
        { name: 'Action Card', quantity: 50 }
      ]);

      const script = createScriptCandidate(`
        Draw an ACTION CARD from the deck.
        Place the action card face up.
      `);

      const result = validateScriptConsistency(script, report);

      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      expect(unknownViolations.length).toBe(0);
    });
  });

  describe('Punctuation Handling', () => {
    it('should ignore punctuation in component names', () => {
      const report = createIngestionReport([
        { name: 'Player\'s Board', quantity: 4 }
      ]);

      const script = createScriptCandidate(`
        Each player takes a Players Board.
      `);

      const result = validateScriptConsistency(script, report);

      const unknownViolations = result.violations.filter(
        v => v.type === ViolationType.UNKNOWN_COMPONENT
      );
      
      expect(unknownViolations.length).toBe(0);
    });
  });
});
