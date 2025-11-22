import fs from 'fs';
import path from 'path';

const LOG_RELATIVE_PATH = 'logs/genesis_evaluations.jsonl';

export function loadGenesisHealthSummary() {
  const logPath = path.join(process.cwd(), LOG_RELATIVE_PATH);

  if (!fs.existsSync(logPath)) {
    return {
      hasLog: false,
      totalEvaluations: 0,
      grades: {},
      incompatibleCount: 0,
      lastEvaluationAtUtc: null,
    };
  }

  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  let total = 0;
  const grades = {};
  let incompatibleCount = 0;
  let lastEval = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      total += 1;
      const grade = entry.grade || 'unknown';
      grades[grade] = (grades[grade] || 0) + 1;
      if (entry.compatible === false) {
        incompatibleCount += 1;
      }
      const ts = entry.createdAtUtc;
      if (ts && (!lastEval || ts > lastEval)) {
        lastEval = ts;
      }
    } catch {
      // skip malformed line; don't break health summary
      continue;
    }
  }

  return {
    hasLog: true,
    totalEvaluations: total,
    grades,
    incompatibleCount,
    lastEvaluationAtUtc: lastEval,
  };
}
