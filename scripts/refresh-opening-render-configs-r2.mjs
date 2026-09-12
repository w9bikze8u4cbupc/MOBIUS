#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { BRAND_AUDIO_CONTRACT } = require('../src/services/editorialStandard.cjs');
const root = process.cwd();
const sharedSignature = path.resolve(root, 'out/mission-01/shared/mobius-cafe-sonic-signature.wav');
for (const game of ['terraforming-mars', '7-wonders-duel']) {
  const file = path.resolve(root, `out/mission-01/${game}/render-config.json`);
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  config.editorial = { ...(config.editorial || {}), brandAudio: BRAND_AUDIO_CONTRACT };
  for (const scene of config.scenes || []) {
    scene.editorial = { ...(scene.editorial || {}), brandAudio: BRAND_AUDIO_CONTRACT };
    if (scene.audio?.ambientFile && scene.audio.ambientFile.includes('mobius-cafe-sonic-signature')) scene.audio.ambientFile = sharedSignature;
  }
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ game, path: file, brandAudioVersion: BRAND_AUDIO_CONTRACT.version, signaturePath: sharedSignature }));
}
