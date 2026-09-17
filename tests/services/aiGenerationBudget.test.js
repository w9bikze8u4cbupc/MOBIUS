const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function ledger(root, overrides = {}) {
  const file = path.join(root, 'budget.json');
  fs.writeFileSync(file, JSON.stringify({ maxCalls: 2, calls: [{ inputHash: 'old' }], blocker: { code: 'OLD_FAILURE', rawErrorOmitted: true }, ...overrides }));
  return file;
}

function runModule(source) {
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', windowsHide: true,
  }).trim());
}

test('explicit recovery preserves failed history and cumulative cap before one new reservation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-text-budget-'));
  try {
    const file = ledger(root);
    const source = `import fs from 'node:fs'; import {authorizeGenerationBudgetRecovery,reserveGenerationBudget} from './src/services/aiGenerationBudget.js'; const f=${JSON.stringify(file)}; const r=authorizeGenerationBudgetRecovery(f,{id:'validated-new-input-v1',authorization:'Director authorizes a new bounded input.',reason:'The previous validation error is fixed.'}); reserveGenerationBudget({MOBIUS_TEXT_GENERATION_BUDGET_LEDGER:f},{inputHash:'new'}); console.log(JSON.stringify({preserved:r.callsPreserved,after:JSON.parse(fs.readFileSync(f,'utf8'))}));`;
    const output = runModule(source);
    expect(output.preserved).toBe(1);
    const after = output.after;
    expect(after.calls).toHaveLength(2);
    expect(after.blocker).toBeNull();
    expect(after.recoveries).toHaveLength(1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('recovery cannot reset an exhausted ledger or duplicate its lifecycle event', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-text-budget-'));
  try {
    const full = ledger(root, { maxCalls: 1 });
    const other = path.join(root, 'other');
    fs.mkdirSync(other);
    const open = ledger(other);
    const source = `import {authorizeGenerationBudgetRecovery} from './src/services/aiGenerationBudget.js'; const full=${JSON.stringify(full)}, open=${JSON.stringify(open)}; const request={id:'duplicate-recovery-v1',authorization:'Director.',reason:'A different input is ready.'}; let exhausted, duplicate; try{authorizeGenerationBudgetRecovery(full,request)}catch(e){exhausted=e.message} authorizeGenerationBudgetRecovery(open,request); try{authorizeGenerationBudgetRecovery(open,request)}catch(e){duplicate=e.message} console.log(JSON.stringify({exhausted,duplicate}));`;
    const output = runModule(source);
    expect(output.exhausted).toBe('TEXT_GENERATION_RECOVERY_CAP_EXHAUSTED');
    expect(output.duplicate).toBe('TEXT_GENERATION_RECOVERY_NOT_REQUIRED');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
