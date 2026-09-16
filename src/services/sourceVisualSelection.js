import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { nativeManifestProvenance } from './hephaestusEvidence.js';
import { curateHephaestusAssets } from './hephaestusCuration.js';
import editorialStandard from './editorialStandard.cjs';
import {getAiConfig,getGenerationOptions} from '../config/aiConfig.js';
import {createAiProviderRun} from './aiProviderExecutor.js';
import {reserveGenerationBudget,recordGenerationFailure} from './aiGenerationBudget.js';
import ruleVisualReferentRecovery from './ruleVisualReferentRecovery.cjs';

const {
  RULE_VISUAL_REFERENT_RECOVERY_CONTRACT,
  buildRuleVisualReferentRecoveryPacket,
  hashVisualReferentRecoveryPacket,
  validateRuleVisualReferentRecovery,
} = ruleVisualReferentRecovery;

// A provider outage is not a request to adjudicate a visual interpretation.
// Keep the complete review evidence, but expose only a sanitized machine cause.
export function visualProviderFailure(report) {
  const blocker = report?.summary?.providerBlocker;
  if (!blocker) return null;
  const responseBudget = /\bVISUAL_RESPONSE_REASONING_BUDGET_EXHAUSTED\b/.exec(String(blocker));
  const emptyResponse = /\bVISUAL_PROVIDER_EMPTY_CONTENT\b/.exec(String(blocker));
  if (responseBudget || emptyResponse) {
    const code = responseBudget?.[0] || emptyResponse?.[0];
    const error = new Error(code);
    error.code = code;
    error.classification = 'retryable_engineering';
    error.explicitRecovery = true;
    error.httpStatus = null;
    return error;
  }
  const http = /HTTP (\d{3})\b/.exec(String(blocker));
  const status = http ? Number(http[1]) : null;
  const error = new Error(status ? `VISUAL_PROVIDER_UNAVAILABLE: HTTP ${status}` : 'VISUAL_PROVIDER_RESPONSE_INVALID');
  error.code = status ? 'VISUAL_PROVIDER_UNAVAILABLE' : 'VISUAL_PROVIDER_RESPONSE_INVALID';
  error.classification = status ? 'provider_unavailable' : 'retryable_engineering';
  error.explicitRecovery = true;
  error.httpStatus = status;
  return error;
}

/**
 * A provider recovery is an explicit lifecycle event, not a quality change.
 * It invalidates only the bounded visual-analysis checkpoint so a retained
 * transient failure cannot be replayed as if it were fresh evidence.
 */
export function visualProviderRecoveryIdentity(env = process.env) {
  const ledgerPath = String(env.MOBIUS_VISUAL_BUDGET_LEDGER || '').trim();
  if (!ledgerPath || !fs.existsSync(ledgerPath)) return null;
  try {
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const epoch = String(ledger.recoveryEpoch || '').trim();
    return /^[A-Za-z0-9_-]{4,100}$/.test(epoch) ? `mobius-visual-provider-recovery-v1:${epoch}` : null;
  } catch {
    // A malformed optional ledger must never create a fake cache identity.
    return null;
  }
}

export const COMPONENT_DISCOVERY_CONTRACT = 'mobius-source-component-discovery-v2';

const NON_PHYSICAL_DISCOVERY_CATEGORIES = new Set([
  'action', 'currency', 'effect', 'rule', 'state', 'status', 'value', 'virtual_resource',
]);

function componentDiscoveryEvidence(term = {}) {
  return (term.evidence || [])
    .filter((row) => Number.isInteger(Number(row?.page)) && Number(row.page) > 0 && String(row?.quote || '').trim())
    .map((row) => ({ page: Number(row.page), quote: String(row.quote).trim() }));
}

/**
 * Reconnect source-faithful crops produced by a prior bounded matcher batch to
 * the next canonical candidate catalogue. A crop is replayable only inside the
 * same project root and for the same PDF SHA. It re-enters as an UNKNOWN search
 * candidate: prior localization never becomes component or scene acceptance.
 */
export function replayGeneratedVisualCandidates({ images = [], semanticReport = {}, sourceSha256, projectRoot } = {}) {
  const root = projectRoot ? path.resolve(projectRoot) : null;
  const insideRoot = (filePath) => !root || path.resolve(filePath).startsWith(`${root}${path.sep}`);
  const merged = new Map((images || []).filter((row) => row?.id).map((row) => [row.id, row]));
  for (const row of semanticReport?.generatedAssets || []) {
    const filePath = String(row?.file_path || row?.path || '').trim();
    const provenance = row?.provenance || {};
    const candidateSourceSha = row?.sourcePdfSha256 || provenance.sourcePdfSha256;
    if (!row?.id || !filePath || !fs.existsSync(filePath) || !insideRoot(filePath)
      || !sourceSha256 || candidateSourceSha !== sourceSha256
      || !Number.isInteger(Number(row?.source_page || provenance.sourcePage))
      || Number(row?.source_page || provenance.sourcePage) <= 0) continue;
    const replay = {
      ...row,
      file_path: filePath,
      localizedReferent: row.localizedReferent || provenance.measuredObjectId || null,
      cropCompleteness: 'unknown',
      cropPurity: 'unknown',
      is_component: null,
      requiresPixelVerification: true,
    };
    delete replay.objectVisualEvidence;
    delete replay.selectedAssetIds;
    merged.set(row.id, replay);
  }
  return [...merged.values()];
}

const VISUAL_SEARCH_REQUIREMENT_WEIGHTS = Object.freeze({
  setupPlacementRequired: 100,
  layeredStateRequired: 70,
  trackStateRequired: 60,
  requiredRelationship: 50,
  transitionRequired: 40,
});

