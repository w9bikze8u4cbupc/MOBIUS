import { readFileSync } from 'fs';

// Read the feature data
const rows = readFileSync('tmp/features.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
console.error(`Loaded ${rows.length} feature records`);

// Grid search parameters
const grids = {
  wSize: [0.2, 0.25, 0.3, 0.35, 0.4],
  wProx: [0.2, 0.25, 0.3, 0.35, 0.4],
  wProv: [0.1, 0.15, 0.2, 0.25, 0.3],
  wFocus: [0.15, 0.2, 0.25, 0.3],
  wUnique: [0.05, 0.1, 0.15, 0.2],
  hiThresh: [0.72, 0.75, 0.78, 0.8],
  medThresh: [0.5, 0.55, 0.6],
};

// Scoring function
function score(r, w) {
  const s =
    w.wSize * r.size +
    w.wProx * r.proximity +
    w.wProv * r.providerWeight +
    w.wFocus * r.focus +
    w.wUnique * r.uniqueness;
  return Math.max(0, Math.min(1, s));
}

// Count positive samples
const positives = rows.filter((r) => r.isPositive).length;
console.error(`Found ${positives} positive samples`);

// Grid search
let best = null;
let combinations = 0;

for (const wSize of grids.wSize)
  for (const wProx of grids.wProx)
    for (const wProv of grids.wProv)
      for (const wFocus of grids.wFocus)
        for (const wUnique of grids.wUnique)
          for (const hi of grids.hiThresh)
            for (const med of grids.medThresh) {
              if (!(hi > med)) continue;

              combinations++;
              const w = { wSize, wProx, wProv, wFocus, wUnique };
              let tpH = 0,
                fpH = 0,
                tpHM = 0,
                fpHM = 0;

              for (const r of rows) {
                const s = score(r, w);
                const band = s >= hi ? 'H' : s >= med ? 'M' : 'L';
                if (band === 'H') {
                  r.isPositive ? tpH++ : fpH++;
                }
                if (band === 'H' || band === 'M') {
                  r.isPositive ? tpHM++ : fpHM++;
                }
              }

              const precisionH = tpH / Math.max(1, tpH + fpH);
              const recallHM = tpHM / Math.max(1, positives);
              const objective = 0.6 * precisionH + 0.4 * recallHM; // prioritize High precision, then coverage

              const cand = {
                weights: w,
                thresholds: { high: hi, medium: med },
                precisionH: +precisionH.toFixed(3),
                recallHM: +recallHM.toFixed(3),
                objective: +objective.toFixed(3),
              };
              if (!best || cand.objective > best.objective) {
                best = cand;
                console.error(
                  `New best: objective=${cand.objective}, precisionH=${cand.precisionH}, recallHM=${cand.recallHM}`,
                );
              }
            }

console.error(`\nTested ${combinations} combinations`);
console.error('\nBest configuration:');
// Output only the JSON to stdout for piping
console.log(JSON.stringify(best, null, 2));
