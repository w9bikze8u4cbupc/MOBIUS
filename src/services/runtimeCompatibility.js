import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { HEPHAESTUS_MANIFEST_CONTRACT } from './hephaestusMaterialization.js';

export const RUNTIME_CAPABILITY_CONTRACT = 'mobius-runtime-capabilities-v1';
export const PROJECT_SOURCE_DESCRIPTOR_CONTRACT = 'mobius-project-source-v1';
export const CANONICAL_PRODUCTION_STAGE_CONTRACT = 'mobius-canonical-production-stages-v1';
export const PROJECT_CONTEXT_PERSISTENCE_CONTRACT = 'mobius-project-context-persistence-v1';
export const RENDERER_QA_COMPATIBILITY_CONTRACT = 'mobius-normal-production-qa-v1';

export const CANONICAL_RUNTIME_CONTRACTS = Object.freeze({
  sourceDescriptor: PROJECT_SOURCE_DESCRIPTOR_CONTRACT,
  hephaestusMaterialization: HEPHAESTUS_MANIFEST_CONTRACT,
  canonicalProductionStages: CANONICAL_PRODUCTION_STAGE_CONTRACT,
  projectContextPersistence: PROJECT_CONTEXT_PERSISTENCE_CONTRACT,
  rendererQa: RENDERER_QA_COMPATIBILITY_CONTRACT,
});

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizedRoot(value) {
  return path.resolve(String(value || process.cwd())).replace(/\\/g, '/').toLowerCase();
}

export function resolveGitIdentity({ cwd = process.cwd(), env = process.env } = {}) {
  if (env.MOBIUS_BUILD_SHA && /^[a-f0-9]{40}$/i.test(env.MOBIUS_BUILD_SHA)) {
    return env.MOBIUS_BUILD_SHA.toLowerCase();
  }
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().toLowerCase();
  } catch {
    return `unversioned-${sha256(normalizedRoot(cwd)).slice(0, 16)}`;
  }
}

export function buildWorkerRuntimeRequirements({ cwd = process.cwd(), env = process.env } = {}) {
  const buildIdentity = resolveGitIdentity({ cwd, env });
  return {
    contract: RUNTIME_CAPABILITY_CONTRACT,
    workerIdentity: buildIdentity,
    requiredContracts: { ...CANONICAL_RUNTIME_CONTRACTS },
  };
}

export function buildApiRuntimeCapabilities({ cwd = process.cwd(), env = process.env, startedAt = new Date().toISOString() } = {}) {
  const runtimeIdentity = resolveGitIdentity({ cwd, env });
  const contracts = { ...CANONICAL_RUNTIME_CONTRACTS };
  const deploymentRoot = env.MOBIUS_RUNTIME_DEPLOYMENT_ROOT || cwd;
  const ownershipToken = env.MOBIUS_RUNTIME_OWNERSHIP_TOKEN || '';
  return {
    contract: RUNTIME_CAPABILITY_CONTRACT,
    runtimeIdentity,
    runtimeFingerprint: sha256(JSON.stringify({ runtimeIdentity, contracts })),
    startedAt,
    contracts,
    process: {
      pid: process.pid,
      platform: process.platform,
      node: process.version,
    },
    ownership: {
      manager: env.MOBIUS_RUNTIME_MANAGER || 'unmanaged',
      deploymentRootFingerprint: sha256(normalizedRoot(deploymentRoot)),
      tokenFingerprint: ownershipToken ? sha256(ownershipToken) : null,
    },
  };
}

export function evaluateRuntimeCompatibility(capabilities, requirements) {
  const reasons = [];
  if (!capabilities || capabilities.contract !== RUNTIME_CAPABILITY_CONTRACT) {
    reasons.push('legacy-or-missing-capability-contract');
  }
  const available = capabilities?.contracts || {};
  for (const [name, required] of Object.entries(requirements?.requiredContracts || {})) {
    if (available[name] !== required) reasons.push(`${name}:${available[name] || 'missing'}!=${required}`);
  }
  return {
    compatible: reasons.length === 0,
    reasons,
    workerIdentity: requirements?.workerIdentity || null,
    apiRuntimeIdentity: capabilities?.runtimeIdentity || null,
    sameBuild: Boolean(requirements?.workerIdentity && capabilities?.runtimeIdentity === requirements.workerIdentity),
    requiredContracts: requirements?.requiredContracts || {},
    availableContracts: available,
  };
}

export class RuntimeCompatibilityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeCompatibilityError';
    this.code = code;
    this.classification = 'retryable_runtime';
    Object.assign(this, details);
  }
}

async function fetchCapabilities({ baseUrl, apiKey, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(`${String(baseUrl).replace(/\/$/, '')}/api/runtime/capabilities`, {
      headers: apiKey ? { 'x-api-key': apiKey, 'x-mobius-api-key': apiKey } : {},
    });
  } catch (cause) {
    throw new RuntimeCompatibilityError('RUNTIME_API_UNAVAILABLE', `MOBIUS API runtime is unavailable: ${cause.message}`, { cause });
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new RuntimeCompatibilityError('RUNTIME_API_UNAVAILABLE', `MOBIUS API capability preflight failed (${response.status}).`, { status: response.status, response: body });
  }
  return body;
}

export async function preflightRuntimeCompatibility({
  baseUrl,
  apiKey,
  fetchImpl = fetch,
  requirements = buildWorkerRuntimeRequirements(),
  alignRuntime = null,
} = {}) {
  let capabilities;
  let firstError = null;
  try {
    capabilities = await fetchCapabilities({ baseUrl, apiKey, fetchImpl });
  } catch (error) {
    firstError = error;
  }
  let compatibility = firstError
    ? { compatible: false, reasons: [firstError.code || 'runtime-unavailable'] }
    : evaluateRuntimeCompatibility(capabilities, requirements);
  let alignment = { attempted: false, aligned: false, reason: null };

  if (!compatibility.compatible && alignRuntime) {
    alignment = await alignRuntime({ baseUrl, requirements, capabilities, compatibility, error: firstError });
    if (alignment?.attempted) {
      capabilities = await fetchCapabilities({ baseUrl, apiKey, fetchImpl });
      compatibility = evaluateRuntimeCompatibility(capabilities, requirements);
      if (compatibility.compatible) alignment = { ...alignment, aligned: true };
    }
  }

  if (!compatibility.compatible) {
    if (firstError && !alignment?.attempted) throw firstError;
    throw new RuntimeCompatibilityError(
      'RUNTIME_CONTRACT_MISMATCH',
      `MOBIUS API runtime does not satisfy worker contracts: ${compatibility.reasons.join(', ')}`,
      { capabilities, requirements, compatibility, alignment, initialError: firstError },
    );
  }
  return { capabilities, requirements, compatibility, alignment };
}
