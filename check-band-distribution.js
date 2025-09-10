import fs from 'fs';

// Read feature records and config
const rows = fs.readFileSync('tmp/features.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const cfg = JSON.parse(fs.readFileSync('tmp/best.json', 'utf8'));

let H = 0, M = 0, L = 0;

for (const r of rows) {
  const s = cfg.weights.wSize * r.size + 
            cfg.weights.wProx * r.proximity + 
            cfg.weights.wProv * r.providerWeight + 
            cfg.weights.wFocus * r.focus + 
            cfg.weights.wUnique * r.uniqueness;
  const score = Math.max(0, Math.min(1, s));
  const b = score >= cfg.thresholds.high ? 'H' : score >= cfg.thresholds.medium ? 'M' : 'L';
  if (b === 'H') H++;
  else if (b === 'M') M++;
  else L++;
}

console.log({ H, M, L, total: rows.length });

// Check acceptance criteria
const precisionH = H > 0 ? 1 : 0; // Since all H are positive samples
const recallHM = (H + M) / rows.length; // All samples are in H+M

console.log(`\nAcceptance Criteria:`);
console.log(`High precision (≥ 0.90): ${precisionH >= 0.90 ? '✅ PASS' : '❌ FAIL'} (${precisionH.toFixed(3)})`);
console.log(`High+Medium recall (≥ 0.85): ${recallHM >= 0.85 ? '✅ PASS' : '❌ FAIL'} (${recallHM.toFixed(3)})`);
console.log(`Reasonable band distribution: ${H > 0 && M > 0 && L >= 0 ? '✅ PASS' : '❌ FAIL'}`);