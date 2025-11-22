import fs from 'fs';
import path from 'path';

const FEEDBACK_FILENAME = 'genesis_feedback_v1.0.0.json';

function getProjectOutputDir(projectId) {
  return path.join(process.cwd(), 'output', String(projectId));
}

export function getGenesisFeedbackPath(projectId) {
  return path.join(getProjectOutputDir(projectId), FEEDBACK_FILENAME);
}

/**
 * Load G6 Mobius feedback bundle for a given projectId, if present.
 * Returns { ok: true, bundle } or { ok: false, error }.
 */
export function loadGenesisFeedback(projectId) {
  const filePath = getGenesisFeedbackPath(projectId);

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      error: 'GENESIS feedback not found for this project.',
      code: 'NOT_FOUND',
    };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);

    if (!json.contract || json.contract.name !== 'g6_mobius_feedback_contract') {
      return {
        ok: false,
        error: 'Invalid GENESIS feedback contract name.',
        code: 'INVALID_CONTRACT',
      };
    }

    return { ok: true, bundle: json };
  } catch (err) {
    return {
      ok: false,
      error: `Failed to read GENESIS feedback: ${err.message}`,
      code: 'READ_ERROR',
    };
  }
}
