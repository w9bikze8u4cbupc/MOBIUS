import { AudioQcOrchestrator, formatAudioQcMarkdown } from '../utils/audio-qc';

describe('AudioQcOrchestrator', () => {
  it('normalizes towards the target LUFS and passes when within tolerance', () => {
    const orchestrator = new AudioQcOrchestrator({
      targetLufs: -24,
      tolerance: 0.5,
      peakLimit: -1,
      presetName: 'broadcast',
    });

    const result = orchestrator.run(
      {
        integratedLufs: -26,
        truePeakDb: -3,
      },
      {
        runId: 'run-001',
        source: 'unit-test',
      }
    );

    expect(result.status).toBe('pass');
    expect(result.gainDb).toBeCloseTo(2, 5);
    expect(result.limitedByPeak).toBe(false);
    expect(result.report.json.normalized.integratedLufs).toBeCloseTo(-24, 5);
    expect(result.report.json.normalized.truePeakDb).toBeCloseTo(-1, 5);
    expect(result.report.json.evaluation.withinTolerance).toBe(true);
    expect(result.report.json.evaluation.peakWithinLimit).toBe(true);

    const markdown = result.report.markdown;
    expect(markdown).toContain('PASS');
    expect(markdown).toContain('Integrated LUFS');
  });

  it('engages peak guard when peak limit would be exceeded', () => {
    const orchestrator = new AudioQcOrchestrator({
      targetLufs: -24,
      tolerance: 0.5,
      peakLimit: -1,
      presetName: 'broadcast',
    });

    const result = orchestrator.run(
      {
        integratedLufs: -27.2,
        truePeakDb: -3.5,
      },
      {
        presetName: 'broadcast',
        runId: 'run-guard',
      }
    );

    expect(result.limitedByPeak).toBe(true);
    expect(result.gainDb).toBeCloseTo(2.5, 5);
    expect(result.status).toBe('warn');
    expect(result.report.json.evaluation.withinTolerance).toBe(false);
    expect(result.report.json.evaluation.messages.some(msg => msg.includes('Peak guard'))).toBe(true);

    const markdown = formatAudioQcMarkdown(result.report.json);
    expect(markdown).toContain('Peak guard');
  });

  it('fails when loudness data is missing', () => {
    const orchestrator = new AudioQcOrchestrator({
      targetLufs: -24,
      tolerance: 0.5,
      peakLimit: -1,
    });

    const result = orchestrator.run({});
    expect(result.status).toBe('fail');
    expect(result.messages[0]).toContain('Integrated loudness');
    expect(result.report.json.evaluation.messages[0]).toContain('Integrated loudness');
  });
});
