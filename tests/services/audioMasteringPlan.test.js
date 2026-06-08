/**
 * Tests for audio mastering plan generation.
 */

let buildAudioMasteringPlan, DEFAULT_MASTERING_TARGETS;

beforeAll(async () => {
  const mod = await import('../../src/services/audioMasteringPlan.js');
  buildAudioMasteringPlan = mod.buildAudioMasteringPlan;
  DEFAULT_MASTERING_TARGETS = mod.DEFAULT_MASTERING_TARGETS;
});

describe('audioMasteringPlan', () => {
  test('passes when analyzer shows audio within targets', () => {
    const plan = buildAudioMasteringPlan('/audio/narration.mp3', {
      integratedLufs: -14.2,
      truePeakDbtp: -1.5,
      maxPeakDbfs: -2.0,
      silenceSegments: [],
    });
    expect(plan.enabled).toBe(true);
    expect(plan.status).toBe('pass');
    expect(plan.warnings).toHaveLength(0);
    expect(plan.analyzerStatus).toBe('available');
  });

  test('warns when loudness is outside tolerance', () => {
    const plan = buildAudioMasteringPlan('/audio/narration.mp3', {
      integratedLufs: -16.5,
      truePeakDbtp: -2.0,
    });
    expect(plan.status).toBe('warn');
    expect(plan.warnings.some((w) => w.includes('LUFS'))).toBe(true);
  });

  test('fails when true peak exceeds limit', () => {
    const plan = buildAudioMasteringPlan('/audio/narration.mp3', {
      integratedLufs: -14.0,
      truePeakDbtp: -0.3,
    });
    expect(plan.status).toBe('fail');
    expect(plan.warnings.some((w) => w.includes('True peak'))).toBe(true);
  });

  test('fails when clipping is detected', () => {
    const plan = buildAudioMasteringPlan('/audio/narration.mp3', {
      integratedLufs: -14.0,
      truePeakDbtp: -1.5,
      maxPeakDbfs: 0.0,
    });
    expect(plan.status).toBe('fail');
    expect(plan.warnings.some((w) => w.includes('Clipping'))).toBe(true);
  });

  test('warns on long silence segments', () => {
    const plan = buildAudioMasteringPlan('/audio/narration.mp3', {
      integratedLufs: -14.0,
      truePeakDbtp: -1.5,
      silenceSegments: [{ startMs: 1000, endMs: 8000 }],
    });
    expect(plan.warnings.some((w) => w.includes('Silence'))).toBe(true);
  });

  test('warns when no analyzer data is available', () => {
    const plan = buildAudioMasteringPlan('/audio/narration.mp3', null);
    expect(plan.status).toBe('warn');
    expect(plan.analyzerStatus).toBe('missing');
    expect(plan.warnings.some((w) => w.includes('No analyzer data'))).toBe(true);
  });

  test('disables when no input path provided', () => {
    const plan = buildAudioMasteringPlan(null);
    expect(plan.enabled).toBe(false);
    expect(plan.status).toBe('disabled');
  });

  test('supports custom thresholds', () => {
    const plan = buildAudioMasteringPlan('/audio/narration.mp3', {
      integratedLufs: -16.0,
      truePeakDbtp: -1.5,
    }, { targets: { targetIntegratedLufs: -16, lufsTolerance: 0.5 } });
    expect(plan.status).toBe('pass');
  });

  test('dry-run FFmpeg args include loudnorm filter', () => {
    const plan = buildAudioMasteringPlan('/audio/narration.mp3', {
      integratedLufs: -14.0,
      truePeakDbtp: -1.5,
    });
    expect(plan.ffmpegArgs).toContain('-af');
    const afIdx = plan.ffmpegArgs.indexOf('-af');
    expect(plan.ffmpegArgs[afIdx + 1]).toContain('loudnorm');
    expect(plan.ffmpegArgs[afIdx + 1]).toContain('I=-14');
    expect(plan.ffmpegArgs[afIdx + 1]).toContain('TP=-1');
  });

  test('output naming uses -mastered suffix', () => {
    const plan = buildAudioMasteringPlan('/out/narration.mp3', { integratedLufs: -14 });
    expect(plan.outputAudioPath).toContain('narration-mastered.m4a');
  });

  test('includes ducking preparation metadata', () => {
    const plan = buildAudioMasteringPlan('/audio/x.mp3', { integratedLufs: -14, truePeakDbtp: -2 });
    expect(plan.duckingPreparation).toBeDefined();
    expect(plan.duckingPreparation.narrationPriority).toBe(true);
    expect(plan.duckingPreparation.musicBedSupported).toBe(false);
    expect(plan.duckingPreparation.recommendedMusicDuckDb).toBe(18);
  });

  test('default targets match MOBIUS Elite standards', () => {
    expect(DEFAULT_MASTERING_TARGETS.targetIntegratedLufs).toBe(-14);
    expect(DEFAULT_MASTERING_TARGETS.truePeakLimitDbtp).toBe(-1.0);
    expect(DEFAULT_MASTERING_TARGETS.clippingLimitDbfs).toBe(0.0);
    expect(DEFAULT_MASTERING_TARGETS.sampleRate).toBe(48000);
  });
});
