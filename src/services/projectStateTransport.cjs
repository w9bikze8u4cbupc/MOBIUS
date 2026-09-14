'use strict';

const { createHash } = require('node:crypto');
const CONTRACT = 'mobius-project-state-transport-v1';
const API_LIMIT_BYTES = 25 * 1024 * 1024;
const TRANSPORT_BUDGET_BYTES = 20 * 1024 * 1024;
const EXPANDED_BUDGET_BYTES = 192 * 1024 * 1024;
const bytes = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function failure(message, code = 'PROJECT_STATE_INVALID') {
  return Object.assign(new Error(message), { code, statusCode: code === 'PROJECT_STATE_TOO_LARGE' ? 413 : 400, classification: 'recovery_required' });
}
function assertBudget(value, budget = TRANSPORT_BUDGET_BYTES) {
  const size = bytes(value);
  if (size > budget) throw failure(`Project state is ${size} UTF-8 bytes; budget is ${budget}. Explicit recovery is required.`, 'PROJECT_STATE_TOO_LARGE');
  return size;
}

// Shared visual evidence belongs to the SAME project context, not to every
// scene/plan/review occurrence of its candidate. Dynamic scores stay inline.
const VISUAL_EVIDENCE_CONTRACT='mobius-project-visual-evidence-references-v1';
const EVIDENCE_FIELDS=['sourceRefs','provenance','objectVisualEvidence','objectAnalysisAttempts','bindingHypotheses'];
function compactVisualEvidence(body) {
  const dictionary={...(body.projectContext?.visualEvidence?.entries||{})};
  function visit(value){
    if(Array.isArray(value))return value.map(visit);
    if(!value||typeof value!=='object')return value;
    const result={};
    for(const [key,child] of Object.entries(value))result[key]=key==='visualEvidence'?child:visit(child);
    if(value.candidate?.id && !value.candidate.visualEvidenceRef){
      const id=digest(value.candidate);dictionary[id]=value.candidate;
      result.candidate={id:value.candidate.id,visualEvidenceRef:id};
    }
    if(typeof value.assetId==='string' && Array.isArray(value.rejectionReasons)){
      const evidence=Object.fromEntries(EVIDENCE_FIELDS.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
      if(Object.keys(evidence).length){const id=digest(evidence);dictionary[id]=evidence;for(const key of EVIDENCE_FIELDS)delete result[key];result.visualEvidenceRef=id;}
    }
    return result;
  }
  const result=visit(body);
  if(Object.keys(dictionary).length)result.projectContext={...result.projectContext,visualEvidence:{contract:VISUAL_EVIDENCE_CONTRACT,entries:dictionary}};
  validateVisualEvidenceReferences(result);
  return result;
}
function validateVisualEvidenceReferences(body){
  const registry=body.projectContext?.visualEvidence;
  if(registry && (registry.contract!==VISUAL_EVIDENCE_CONTRACT||!registry.entries))throw failure('Unsupported visual evidence registry.');
  const entries=registry?.entries||{};
  for(const [id,evidence] of Object.entries(entries))if(digest(evidence)!==id)throw failure('Visual evidence checksum mismatch.');
  function visit(value){if(!value||typeof value!=='object')return;
    if(value.visualEvidenceRef && !Object.hasOwn(entries,value.visualEvidenceRef))throw failure('Missing visual evidence reference.');
    for(const [key,child] of Object.entries(value))if(key!=='visualEvidence')visit(child);
  }
  visit(body);
}
function hydrateVisualReviewItem(item,registry){
  return {...item,candidates:(item.candidates||[]).map(candidate=>{
    if(!candidate.visualEvidenceRef)return candidate;
    const evidence=registry?.entries?.[candidate.visualEvidenceRef];
    if(!evidence||digest(evidence)!==candidate.visualEvidenceRef)throw failure('Visual review evidence missing or corrupt.');
    const {visualEvidenceRef,...inline}=candidate;
    return {...inline,...evidence};
  })};
}

// Tagged nodes cannot collide with user JSON keys. Content-addressed definitions
// keep every candidate, score and source exactly once, without truncating lists.
function packProjectState(value) {
  const clean = JSON.parse(JSON.stringify(value));
  assertBudget(clean, EXPANDED_BUDGET_BYTES);
  const definitions = Object.create(null);
  // Page excerpts, paths and object-specific explanations recur in different
  // containers. Object-only interning left every such string inline. Existing
  // v1 refs already support primitive definitions, so historical readers remain
  // compatible; no compression, schema migration or evidence truncation.
  const strings = new Map();
  function countStrings(v) {
    if (typeof v === 'string' && v.length >= 128) strings.set(v, (strings.get(v) || 0) + 1);
    else if (v && typeof v === 'object') for (const x of Object.values(v)) countStrings(x);
  }
  countStrings(clean);
  function encode(v, depth = 0) {
    if (depth > 128) throw failure('Project state nesting exceeds the contract.');
    if (typeof v === 'string' && (strings.get(v) || 0) >= 3) {
      const hash = digest(v);
      definitions[hash] = v;
      return ['ref', hash];
    }
    if (!v || typeof v !== 'object') return v;
    const node = Array.isArray(v) ? ['array', v.map(x => encode(x, depth + 1))]
      : ['object', Object.entries(v).map(([k, x]) => [k, encode(x, depth + 1)])];
    if (bytes(node) < 256) return node;
    const hash = digest(node);
    definitions[hash] = node;
    return ['ref', hash];
  }
  const root = encode(clean);
  const envelope = { contract: CONTRACT, expandedBytes: bytes(clean), root, definitions };
  assertBudget(envelope);
  return envelope;
}

function unpackProjectState(envelope) {
  if (!envelope || envelope.contract !== CONTRACT) throw failure('Unsupported project state transport contract.');
  assertBudget(envelope);
  const definitions = envelope.definitions;
  if (!definitions || Array.isArray(definitions) || typeof definitions !== 'object') throw failure('Missing state definitions.');
  const memo = new Map(); const active = new Set(); const used = new Set();
  function decode(node, depth = 0) {
    if (depth > 128) throw failure('Project state nesting exceeds the contract.');
    if (!Array.isArray(node)) {
      if (node !== null && typeof node === 'object') throw failure('Untagged state object.');
      return { value: node, size: bytes(node) };
    }
    if (node.length !== 2) throw failure('Invalid state node.');
    const [tag, payload] = node;
    if (tag === 'ref') {
      if (typeof payload !== 'string' || !/^[a-f0-9]{64}$/.test(payload) || !Object.hasOwn(definitions, payload)) throw failure('Missing state reference.');
      used.add(payload);
      if (memo.has(payload)) return memo.get(payload);
      if (active.has(payload)) throw failure('Cyclic state reference.');
      if (digest(definitions[payload]) !== payload) throw failure('State reference checksum mismatch.');
      active.add(payload); const result = decode(definitions[payload], depth + 1); active.delete(payload); memo.set(payload, result); return result;
    }
    if (!['array', 'object'].includes(tag) || !Array.isArray(payload)) throw failure('Invalid state container.');
    const value = tag === 'array' ? [] : {}; let size = 2; const keys = new Set();
    for (const part of payload) {
      let key; let child = part;
      if (tag === 'object') {
        if (!Array.isArray(part) || part.length !== 2 || typeof part[0] !== 'string' || keys.has(part[0])) throw failure('Invalid state property.');
        [key, child] = part; keys.add(key); size += bytes(key) + 1;
      }
      const decoded = decode(child, depth + 1); size += decoded.size + 1;
      if (size > EXPANDED_BUDGET_BYTES) throw failure('Expanded project state exceeds budget.', 'PROJECT_STATE_TOO_LARGE');
      if (tag === 'array') value.push(decoded.value);
      else Object.defineProperty(value, key, { value: decoded.value, enumerable: true, writable: true, configurable: true });
    }
    if (payload.length) size--;
    return { value, size };
  }
  const result = decode(envelope.root);
  if (result.size !== envelope.expandedBytes || used.size !== Object.keys(definitions).length) throw failure('State size or reference inventory mismatch.');
  // Return independent objects, just as the historical JSON transport did.
  return JSON.parse(JSON.stringify(result.value));
}

// Keep the historical DB row interface for every Cockpit/render/recovery caller.
// Only its on-disk representation changes; old rows remain readable.
const JSON_FIELDS = ['metadata', 'components', 'images', 'scenes'];
function packProjectRow(row) {
  const logical = { ...row }; const jsonFields = [];
  for (const field of JSON_FIELDS) {
    if (typeof row[field] !== 'string') continue;
    try {
      const parsed = JSON.parse(row[field]);
      if (JSON.stringify(parsed) === row[field]) { logical[field] = parsed; jsonFields.push(field); }
    } catch { /* Preserve legacy opaque fields. */ }
  }
  return { storageContract: CONTRACT, jsonFields, state: packProjectState(logical) };
}
function unpackProjectRow(row) {
  if (!row?.storageContract) return row;
  if (row.storageContract !== CONTRACT) throw failure('Unsupported stored state contract.');
  const logical = unpackProjectState(row.state);
  for (const field of row.jsonFields) {
    if (!JSON_FIELDS.includes(field)) throw failure('Invalid serialized row field.');
    logical[field] = JSON.stringify(logical[field]);
  }
  return logical;
}
function bodyErrorHandler(error, req, res, next) {
  if (error?.type === 'entity.too.large' && /^\/api\/projects\/[^/]+\/production-state$/.test(req.path)) {
    return res.status(413).json({ code: 'PROJECT_STATE_TOO_LARGE', classification: 'recovery_required', error: 'Production state exceeds the API transport limit. Explicit recovery is required.' });
  }
  return next(error);
}
module.exports = { CONTRACT, VISUAL_EVIDENCE_CONTRACT, compactVisualEvidence, validateVisualEvidenceReferences, hydrateVisualReviewItem, API_LIMIT_BYTES, TRANSPORT_BUDGET_BYTES, EXPANDED_BUDGET_BYTES, bytes, assertBudget, packProjectState, unpackProjectState, packProjectRow, unpackProjectRow, bodyErrorHandler };
