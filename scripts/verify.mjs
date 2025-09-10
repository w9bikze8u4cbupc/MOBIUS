import fs from 'fs';

const gig = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const shotlist = JSON.parse(fs.readFileSync(process.argv[3],'utf8'));

const issues = [];

// Coverage: each setup op has a shot
for (const op of gig.setup) {
  const hit = shotlist.shots.some(s => s.type === 'setupOp' && s.data?.op === op.op && s.data?.what === op.what);
  if (!hit) issues.push({ type: 'coverage', msg: `Missing setup shot for ${op.op} ${op.what}` });
}

// Turn phases covered
for (const ph of gig.turnStructure) {
  const hit = shotlist.shots.some(s => s.type === 'phaseHeader' && s.data?.text === ph.phase);
  if (!hit) issues.push({ type: 'coverage', msg: `Missing phase header for ${ph.phase}` });
}

// Scoring present
if (!shotlist.shots.some(s => s.type === 'scoring')) {
  issues.push({ type: 'coverage', msg: 'Missing scoring segment' });
}

// Contradictions stub (extend with RAG check vs rulebook text)
function contradictsNarrationStub(_gig, _shots) { return []; }
issues.push(...contradictsNarrationStub(gig, shotlist.shots));

const ok = issues.length === 0;
console.log(JSON.stringify({ ok, issues }, null, 2));
process.exit(ok ? 0 : 1);