function componentVisualSearchPages(id, scenes = []) {
  const maximumPage = Math.max(0, ...(scenes || []).flatMap((scene) => scene?.source_pages || [])
    .map(Number).filter((page) => Number.isInteger(page) && page > 0));
  const ranked = new Map();
  const illustratedSpreadStarts = new Map();
  for (const scene of scenes || []) {
    const requirement = scene?.visualRequirement || {};
    if (!(requirement.requiredObjects || []).includes(id) || requirement.actualGameAssetRequired === false) continue;
    const score = Object.entries(VISUAL_SEARCH_REQUIREMENT_WEIGHTS)
      .reduce((total, [field, weight]) => total + (requirement[field] ? weight : 0), 0)
      + (/setup|component|placement|board/i.test(String(requirement.purpose || scene?.section || '')) ? 35 : 0);
    for (const rawPage of scene?.source_pages || []) {
      const page = Number(rawPage);
      if (!Number.isInteger(page) || page <= 0) continue;
      ranked.set(page, Math.max(ranked.get(page) || 0, score));
      // Illustrated setup spreads frequently follow the text that introduces
      // them. Reserve one following-page hypothesis after direct evidence
      // pages have been ranked; otherwise neighbours of one dense rule can
      // consume the whole bounded search and hide another direct source page.
      if (score >= VISUAL_SEARCH_REQUIREMENT_WEIGHTS.setupPlacementRequired) {
        illustratedSpreadStarts.set(page, Math.max(illustratedSpreadStarts.get(page) || 0, score));
      }
    }
  }
  const direct = [...ranked.entries()]
    .sort(([leftPage, leftScore], [rightPage, rightScore]) => rightScore - leftScore || leftPage - rightPage)
    .slice(0, 3)
    .map(([page]) => page);
  const followingIllustrations = [...illustratedSpreadStarts.entries()]
    .sort(([leftPage, leftScore], [rightPage, rightScore]) => rightScore - leftScore || leftPage - rightPage)
    .map(([page]) => page + 1)
    .filter((page) => page > 0 && (!maximumPage || page <= maximumPage) && !direct.includes(page))
    .slice(0, 3);
  return [...new Set([...direct, ...followingIllustrations])]
    .sort((left, right) => left - right);
}

/**
 * Create source-identity discovery work from the same source-grounded
 * component terminology used by normal visual plans. It does not add an
 * asset, a binding, or a teaching scene. Each packet is intentionally atomic:
 * a broad inventory page can name many components without showing any of
 * them, so a provider verdict for one referent must never be treated as a
 * verdict for its neighbours. Atomic evidence also lets a successful identity
 * measurement unlock every later scene using that component.
 */
export function buildComponentDiscoveryScenes({ scenes = [], componentTerms = {} } = {}) {
  const required = new Set((scenes || []).flatMap((scene) => scene?.visualRequirement?.requiredObjects || []));
  const usage = new Map();
  for (const scene of scenes || []) {
    for (const id of scene?.visualRequirement?.requiredObjects || []) usage.set(id, (usage.get(id) || 0) + 1);
  }
  const discoveries = [];
  for (const id of [...required].sort()) {
    const term = componentTerms?.[id];
    if (!term || typeof term !== 'object' || term.status !== 'GROUNDED') continue;
    if (NON_PHYSICAL_DISCOVERY_CATEGORIES.has(String(term.category || '').toLowerCase())) continue;
    const evidence = componentDiscoveryEvidence(term);
    if (!evidence.length) continue;
    // A component may be mentioned throughout the rules. Its earliest exact
    // component evidence is the stable discovery page; other citations stay
    // with the teaching scene and never become identity proof by themselves.
    const page = evidence.map((row) => row.page).sort((left, right) => left - right)[0];
    const sourceRefs = evidence.filter((row) => row.page === page);
    const visualSearchPages = componentVisualSearchPages(id, scenes).filter((candidate) => candidate !== page);
    const suffix = crypto.createHash('sha256').update(JSON.stringify([page, id, visualSearchPages])).digest('hex').slice(0, 12);
    discoveries.push({
      id: `source-component-discovery-p${page}-${suffix}`,
      source_pages: [page],
      visualSearchPages,
      sourceRefs,
      visualRequirement: {
        actualGameAssetRequired: true,
        requiredObjects: [id],
        purpose: 'component-identity-discovery',
        componentDiscovery: true,
      },
      discoveryContract: COMPONENT_DISCOVERY_CONTRACT,
      discoveryReferent: id,
      discoveryReuseCount: usage.get(id) || 0,
    });
  }
  return discoveries.sort((left, right) => (right.discoveryReuseCount - left.discoveryReuseCount)
    || (left.source_pages[0] - right.source_pages[0]) || left.discoveryReferent.localeCompare(right.discoveryReferent));
}

export function locateInterleavedSourceQuote(text,quote){
  // PDF reading order may interleave a card's icon values/labels with prose.
  // Locate all supplied words in order, but RETURN the exact source span with
  // every intervening token intact. Never remove costs/numbers from evidence.
  const tokens=value=>[...value.matchAll(/[\p{L}\p{N}]+/gu)].map(m=>({word:m[0].toLowerCase(),start:m.index,end:m.index+m[0].length}));
  const source=tokens(text),wanted=tokens(quote);if(wanted.length<5)return null;
  const matches=[];
  for(let start=0;start<source.length;start++){
    if(source[start].word!==wanted[0].word)continue;
    let index=start,matched=0;
    while(index<source.length&&index-start<wanted.length+12&&matched<wanted.length){if(source[index].word===wanted[matched].word)matched++;index++;}
    if(matched===wanted.length)matches.push(text.slice(source[start].start,source[index-1].end));
  }
  return matches.length===1?matches[0]:null;
}

