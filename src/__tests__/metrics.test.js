/**
 * Unit tests for the metrics module
 */

import { 
  renderStarted, 
  renderCompleted, 
  renderFailed, 
  renderTimeout,
  renderDuration, 
  ffmpegSpeedRatio
} from '../render/metrics.js';

describe('Metrics Module', () => {
  describe('Metric Counters', () => {
    beforeEach(() => {
      // Reset all metrics before each test
      renderStarted.reset();
      renderCompleted.reset();
      renderFailed.reset();
      renderTimeout.reset();
      renderDuration.reset();
      ffmpegSpeedRatio.reset();
    });

    test('should increment render started counter', async () => {
      const initialMetric = await renderStarted.get();
      const initialValues = initialMetric.values;
      const initialCount = initialValues.length > 0 ? initialValues[0].value : 0;
      renderStarted.inc();
      const newMetric = await renderStarted.get();
      const newValues = newMetric.values;
      const newCount = newValues.length > 0 ? newValues[0].value : 0;
      expect(newCount).toBe(initialCount + 1);
    });

    test('should increment render completed counter', async () => {
      const initialMetric = await renderCompleted.get();
      const initialValues = initialMetric.values;
      const initialCount = initialValues.length > 0 ? initialValues[0].value : 0;
      renderCompleted.inc();
      const newMetric = await renderCompleted.get();
      const newValues = newMetric.values;
      const newCount = newValues.length > 0 ? newValues[0].value : 0;
      expect(newCount).toBe(initialCount + 1);
    });

    test('should increment render failed counter with labels', async () => {
      const initialMetric = await renderFailed.get();
      const initialValues = initialMetric.values;
      const initialCount = initialValues.length > 0 ? initialValues[0].value : 0;
      renderFailed.inc({ reason: 'test_failure' });
      const newMetric = await renderFailed.get();
      const newValues = newMetric.values;
      // Find the value with our label
      const labeledValue = newValues.find(v => v.labels.reason === 'test_failure');
      expect(labeledValue).toBeDefined();
      expect(labeledValue.value).toBe(1);
    });

    test('should increment render timeout counter with labels', async () => {
      const initialMetric = await renderTimeout.get();
      const initialValues = initialMetric.values;
      const initialCount = initialValues.length > 0 ? initialValues[0].value : 0;
      renderTimeout.inc({ reason: 'test_timeout' });
      const newMetric = await renderTimeout.get();
      const newValues = newMetric.values;
      // Find the value with our label
      const labeledValue = newValues.find(v => v.labels.reason === 'test_timeout');
      expect(labeledValue).toBeDefined();
      expect(labeledValue.value).toBe(1);
    });

    test('should observe render duration histogram', async () => {
      renderDuration.observe(30);
      const metric = await renderDuration.get();
      const values = metric.values;
      // Find the bucket for 30 seconds
      const bucket = values.find(v => v.metricName === 'mobius_render_duration_seconds_bucket' && v.labels.le === 30);
      expect(bucket).toBeDefined();
      expect(bucket.value).toBe(1);
    });

    test('should observe ffmpeg speed ratio histogram', async () => {
      ffmpegSpeedRatio.observe(2.5);
      const metric = await ffmpegSpeedRatio.get();
      const values = metric.values;
      // Find the bucket for 2.5 speed ratio (should fall in 5 bucket)
      const bucket = values.find(v => v.metricName === 'mobius_ffmpeg_speed_ratio_bucket' && v.labels.le === 5);
      expect(bucket).toBeDefined();
      expect(bucket.value).toBe(1);
    });
  });
});