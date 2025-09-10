import fs from 'fs';

const priors = {
  hook: [15, 30],
  components: [30, 60],
  setupOp: [3, 8], // per op
  phaseHeader: [2, 4],
  actionDemo: [5, 12], // per action example
  scoring: [45, 90],
  outro: [10, 20]
};

function clamp([min, max]) { return (val) => Math.max(min, Math.min(max, val)); }
const clampOp = clamp(priors.setupOp);
const clampAction = clamp(priors.actionDemo);

function shot(id, type, data, duration) {
  return { id, type, duration, data };
}

function compile(gig) {
  const shots = [];
  let i = 1;

  // Title/Hook
  shots.push(shot(`s${i++}`, 'title', { text: `How to Play ${gig.meta.title}` }, 6));
  shots.push(shot(`s${i++}`, 'hook', { text: `Win by ${gig.scoring?.[1]?.end || 'meeting the victory condition'}` }, 10));

  // Components
  shots.push(shot(`s${i++}`, 'components', { items: gig.components.map(c => c.name), callouts: true }, 12));

  // Setup ops
  for (const op of gig.setup) {
    const template = op.anim?.template || (op.op === 'deal' ? 'dealCards' : op.op === 'place' ? 'placeToken' : 'phaseHeader');
    shots.push(shot(`s${i++}`, 'setupOp', {
      op: op.op,
      what: op.what,
      where: op.where,
      params: op.anim?.params,
      template
    }, clampOp(5)));
  }

  // Turn phases with example per phase if available
  for (const ph of gig.turnStructure) {
    shots.push(shot(`s${i++}`, 'phaseHeader', { text: ph.phase, icon: 'phase' }, 3));
    const template = ph.animationHint?.template || 'highlightRegion';
    shots.push(shot(`s${i++}`, 'turnPhase', { phase: ph.phase, template }, clampAction(7)));
    if (ph.actions?.length) {
      for (const a of ph.actions.slice(0, 1)) {
        shots.push(shot(`s${i++}`, 'actionExample', { action: a.name || ph.phase, template: ph.animationHint?.template || 'highlightRegion' }, clampAction(6)));
      }
    }
  }

  // Scoring
  shots.push(shot(`s${i++}`, 'scoring', { rules: gig.scoring }, 15));

  // Outro
  shots.push(shot(`s${i++}`, 'outro', { text: 'That\'s how to play!' }, 8));

  return shots;
}

if (process.argv.length < 3) {
  console.error('Usage: node scripts/compile-shotlist.mjs <gig.json> > tmp/shotlist.json');
  process.exit(1);
}

const gig = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const shots = compile(gig);
console.log(JSON.stringify({ meta: { title: gig.meta.title }, shots }, null, 2));