// Extraction fragments are retrieval hints, not physical component names.
// Keep every original ID/requirement; normalize only its source-grounded search
// terminology. This grants no pixel identity, binding, or scene acceptance.
export async function normalizeSourceReferentTerms({model,cachePath,env=process.env,complete}={}){
  const ai=getAiConfig(env);
  const packet={contract:'mobius-source-referent-terminology-v1',sourceSha256:model.sourcePdfSha256,
    components:model.components.map(c=>({id:c.id,name:c.name,category:c.category})),
    evidence:model.documentMap.pages.filter(p=>p.normalizedText).map(p=>({page:p.humanPageNumber,text:p.normalizedText,hash:p.textHash}))};
  const hash=crypto.createHash('sha256').update(JSON.stringify({packet,provider:ai.provider,model:ai.model})).digest('hex');
  const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(value,null,2));fs.renameSync(file+'.tmp',file);};
  const validate=result=>{
    if(!Array.isArray(result?.referents)||result.referents.length!==packet.components.length)throw Error('REFERENT_COVERAGE_INVALID');
    const seen=new Set();
    for(const ref of result.referents){
      if(!packet.components.some(c=>c.id===ref.id)||seen.has(ref.id))throw Error('REFERENT_ID_INVALID');seen.add(ref.id);
      if(!['GROUNDED','UNKNOWN'].includes(ref.status))throw Error('REFERENT_STATUS_INVALID');
      if(ref.status==='GROUNDED'&&(!ref.canonicalTerm?.trim()||!ref.evidence?.length))throw Error('REFERENT_EVIDENCE_MISSING');
      for(const e of ref.evidence||[]){const page=packet.evidence.find(p=>p.page===e.page);
        if(!page||!e.quote?.trim())throw Error('REFERENT_EVIDENCE_INVALID');
        if(!page.text.includes(e.quote)){
          const exact=locateInterleavedSourceQuote(page.text,e.quote);
          if(!exact)throw Error('REFERENT_EVIDENCE_INVALID');
          e.providerQuote=e.quote;e.quote=exact;e.sourceProjection='unique-ordered-source-span-with-interleaved-tokens-preserved';
        }}
    }
    return result;
  };
  if(fs.existsSync(cachePath)){const prior=JSON.parse(fs.readFileSync(cachePath));if(prior.inputHash===hash){validate(prior.result);return {...prior,reused:true,providerCalls:0};}}
  const receiptPath=cachePath+'.'+hash+'.response.json';
  if(fs.existsSync(receiptPath)){
    const raw=JSON.parse(fs.readFileSync(receiptPath));const result=validate(JSON.parse(raw.content));
    const recovered={contract:packet.contract,inputHash:hash,result,usage:raw.usage,providerCalls:0,reused:true,validationRecovery:'exact-source-span-reconciliation; original response retained'};
    write(cachePath,recovered);return recovered;
  }
  const fields={id:{type:'string'},canonicalTerm:{type:'string'},frenchTerm:{type:'string'},category:{type:'string'},status:{type:'string',enum:['GROUNDED','UNKNOWN']},reason:{type:'string'},evidence:{type:'array',items:{type:'object',properties:{page:{type:'integer'},quote:{type:'string'}},required:['page','quote'],additionalProperties:false}}};
  const schema={type:'json_schema',json_schema:{name:'source_referent_terms',strict:true,schema:{type:'object',properties:{referents:{type:'array',items:{type:'object',properties:fields,required:Object.keys(fields),additionalProperties:false}}},required:['referents'],additionalProperties:false}}};
  const ledger=reserveGenerationBudget(env,{inputHash:hash,contract:packet.contract,model:ai.model});
  try{
    const run=complete?null:createAiProviderRun({env,maxRetries:0,allowedProviders:[ai.provider==='ai-integrations'?'openai':ai.provider]});
    const response=await(complete||run.complete)({messages:[{role:'user',content:'Normalize each extracted referent into the actual physical object or symbol described by the supplied official text. Keep EVERY original ID. A sentence fragment or action heading is not a separate physical object; name its underlying physical referent only when the text proves it. Distinguish card family, pile/hand/location STATE from intrinsic card identity. Same underlying object may share canonicalTerm; never merge distinct card families by guess. A virtual resource/symbol is not necessarily a physical token. Return UNKNOWN where no exact identity is grounded. Include short EXACT source quotations (copy characters, do not fix spelling) and one-based PDF pages. No image choice, crop coordinates, rules changes or acceptance. Terms remain search hypotheses pending pixels.\n'+JSON.stringify(packet)}],options:getGenerationOptions(ai,{max_completion_tokens:12000,response_format:schema}),maxRetries:0,inputHash:hash,promptTemplateVersion:packet.contract,schemaContractVersion:packet.contract});
    const raw=response.response.choices[0].message.content;write(receiptPath,{inputHash:hash,content:raw,usage:response.response.usage,provenance:response.provenance});
    const result=validate(JSON.parse(raw));const receipt={contract:packet.contract,inputHash:hash,result,usage:response.response.usage,providerCalls:1,reused:false};write(cachePath,receipt);return receipt;
  }catch(error){recordGenerationFailure(ledger,error);throw error;}
}

/**
 * Recover a rule's visual referent before source-asset selection. The provider
 * can only select IDs from the existing source-grounded component inventory,
 * and can cite only excerpts supplied by the accepted RuleAtoms. This is a
 * bounded interpretation pass, not an image selector or a rule-authority
 * substitute.
 */
