import {
  RUNTIME_CAPABILITY_CONTRACT,
  buildApiRuntimeCapabilities,
  buildWorkerRuntimeRequirements,
  evaluateRuntimeCompatibility,
  preflightRuntimeCompatibility,
} from '../../src/services/runtimeCompatibility.js';

const requirements = buildWorkerRuntimeRequirements({ cwd: process.cwd(), env: { MOBIUS_BUILD_SHA: '1'.repeat(40) } });

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('canonical runtime compatibility', () => {
  test('same SHA and compatible contracts pass', () => {
    const capabilities = buildApiRuntimeCapabilities({ cwd: process.cwd(), env: { MOBIUS_BUILD_SHA: '1'.repeat(40) } });
    expect(evaluateRuntimeCompatibility(capabilities, requirements)).toMatchObject({ compatible: true, sameBuild: true });
  });

  test('different SHA and compatible contracts pass', () => {
    const capabilities = buildApiRuntimeCapabilities({ cwd: process.cwd(), env: { MOBIUS_BUILD_SHA: '2'.repeat(40) } });
    expect(evaluateRuntimeCompatibility(capabilities, requirements)).toMatchObject({ compatible: true, sameBuild: false });
  });

  test('legacy and stale capability responses are rejected', () => {
    expect(evaluateRuntimeCompatibility({ status: 'ok' }, requirements).compatible).toBe(false);
    const stale = buildApiRuntimeCapabilities({ env: { MOBIUS_BUILD_SHA: '2'.repeat(40) } });
    delete stale.contracts.hephaestusMaterialization;
    expect(evaluateRuntimeCompatibility(stale, requirements).reasons).toContain(
      'hephaestusMaterialization:missing!=mobius-hephaestus-materialization-v1',
    );
  });

  test('an API without the domain-synthesis stage contract is rejected before production', () => {
    const stale = buildApiRuntimeCapabilities({ env: { MOBIUS_BUILD_SHA: '2'.repeat(40) } });
    stale.contracts.canonicalProductionStages = 'mobius-canonical-production-stages-v1';
    expect(evaluateRuntimeCompatibility(stale, requirements)).toMatchObject({ compatible: false });
  });

  test('unavailable API reports a truthful retryable runtime state', async () => {
    await expect(preflightRuntimeCompatibility({
      baseUrl: 'http://fixture.local', requirements,
      fetchImpl: async () => { throw new Error('offline'); },
    })).rejects.toMatchObject({ code: 'RUNTIME_API_UNAVAILABLE', classification: 'retryable_runtime' });
  });

  test('safe canonical alignment is rechecked before passing', async () => {
    const current = buildApiRuntimeCapabilities({ env: { MOBIUS_BUILD_SHA: '2'.repeat(40) } });
    const stale = { contract: RUNTIME_CAPABILITY_CONTRACT, runtimeIdentity: '0'.repeat(40), contracts: {} };
    let requests = 0;
    const alignRuntime = jest.fn(async () => ({ attempted: true, aligned: false }));
    const result = await preflightRuntimeCompatibility({
      baseUrl: 'http://fixture.local', requirements, alignRuntime,
      fetchImpl: async () => response(++requests === 1 ? stale : current),
    });
    expect(alignRuntime).toHaveBeenCalledTimes(1);
    expect(requests).toBe(2);
    expect(result.compatibility.compatible).toBe(true);
    expect(result.alignment.aligned).toBe(true);
  });

  test('already-compatible runtime does not restart', async () => {
    const capabilities = buildApiRuntimeCapabilities({ env: { MOBIUS_BUILD_SHA: '2'.repeat(40) } });
    const alignRuntime = jest.fn();
    await preflightRuntimeCompatibility({
      baseUrl: 'http://fixture.local', requirements, alignRuntime,
      fetchImpl: async () => response(capabilities),
    });
    expect(alignRuntime).not.toHaveBeenCalled();
  });
});
