const path = require('path');
const fs = require('fs');
const { generateTutorialScript } = require('../../src/services/tutorialScriptGenerator.cjs');
const { validateSegment, validateEliteOrdering, ELITE_S1_REQUIRED_ORDER } = require('../../src/services/tutorialScriptSchema.cjs');

const fixturePath = path.join(__dirname, '../fixtures/tutorial-vertical-slice/gem-collectors.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

describe('tutorialScriptGenerator', () => {
  let result;

  beforeAll(() => {
    result = generateTutorialScript(fixture);
  });

  it('produces segments array', () => {
    expect(Array.isArray(result.segments)).toBe(true);
    expect(result.segments.length).toBeGreaterThan(0);
  });

  it('produces metadata with correct game info', () => {
    expect(result.metadata.gameId).toBe('gem-collectors');
    expect(result.metadata.gameName).toBe('Gem Collectors');
    expect(result.metadata.generatedBy).toBe('mobius-tutorial-script-generator');
  });

  it('follows Elite S1 required ordering', () => {
    const ordering = validateEliteOrdering(result.segments);
    expect(ordering.valid).toBe(true);
    expect(ordering.errors).toEqual([]);
  });

  it('includes all Elite S1 required segment types', () => {
    const types = result.segments.map((s) => s.type);
    for (const required of ELITE_S1_REQUIRED_ORDER) {
      expect(types).toContain(required);
    }
  });

  it('each segment has valid shape', () => {
    for (const segment of result.segments) {
      const { valid, errors } = validateSegment(segment);
      expect({ id: segment.id, valid, errors }).toEqual({ id: segment.id, valid: true, errors: [] });
    }
  });

  it('segments have positive durations', () => {
    for (const segment of result.segments) {
      expect(segment.durationSec).toBeGreaterThan(0);
    }
  });

  it('total duration is reasonable (30-120s)', () => {
    expect(result.metadata.totalDurationSec).toBeGreaterThan(30);
    expect(result.metadata.totalDurationSec).toBeLessThan(120);
  });

  it('narration is derived from fixture data (no hallucinated rules)', () => {
    for (const segment of result.segments) {
      expect(segment.narration).toBeTruthy();
      expect(segment.sourceRef).toBeTruthy();
      // Narration should reference known fixture content
      expect(typeof segment.narration).toBe('string');
      expect(segment.narration.length).toBeGreaterThan(5);
    }
  });

  it('hook segment mentions game name', () => {
    const hook = result.segments.find((s) => s.type === 'hook');
    expect(hook).toBeDefined();
    expect(hook.narration).toContain('Gem Collectors');
  });

  it('objective segment matches fixture', () => {
    const obj = result.segments.find((s) => s.type === 'objective');
    expect(obj).toBeDefined();
    expect(obj.narration).toBe(fixture.objective);
  });

  it('produces deterministic output', () => {
    const result2 = generateTutorialScript(fixture);
    expect(result.segments).toEqual(result2.segments);
    expect(result.metadata.segmentCount).toBe(result2.metadata.segmentCount);
    expect(result.metadata.totalDurationSec).toBe(result2.metadata.totalDurationSec);
  });

  it('warns on missing data instead of crashing', () => {
    const minimal = { gameId: 'test', gameName: 'Test' };
    const minResult = generateTutorialScript(minimal);
    expect(minResult.segments.length).toBeGreaterThan(0);
    expect(minResult.warnings.length).toBeGreaterThan(0);
    expect(minResult.warnings.some((w) => w.includes('Missing'))).toBe(true);
  });

  it('throws on null/undefined fixture', () => {
    expect(() => generateTutorialScript(null)).toThrow('SCRIPT_GENERATION_FAILED');
    expect(() => generateTutorialScript(undefined)).toThrow('SCRIPT_GENERATION_FAILED');
  });

  it('confidence is always 1.0 (no LLM uncertainty)', () => {
    for (const segment of result.segments) {
      expect(segment.confidence).toBe(1.0);
    }
  });
});
