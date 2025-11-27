#!/usr/bin/env node
// Bridge script to sync captions/localization config from Python into Node-consumable JSON.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run() {
  const result = spawnSync('python', ['-m', 'mobius.config_models', '--dump-captions-localization'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    console.error('Failed to dump captions/localization config from Python');
    if (result.stderr) {
      console.error(result.stderr.trim());
    }
    process.exit(result.status || 1);
  }

  const payload = JSON.parse(result.stdout);
  const { captions, localization } = payload;

  const configDir = path.join(process.cwd(), 'config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const captionsPath = path.join(configDir, 'captions.generated.json');
  const localizationPath = path.join(configDir, 'localization.generated.json');

  fs.writeFileSync(captionsPath, JSON.stringify(captions, null, 2));
  fs.writeFileSync(localizationPath, JSON.stringify(localization, null, 2));

  console.log('Wrote generated caption/localization configs:', {
    captionsPath,
    localizationPath,
  });
}

run();
