import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createAiProviderRun} from './aiProviderExecutor.js';
import {getAiConfig,getGenerationOptions} from '../config/aiConfig.js';

export const KNOWLEDGE_TEACHING_CONTRACT = 'mobius-source-grounded-teaching-localization-v2';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const write = (file,value) => {fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(`${file}.tmp`,JSON.stringify(value,null,2));fs.renameSync(`${file}.tmp`,file);};

export function teachingPacket(model, language) {
  if (!model?.sourcePdfSha256 || !model.ruleAtoms?.length || model.ruleAtoms.some(a=>a.reviewState!=='accepted')) throw new Error('TEACHING_REQUIRES_ACCEPTED_SOURCE_KNOWLEDGE');
  return {contract:KNOWLEDGE_TEACHING_CONTRACT,language,sourcePdfSha256:model.sourcePdfSha256,
    // Existing tutorial/draft prose is not authority. Keep every condition,
    // action, quantity and citation, not just the previous result-only narration.
    rules:model.ruleAtoms.map(({teaching,...rule})=>rule)};
}

export function validateTeaching(result, packet) {
  if (!Array.isArray(result?.lessons) || result.lessons.length !== packet.rules.length) throw new Error('TEACHING_RULE_COVERAGE_MISMATCH');
  const seen=new Set();
  for(const lesson of result.lessons){
    const rule=packet.rules.find(r=>r.id===lesson.atomId);
    if(!rule || seen.has(lesson.atomId))throw new Error('TEACHING_RULE_ID_INVALID');
    seen.add(lesson.atomId);
    if(typeof lesson.heading!=='string'||!lesson.heading.trim()||typeof lesson.narration!=='string'||lesson.narration.trim().length<30
      ||!Array.isArray(lesson.displayLines)||!lesson.displayLines.length||lesson.displayLines.some(t=>typeof t!=='string'||!t.trim()))throw new Error('TEACHING_CONTENT_INCOMPLETE');
    if(!lesson.visualTeaching||typeof lesson.visualTeaching!=='object')throw new Error('TEACHING_VISUAL_STEPS_MISSING');
    for(const key of ['beforeState','actionState','afterState']){
      const source=rule.visualRequirement?.[key];const localized=lesson.visualTeaching[key];
      if(source!=null&&(!String(localized||'').trim()))throw new Error(`TEACHING_VISUAL_STEP_MISSING:${key}`);
      if(source==null&&localized!==null)throw new Error(`TEACHING_VISUAL_STEP_UNGROUNDED:${key}`);
    }
    const pages=new Set(rule.sourceRefs.map(r=>r.page));
    if(!lesson.sourcePages?.length||lesson.sourcePages.some(p=>!Number.isInteger(p)||p<1||!pages.has(p)))throw new Error('TEACHING_SOURCE_PAGE_INVALID');
  }
  return result;
}

