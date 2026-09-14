import fs from 'node:fs';

function readLedger(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data.calls) || !Number.isInteger(Number(data.maxCalls)) || Number(data.maxCalls) < 0) {
    throw new Error('TEXT_GENERATION_BUDGET_LEDGER_INVALID');
  }
  return data;
}

function writeLedger(file, data) {
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

function withLedgerLock(file, action) {
  const lock = `${file}.lock`;
  const fd = fs.openSync(lock, 'wx');
  try {
    return action();
  } finally {
    fs.closeSync(fd);
    fs.unlinkSync(lock);
  }
}

export function reserveGenerationBudget(env, identity) {
  const file=env.MOBIUS_TEXT_GENERATION_BUDGET_LEDGER||env.MOBIUS_TEACHING_BUDGET_LEDGER;
  if(!file)return null;
  return withLedgerLock(file, () => {
    const data=readLedger(file);
    if(data.blocker||data.calls.length>=data.maxCalls)throw new Error('TEXT_GENERATION_BUDGET_EXHAUSTED_OR_BLOCKED');
    data.calls.push({...identity,at:new Date().toISOString()});
    writeLedger(file,data);
    return file;
  });
}
export function recordGenerationFailure(file,error){
  if(!file)return;
  withLedgerLock(file, () => {const data=readLedger(file);
    data.blocker={code:error.code||error.name,at:new Date().toISOString(),rawErrorOmitted:true};
    writeLedger(file,data);
  });
}

/**
 * A provider/configuration recovery is an explicit operator lifecycle event.
 * It preserves the failed call and all cumulative accounting; it only lifts a
 * stored blocker when a new bounded request has a different, documented input.
 */
export function authorizeGenerationBudgetRecovery(file, recovery = {}) {
  const id = String(recovery.id || '').trim();
  const authorization = String(recovery.authorization || '').trim();
  const reason = String(recovery.reason || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{3,127}$/.test(id) || !authorization || !reason) {
    throw new Error('TEXT_GENERATION_RECOVERY_REQUEST_INVALID');
  }
  return withLedgerLock(file, () => {
    const data = readLedger(file);
    if (!data.blocker) throw new Error('TEXT_GENERATION_RECOVERY_NOT_REQUIRED');
    if (data.calls.length >= data.maxCalls) throw new Error('TEXT_GENERATION_RECOVERY_CAP_EXHAUSTED');
    const history = Array.isArray(data.recoveries) ? data.recoveries : [];
    if (history.some((entry) => entry.id === id)) throw new Error('TEXT_GENERATION_RECOVERY_ALREADY_RECORDED');
    const recorded = {
      id,
      authorization,
      reason,
      recoveredAt: new Date().toISOString(),
      priorBlocker: { ...data.blocker },
      callsPreserved: data.calls.length,
      maxCallsPreserved: data.maxCalls,
    };
    data.recoveries = [...history, recorded];
    data.recoveryEpoch = id;
    data.blocker = null;
    writeLedger(file, data);
    return recorded;
  });
}
