#!/usr/bin/env node

import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.resolve(process.cwd());
const expectedRoot = 'C:\\mobius-games-tutorial-generator-quality-fix';
if (root !== expectedRoot) throw new Error(`Run from ${expectedRoot}.`);

const envPath = path.join(root, '.env');
const outputDir = path.join(root, 'out', 'mission-01', 'twelve-labs-calibration', 'r3', 'auth-probe');
fs.mkdirSync(outputDir, { recursive: true });
if (!fs.existsSync(envPath)) throw new Error('Root .env is missing.');

const envText = fs.readFileSync(envPath, 'utf8');
const parsed = dotenv.parse(envText);
dotenv.config({ path: envPath, override: true });
const variableName = String(parsed.TWELVELABS_API_KEY || '').trim()
  ? 'TWELVELABS_API_KEY'
  : String(parsed.TWELVE_LABS_API_KEY || '').trim()
    ? 'TWELVE_LABS_API_KEY'
    : null;
const rawMatch = envText.match(/^\s*(TWELVELABS_API_KEY|TWELVE_LABS_API_KEY)\s*=([^\r\n]*)(?:\r?\n|$)/m);
const rawValue = rawMatch?.[2] ?? '';
const parsedValue = String(variableName ? parsed[variableName] : '').trim();
const normalize = (value) => {
  let clean = String(value || '').replace(/[\r\n]/g, '').trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) clean = clean.slice(1, -1).trim();
  return clean;
};
const normalizedValue = normalize(rawValue);
const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const ignored = (() => { try { execFileSync('git', ['check-ignore', '-q', '.env'], { cwd: root }); return true; } catch { return false; } })();
const safeDiagnostics = {
  envFileExists: true,
  gitIgnored: ignored,
  variablePresent: Boolean(parsedValue),
  startsWithExpectedKeyPrefixFormat: /^(?:tlk_|tl_)[A-Za-z0-9._-]{8,}$/.test(parsedValue),
  length: parsedValue.length,
  hasLeadingWhitespace: rawValue !== rawValue.trimStart(),
  hasTrailingWhitespace: rawValue !== rawValue.trimEnd(),
  containsQuotes: /['"]/.test(rawValue),
  containsLineBreak: /[\r\n]/.test(rawValue),
  containsNonAscii: /[^\x00-\x7F]/.test(rawValue),
  rawEnvAndDotenvHashesMatch: sha(rawValue) === sha(parsedValue),
  dotenvAndAdapterHashesMatch: null,
};

// The adapter is imported only after explicit dotenv loading. It is used here
// for a hash comparison, never for the direct provider request below.
const adapter = await import('../src/services/twelveLabsVideoReview.js');
const adapterConfig = adapter.getTwelveLabsConfig(process.env);
safeDiagnostics.dotenvAndAdapterHashesMatch = sha(parsedValue) === sha(adapterConfig.apiKey || '');
console.log(JSON.stringify(safeDiagnostics));

const url = 'https://api.twelvelabs.io/v1.3/indexes?page=1&page_limit=1';
const attempts = [];
async function directProbe(key, reason) {
  const startedAt = Date.now();
  const requestTimestamp = new Date().toISOString();
  const response = await fetch(url, { method: 'GET', headers: { 'x-api-key': key } });
  const bodyText = await response.text();
  const responseTimestamp = new Date().toISOString();
  let payload = null;
  try { payload = bodyText ? JSON.parse(bodyText) : null; } catch {}
  attempts.push({
    reason,
    requestTimestamp,
    responseTimestamp,
    latencyMs: Date.now() - startedAt,
    status: response.status,
    statusText: response.statusText || null,
    bodyText,
    payload,
    headers: Object.fromEntries([...response.headers.entries()].filter(([name]) => /^x-api-version$|^x-request-id$|^request-id$|^x-ratelimit-|^retry-after$/i.test(name))),
  });
  return attempts.at(-1);
}

if (!parsedValue) throw new Error('Credential is absent after explicit dotenv loading.');
const first = await directProbe(parsedValue, 'dotenv-parsed-value');
if (first.status !== 200 && normalizedValue !== parsedValue && normalizedValue) await directProbe(normalizedValue, 'normalized-value-after-diagnostic-change');
const finalAttempt = attempts.at(-1);
const scrub = (text) => String(text || '').replaceAll(parsedValue, '[REDACTED]').replaceAll(normalizedValue, '[REDACTED]');
const safeAttempts = attempts.map((attempt) => ({ ...attempt, bodyText: scrub(attempt.bodyText) }));
const providerPayload = finalAttempt?.payload || {};
const rawResponsePath = path.join(outputDir, 'response.raw.json');
fs.writeFileSync(rawResponsePath, JSON.stringify({ provider: 'twelvelabs', rawBody: scrub(finalAttempt?.bodyText || ''), status: finalAttempt?.status ?? null }, null, 2) + '\n');
fs.writeFileSync(path.join(outputDir, 'request.redacted.json'), JSON.stringify({ url, method: 'GET', outboundHeaderNames: ['x-api-key'], forbiddenHeadersAbsent: ['Authorization', 'Content-Type'], attempts: attempts.length }, null, 2) + '\n');
fs.writeFileSync(path.join(outputDir, 'provenance.json'), JSON.stringify({
  provider: 'twelvelabs', baseUrl: 'https://api.twelvelabs.io/v1.3', url, method: 'GET', variableName,
  safeDiagnostics, attempts: safeAttempts.map(({ bodyText, payload, ...attempt }) => ({ ...attempt, providerErrorCode: payload?.code || payload?.error?.code || null, providerErrorMessage: payload?.message || payload?.error?.message || payload?.error || null, responseBodySha256: sha(scrub(bodyText)) })),
  finalStatus: finalAttempt?.status ?? null, xApiVersion: finalAttempt?.headers?.['x-api-version'] || null,
  requestIdHeaders: Object.fromEntries(Object.entries(finalAttempt?.headers || {}).filter(([name]) => /request-id/i.test(name))),
  rateLimitHeaders: Object.fromEntries(Object.entries(finalAttempt?.headers || {}).filter(([name]) => /ratelimit|retry-after/i.test(name))),
  responseRawPath: rawResponsePath, responseRawSha256: sha(fs.readFileSync(rawResponsePath)),
  note: 'Direct built-in fetch probe; repository adapter was not used for the request.',
}, null, 2) + '\n');

console.log(JSON.stringify({ status: finalAttempt?.status ?? null, attempts: attempts.length, directAuthenticationSucceeded: finalAttempt?.status === 200, responseRawPath: rawResponsePath }, null, 2));
