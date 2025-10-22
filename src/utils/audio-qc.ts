export type AudioQcStatus = 'pass' | 'warn' | 'fail';

export interface AudioMeasurement {
  integratedLufs?: number | null;
  truePeakDb?: number | null;
  loudnessRangeLu?: number | null;
}

export interface AudioQcConfig {
  targetLufs: number;
  tolerance: number;
  peakLimit: number;
  presetName?: string;
}

export interface AudioQcOptions {
  presetName?: string;
  runId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  timestamp?: string;
}

export interface AudioQcJsonReport {
  preset: string;
  metadata: Record<string, unknown>;
  config: AudioQcConfig;
  measurement: Required<Record<keyof AudioMeasurement, number | null>>;
  adjustments: {
    gainDb: number;
    limitedByPeak: boolean;
  };
  normalized: Required<Record<keyof AudioMeasurement, number | null>>;
  evaluation: {
    status: AudioQcStatus;
    withinTolerance: boolean;
    peakWithinLimit: boolean | null;
    messages: string[];
  };
}

export interface AudioQcReport {
  json: AudioQcJsonReport;
  markdown: string;
}

export interface AudioQcRunResult {
  status: AudioQcStatus;
  gainDb: number;
  limitedByPeak: boolean;
  normalized: AudioMeasurement;
  report: AudioQcReport;
  messages: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function escalateStatus(current: AudioQcStatus, next: AudioQcStatus): AudioQcStatus {
  const order: Record<AudioQcStatus, number> = { pass: 0, warn: 1, fail: 2 };
  return order[next] > order[current] ? next : current;
}

function cleanMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== undefined && value !== null)
  );
}

function formatValue(value: number | null | undefined, digits = 2): string {
  if (!isFiniteNumber(value)) {
    return '—';
  }
  return value.toFixed(digits);
}

function formatTarget(target: number, tolerance: number): string {
  return `${target.toFixed(2)} ±${tolerance.toFixed(2)}`;
}

export function formatAudioQcMarkdown(report: AudioQcJsonReport): string {
  const lines: string[] = [];
  lines.push(`# Audio QC Report`);
  lines.push('');
  lines.push(`- **Preset:** ${report.preset}`);
  lines.push(`- **Status:** ${report.evaluation.status.toUpperCase()}`);
  if (report.metadata.runId) {
    lines.push(`- **Run ID:** ${report.metadata.runId}`);
  }
  if (report.metadata.source) {
    lines.push(`- **Source:** ${report.metadata.source}`);
  }
  lines.push(`- **Timestamp:** ${report.metadata.timestamp ?? '—'}`);
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push('| Metric | Before | After | Target | Limit |');
  lines.push('| --- | ---: | ---: | ---: | ---: |');
  lines.push(
    `| Integrated LUFS | ${formatValue(report.measurement.integratedLufs)} | ${formatValue(report.normalized.integratedLufs)} | ${formatTarget(report.config.targetLufs, report.config.tolerance)} | — |`
  );
  lines.push(
    `| True Peak (dBTP) | ${formatValue(report.measurement.truePeakDb)} | ${formatValue(report.normalized.truePeakDb)} | — | ${formatValue(report.config.peakLimit)} |`
  );
  if (isFiniteNumber(report.measurement.loudnessRangeLu) || isFiniteNumber(report.normalized.loudnessRangeLu)) {
    lines.push(
      `| Loudness Range (LU) | ${formatValue(report.measurement.loudnessRangeLu)} | ${formatValue(report.normalized.loudnessRangeLu)} | — | — |`
    );
  }
  lines.push('');
  lines.push('## Adjustments');
  lines.push('');
  lines.push(`- Gain applied: ${report.adjustments.gainDb.toFixed(2)} dB`);
  lines.push(`- Peak guard engaged: ${report.adjustments.limitedByPeak ? 'Yes' : 'No'}`);
  lines.push('');
  lines.push('## Evaluation');
  lines.push('');
  if (report.evaluation.messages.length > 0) {
    report.evaluation.messages.forEach(message => {
      lines.push(`- ${message}`);
    });
  } else {
    lines.push('- No issues detected.');
  }
  lines.push('');
  return lines.join('\n');
}

