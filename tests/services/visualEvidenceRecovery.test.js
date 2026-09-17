const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildRecovery, loadRecovery, writeRecovery, VISUAL_EVIDENCE_RECOVERY_CONTRACT } = require('../../src/services/visualEvidenceRecovery.cjs');

const sourceSha = 'a'.repeat(64);
const imageSha = 'b'.repeat(64);

function report(asset = {}) {
  return { scenes: [{ planValidation: { selectedAssets: [{
    id: 'old-crop', sourcePdfSha256: sourceSha, contentHash: imageSha,
    objectVisualEvidence: [{ visualRole: 'TRACK', present: true, complete: true, isolated: true, assetId: 'old-crop' }],
    ...asset,
  }] } }] };
}

test('recovers only measured source evidence owned by the same project PDF', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-evidence-recovery-'));
  try {
    const input = path.join(root, 'historical.json');
    const output = path.join(root, 'recovered.json');
    fs.writeFileSync(input, JSON.stringify(report()));
    const recovery = buildRecovery({ projectId: 'project', sourceSha256: sourceSha, inputPath: input });
    expect(recovery.contract).toBe(VISUAL_EVIDENCE_RECOVERY_CONTRACT);
    expect(recovery.reports[0].assets).toHaveLength(1);
    writeRecovery({ outputPath: output, recovery });
    expect(loadRecovery({ recoveryPath: output, projectId: 'project', sourceSha256: sourceSha })).toHaveLength(1);
    expect(loadRecovery({ recoveryPath: output, projectId: 'other', sourceSha256: sourceSha })).toEqual([]);
    expect(loadRecovery({ recoveryPath: output, projectId: 'project', sourceSha256: 'c'.repeat(64) })).toEqual([]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('does not recover an asset whose immutable source PDF identity differs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-evidence-recovery-'));
  try {
    const input = path.join(root, 'historical.json');
    fs.writeFileSync(input, JSON.stringify(report({ sourcePdfSha256: 'c'.repeat(64) })));
    expect(() => buildRecovery({ projectId: 'project', sourceSha256: sourceSha, inputPath: input }))
      .toThrow('RECOVERABLE_VISUAL_EVIDENCE_NOT_FOUND');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
