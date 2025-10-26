// scripts/validatePreviewPayload.js
function validatePayload(p) {
  const errors = [];

  if (!p || typeof p !== 'object') {
    return ['Payload must be an object'];
  }

  if (!p.jobId || typeof p.jobId !== 'string') errors.push('jobId (string) required');
  if (!p.projectId || typeof p.projectId !== 'string') errors.push('projectId (string) required');
  if (!p.requestId || typeof p.requestId !== 'string') errors.push('requestId (string) required');

  if (!('dryRun' in p)) {
    errors.push('dryRun (boolean) required');
  } else if (typeof p.dryRun !== 'boolean') {
    errors.push('dryRun must be boolean');
  }

  const pr = p.previewRequest;
  if (!pr || typeof pr !== 'object') {
    errors.push('previewRequest (object) required');
  } else {
    if (!('steps' in pr) || !Array.isArray(pr.steps)) errors.push('previewRequest.steps (array) required');
    if (!('assets' in pr) || !Array.isArray(pr.assets)) errors.push('previewRequest.assets (array) required');
    if (!('audio' in pr) || typeof pr.audio !== 'object' || Array.isArray(pr.audio)) {
      errors.push('previewRequest.audio (object) required');
    }
  }

  return errors;
}

// Example usage:
if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('fs');
  const path = process.argv[2] || './payload.json';
  try {
    const raw = fs.readFileSync(path, 'utf8');
    const payload = JSON.parse(raw);
    const errs = validatePayload(payload);
    if (errs.length === 0) {
      console.log('OK: payload is valid');
      process.exit(0);
    } else {
      console.error('INVALID PAYLOAD:');
      errs.forEach((e) => console.error(' -', e));
      process.exit(2);
    }
  } catch (err) {
    console.error('ERROR reading/parsing payload:', err.message);
    process.exit(3);
  }
}

export { validatePayload };