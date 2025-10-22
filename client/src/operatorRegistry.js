const broadcastReport = {
  json: {
    preset: 'broadcast-longform',
    metadata: {
      runId: 'mock-broadcast-001',
      timestamp: '2024-05-19T18:00:00.000Z',
      source: 'staging/hanamikoji',
    },
    config: {
      targetLufs: -24,
      tolerance: 0.5,
      peakLimit: -1,
      presetName: 'broadcast-longform',
    },
    measurement: {
      integratedLufs: -27.8,
      truePeakDb: -3.2,
      loudnessRangeLu: 6.5,
    },
    adjustments: {
      gainDb: 3.8,
      limitedByPeak: false,
    },
    normalized: {
      integratedLufs: -24,
      truePeakDb: -1.2,
      loudnessRangeLu: 6.5,
    },
    evaluation: {
      status: 'pass',
      withinTolerance: true,
      peakWithinLimit: true,
      messages: ['Normalized to broadcast spec with headroom intact.'],
    },
  },
  markdown: `# Audio QC Report\n\n- **Preset:** broadcast-longform\n- **Status:** PASS\n- **Run ID:** mock-broadcast-001\n- **Source:** staging/hanamikoji\n- **Timestamp:** 2024-05-19T18:00:00.000Z\n\n## Metrics\n\n| Metric | Before | After | Target | Limit |\n| --- | ---: | ---: | ---: | ---: |\n| Integrated LUFS | -27.80 | -24.00 | -24.00 ±0.50 | — |\n| True Peak (dBTP) | -3.20 | -1.20 | — | -1.00 |\n| Loudness Range (LU) | 6.50 | 6.50 | — | — |\n\n## Adjustments\n\n- Gain applied: 3.80 dB\n- Peak guard engaged: No\n\n## Evaluation\n\n- Normalized to broadcast spec with headroom intact.\n`,
};

const streamingReport = {
  json: {
    preset: 'streaming-midform',
    metadata: {
      runId: 'mock-streaming-014',
      timestamp: '2024-05-19T17:30:00.000Z',
      source: 'staging/sushi-go',
    },
    config: {
      targetLufs: -18,
      tolerance: 1.0,
      peakLimit: -1.5,
      presetName: 'streaming-midform',
    },
    measurement: {
      integratedLufs: -20.4,
      truePeakDb: -2.7,
      loudnessRangeLu: 5.9,
    },
    adjustments: {
      gainDb: 1.4,
      limitedByPeak: true,
    },
    normalized: {
      integratedLufs: -19,
      truePeakDb: -1.3,
      loudnessRangeLu: 5.9,
    },
    evaluation: {
      status: 'warn',
      withinTolerance: false,
      peakWithinLimit: true,
      messages: ['Peak guard prevented hitting target loudness; review limiting strategy.'],
    },
  },
  markdown: `# Audio QC Report\n\n- **Preset:** streaming-midform\n- **Status:** WARN\n- **Run ID:** mock-streaming-014\n- **Source:** staging/sushi-go\n- **Timestamp:** 2024-05-19T17:30:00.000Z\n\n## Metrics\n\n| Metric | Before | After | Target | Limit |\n| --- | ---: | ---: | ---: | ---: |\n| Integrated LUFS | -20.40 | -19.00 | -18.00 ±1.00 | — |\n| True Peak (dBTP) | -2.70 | -1.30 | — | -1.50 |\n| Loudness Range (LU) | 5.90 | 5.90 | — | — |\n\n## Adjustments\n\n- Gain applied: 1.40 dB\n- Peak guard engaged: Yes\n\n## Evaluation\n\n- Peak guard prevented hitting target loudness; review limiting strategy.\n`,
};

export const MOCK_OPERATOR_REGISTRY = {
  'broadcast-longform': {
    id: 'broadcast-longform',
    label: 'Broadcast Longform (-24 LUFS)',
    description: 'Baseline preset for narrated tutorials with strict broadcast compliance.',
    health: {
      status: 'operational',
      message: 'Ready for nightly QA runs.',
      lastUpdated: '2024-05-19T18:05:00.000Z',
    },
    qc: {
      report: broadcastReport,
      correctiveActions: ['Spot-check transitions for noise floor before final render.'],
      artifacts: [
        { label: 'JSON report', href: '/artifacts/qc/broadcast/latest.json', type: 'json' },
        { label: 'Markdown summary', href: '/artifacts/qc/broadcast/latest.md', type: 'markdown' },
      ],
    },
  },
  'streaming-midform': {
    id: 'streaming-midform',
    label: 'Streaming Midform (-18 LUFS)',
    description: 'Optimized for platform uploads with relaxed tolerance and aggressive guard rails.',
    health: {
      status: 'degraded',
      message: 'Loudness drift detected on last sample.',
      lastUpdated: '2024-05-19T17:35:00.000Z',
    },
    qc: {
      report: streamingReport,
      correctiveActions: [
        'Increase limiter release time by 20ms.',
        'Re-run normalization after dialogue edit pass.',
      ],
      artifacts: [
        { label: 'JSON report', href: '/artifacts/qc/streaming/latest.json', type: 'json' },
        { label: 'Markdown summary', href: '/artifacts/qc/streaming/latest.md', type: 'markdown' },
      ],
    },
  },
};

export function getPresetOptions() {
  return Object.values(MOCK_OPERATOR_REGISTRY).map(preset => ({
    value: preset.id,
    label: preset.label,
  }));
}

export function getPresetDetails(id) {
  return MOCK_OPERATOR_REGISTRY[id] || null;
}
