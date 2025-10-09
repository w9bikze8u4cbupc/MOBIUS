// tests/worker/previewWorker.test.js
import { validatePayload } from '../../scripts/validatePreviewPayload.js';

describe('Preview Worker', () => {
  describe('Payload Validation', () => {
    test('should validate minimal payload', () => {
      const minimalPayload = {
        "jobId": "preview-job-0001",
        "projectId": "proj-mobius-123",
        "requestId": "req-0001",
        "previewRequest": {
          "title": "Tutorial Preview - Minimal",
          "steps": [],
          "assets": [],
          "audio": {},
          "metadata": {}
        },
        "dryRun": true,
        "createdAt": "2025-10-08T12:00:00.000Z"
      };

      const errors = validatePayload(minimalPayload);
      expect(errors).toHaveLength(0);
    });

    test('should validate full payload', () => {
      const fullPayload = {
        "jobId": "preview-job-0002",
        "projectId": "proj-mobius-123",
        "requestId": "req-0002",
        "previewRequest": {
          "title": "How to build a Mobius demo",
          "description": "Auto-generated preview for the 'Intro' tutorial",
          "steps": [],
          "assets": [],
          "audio": {},
          "options": {
            "resolution": "1280x720",
            "format": "webm",
            "includeCaptions": false
          },
          "metadata": {
            "author": "automation",
            "tags": ["preview", "auto"]
          }
        },
        "dryRun": true,
        "priority": "normal",
        "attempts": 0,
        "createdAt": "2025-10-08T12:05:00.000Z",
        "updatedAt": "2025-10-08T12:05:00.000Z"
      };

      const errors = validatePayload(fullPayload);
      expect(errors).toHaveLength(0);
    });

    test('should reject missing dryRun field', () => {
      const payloadWithoutDryRun = {
        "jobId": "preview-job-0001",
        "projectId": "proj-mobius-123",
        "requestId": "req-0001",
        "previewRequest": {
          "title": "Tutorial Preview - Minimal",
          "steps": [],
          "assets": [],
          "audio": {},
          "metadata": {}
        },
        "createdAt": "2025-10-08T12:00:00.000Z"
      };

      const errors = validatePayload(payloadWithoutDryRun);
      expect(errors).toContain('dryRun (boolean) required');
    });

    test('should reject wrong types for steps and audio', () => {
      const payloadWithWrongTypes = {
        "jobId": "preview-job-0001",
        "projectId": "proj-mobius-123",
        "requestId": "req-0001",
        "previewRequest": {
          "title": "Tutorial Preview - Minimal",
          "steps": {}, // Should be array
          "assets": [],
          "audio": [], // Should be object
          "metadata": {}
        },
        "dryRun": true,
        "createdAt": "2025-10-08T12:00:00.000Z"
      };

      const errors = validatePayload(payloadWithWrongTypes);
      expect(errors).toContain('previewRequest.steps (array) required');
      expect(errors).toContain('previewRequest.audio (object) required');
    });
  });
});