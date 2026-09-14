import fs from 'node:fs';
export function reserveGenerationBudget(env, identity) {
  const file=env.MOBIUS_TEXT_GENERATION_BUDGET_LEDGER||env.MOBIUS_TEACHING_BUDGET_LEDGER;
  if(!file)return null;
  const fd=fs.openSync(`${file}.lock`,'wx');
  try {
    const data=JSON.parse(fs.readFileSync(file));
    if(data.blocker||data.calls.length>=data.maxCalls)throw new Error('TEXT_GENERATION_BUDGET_EXHAUSTED_OR_BLOCKED');
    data.calls.push({...identity,at:new Date().toISOString()});
    fs.writeFileSync(`${file}.tmp`,JSON.stringify(data,null,2));fs.renameSync(`${file}.tmp`,file);
    return file;
  } finally {fs.closeSync(fd);fs.unlinkSync(`${file}.lock`);}
}
export function recordGenerationFailure(file,error){
  if(!file)return;
  const fd=fs.openSync(`${file}.lock`,'wx');
  try {const data=JSON.parse(fs.readFileSync(file));
    data.blocker={code:error.code||error.name,at:new Date().toISOString(),rawErrorOmitted:true};
    fs.writeFileSync(`${file}.tmp`,JSON.stringify(data,null,2));fs.renameSync(`${file}.tmp`,file);
  }finally{fs.closeSync(fd);fs.unlinkSync(`${file}.lock`);}
}