export async function recoverRuleVisualReferents({ model, cachePath, env = process.env, complete } = {}) {
  const ai = getAiConfig(env);
  const packet = buildRuleVisualReferentRecoveryPacket(model);
  const inputHash = hashVisualReferentRecoveryPacket({ packet, provider: ai.provider, model: ai.model });
  const batchSize = 6;
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(value, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  };
  const validate = (value) => validateRuleVisualReferentRecovery(packet, value?.result || value);
  if (!packet.candidates.length) {
    const result = { contract: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT, recoveries: [] };
    const record = { contract: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT, inputHash, provider: ai.provider, model: ai.model, result, providerCalls: 0, reused: true };
    if (cachePath) write(cachePath, record);
    return record;
  }
  if (cachePath && fs.existsSync(cachePath)) {
    const prior = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    if (prior.inputHash === inputHash) return { ...prior, result: validate(prior), providerCalls: 0, reused: true };
  }
  const fields = {
    ruleAtomId: { type: 'string' },
    disposition: { type: 'string', enum: ['COMPONENTS_GROUNDED', 'SOURCE_FAITHFUL_DIAGRAM', 'UNRESOLVED'] },
    componentRefs: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'object', properties: { page: { type: 'integer' }, quote: { type: 'string' } }, required: ['page', 'quote'], additionalProperties: false } },
    reason: { type: 'string' },
  };
  const schema = {
    type: 'json_schema',
    json_schema: {
      name: 'rule_visual_referent_recovery',
      strict: true,
      schema: {
        type: 'object',
        properties: { recoveries: { type: 'array', items: { type: 'object', properties: fields, required: Object.keys(fields), additionalProperties: false } } },
        required: ['recoveries'],
        additionalProperties: false,
      },
    },
  };
  const batches = [];
  for (let offset = 0; offset < packet.candidates.length; offset += batchSize) {
    batches.push(packet.candidates.slice(offset, offset + batchSize));
  }
  const recoveries = [];
  const batchRecords = [];
  let providerCalls = 0;
  for (let index = 0; index < batches.length; index += 1) {
    const batchPacket = { ...packet, candidates: batches[index] };
    const batchInputHash = hashVisualReferentRecoveryPacket({ packet: batchPacket, provider: ai.provider, model: ai.model });
    const receiptPath = cachePath ? `${cachePath}.${batchInputHash}.response.json` : null;
    let result;
    let usage = null;
    let reused = false;
    if (receiptPath && fs.existsSync(receiptPath)) {
      const raw = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      result = validateRuleVisualReferentRecovery(batchPacket, JSON.parse(raw.content));
      usage = raw.usage || null;
      reused = true;
    } else {
      const ledger = reserveGenerationBudget(env, { inputHash: batchInputHash, contract: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT, model: ai.model, batch: index + 1, batches: batches.length });
      try {
        const run = complete ? null : createAiProviderRun({ env, maxRetries: 0, allowedProviders: [ai.provider === 'ai-integrations' ? 'openai' : ai.provider] });
        const response = await (complete || run.complete)({
          messages: [{
            role: 'user',
            content: 'For every requested RuleAtom, recover its visual referent using ONLY the supplied official excerpts and existing component inventory. This does not change rules and does not select an image. Components marked REVIEW_ONLY_EXTRACTION_HYPOTHESIS are retrieval artifacts, not eligible identities. Return COMPONENTS_GROUNDED only with existing SOURCE_GROUNDED_COMPONENT IDs directly supported by the excerpt. Replace review-only current referents rather than preserving their labels. Return SOURCE_FAITHFUL_DIAGRAM only when the excerpt establishes the teaching point but no physical component is required to teach it; never use it to avoid a missing component or supersede a trusted current component. Otherwise return UNRESOLVED. Copy a short exact substring from the supplied excerpt for every evidence row. Never cite another page, invent a component, infer a token from a name, or use outside game knowledge.\n' + JSON.stringify(batchPacket),
          }],
          options: getGenerationOptions(ai, { max_completion_tokens: 5000, response_format: schema }, 'rulebook_domain_synthesis'),
          maxRetries: 0,
          inputHash: batchInputHash,
          promptTemplateVersion: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT,
          schemaContractVersion: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT,
        });
        const raw = response.response.choices[0].message.content;
        result = validateRuleVisualReferentRecovery(batchPacket, JSON.parse(raw));
        usage = response.response.usage || null;
        if (receiptPath) write(receiptPath, { inputHash: batchInputHash, content: raw, usage, provenance: response.provenance });
        providerCalls += 1;
      } catch (error) {
        recordGenerationFailure(ledger, error);
        throw error;
      }
    }
    recoveries.push(...result.recoveries);
    batchRecords.push({ batch: index + 1, inputHash: batchInputHash, candidates: batches[index].map((candidate) => candidate.id), providerCalls: reused ? 0 : 1, reused, usage });
  }
  const result = validate({ recoveries });
  const record = {
    contract: RULE_VISUAL_REFERENT_RECOVERY_CONTRACT,
    inputHash,
    provider: ai.provider,
    model: ai.model,
    result,
    batches: batchRecords,
    providerCalls,
    reused: providerCalls === 0,
  };
  if (cachePath) write(cachePath, record);
  return record;
}

const { classifyVisualLanguage } = editorialStandard;

