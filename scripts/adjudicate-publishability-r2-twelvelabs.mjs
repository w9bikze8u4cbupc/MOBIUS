#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.cwd());
const dir = path.join(root, 'out', 'publishability-r2', '7-wonders-duel', 'twelve-labs');
const provenancePath = path.join(dir, 'provider-provenance.json');
const rawPath = path.join(dir, 'provider-response.raw.json');
const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
const raw = fs.readFileSync(rawPath, 'utf8');
const rawSha = crypto.createHash('sha256').update(raw).digest('hex');
const parseStatus = { valid: false, provider: 'twelvelabs', model_name: 'pegasus1.5', reason: provenance.classification || 'invalid_structured_output', rawResponsePath: rawPath, rawResponseSha256: rawSha, tlFindingsCreated: 0 };
fs.writeFileSync(path.join(dir, 'provider-response.parsed.json'), `${JSON.stringify(parseStatus, null, 2)}\n`);
fs.writeFileSync(path.join(dir, 'adjudication.json'), `${JSON.stringify({ namespace: 'ADJ', provider: 'twelvelabs', model_name: 'pegasus1.5', status: 'DEGRADED_ADVISORY', findings: [], explanation: 'Le fournisseur a répondu HTTP 200 avec un enveloppe tronquée (finish_reason=length); aucune observation n’est transformée en TL-* sans JSON canonique validable.', sourceResponsePath: rawPath, sourceResponseSha256: rawSha }, null, 2)}\n`);
const runnerPath = path.join(root, 'out', 'publishability-r2', '7-wonders-duel', 'runner-evidence.json');
const runner = fs.existsSync(runnerPath) ? JSON.parse(fs.readFileSync(runnerPath, 'utf8')) : {};
runner.status = 'DEGRADED_ADVISORY';
runner.externalResponsePreserved = true;
runner.tlFindingsCreated = 0;
runner.blockingProductState = false;
fs.writeFileSync(runnerPath, `${JSON.stringify(runner, null, 2)}\n`);
console.log(JSON.stringify({ status: 'DEGRADED_ADVISORY', tlFindings: 0, rawResponseSha256: rawSha, adjudication: path.join(dir, 'adjudication.json') }, null, 2));
