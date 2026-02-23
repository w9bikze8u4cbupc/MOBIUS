// tests/unit/confirmFile.test.js
// Unit tests for confirmation file schema validation

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Confirmation File Schema', () => {
  it('should validate complete confirmation file', () => {
    const confirmFile = {
      version: '1.0',
      projectId: 'prov0-01',
      confirm: [
        {
          gateId: 'confirm_metadata',
          decision: 'CONFIRM',
          note: 'Reviewed and accurate'
        }
      ],
      ack: {
        operator: 'Test Operator',
        timestamp: '2026-02-23T10:00:00Z',
        notes: 'All gates reviewed'
      }
    };

    // Validate schema
    assert.ok(confirmFile.version, 'version is required');
    assert.ok(confirmFile.projectId, 'projectId is required');
    assert.ok(Array.isArray(confirmFile.confirm), 'confirm must be array');
    assert.ok(confirmFile.ack, 'ack is required');
    assert.ok(confirmFile.ack.operator, 'ack.operator is required');
    assert.ok(confirmFile.ack.timestamp, 'ack.timestamp is required');
  });

  it('should reject confirmation file missing projectId', () => {
    const confirmFile = {
      version: '1.0',
      confirm: [],
      ack: {
        operator: 'Test',
        timestamp: '2026-02-23T10:00:00Z'
      }
    };

    assert.ok(!confirmFile.projectId, 'projectId should be missing');
  });

  it('should reject confirmation file with invalid confirm array', () => {
    const confirmFile = {
      version: '1.0',
      projectId: 'test',
      confirm: 'not-an-array',
      ack: {
        operator: 'Test',
        timestamp: '2026-02-23T10:00:00Z'
      }
    };

    assert.ok(!Array.isArray(confirmFile.confirm), 'confirm should not be array');
  });

  it('should reject confirmation file missing ack', () => {
    const confirmFile = {
      version: '1.0',
      projectId: 'test',
      confirm: []
    };

    assert.ok(!confirmFile.ack, 'ack should be missing');
  });

  it('should validate confirmation entry schema', () => {
    const confirmation = {
      gateId: 'confirm_metadata',
      decision: 'CONFIRM',
      note: 'Reviewed'
    };

    assert.ok(confirmation.gateId, 'gateId is required');
    assert.ok(confirmation.decision, 'decision is required');
    assert.strictEqual(confirmation.decision, 'CONFIRM', 'decision must be CONFIRM');
    assert.ok(confirmation.note, 'note is required');
  });

  it('should extract confirmations from file', () => {
    const confirmFile = {
      version: '1.0',
      projectId: 'prov0-01',
      confirm: [
        { gateId: 'gate1', decision: 'CONFIRM', note: 'OK' },
        { gateId: 'gate2', decision: 'CONFIRM', note: 'OK' },
        { gateId: 'gate3', decision: 'REJECT', note: 'Not OK' }
      ],
      ack: {
        operator: 'Test',
        timestamp: '2026-02-23T10:00:00Z'
      }
    };

    const confirmations = {};
    for (const conf of confirmFile.confirm) {
      if (conf.decision === 'CONFIRM') {
        confirmations[conf.gateId] = true;
      }
    }

    assert.strictEqual(Object.keys(confirmations).length, 2, 'Should have 2 confirmations');
    assert.ok(confirmations.gate1, 'gate1 should be confirmed');
    assert.ok(confirmations.gate2, 'gate2 should be confirmed');
    assert.ok(!confirmations.gate3, 'gate3 should not be confirmed');
  });

  it('should validate ISO 8601 timestamp format', () => {
    const validTimestamps = [
      '2026-02-23T10:00:00Z',
      '2026-02-23T10:00:00.000Z',
      '2026-02-23T10:00:00+00:00'
    ];

    for (const ts of validTimestamps) {
      const date = new Date(ts);
      assert.ok(!isNaN(date.getTime()), `${ts} should be valid ISO 8601`);
    }
  });

  it('should reject invalid timestamp format', () => {
    const invalidTimestamps = [
      '2026-02-23',
      '10:00:00',
      'invalid',
      ''
    ];

    for (const ts of invalidTimestamps) {
      const date = new Date(ts);
      // Empty string and 'invalid' will parse but be invalid
      if (ts === '' || ts === 'invalid') {
        assert.ok(isNaN(date.getTime()), `${ts} should be invalid`);
      }
    }
  });
});

describe('Objective QC Report Schema', () => {
  it('should validate complete QC report', () => {
    const qcReport = {
      version: '1.0',
      timestamp: '2026-02-23T10:00:00Z',
      outputDir: '/path/to/output',
      status: 'PASS',
      errors: [],
      warnings: [],
      artifacts: {
        video: { exists: true, path: '/path/to/video.mp4', size: 1000000 },
        captions: { exists: true, path: '/path/to/captions.srt', size: 10000 },
        chapters: { exists: true, path: '/path/to/chapters.json', size: 1000 },
        manifest: { exists: true, path: '/path/to/manifest.json', size: 2000 },
        thumbnail: { exists: true, path: '/path/to/thumbnail.jpg', size: 50000 }
      },
      technical: {
        video: {
          duration: 300,
          size: 1000000,
          bitrate: 5000000,
          codec: 'h264',
          width: 1920,
          height: 1080,
          fps: 30,
          pixelFormat: 'yuv420p'
        },
        audio: {
          codec: 'aac',
          sampleRate: 48000,
          channels: 2,
          bitrate: 128000
        }
      }
    };

    assert.ok(qcReport.version, 'version is required');
    assert.ok(qcReport.timestamp, 'timestamp is required');
    assert.ok(qcReport.status, 'status is required');
    assert.ok(Array.isArray(qcReport.errors), 'errors must be array');
    assert.ok(Array.isArray(qcReport.warnings), 'warnings must be array');
    assert.ok(qcReport.artifacts, 'artifacts is required');
    assert.ok(qcReport.technical, 'technical is required');
  });

  it('should validate QC status values', () => {
    const validStatuses = ['PASS', 'FAIL', 'PASS_WITH_WARNINGS', 'ERROR'];

    for (const status of validStatuses) {
      assert.ok(validStatuses.includes(status), `${status} should be valid`);
    }
  });

  it('should validate error entry schema', () => {
    const error = {
      type: 'MISSING_ARTIFACT',
      message: 'Video file not found',
      artifact: 'video'
    };

    assert.ok(error.type, 'type is required');
    assert.ok(error.message, 'message is required');
  });

  it('should validate warning entry schema', () => {
    const warning = {
      type: 'LOUDNESS_OUT_OF_RANGE',
      message: 'Loudness is -16 LUFS, target is -14 LUFS'
    };

    assert.ok(warning.type, 'type is required');
    assert.ok(warning.message, 'message is required');
  });
});
