import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'scoring-endgame-r1', 'twelve-labs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isAssetCreateBody(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const value = readJson(filePath);
    return Boolean(value?._id && value?.method === 'direct' && value?.filename);
  } catch {
    return false;
  }
}

const repaired = [];
for (const game of ['terraforming-mars', '7-wonders-duel']) {
  const gameDir = path.join(outRoot, game);
  const provenancePath = path.join(gameDir, 'provider-provenance.json');
  if (!fs.existsSync(provenancePath)) continue;
  const provenance = readJson(provenancePath);
  const rawPath = provenance.rawResponsePath || path.join(gameDir, 'provider-response.raw.json');
  const analysisWasAttempted = provenance.attemptedStage === 'analysis' || Number(provenance.httpStatus?.analysis) >= 200;
  const rawIsUploadResponse = isAssetCreateBody(rawPath);
  if (provenance.status !== 'failed' || !analysisWasAttempted || !rawIsUploadResponse) continue;

  const preservationPath = path.join(gameDir, 'analysis-response-preservation.json');
  const assetCreatePath = path.join(gameDir, 'asset-create-response.raw.json');
  if (!fs.existsSync(assetCreatePath)) fs.copyFileSync(rawPath, assetCreatePath);
  writeJson(preservationPath, {
    provider: provenance.provider,
    model_name: provenance.model_name,
    analysisAttempted: true,
    analysisHttpStatus: provenance.httpStatus?.analysis ?? null,
    analysisResponseAvailable: false,
    rawResponseAvailable: false,
    reason: 'The historical runner stored the upload response under provider-response.raw.json after local structured-output parsing failed. No analysis body is available in the preserved artifacts; no provider response was synthesized.',
    misclassifiedArtifact: rawPath,
    misclassifiedArtifactRole: 'asset-create-response',
  });
  writeJson(provenancePath, {
    ...provenance,
    actualProviderCall: true,
    analysisResponseAvailable: false,
    rawResponsePath: null,
    rawResponseSha256: null,
    rawResponseNote: preservationPath,
    parsedResponsePath: null,
    parsedResponseSha256: null,
    parsedResponseAvailable: false,
  });
  writeJson(path.join(gameDir, 'adjudication.json'), {
    namespace: 'ADJ',
    findings: [],
    status: 'not_available',
    note: 'No adjudication was generated because the current provider response failed structured-output validation. Historical adjudication, when present, remains under the initial evidence directory.',
  });
  repaired.push({ game, preservationPath });
}

const runnerPath = path.join(outRoot, 'runner-evidence.json');
if (fs.existsSync(runnerPath)) {
  const runner = readJson(runnerPath);
  const gameProvenance = Object.fromEntries(['terraforming-mars', '7-wonders-duel'].map((game) => {
    const filePath = path.join(outRoot, game, 'provider-provenance.json');
    return [game, fs.existsSync(filePath) ? readJson(filePath) : null];
  }));
  const attempts = Object.values(gameProvenance).filter((value) => value?.attemptedStage === 'analysis' || Number(value?.httpStatus?.analysis) >= 200).length;
  writeJson(runnerPath, {
    ...runner,
    providerRequestAttempted: attempts > 0,
    actualProviderCall: attempts > 0,
    analysisCallCount: attempts,
    rawResponseAvailable: false,
    note: 'Analysis HTTP requests were made, but their response bodies were not retained by the historical runner. The absence is recorded explicitly; no synthetic provider review is present.',
  });
}

console.log(JSON.stringify({ repaired }, null, 2));