const TYPE_KEYWORDS = {
  component: ['composant', 'composants', 'component', 'components', 'matériel', 'materiel'],
  board: ['plateau', 'board', 'piste', 'track', 'emplacement', 'site', 'temple', 'recherche', 'supply'],
  card: ['carte', 'card', 'deck', 'paquet', 'rangée', 'artefact', 'objet', 'jouer'],
  token: ['jeton', 'token', 'ressource', 'pièce', 'garde', 'idole', 'marqueur', 'diamant', 'tablette'],
  tile: ['tuile', 'tile', 'site', 'plateau', 'lieu'],
  marker: ['marqueur', 'pion', 'explorateur', 'archéologue', 'assistant'],
  dice: ['dé', 'dice'],
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assetType(asset) {
  return String(asset.visual_kind || asset.type || asset.classification || asset.label || 'unknown').toLowerCase();
}

function resolveAssetPath(asset, manifestPath, evidenceAsset = null) {
  const manifestDir = path.dirname(manifestPath);
  const candidates = [
    asset.renderPath,
    evidenceAsset?.renderPath,
    evidenceAsset?.sourceImage,
    asset.file_path,
    asset.fileKey,
    asset.path,
    asset.file_name && path.join(manifestDir, 'images', 'all', asset.file_name),
    asset.file_name && path.join(manifestDir, asset.file_name),
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function inferVisualTypes(scene = {}) {
  const explicit = Array.isArray(scene.visual_types) ? scene.visual_types : [];
  const text = normalize([
    scene.section,
    scene.narration,
    scene.on_screen_text,
    scene.visual_intent,
  ].filter(Boolean).join(' '));
  const inferred = Object.entries(TYPE_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => text.includes(normalize(keyword))))
    .map(([type]) => type);
  return [...new Set([...explicit.map((value) => normalize(value)), ...inferred])];
}

function sourcePageScore(asset, sourcePages) {
  const pages = new Set((Array.isArray(sourcePages) ? sourcePages : []).map(Number));
  const assetPage = asset.source_page !== undefined && asset.source_page !== null
    ? Number(asset.source_page)
    : asset.sourcePage !== undefined && asset.sourcePage !== null
      ? Number(asset.sourcePage)
      : Number(asset.page_index ?? asset.pageIndex) + 1;
  // HEPHAESTUS records zero-based PDF pages, while source_page is the
  // canonical one-based identity. Normalize once, then use an exact match so
  // a cited page can never silently select its neighbour.
  return pages.has(assetPage) ? 0.32 : 0;
}

function typeScore(asset, desiredTypes) {
  if (!desiredTypes.length) return 0.08;
  const type = normalize(assetType(asset));
  if (desiredTypes.includes(type)) return 0.34;
  if (desiredTypes.includes('component') && ['focused-page-crop', 'focused-page-region', 'card', 'token', 'board', 'tile', 'marker', 'dice'].includes(type)) return 0.30;
  return 0;
}

function dimensionsScore(asset) {
  const dimensions = asset.dimensions || {};
  const width = Number(asset.width || dimensions.width || 0);
  const height = Number(asset.height || dimensions.height || 0);
  const area = width * height;
  return Math.min(0.15, Math.log10(Math.max(1, area)) / 40);
}

function isComponentOverviewScene(scene = {}) {
  const text = normalize([
    scene.section,
    scene.title,
    scene.narration,
    scene.on_screen_text,
    scene.visual_intent,
  ].filter(Boolean).join(' '));
  return /\b(composants?|components?|materiel)\b/.test(text)
    && !/\b(action|actions|jouer|play|tour|turn|placement|placer)\b/.test(text);
}

function componentPresentationPenalty(asset, scene = {}) {
  const setupText = normalize([scene.section, scene.title, scene.narration, scene.visual_intent]
    .filter(Boolean).join(' '));
  const isSetupScene = /\b(mise en place|preparation|setup)\b/.test(setupText);
  if (!isComponentOverviewScene(scene) && !isSetupScene) return 0;
  const explicitPage = asset.source_page ?? asset.sourcePage;
  const page = explicitPage !== undefined && explicitPage !== null
    ? Number(explicitPage)
    : Number(asset.page_index ?? asset.pageIndex) + 1;
  const type = normalize(assetType(asset));
  const dimensions = asset.dimensions || {};
  const width = Number(asset.width || dimensions.width || 0);
  const height = Number(asset.height || dimensions.height || 0);
  const area = width * height;
  let penalty = 0;
  // Page-one art is normally the box cover. It remains eligible as a last
  // resort, but must not outrank actual teaching components in an inventory
  // overview. Metadata scenes bypass this policy through their own contract.
  if (page === 1 && ['board', 'component', 'focused-page-crop', 'focused-page-region'].includes(type)) penalty -= 0.35;
  // A very large raster classified as a token/tile/marker is usually a
  // source illustration rather than the small physical item being named.
  // Prefer the bounded extracted instance when one is available.
  if (['token', 'tile', 'marker', 'dice', 'currency'].includes(type) && area > 500000) penalty -= 0.22;
  return penalty;
}

function languageScore(asset, scene = {}) {
  if (scene.language !== 'fr-CA') return { score: 0, audit: 'not-applicable' };
  const audit = classifyVisualLanguage({
    visualKind: asset.visual_kind || asset.type,
    assetPath: asset.renderPath || asset.path || asset.file_name,
    metadata: asset,
    language: scene.language,
  });
  if (audit === 'english-explanatory') return { score: -0.18, audit };
  if (audit === 'english-source-uncertain') return { score: -0.08, audit };
  if (audit === 'language-neutral-component' || audit === 'french-localized') return { score: 0.04, audit };
  return { score: 0, audit };
}

const LOCAL_SEMANTIC_STOP_WORDS = new Set([
  'avec', 'dans', 'pour', 'plus', 'vous', 'votre', 'leurs', 'cette', 'comme', 'sont',
  'the', 'and', 'from', 'that', 'this', 'your', 'will', 'have', 'into', 'with',
  'afin', 'sans', 'tous', 'toutes', 'sur', 'une', 'des', 'les', 'aux', 'par', 'qui',
]);

const VISUAL_TERM_ALIASES = new Map([
  ['outil', 'tool'], ['outils', 'tool'], ['carte', 'card'], ['cartes', 'card'],
  ['jeton', 'token'], ['jetons', 'token'], ['faveur', 'favor'], ['faveurs', 'favor'],
  ['de', 'dice'], ['des', 'dice'], ['dés', 'dice'], ['objectif', 'objective'], ['objectifs', 'objective'],
]);

function meaningfulTokens(value) {
  return new Set(normalize(value).split(' ')
    .map((token) => VISUAL_TERM_ALIASES.get(token) || token.replace(/s$/, ''))
    .filter((token) => token.length >= 4 && !LOCAL_SEMANTIC_STOP_WORDS.has(token)));
}

function localLayoutEvidence(asset, scene = {}) {
  const sceneTokens = meaningfulTokens([
    scene.section,
    scene.narration,
    scene.on_screen_text,
    scene.visual_intent,
  ].filter(Boolean).join(' '));
  const layoutTokens = meaningfulTokens([
    asset.label,
    asset.layout_text,
    ...(Array.isArray(asset.layout_labels) ? asset.layout_labels : []),
  ].join(' '));
  if (!sceneTokens.size || !layoutTokens.size) return { score: 0, overlap: [] };
  const overlap = [...sceneTokens].filter((token) => layoutTokens.has(token));
  return { score: Number((overlap.length / Math.min(sceneTokens.size, 8)).toFixed(3)), overlap };
}

function isProviderSemanticFailure(semanticMatch) {
  const reason = String(semanticMatch?.reason || '').toLowerCase();
  return Boolean(semanticMatch)
    && (reason.includes('vision failure') || reason.includes('credit_balance_exhausted')
      || reason.includes('insufficient_quota') || reason.includes('429')
      || reason.includes('provider unavailable') || reason.includes('provider failure'));
}

/**
 * Load and curate a Hephaestus manifest into renderer-ready candidate assets.
 * Files whose historical absolute paths are stale are resolved from the manifest
 * directory by filename, making project copies and CI workspaces portable.
 */
export function loadSourceVisualCatalog(manifestPath, options = {}) {
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return { manifestPath: manifestPath || null, assets: [], warnings: ['asset manifest unavailable'] };
  }
  const payload = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pdfPath = payload.pdf_path || payload.source?.canonicalPath || payload.source?.path;
  const verifiedPdfSha = pdfPath && fs.existsSync(pdfPath)
    ? crypto.createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex') : null;
  const qualityReportPath = options.qualityReportPath;
  const semanticReportPath = options.semanticReportPath;
  const hephaestusEvidencePath = options.hephaestusEvidencePath;
  const qualityByAssetId = new Map();
  const semanticBySceneId = new Map();
  const evidenceByAssetId = new Map();
  const bindingsByAssetId = new Map();
  const objectEvidenceByAssetId = new Map();
  const analysisByAssetId = new Map();
  if (qualityReportPath && fs.existsSync(qualityReportPath)) {
    const qualityReport = JSON.parse(fs.readFileSync(qualityReportPath, 'utf8'));
    for (const judgement of qualityReport.assets || []) {
      if (judgement?.asset_id) qualityByAssetId.set(judgement.asset_id, judgement);
    }
  }
  if (semanticReportPath && fs.existsSync(semanticReportPath)) {
    const semanticReport = JSON.parse(fs.readFileSync(semanticReportPath, 'utf8'));
    for (const sceneMatch of semanticReport.scenes || []) {
      if (sceneMatch?.scene_id) semanticBySceneId.set(sceneMatch.scene_id, sceneMatch);
      for (const candidate of sceneMatch.candidates || []) {
        const attempts = analysisByAssetId.get(candidate.asset_id) || [];
        attempts.push({ sceneId: sceneMatch.scene_id, status: candidate.status, reason: candidate.reason || null, evidencePacket: candidate.evidencePacket || null });
        analysisByAssetId.set(candidate.asset_id, attempts);
        if (candidate.status !== 'MEASURED') continue;
        const rows = objectEvidenceByAssetId.get(candidate.asset_id) || [];
        rows.push(...(candidate.objects || []).map((row) => ({ ...row, sceneId: sceneMatch.scene_id })));
        objectEvidenceByAssetId.set(candidate.asset_id, rows);
      }
    }
  }
  if (hephaestusEvidencePath && fs.existsSync(hephaestusEvidencePath)) {
    const evidence = JSON.parse(fs.readFileSync(hephaestusEvidencePath, 'utf8'));
    for (const asset of evidence.assets || []) {
      if (asset?.id) evidenceByAssetId.set(asset.id, asset);
    }
    for (const binding of evidence.componentBindings || []) {
      if (!binding?.assetId) continue;
      const bindings = bindingsByAssetId.get(binding.assetId) || [];
      bindings.push(binding);
      bindingsByAssetId.set(binding.assetId, bindings);
    }
  }
  const rawAssets = Array.isArray(payload.images) ? payload.images : [];
  const curated = curateHephaestusAssets(rawAssets);
  const assets = curated.assets
    .map((asset) => {
      const componentEvidence = evidenceByAssetId.get(asset.id) || null;
      const bindings = bindingsByAssetId.get(asset.id) || [];
      const sourcePage = componentEvidence?.pageNumber || asset.source_page || (Number.isInteger(Number(asset.page_index)) ? Number(asset.page_index) + 1 : null);
      const renderPath = resolveAssetPath(asset, manifestPath, componentEvidence);
      const nativeProvenance = nativeManifestProvenance(payload, asset, renderPath, verifiedPdfSha);
      return {
      ...asset,
      // The combined manifest is stored under production/source-visual-review,
      // while the native pixels remain under HEPHAESTUS.  Evidence owns that
      // canonical absolute path, so resolve it before relative manifest paths.
      renderPath,
      extractionMethod: asset.extractionMethod || nativeProvenance?.extractionMethod,
      nativeSourceEvidence: nativeProvenance,
      source_page: sourcePage,
      nativeWidthPx: asset.original_dimensions?.width || componentEvidence?.nativeWidthPx || asset.dimensions?.width || null,
      nativeHeightPx: asset.original_dimensions?.height || componentEvidence?.nativeHeightPx || asset.dimensions?.height || null,
      // Recovered authorized candidates carry only feature-search hypotheses
      // here. The source resolver still requires provider pixel evidence for
      // the exact component and never upgrades this metadata to a binding.
      componentRefs: asset.componentRefs || [],
      referentAliases: asset.referentAliases || asset.aliases || [],
      bindingHypotheses: bindings,
      // Derived crops carry a strictly validated parent-pixel verdict in the
      // manifest itself. Keep it alongside matcher evidence so the canonical
      // resolver, Cockpit, and replay all see the same source proof.
      objectVisualEvidence: [...(objectEvidenceByAssetId.get(asset.id) || []), ...(asset.objectVisualEvidence || [])],
      objectAnalysisAttempts: analysisByAssetId.get(asset.id) || [],
      semanticObjects: [...new Set([
        ...(asset.semanticObjects || []), asset.label, asset.category, componentEvidence?.componentName, componentEvidence?.category,
      ].filter(Boolean))],
      visualQuality: qualityByAssetId.get(asset.id) || null,
      componentEvidence,
      componentBindings: [...bindings, ...(asset.component_bindings || [])],
      provenance: {
        ...(asset.provenance || {}), ...(componentEvidence?.provenance || {}), ...(nativeProvenance || {}),
        sourcePage,
        componentBindings: bindings.map((binding) => ({ componentId: binding.componentId, confidence: binding.confidence, reviewState: binding.reviewState })),
      },
    }})
    .filter((asset) => Boolean(asset.renderPath) && asset.componentEvidence?.reviewState !== 'rejected');
  const warnings = [];
  if (assets.length === 0) warnings.push('asset manifest contains no readable component images');
  if (qualityReportPath && !fs.existsSync(qualityReportPath)) warnings.push('visual quality report unavailable');
  if (semanticReportPath && !fs.existsSync(semanticReportPath)) warnings.push('semantic visual report unavailable');
  return {
    manifestPath,
    qualityReportPath: qualityReportPath || null,
    semanticReportPath: semanticReportPath || null,
    hephaestusEvidencePath: hephaestusEvidencePath || null,
    semanticBySceneId,
    assets,
    warnings,
    stats: curated.stats,
  };
}

/**
 * Select the strongest component visual for a reviewed scene. Explicit scene
 * assignments always win; a rulebook page is returned only as a labelled
 * fallback, never disguised as a component match.
 */
export function selectSourceVisual(scene = {}, catalog = { assets: [] }, fallbackPath = null) {
  if (scene.visual_asset && fs.existsSync(scene.visual_asset)) {
    return {
      path: path.resolve(scene.visual_asset),
      kind: scene.visual_asset_kind || 'explicit-asset',
      confidence: 1,
      reason: scene.visual_asset_kind === 'automatic-asset'
        ? 'automatic-semantic-assignment'
        : 'reviewed-explicit-assignment',
      assetId: scene.visual_asset_id || null,
      sourcePage: scene.visual_source_page || scene.source_page || null,
      provenance: scene.visual_provenance || scene.provenance || null,
      languageAudit: classifyVisualLanguage({
        visualKind: scene.visual_asset_kind || 'explicit-asset',
        assetPath: scene.visual_asset,
        metadata: scene.visual_metadata || {},
        language: scene.language || 'fr-CA',
      }),
    };
  }

  const desiredTypes = inferVisualTypes(scene);
  const baseCandidates = (catalog.assets || [])
    .filter((asset) => asset.is_component !== false)
    // A visually informative duplicate may be the only extracted instance
    // located on the rulebook page cited by the scene. Keep it selectable,
    // while still excluding blank/tiny assets rejected by curation.
    .filter((asset) => asset.curation?.lowInformation !== true);
  const citedPageCandidates = baseCandidates.filter((asset) => sourcePageScore(asset, scene.source_pages) > 0);
  const qualityGateEnabled = Boolean(catalog.qualityReportPath);
  const passesVisualQa = (asset) => qualityGateEnabled
    ? (asset.visualQuality?.primary_explanatory === true && Number(asset.visualQuality.quality_score) >= 70)
    : true;
  // A cited page is the best deterministic evidence of the rule being taught.
  // When vision QA rejects every cited component, deliberately use the labelled
  // rulebook-page fallback rather than a persuasive but unrelated visual.
  const qualityCandidates = qualityGateEnabled
    ? citedPageCandidates.filter(passesVisualQa)
    : (citedPageCandidates.length > 0 ? citedPageCandidates.filter(passesVisualQa) : baseCandidates.filter(passesVisualQa));
  const semanticGateEnabled = Boolean(catalog.semanticReportPath);
  const semanticMatch = catalog.semanticBySceneId?.get(scene.id) || null;
  const isMetadataCard = scene.metadata_card === true;
  const providerSemanticFailure = isProviderSemanticFailure(semanticMatch);
  // Provider failure is UNKNOWN, never a successful pixel judgement.
  const locallyGroundedCandidates = [];
  const candidatePool = isMetadataCard
    ? qualityCandidates
    : semanticGateEnabled
    ? (!providerSemanticFailure && semanticMatch?.status === 'matched'
      ? qualityCandidates.filter((asset) => asset.id === semanticMatch.selected_asset_id)
      : locallyGroundedCandidates)
    : qualityCandidates;
  const candidates = candidatePool
    .map((asset) => {
      const curationScore = Number(asset.curation?.score || asset.confidence || 0.5) * 0.28;
      const duplicatePenalty = asset.curation?.isDuplicate ? 0.035 : 0;
      const language = languageScore(asset, scene);
      const localSemanticRecoveryBonus = providerSemanticFailure
        && !isComponentOverviewScene(scene)
        && semanticMatch?.selected_asset_id === asset.id
        && ['focused-page-crop', 'focused-page-region'].includes(asset.visual_kind)
        ? 0.18
        : 0;
      const localSemanticRecoveryTypeBonus = providerSemanticFailure
        && !isComponentOverviewScene(scene)
        && semanticMatch?.selected_asset_id === asset.id
        && ['focused-page-crop', 'focused-page-region'].includes(asset.visual_kind)
        && typeScore(asset, desiredTypes) === 0
        ? 0.30
        : 0;
      const score = curationScore + sourcePageScore(asset, scene.source_pages) + typeScore(asset, desiredTypes) + dimensionsScore(asset) + language.score - duplicatePenalty + componentPresentationPenalty(asset, scene) + localSemanticRecoveryBonus + localSemanticRecoveryTypeBonus;
      return { asset, score: Number(Math.min(1, score).toFixed(3)), languageAudit: language.audit };
    })
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  if (best && best.score >= 0.42) {
    const localEvidence = providerSemanticFailure ? localLayoutEvidence(best.asset, scene) : null;
    const assetProvenance = best.asset.provenance || {};
    const sourcePage = Number.isFinite(Number(best.asset.source_page ?? best.asset.sourcePage))
      ? Number(best.asset.source_page ?? best.asset.sourcePage)
      : Number.isFinite(Number(best.asset.page_index ?? best.asset.pageIndex))
        ? Number(best.asset.page_index ?? best.asset.pageIndex) + 1
        : Number(scene.source_pages?.[0]) || null;
    return {
      path: best.asset.renderPath,
      kind: ['focused-page-crop', 'focused-page-region'].includes(best.asset.visual_kind)
        ? best.asset.visual_kind
        : best.asset.type === 'focused-crop'
          ? 'focused-page-crop'
        : 'component',
      confidence: best.score,
      reason: providerSemanticFailure
        ? `layout-grounded-semantic-recovery:${localEvidence.overlap.join(',') || 'cited-focused-region'}`
        : `curated-component:${assetType(best.asset)}`,
      assetId: best.asset.id || null,
      sourcePage,
      visualTypes: desiredTypes,
      visualQuality: best.asset.visualQuality || null,
      componentEvidence: best.asset.componentEvidence || null,
      languageAudit: best.languageAudit,
      semanticMatch: semanticMatch || null,
      provenance: {
        ...assetProvenance,
        sourcePdfSha256: assetProvenance.sourcePdfSha256 || best.asset.sourcePdfSha256 || scene.source_pdf_sha256 || null,
        sourcePage: assetProvenance.sourcePage || assetProvenance.source_page || sourcePage,
        bbox: assetProvenance.bbox || best.asset.bbox || best.asset.normalized_bbox || null,
        assetHash: assetProvenance.assetHash || best.asset.contentHash || null,
      },
    };
  }

  if (fallbackPath) {
    const alternatives = citedPageCandidates.slice(0, 12).map((asset) => {
      const evidence = localLayoutEvidence(asset, scene);
      return {
        assetId: asset.id || null,
        kind: asset.visual_kind || asset.type || 'unknown',
        sourcePage: asset.source_page ?? ((Number(asset.page_index) + 1) || null),
        qualityScore: asset.visualQuality?.quality_score ?? null,
        semanticEvidence: evidence.score,
        rejection: providerSemanticFailure ? 'below-local-layout-semantic-threshold' : 'semantic-gate-no-match',
      };
    });
    return {
      path: fallbackPath,
      kind: 'rulebook-page-fallback',
      confidence: 0.2,
      reason: 'no-suitable-curated-component',
      fallbackReason: 'no-qualified-source-visual-after-quality-and-semantic-gates',
      alternativesConsidered: alternatives,
      fallbackMitigation: 'labelled cited rulebook page with discreet bottom-left source reference',
      sourcePage: Number(scene.source_pages?.[0]) || null,
      provenance: scene.source_pdf_sha256 ? {
        sourcePdfSha256: scene.source_pdf_sha256,
        sourcePage: Number(scene.source_pages?.[0]) || null,
        extraction: 'authoritative-rulebook-page-fallback',
      } : null,
      assetId: null,
      visualTypes: desiredTypes,
      warning: `Scene '${scene.id || 'unknown'}' fell back to the cited rule page because no curated component passed selection${semanticGateEnabled ? ' against the semantic scene match' : citedPageCandidates.length > 0 ? ' on the cited rule page' : ''}` ,
      languageAudit: classifyVisualLanguage({ visualKind: 'fallback', assetPath: fallbackPath, language: scene.language || 'fr-CA' }),
    };
  }

  return {
    path: null,
    kind: 'missing',
    confidence: 0,
    reason: 'no-visual-available',
    assetId: null,
    visualTypes: desiredTypes,
    warning: `Scene '${scene.id || 'unknown'}' has no available visual`,
  };
}

export { inferVisualTypes, resolveAssetPath };