export async function materializeKnowledgeTeaching({model,language='fr-CA',cachePath,env=process.env,complete}={}) {
  const packet=teachingPacket(model,language);
  const ai=getAiConfig(env);
  const inputHash=hash({packet,provider:ai.provider,model:ai.model});
  if(fs.existsSync(cachePath)){
    const prior=JSON.parse(fs.readFileSync(cachePath));
    if(prior.inputHash===inputHash){validateTeaching(prior.result,packet);return {...prior,reused:true,providerCalls:0};}
    write(`${cachePath}.${prior.inputHash}.history.json`,prior);
  }
  const failurePath=`${cachePath}.${inputHash}.failure.json`;
  if(fs.existsSync(failurePath))throw Object.assign(new Error('TEACHING_PREVIOUS_PROVIDER_FAILURE_REQUIRES_EXPLICIT_RECOVERY'),{code:'TEACHING_PREVIOUS_PROVIDER_FAILURE_REQUIRES_EXPLICIT_RECOVERY'});
  const props={atomId:{type:'string'},heading:{type:'string'},narration:{type:'string'},displayLines:{type:'array',items:{type:'string'}},sourcePages:{type:'array',items:{type:'integer'}},visualTeaching:{type:'object',properties:{beforeState:{type:['string','null']},actionState:{type:['string','null']},afterState:{type:['string','null']}},required:['beforeState','actionState','afterState'],additionalProperties:false}};
  const schema={type:'json_schema',json_schema:{name:'source_grounded_teaching',strict:true,schema:{type:'object',properties:{lessons:{type:'array',items:{type:'object',properties:props,required:Object.keys(props),additionalProperties:false}}},required:['lessons'],additionalProperties:false}}};
  const prompt='Produce beginner-friendly spoken teaching in '+language+' from these accepted official-source rules. One lesson per exact atomId; retain ALL triggers, conditions, costs, quantities, choices, consequences and exceptions. Never turn a result alone into an unexplained rule. Do not invent game facts or omit an essential explanation to target a duration. Use natural Canadian French, warm clear table-host delivery, and concise French display bullet lines distinct from narration. Translate game terms consistently; retain proper names. Every lesson cites only its own supplied source pages. For each non-null visualRequirement beforeState, actionState and afterState, return its faithful French translation in visualTeaching; use null only when that exact source field is absent. These are labels for source-grounded visuals, never new physical facts. Existing field names are not narration. Return only the structured object.\n'+JSON.stringify(packet);
  let reserved;
  if(env.MOBIUS_TEACHING_BUDGET_LEDGER){
    const ledger=env.MOBIUS_TEACHING_BUDGET_LEDGER;
    const fd=fs.openSync(`${ledger}.lock`,'wx');
    try{reserved=JSON.parse(fs.readFileSync(ledger));if(reserved.calls.length>=reserved.maxCalls||reserved.blocker)throw new Error('TEACHING_BUDGET_EXHAUSTED_OR_BLOCKED');reserved.calls.push({inputHash,model:ai.model,at:new Date().toISOString()});write(ledger,reserved);}finally{fs.closeSync(fd);fs.unlinkSync(`${ledger}.lock`);}
  }
  try{
    const run=complete?null:createAiProviderRun({env,maxRetries:0,allowedProviders:[ai.provider==='ai-integrations'?'openai':ai.provider]});
    const response=await (complete||run.complete)({messages:[{role:'user',content:prompt}],
      options:getGenerationOptions(ai,{max_completion_tokens:Math.min(30000,Math.max(12000,packet.rules.length*240)),response_format:schema}),maxRetries:0,
      inputHash,promptTemplateVersion:KNOWLEDGE_TEACHING_CONTRACT,schemaContractVersion:KNOWLEDGE_TEACHING_CONTRACT});
    const raw=response.response?.choices?.[0]?.message?.content;
    write(`${cachePath}.${inputHash}.response.json`,{inputHash,content:raw,usage:response.response?.usage||null,provenance:response.provenance});
    const result=validateTeaching(JSON.parse(raw),packet);
    const receipt={contract:KNOWLEDGE_TEACHING_CONTRACT,inputHash,result,usage:response.response?.usage||null,provenance:response.provenance,providerCalls:1,reused:false};
    write(cachePath,receipt);return receipt;
  }catch(error){
    const failure={inputHash,at:new Date().toISOString(),code:error.code||error.name,providerAttempts:error.providerAttempts||[],rawErrorOmitted:true};
    write(failurePath,failure);
    if(reserved){reserved.blocker=failure;write(env.MOBIUS_TEACHING_BUDGET_LEDGER,reserved);}
    throw error;
  }
}

export function applyKnowledgeTeaching(model, receipt) {
  const lessons=new Map(receipt.result.lessons.map(l=>[l.atomId,l]));
  return {...model,teachingProvenance:{contract:receipt.contract,inputHash:receipt.inputHash,provider:receipt.provenance},
    ruleAtoms:model.ruleAtoms.map(rule=>{const l=lessons.get(rule.id);return {...rule,teaching:{...rule.teaching,heading:l.heading,narration:l.narration,displayLines:l.displayLines,visualTeaching:l.visualTeaching,profile:'AMELIE_TEACHING_WARM_R10'}};})};
}
