/**
 * Tests for audio loudness and peak validation contract.
 */

let validateAudioLoudness, DEFAULT_THRESHOLDS;

beforeAll(async () => {
  const mod = await import('../../src/services/audioLoudnessValidation.js');
  validateAudioLoudness = mod.validateAudioLoudness;
  DEFAULT_THRESHOLDS = mod.DEFAULT_THRESHOLDS;
});

describe('audioLoudnessValidation', () => {
  test('passes when LUFS and peak are within thresholds', () => {
    const result = validateAudioLoudness({
      integratedLufs: -14.2,
      truePeakDbtp: -1.5,
      maxPeakDbfs: -2.0,
    });
    expect(result.status).toBe('pass');
    expect(result.lufsStatus).toBe('pass');
    expect(result.peakStatus).toBe('pass');
    expect(result.clippingDetected).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  test('warns when LUFS is outside tolerance but within 2x', () => {
    const result = validateAudioLoudness({
      integratedLufs: -14.8, // 0.8 from -14, tolerance is 0.5
      truePeakDbtp: -2.0,
    });
    expect(result.status).toBe('warn');
    expect(result.lufsStatus).toBe('warn');
    expect(result.warnings.some((w) => w.includes('LUFS'))).toBe(true);
  });

  test('fails when LUFS is far from target', () => {
    const result = validateAudioLoudness({
      integratedLufs: -20.0,
      truePeakDbtp: -2.0,
    });
    expect(result.status).toBe('fail');
    expect(result.lufsStatus).toBe('fail');
  });

  test('fails when true peak exceeds maximum', () => {
    const result = validateAudioLoudness({
      integratedLufs: -14.0,
      truePeakDbtp: -0.5, // exceeds -1.0
    });
    expect(result.status).toBe('fail');
    expect(result.peakStatus).toBe('fail');
    expect(result.warnings.some((w) => w.includes('True peak'))).toBe(true);
  });

  test('detects clipping at 0 dBFS', () => {
    const result = validateAudioLoudness({
      integratedLufs: -14.0,
      truePeakDbtp: -1.5,
      maxPeakDbfs: 0.0,
    });
    expect(result.clippingDetected).toBe(true);
    expect(result.status).toBe('fail');
    expect(result.warnings.some((w) => w.includes('Clipping'))).toBe(true);
  });

  test('warns on long silence segments', () => {
    const result = validateAudioLoudness({
      integratedLufs: -14.0,
      truePeakDbtp: -1.5,
      silenceSegments: [
        { startMs: 5000, endMs: 12000 }, // 7000ms > 5000ms max
      ],
    });
    expect(result.silenceWarnings.length).toBeGreaterThan(0);
    expect(result.status).toBe('warn');
  });

  test('passes with short silence within threshold', () => {
    const result = validateAudioLoudness({
      integratedLufs: -14.0,
      truePeakDbtp: -1.5,
      silenceSegments: [
        { startMs: 1000, endMs: 2000 }, // 1000ms < 5000ms max
      ],
    });
    expect(result.silenceWarnings).toHaveLength(0);
    expect(result.status).toBe('pass');
  });

  test('warns when analyzer data is missing', () => {
    const result = validateAudioLoudness({});
    expect(result.status).toBe('warn');
    expect(result.warnings.some((w) => w.includes('not available'))).toBe(true);
    expect(result.integratedLufs).toBeNull();
    expect(result.truePeakDbtp).toBeNull();
  });

  test('supports custom thresholds', () => {
    const result = validateAudioLoudness(
      { integratedLufs: -16.0, truePeakDbtp: -1.5 },
      { targetIntegratedLufs: -16, integratedLufsTolerance: 0.5 },
    );
    expect(result.status).toBe('pass');
    expect(result.lufsStatus).toBe('pass');
  });

  test('default thresholds are reasonable', () => {
    expect(DEFAULT_THRESHOLDS.targetIntegratedLufs).toBe(-14);
    expect(DEFAULT_THRESHOLDS.maxTruePeakDbtp).toBe(-1.0);
    expect(DEFAULT_THRESHOLDS.clippingThresholdDbfs).toBe(0.0);
    expect(DEFAULT_THRESHOLDS.maxSilenceDurationMs).toBe(5000);
  });
});
