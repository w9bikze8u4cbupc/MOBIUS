import fs from 'fs';
import path from 'path';

const LOG_RELATIVE_PATH = 'logs/genesis_evaluations.jsonl';

/**
 * Load evaluation history for a given projectId (and optional tutorialId).
 * Returns the most recent entries first.
 */
export function loadGenesisHistory({ projectId, tutorialId = null, limit = 10 }) {
  const logPath = path.join(process.cwd(), LOG_RELATIVE_PATH);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const entries = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.projectId !== String(projectId)) continue;
      if (tutorialId && entry.tutorialId !== String(tutorialId)) continue;
      entries.push(entry);
    } catch {
      // skip malformed rows
      continue;
    }
  }

  // Sort by createdAtUtc descending
  entries.sort((a, b) => {
    const ta = a.createdAtUtc || '';
    const tb = b.createdAtUtc || '';
    return tb.localeCompare(ta);
  });

  return entries.slice(0, limit);
}
