#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const { authorizeGenerationBudgetRecovery } = await import('../src/services/aiGenerationBudget.js');

function value(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

const ledger = value('ledger');
const recoveryPath = value('recovery');
if (!ledger || !recoveryPath) {
  throw new Error('Usage: node scripts/recover-ai-generation-budget.mjs --ledger <budget.json> --recovery <recovery.json>');
}
const absoluteLedger = path.resolve(ledger);
const absoluteRecovery = path.resolve(recoveryPath);
if (!fs.existsSync(absoluteLedger) || !fs.existsSync(absoluteRecovery)) throw new Error('TEXT_GENERATION_RECOVERY_INPUT_MISSING');
const recovery = JSON.parse(fs.readFileSync(absoluteRecovery, 'utf8'));
const recorded = authorizeGenerationBudgetRecovery(absoluteLedger, recovery);
console.log(JSON.stringify({ status: 'recovered', ledger: absoluteLedger, recovery: recorded }, null, 2));
