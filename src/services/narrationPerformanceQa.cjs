/** Deterministic first-pass QA for cached/generated narration takes. */

function tokens(value) {
  return String(value || '')
    .toLocaleLowerCase('fr-CA')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9à-ÿ'-]+/gi, ' ')
    .trim().split(/\s+/).filter(Boolean);
}

function lcsLength(left, right) {
  const row = new Uint16Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= right.length; j += 1) {
      const prior = row[j];
      row[j] = left[i - 1] === right[j - 1] ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = prior;
    }
  }
  return row[right.length];
}

function auditNarrationPerformance({ intendedText, transcriptText, durationSec = 0, pauseDurationSec = 0, minimumAsrCoverage = 0.72 } = {}) {
  const intended = tokens(intendedText);
  const spoken = tokens(transcriptText);
  const matched = lcsLength(intended, spoken);
  const coverageRatio = intended.length ? matched / intended.length : 1;
  const consecutiveRepeats = [];
  for (let index = 1; index < spoken.length; index += 1) {
    if (spoken[index] === spoken[index - 1] && spoken[index].length > 1) consecutiveRepeats.push(spoken[index]);
  }
  const transcript = String(transcriptText || '');
  const partialRuns = [
    ...(transcript.match(/\b([a-zà-ÿ]{1,6})-(?:\1-)+[a-zà-ÿ]+/gi) || []),
    ...(transcript.match(/(?:^|\s)(?:[a-zà-ÿ]\s+){2,}[a-zà-ÿ](?:\s|$)/gi) || []),
  ];
  const speechSec = Math.max(0.001, Number(durationSec) - Number(pauseDurationSec));
  const wordsPerMinute = spoken.length / speechSec * 60;
  const violations = [];
  // Local ASR is an error-tolerant detector, not a verbatim authority. French
  // homophones, numerals, proper names and game terminology routinely produce
  // substitutions despite a complete take. Missing clauses still fall well
  // below this calibrated floor; restart/partial-word checks remain independent.
  if (coverageRatio < minimumAsrCoverage) violations.push('transcript-content-mismatch');
  if (consecutiveRepeats.length) violations.push('repeated-word-or-false-start');
  if (partialRuns.length) violations.push('partial-word-or-stutter-run');
  if (durationSec > 0 && (wordsPerMinute < 90 || wordsPerMinute > 205)) violations.push('abnormal-speech-rate');
  return {
    contract: 'mobius-narration-performance-qa-v1',
    status: violations.length ? 'FAIL' : 'PASS',
    intendedWordCount: intended.length,
    transcriptWordCount: spoken.length,
    matchedWordCount: matched,
    coverageRatio: Number(coverageRatio.toFixed(4)),
    minimumAsrCoverage,
    wordsPerMinute: Number(wordsPerMinute.toFixed(1)),
    consecutiveRepeats,
    partialRuns,
    violations,
  };
}

module.exports = { auditNarrationPerformance };
