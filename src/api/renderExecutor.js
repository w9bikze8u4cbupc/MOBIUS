import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

function parseProgress(message) {
  const match = message.match(/progress[:=]\s*(\d{1,3})/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

async function collectArtifacts(outputDir) {
  try {
    const entries = await fs.readdir(outputDir);
    return entries.map((entry) => path.join(outputDir, entry));
  } catch {
    return [];
  }
}

export async function runRenderJob(job, { onProgress, rendererCommand, rendererArgs = [], rendererCwd, outputBaseDir } = {}) {
  const command = rendererCommand || process.env.RENDERER_COMMAND || 'node';
  const script = process.env.RENDERER_SCRIPT;
  const args = [...rendererArgs];
  if (!rendererArgs.length && script) {
    args.push(script);
  }

  const baseDir = outputBaseDir || process.env.RENDER_OUTPUT_DIR || path.join(process.cwd(), 'exports', 'render-jobs');
  const jobOutputDir = path.join(baseDir, job.id);
  await fs.mkdir(jobOutputDir, { recursive: true });

  const configPath = path.join(jobOutputDir, 'render-config.json');
  await fs.writeFile(configPath, JSON.stringify(job.config, null, 2), 'utf-8');

  const finalArgs = [...args, '--config', configPath, '--output', jobOutputDir];

  return new Promise((resolve, reject) => {
    const child = spawn(command, finalArgs, {
      cwd: rendererCwd || process.cwd(),
      env: {
        ...process.env,
        RENDER_JOB_ID: job.id,
        RENDER_OUTPUT_DIR: jobOutputDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data) => {
      const text = data.toString();
      const progress = parseProgress(text);
      if (progress !== null && typeof onProgress === 'function') {
        onProgress(progress);
      }
      console.log(`[render ${job.id}] ${text.trim()}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`[render ${job.id}][stderr] ${data.toString().trim()}`);
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', async (code) => {
      if (code === 0) {
        const artifacts = await collectArtifacts(jobOutputDir);
        resolve({ artifacts });
      } else {
        reject(new Error(`Renderer exited with code ${code}`));
      }
    });
  });
}

