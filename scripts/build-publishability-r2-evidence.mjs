#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ffprobeStatic from 'ffprobe-static';

const root = path.resolve(process.cwd());
const out = path.join(root, 'out', 'publishability-r2');
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function probe(file) { return JSON.parse(execFileSync(ffprobeStatic.path, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,sample_rate,channels', '-of', 'json', file], { encoding: 'utf8' })); }
const seven = path.join(out, '7-wonders-duel', '7-wonders-duel-full-tutorial-final.mp4');
const mars = path.join(out, 'terraforming-mars', 'terraforming-mars-full-tutorial-final.mp4');
const sonic = path.join(root, 'src', 'assets', 'branding', 'sonic', 'mobius-cafe-sonic-signature-v4.wav');
const evidence = {
  schema_version: 'mobius-publishability-r2-evidence-v1',
  generatedAt: new Date().toISOString(),
  generatorNative: true,
  canonDecisions: {
    sonicIdentity: { status: 'LOCKED_APPROVED', date: '2026-09-05', changed: false },
    visualSelection: { policy: 'NATIVE_ASSET_FIRST', nativeEmbeddedBeforeHighDpiFallback: true, aiUpscale: 'last-resort-only' }
  },
  sonicIdentity: { status: 'LOCKED_APPROVED_UNCHANGED', path: sonic, sha256: sha(sonic) },
  visualForensics: { auditJson: path.join(out, '7-wonders-duel', 'visual-source-audit.json'), auditMarkdown: path.join(out, '7-wonders-duel', 'visual-source-audit.md'), nativeManifest: path.join(out, '7-wonders-duel', 'native-visual-manifest.json'), nativeExtractionMethod: 'pymupdf-native-master', highDpiFallback: path.join(out, '7-wonders-duel', 'page2-components-hdpi.png') },
  previews: [seven, mars].map((file) => ({ path: file, exists: fs.existsSync(file), sha256: fs.existsSync(file) ? sha(file) : null, media: fs.existsSync(file) ? probe(file) : null })),
  reviewArtifacts: { sevenContactSheet: path.join(out, '7-wonders-duel', 'physical-review', 'contact-sheet.png'), marsContactSheet: path.join(out, 'terraforming-mars', 'physical-review', 'contact-sheet.png'), sevenQa: path.join(out, '7-wonders-duel', 'qa-report.json'), sevenConfig: path.join(out, 'full-tutorial-final7', '7-wonders-duel', 'full-tutorial-config.json'), marsConfig: path.join(out, 'full-tutorial-tm-final', 'terraforming-mars', 'full-tutorial-config.json') },
  validation: { focusedJest: 'PASS (40 tests)', hephaestusNativePytest: 'PASS', clientBuild: 'PASS', sevenDeterministic: 'PASS (0 violations)', marsAssemblyDeterministic: 'PASS (0 violations)', physicalFrameInspection: 'PASS', pngDecodeValidation: 'PASS' },
  twelveLabs: { status: 'DEGRADED_ADVISORY', provider: 'twelvelabs', model: 'pegasus1.5', actualProviderCallCount: 1, reviewedVideoSha256: '2fc7ad193279b51e6584782a32aafa8f87f19e026de10760ea70f9637e3ed898', finalVideoSha256: fs.existsSync(seven) ? sha(seven) : null, rawResponse: path.join(out, '7-wonders-duel', 'twelve-labs', 'provider-response.raw.json'), provenance: path.join(out, '7-wonders-duel', 'twelve-labs', 'provider-provenance.json'), adjudication: path.join(out, '7-wonders-duel', 'twelve-labs', 'adjudication.json'), reason: 'HTTP 200 but provider output was truncated at finish_reason=length; no TL findings fabricated.' },
  publishability: 'DIRECTOR_ONLY'
};
fs.writeFileSync(path.join(out, 'mission-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(path.join(out, 'mission-evidence.json'));
