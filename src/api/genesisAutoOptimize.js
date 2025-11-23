// src/api/genesisAutoOptimize.js

import { spawn } from 'child_process';

export function runGenesisAutoOptimize(projectId) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python', ['scripts/genesis_auto_optimize.py', '--project-id', String(projectId)], {
      stdio: 'inherit',
    });

    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`auto_optimize exited with code ${code}`));
    });
  });
}