export class AudioQcOrchestrator {
  private readonly config: AudioQcConfig;

  constructor(config: AudioQcConfig) {
    this.config = config;
  }

  run(measurement: AudioMeasurement, options: AudioQcOptions = {}): AudioQcRunResult {
    const messages: string[] = [];
    let status: AudioQcStatus = 'pass';

    const integratedAvailable = isFiniteNumber(measurement.integratedLufs);
    const peakAvailable = isFiniteNumber(measurement.truePeakDb);

    if (!integratedAvailable) {
      status = 'fail';
      messages.push('Integrated loudness measurement unavailable.');
    }

    if (!peakAvailable) {
      status = escalateStatus(status, 'warn');
      messages.push('True peak measurement unavailable; peak limit cannot be enforced.');
    }

    let gainDb = 0;
    let limitedByPeak = false;

    if (integratedAvailable) {
      gainDb = this.config.targetLufs - (measurement.integratedLufs as number);
    }

    if (integratedAvailable && peakAvailable) {
      const allowableGain = this.config.peakLimit - (measurement.truePeakDb as number);
      if (gainDb > allowableGain) {
        gainDb = allowableGain;
        limitedByPeak = true;
      }
    }

    const normalizedIntegrated = integratedAvailable
      ? (measurement.integratedLufs as number) + gainDb
      : null;
    const normalizedPeak = peakAvailable ? (measurement.truePeakDb as number) + gainDb : null;
    const normalizedLoudnessRange = isFiniteNumber(measurement.loudnessRangeLu)
      ? (measurement.loudnessRangeLu as number)
      : null;

    const withinTolerance = integratedAvailable
      ? Math.abs((normalizedIntegrated as number) - this.config.targetLufs) <= this.config.tolerance
      : false;
    const peakWithinLimit = peakAvailable
      ? (normalizedPeak as number) <= this.config.peakLimit
      : null;

    if (peakWithinLimit === false) {
      status = 'fail';
      messages.push(
        `Normalized true peak ${formatValue(normalizedPeak)} dBTP exceeds limit ${this.config.peakLimit.toFixed(2)} dBTP.`
      );
    }

    if (integratedAvailable && !withinTolerance) {
      const note = limitedByPeak
        ? 'Peak guard prevented hitting target loudness; review limiting strategy.'
        : 'Integrated loudness outside tolerance after normalization.';
      messages.push(note);
      status = escalateStatus(status, 'warn');
    }

    const presetName = options.presetName || this.config.presetName || 'custom';
    const metadata = cleanMetadata({
      preset: presetName,
      runId: options.runId,
      source: options.source,
      timestamp: options.timestamp || new Date().toISOString(),
      ...(options.metadata || {}),
    });

    const report: AudioQcJsonReport = {
      preset: presetName,
      metadata,
      config: {
        targetLufs: this.config.targetLufs,
        tolerance: this.config.tolerance,
        peakLimit: this.config.peakLimit,
        presetName: this.config.presetName,
      },
      measurement: {
        integratedLufs: integratedAvailable ? (measurement.integratedLufs as number) : null,
        truePeakDb: peakAvailable ? (measurement.truePeakDb as number) : null,
        loudnessRangeLu: normalizedLoudnessRange,
      },
      adjustments: {
        gainDb,
        limitedByPeak,
      },
      normalized: {
        integratedLufs: integratedAvailable ? (normalizedIntegrated as number) : null,
        truePeakDb: peakAvailable ? (normalizedPeak as number) : null,
        loudnessRangeLu: normalizedLoudnessRange,
      },
      evaluation: {
        status,
        withinTolerance,
        peakWithinLimit,
        messages,
      },
    };

    const markdown = formatAudioQcMarkdown(report);

    return {
      status,
      gainDb,
      limitedByPeak,
      normalized: {
        integratedLufs: report.normalized.integratedLufs,
        truePeakDb: report.normalized.truePeakDb,
        loudnessRangeLu: report.normalized.loudnessRangeLu,
      },
      report: {
        json: report,
        markdown,
      },
      messages,
    };
  }
}
