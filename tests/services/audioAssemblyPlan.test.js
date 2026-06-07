/**
 * Tests for deterministic audio assembly planning.
 */

let buildAudioAssemblyPlan;

beforeAll(async () => {
  const mod = await import('../../src/services/audioAssemblyPlan.js');
  buildAudioAssemblyPlan = mod.buildAudioAssemblyPlan;
});

describe('audioAssemblyPlan', () => {
  test('sequences narration in storyboard scene order', () => {
    const scenes = [
      { id: 's1', durationSec: 3, narrationAudio: { id: 'a1', filePath: '/a1.mp3', durationMs: 2800 } },
      { id: 's2', durationSec: 5, narrationAudio: { id: 'a2', filePath: '/a2.mp3', durationMs: 4900 } },
    ];
    const { entries, summary } = buildAudioAssemblyPlan(scenes);
    expect(entries).toHaveLength(2);
    expect(entries[0].sceneId).toBe('s1');
    expect(entries[0].startMs).toBe(0);
    expect(entries[1].sceneId).toBe('s2');
    expect(entries[1].startMs).toBe(3000);
    expect(summary.mappedAudioCount).toBe(2);
    expect(summary.totalNarrationDurationMs).toBe(7700);
  });

  test('reports missing audio for scenes with narration text', () => {
    const scenes = [
      { id: 's1', durationSec: 4, narration: 'Need audio here' },
    ];
    const { entries, warnings, summary } = buildAudioAssemblyPlan(scenes);
    expect(entries[0].status).toBe('missing');
    expect(summary.missingAudioCount).toBe(1);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('s1');
  });

  test('marks scenes without narration text as silent', () => {
    const scenes = [
      { id: 's1', durationSec: 2 },
    ];
    const { entries, summary } = buildAudioAssemblyPlan(scenes);
    expect(entries[0].status).toBe('silent');
    expect(summary.silentSceneCount).toBe(1);
  });

  test('warns on duration mismatch between audio and scene', () => {
    const scenes = [
      { id: 's1', durationSec: 3, narrationAudio: { id: 'a1', filePath: '/a.mp3', durationMs: 8000 } },
    ];
    const { entries, warnings, summary } = buildAudioAssemblyPlan(scenes);
    expect(entries[0].warnings.some((w) => w.includes('duration mismatch'))).toBe(true);
    expect(summary.durationMismatchCount).toBe(1);
    expect(warnings.some((w) => w.includes('duration'))).toBe(true);
  });

  test('warns on unsupported audio format', () => {
    const scenes = [
      { id: 's1', durationSec: 3, narrationAudio: { id: 'a1', filePath: '/a.xyz', durationMs: 2800 } },
    ];
    const { entries, warnings } = buildAudioAssemblyPlan(scenes);
    expect(entries[0].warnings.some((w) => w.includes('unsupported'))).toBe(true);
    expect(warnings.some((w) => w.includes('unsupported'))).toBe(true);
  });

  test('warns on invalid (zero) duration', () => {
    const scenes = [
      { id: 's1', durationSec: 3, narrationAudio: { id: 'a1', filePath: '/a.mp3', durationMs: 0 } },
    ];
    const { entries } = buildAudioAssemblyPlan(scenes);
    expect(entries[0].warnings.some((w) => w.includes('invalid duration'))).toBe(true);
  });

  test('computes cumulative timing correctly', () => {
    const scenes = [
      { id: 's1', durationSec: 2, narrationAudio: { id: 'a1', filePath: '/a.mp3', durationMs: 1800 } },
      { id: 's2', durationSec: 3 },
      { id: 's3', durationSec: 4, narrationAudio: { id: 'a3', filePath: '/c.mp3', durationMs: 3800 } },
    ];
    const { entries } = buildAudioAssemblyPlan(scenes);
    expect(entries[0].startMs).toBe(0);
    expect(entries[1].startMs).toBe(2000);
    expect(entries[2].startMs).toBe(5000);
    expect(entries[2].endMs).toBe(5000 + 3800);
  });

  test('returns correct summary metadata', () => {
    const scenes = [
      { id: 's1', durationSec: 3, narrationAudio: { id: 'a1', filePath: '/a.mp3', durationMs: 2800 } },
      { id: 's2', durationSec: 4, narration: 'Missing audio' },
      { id: 's3', durationSec: 2 },
    ];
    const { summary } = buildAudioAssemblyPlan(scenes);
    expect(summary.totalEntries).toBe(3);
    expect(summary.mappedAudioCount).toBe(1);
    expect(summary.missingAudioCount).toBe(1);
    expect(summary.silentSceneCount).toBe(1);
    expect(summary.expectedRenderDurationMs).toBe(9000);
  });

  test('empty scenes returns empty plan', () => {
    const { entries, warnings, summary } = buildAudioAssemblyPlan([]);
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(summary.totalEntries).toBe(0);
  });
});
