/**
 * Tests for FFmpeg audio muxing plan builder.
 */

let buildAudioMuxingPlan, buildFfmpegMuxArgs;

beforeAll(async () => {
  const mod = await import('../../src/services/audioMuxingPlan.js');
  buildAudioMuxingPlan = mod.buildAudioMuxingPlan;
  buildFfmpegMuxArgs = mod.buildFfmpegMuxArgs;
});

describe('audioMuxingPlan', () => {
  const baseAssembly = {
    entries: [
      { sceneId: 's1', audioAssetId: 'a1', filePath: '/audio/s1.mp3', startMs: 0, durationMs: 3000, status: 'ready' },
      { sceneId: 's2', audioAssetId: 'a2', filePath: '/audio/s2.mp3', startMs: 3000, durationMs: 5000, status: 'ready' },
    ],
  };

  test('builds enabled plan with one audio asset', () => {
    const assembly = { entries: [baseAssembly.entries[0]] };
    const plan = buildAudioMuxingPlan('/out/video.mp4', assembly);
    expect(plan.enabled).toBe(true);
    expect(plan.status).toBe('ready');
    expect(plan.audioInputs).toHaveLength(1);
    expect(plan.inputVideoPath).toBe('/out/video.mp4');
    expect(plan.outputVideoPath).toContain('-with-audio.mp4');
    expect(plan.copyVideoStream).toBe(true);
  });

  test('builds plan with multiple ordered audio assets', () => {
    const plan = buildAudioMuxingPlan('/out/video.mp4', baseAssembly);
    expect(plan.enabled).toBe(true);
    expect(plan.audioInputs).toHaveLength(2);
    expect(plan.audioInputs[0].sceneId).toBe('s1');
    expect(plan.audioInputs[1].sceneId).toBe('s2');
  });

  test('disables muxing when no video path provided', () => {
    const plan = buildAudioMuxingPlan(null, baseAssembly);
    expect(plan.enabled).toBe(false);
    expect(plan.status).toBe('disabled');
    expect(plan.warnings[0]).toContain('No input video');
  });

  test('disables muxing when no usable audio exists', () => {
    const assembly = { entries: [{ sceneId: 's1', status: 'silent' }] };
    const plan = buildAudioMuxingPlan('/out/video.mp4', assembly);
    expect(plan.enabled).toBe(false);
    expect(plan.status).toBe('no-audio');
  });

  test('warns on missing narration scenes', () => {
    const assembly = {
      entries: [
        { sceneId: 's1', audioAssetId: 'a1', filePath: '/a.mp3', startMs: 0, durationMs: 3000, status: 'ready' },
        { sceneId: 's2', status: 'missing' },
      ],
    };
    const plan = buildAudioMuxingPlan('/out/video.mp4', assembly);
    expect(plan.enabled).toBe(true);
    expect(plan.warnings.some((w) => w.includes('narration text but no audio'))).toBe(true);
  });

  test('skips unsupported audio formats with warning', () => {
    const assembly = {
      entries: [{ sceneId: 's1', audioAssetId: 'a1', filePath: '/a.xyz', startMs: 0, durationMs: 3000, status: 'ready' }],
    };
    const plan = buildAudioMuxingPlan('/out/video.mp4', assembly);
    expect(plan.enabled).toBe(false); // no usable audio after filtering
    expect(plan.warnings.some((w) => w.includes('unsupported'))).toBe(true);
  });

  test('dry-run flag is passed through', () => {
    const plan = buildAudioMuxingPlan('/out/video.mp4', baseAssembly, { dryRun: true });
    expect(plan.dryRun).toBe(true);
    expect(plan.enabled).toBe(true);
  });

  test('FFmpeg args contain video copy and audio codec', () => {
    const plan = buildAudioMuxingPlan('/out/video.mp4', baseAssembly);
    expect(plan.ffmpegArgs).toContain('-c:v');
    expect(plan.ffmpegArgs).toContain('copy');
    expect(plan.ffmpegArgs).toContain('-c:a');
    expect(plan.ffmpegArgs).toContain('aac');
  });

  test('output filename uses -with-audio suffix', () => {
    const plan = buildAudioMuxingPlan('/out/preview.mp4', baseAssembly);
    expect(plan.outputVideoPath).toContain('preview-with-audio.mp4');
  });

  test('preserves caption sidecars in metadata', () => {
    const captions = ['/out/captions_en.srt'];
    const plan = buildAudioMuxingPlan('/out/video.mp4', baseAssembly, { captionSidecars: captions });
    expect(plan.captionSidecars).toEqual(captions);
  });

  test('empty assembly plan disables muxing', () => {
    const plan = buildAudioMuxingPlan('/out/video.mp4', { entries: [] });
    expect(plan.enabled).toBe(false);
    expect(plan.status).toBe('no-audio');
  });
});
