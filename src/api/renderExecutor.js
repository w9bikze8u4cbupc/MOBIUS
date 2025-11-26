import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const moduleDirname = path.join(process.cwd(), 'src', 'api');
export const RENDER_OUTPUT_BASE =
  process.env.JOB_RESULTS_DIR || path.join(moduleDirname, 'uploads', 'render-jobs');

function parseProgress(line) {
  const match = line.match(/progress[:=]\s*(\d{1,3})/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, value));
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function writeConfig(jobOutputDir, jobId, config) {
  const configPath = path.join(jobOutputDir, `${jobId}-config.json`);
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

function buildCommand({ jobId, configPath, jobOutputDir }) {
  const rendererCommand = process.env.RENDERER_COMMAND;
  const rendererArgsEnv = process.env.RENDERER_ARGS || '';
  const rendererEntrypoint = process.env.RENDERER_ENTRYPOINT;

  if (!rendererCommand && !rendererEntrypoint) {
    throw new Error('RENDERER_COMMAND_NOT_CONFIGURED');
  }

  const args = rendererArgsEnv
    .split(/\s+/)
    .map((arg) => arg.trim())
    .filter(Boolean);

  if (rendererEntrypoint) {
    args.push(rendererEntrypoint);
  }

  args.push('--job-id', jobId, '--config', configPath, '--output', jobOutputDir);

  return {
    command: rendererCommand || 'node',
    args,
  };
}

async function collectArtifacts(jobOutputDir, publicBasePath) {
  const files = await fs.promises.readdir(jobOutputDir);
  return files.map((file) => path.join(publicBasePath, file));
}

export async function runRenderJob(job, options = {}) {
  const jobOutputDir = path.join(options.outputBaseDir || RENDER_OUTPUT_BASE, job.id);
  const publicBasePath = path.join('/uploads/render-jobs', job.id);
  await ensureDir(jobOutputDir);

  const configPath = await writeConfig(jobOutputDir, job.id, job.config);
  const { command, args } = buildCommand({ jobId: job.id, configPath, jobOutputDir });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env },
      cwd: process.cwd(),
    });

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      text
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => {
          const progress = parseProgress(line);
          if (progress !== null && typeof options.onProgress === 'function') {
            options.onProgress(progress);
          }
        });
    });

    const stderrLines = [];
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderrLines.push(text);
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('exit', async (code) => {
      if (code === 0) {
        try {
          const artifacts = await collectArtifacts(jobOutputDir, publicBasePath);
          resolve(artifacts);
        } catch (err) {
          reject(err);
        }
      } else {
        const error = new Error(
          `Render process exited with code ${code}: ${stderrLines.join('\n').trim()}`,
        );
        reject(error);
      }
    });
  });
}
