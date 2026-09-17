import {createAiProviderRun} from './aiProviderExecutor.js';
import {getAiConfig,getGenerationOptions} from '../config/aiConfig.js';
import {reserveGenerationBudget,recordGenerationFailure} from './aiGenerationBudget.js';
import domainSynthesis from './rulebookDomainSynthesis.cjs';
const {validateDomainSynthesisPacket,buildDomainSynthesisPrompt,parseDomainSynthesisJson}=domainSynthesis;

/** One canonical provider execution shared by API and worker-side resumption. */
export async function synthesizeRulebookDomains(packet,{env=process.env}={}){
  if(!validateDomainSynthesisPacket(packet))throw Object.assign(new Error('Invalid canonical evidence packet'),{code:'RULEBOOK_DOMAIN_SYNTHESIS_PACKET_INVALID',statusCode:400});
  const config=getAiConfig(env);
  const ledger=reserveGenerationBudget(env,{inputHash:packet.cacheKey,model:config.model,stage:packet.kind||'domain-synthesis'});
  try {
  const run=createAiProviderRun({env,maxRetries:0,allowedProviders:[config.provider==='ai-integrations'?'openai':config.provider]});
  const completion=await run.complete({messages:[{role:'system',content:'You are a precise rulebook evidence extractor. Return only the requested JSON object.'},
    {role:'user',content:buildDomainSynthesisPrompt(packet)}],
    options:getGenerationOptions(config,packet.kind==='document-completeness'?{max_completion_tokens:14000,response_format:{type:'json_object'}}:{},packet.kind==='document-completeness'?null:'rulebook_domain_synthesis'),
    inputHash:packet.cacheKey,promptTemplateVersion:packet.promptVersion,schemaContractVersion:packet.contract,
    validate:response=>parseDomainSynthesisJson(response.choices?.[0]?.message?.content||'')});
  return {contract:packet.contract,cacheKey:packet.cacheKey,result:completion.value,provenance:completion.provenance,
    usage:completion.response?.usage||null,providerAttempts:completion.attempts||[]};
  }catch(error){recordGenerationFailure(ledger,error);throw error;}
}
