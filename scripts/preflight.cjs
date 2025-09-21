#!/usr/bin/env node
 
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const http = require('http');
const https = require('https');
const { URL } = require('url');

function getArg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}

const BASE = getArg('--base', process.env.BASE || '');
const OUTPUT_DIR = getArg('--output-dir', process.env.OUTPUT_DIR || path.resolve('dist'));
const UPLOADS_DIR = getArg('--uploads-dir', process.env.UPLOADS_DIR || path.resolve('src/api/uploads'));
const REQUIRE_TTS = hasFlag('--require-tts');
const STRICT = hasFlag('--strict');
const EGRESS = getArg('--egress', 'https://api.elevenlabs.io');

const checks = [];
let failures = 0;
let warnings = 0;

function record(ok, name, msg, fix) {
  const entry = { ok, name, msg, fix };
  checks.push(entry);
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${msg ? ` — ${msg}` : ''}`);
  if (!ok && fix) console.log(`      fix: ${fix}`);
}

function warn(name, msg, fix) {
  warnings++;
  console.log(`WARN: ${name}${msg ? ` — ${msg}` : ''}`);
  if (fix) console.log(`      tip: ${fix}`);
  if (STRICT) {
    failures++;
  }
}

function run(cmd) {
  try {
    const out = cp.execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return { ok: true, out };
  } catch (e) {
    return { ok: false, err: e };
  }
}

function checkBin(bin, args, required = true, tip = '') {
  const cmd = `${bin} ${args}`.trim();
  const r = run(cmd);
  if (r.ok) {
    const first = r.out.split('\n')[0];
    record(true, `binary:${bin}`, first);
  } else if (required) {
    record(false, `binary:${bin}`, 'not found or not runnable', `Install ${bin}. ${tip}`);
  } else {
    warn(`binary:${bin}`, 'not found (optional)', `Install ${bin} if you use features depending on it. ${tip}`);
  }
}

function checkDirWritable(dir, required = true) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, `.preflight-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);
    fs.writeFileSync(p, 'ok');
    fs.unlinkSync(p);
    record(true, `writable:${dir}`, 'ok');
  } catch (e) {
    if (required) {
      record(false, `writable:${dir}`, 'not writable', 'Adjust permissions or choose a writable path');
    } else {
      warn(`writable:${dir}`, 'not writable (optional)', 'Adjust permissions or choose a writable path');
    }
  }
}

function head(urlStr, timeout = 5000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          method: 'HEAD',
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + (u.search || ''),
          timeout
        },
        (res) => resolve({ ok: true, status: res.statusCode })
      );
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
        resolve({ ok: false, err: new Error('timeout') });
      });
      req.on('error', (err) => resolve({ ok: false, err }));
      req.end();
    } catch (err) {
      resolve({ ok: false, err });
    }
  });
}

function getJson(urlStr, timeout = 5000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          method: 'GET',
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + (u.search || ''),
          timeout,
          headers: { 'Accept': 'application/json' }
        },
        (res) => {
          let buf = '';
          res.on('data', (d) => (buf += d));
          res.on('end', () => {
            try {
              const json = JSON.parse(buf || '{}');
              resolve({ ok: true, status: res.statusCode, json });
            } catch (e) {
              resolve({ ok: false, status: res.statusCode, err: e, body: buf });
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
        resolve({ ok: false, err: new Error('timeout') });
      });
      req.on('error', (err) => resolve({ ok: false, err }));
      req.end();
    } catch (err) {
      resolve({ ok: false, err });
    }
  });
}

(async function main() {
  console.log('--- Preflight start ---');

  // Node version
  const nodeVer = process.versions.node;
  const major = parseInt(nodeVer.split('.')[0], 10) || 0;
  if (major >= 16) {
    record(true, 'node:version', `Node ${nodeVer}`);
  } else {
    record(false, 'node:version', `Node ${nodeVer}`, 'Use Node 16+ (recommended 18 or 20)');
  }

  // Binaries
  checkBin('ffmpeg', '-version', true, 'https://ffmpeg.org/download.html');
  checkBin('ffprobe', '-version', true, 'Part of ffmpeg distribution');
  checkBin('pdftoppm', '-v', false, 'Provided by Poppler');
  checkBin('pdftotext', '-v', false, 'Provided by Poppler');

  // Writable dirs
  checkDirWritable(UPLOADS_DIR, true);
  checkDirWritable(OUTPUT_DIR, true);

  // Env vars
  if (process.env.ELEVENLABS_API_KEY) {
    record(true, 'env:ELEVENLABS_API_KEY', 'present');
  } else if (REQUIRE_TTS) {
    record(false, 'env:ELEVENLABS_API_KEY', 'missing', 'Set ELEVENLABS_API_KEY in your environment');
  } else {
    warn('env:ELEVENLABS_API_KEY', 'missing (TTS disabled)', 'Set ELEVENLABS_API_KEY to enable TTS');
  }

  // Optional: ping health/details
  if (BASE) {
    const r = await getJson(`${BASE.replace(/\/$/, '')}/api/health/details`, 6000);
    if (r.ok && r.status === 200) {
      record(true, 'api:/api/health/details', '200 OK');
      const fields = ['nodeVersion', 'popplerVersion', 'staticMounts', 'outputWritable'];
      const missing = fields.filter((k) => !(k in r.json));
      if (missing.length > 0) {
        warn('health:fields', `missing fields: ${missing.join(', ')}`, 'Ensure details include system diagnostics');
      }
    } else {
      warn('api:/api/health/details', `unreachable or not 200 (${r.status || r.err?.message || 'unknown'})`, 'Start server or verify BASE');
    }
  } else {
    warn('config:BASE', 'not set', 'Pass --base http://localhost:3000 to verify health endpoints');
  }

  // Optional: basic egress test
  if (EGRESS) {
    const h = await head(EGRESS, 5000);
    if (h.ok && h.status >= 200 && h.status < 500) {
      record(true, 'egress', `reachable (${EGRESS})`);
    } else {
      warn('egress', `not reachable (${EGRESS})`, 'Check firewall/proxy or whitelist');
    }
  }

  // Optional: timeouts/concurrency envs
  const numEnv = (k) => {
    const v = process.env[k];
    return v && !Number.isNaN(Number(v));
  };
  if (numEnv('REQUEST_TIMEOUT_MS') && numEnv('MAX_CONCURRENCY')) {
    record(true, 'env:timeouts/concurrency', `REQUEST_TIMEOUT_MS=${process.env.REQUEST_TIMEOUT_MS}, MAX_CONCURRENCY=${process.env.MAX_CONCURRENCY}`);
  } else {
    warn('env:timeouts/concurrency', 'not configured', 'Set REQUEST_TIMEOUT_MS and MAX_CONCURRENCY for robustness');
  }

  console.log('--- Preflight summary ---');
  console.log(`Failures: ${failures}  Warnings: ${warnings}  Strict: ${STRICT ? 'on' : 'off'}`);
  process.exit(failures > 0 ? 1 : 0);
})();