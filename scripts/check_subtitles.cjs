#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const SNAP_INTERVAL = 1 / 12; // ≈ 83.333 ms
const EPSILON = 1e-6;
const MAX_LINE_LENGTH = 42;
const MAX_LINES = 2;
const MAX_CPS = 17;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loadJson(filePath) {
  const absolute = path.resolve(filePath);
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function emitJUnit(result, outfile) {
  if (!outfile) return;
  const xml = `<?xml version="1.0"?>\n<testsuite name="subtitle-contract" tests="1">\n  <testcase name="subtitle-validation">\n    ${result.ok ? '' : `<failure message="${result.message.replace(/"/g, '&quot;')}"></failure>`}\n  </testcase>\n</testsuite>`;
  fs.writeFileSync(outfile, xml);
}

function getArgValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  if (idx === args.length - 1) {
    fail(`Missing value for ${flag}`);
  }
  return args[idx + 1];
}

function isSnapped(value) {
  return Math.abs(value * 12 - Math.round(value * 12)) < EPSILON;
}

function isSentenceCase(text) {
  const match = text.match(/[A-Za-z]/);
  if (!match) {
    return true;
  }
  const first = match[0];
  return first === first.toUpperCase();
}

function hasTerminalPunctuation(text) {
  return /[.!?…]$/.test(text);
}

function validateBracketedCue(text) {
  if (!text.startsWith('[') || !text.endsWith(']')) {
    return true;
  }
  if (/\[.*\[/.test(text) || /\].*\]/.test(text.slice(1, -1))) {
    return false;
  }
  const inner = text.slice(1, -1);
  return inner === inner.toUpperCase();
}

function main() {
  const args = process.argv.slice(2);
  const input = getArgValue(args, '--input');
  if (!input) {
    fail('--input required');
  }
  const contractPath = getArgValue(args, '--contract') || 'docs/spec/subtitle_contract_v1.0.0.json';
  const junitPath = getArgValue(args, '--junit');

  try {
    const data = loadJson(input);
    const spec = loadJson(contractPath);

    const bail = (message) => {
      emitJUnit({ ok: false, message }, junitPath);
      fail(message);
    };

    if (data.subtitleContractVersion !== spec.subtitleContractVersion) {
      bail('Version mismatch');
    }

    if (!data.format || !['srt', 'vtt'].includes(data.format)) {
      bail('Unsupported format');
    }

    if (typeof data.language !== 'string' || data.language.length < 2 || data.language.length > 8) {
      bail('Invalid language code');
    }

    if (!Array.isArray(data.items) || data.items.length === 0) {
      bail('No subtitle items provided');
    }

    const ids = new Set();
    let prevEnd = null;
    let prevId = null;

    data.items.forEach((cue, index) => {
      if (!cue || typeof cue !== 'object') {
        bail(`Cue at index ${index} is not an object`);
      }

      const { id, startSec, endSec } = cue;

      if (!id || typeof id !== 'string') {
        bail(`Cue at index ${index} is missing an id`);
      }

      if (ids.has(id)) {
        bail(`Duplicate cue id ${id}`);
      }
      ids.add(id);

      if (typeof startSec !== 'number' || typeof endSec !== 'number') {
        bail(`Cue ${id} has invalid timing values`);
      }

      if (startSec < 0 || endSec <= startSec) {
        bail(`Cue ${id} has invalid start/end range`);
      }

      if (!isSnapped(startSec) || !isSnapped(endSec)) {
        bail(`Cue ${id} is not aligned to ${SNAP_INTERVAL.toFixed(6)}s increments`);
      }

      if (prevEnd !== null && startSec < prevEnd + SNAP_INTERVAL - EPSILON) {
        bail(`Cue ${id} overlaps with ${prevId}`);
      }

      prevEnd = endSec;
      prevId = id;

      const rawText = typeof cue.text === 'string' ? cue.text : '';
      const normalized = rawText
        .normalize('NFC')
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .join('\n')
        .trim();
      if (!normalized) {
        bail(`Cue ${id} is missing text`);
      }

      if (!validateBracketedCue(normalized)) {
        bail(`Cue ${id} has invalid bracket formatting`);
      }

      const lines = normalized.split(/\r?\n/);
      if (lines.length > MAX_LINES) {
        bail(`Cue ${id} exceeds ${MAX_LINES} lines`);
      }
      for (const line of lines) {
        if (line.length > MAX_LINE_LENGTH) {
          bail(`Cue ${id} has a line over ${MAX_LINE_LENGTH} characters`);
        }
      }

      const duration = endSec - startSec;
      const contentLength = normalized.replace(/\s+/g, '').length;
      const cps = contentLength / duration;
      if (cps > MAX_CPS + EPSILON) {
        bail(`Cue ${id} exceeds CPS limit (${cps.toFixed(2)} > ${MAX_CPS})`);
      }

      const alphaOnly = normalized.replace(/[^A-Za-z]/g, '');
      if (!normalized.startsWith('[') && alphaOnly) {
        if (!isSentenceCase(normalized)) {
          bail(`Cue ${id} violates sentence case`);
        }
        if (normalized.length >= 8 && !hasTerminalPunctuation(normalized)) {
          bail(`Cue ${id} missing terminal punctuation`);
        }
      }
    });

    emitJUnit({ ok: true, message: 'OK' }, junitPath);
    console.log('Subtitle contract OK');
  } catch (err) {
    const message = err && err.message ? err.message : 'Unknown error';
    emitJUnit({ ok: false, message }, junitPath);
    fail(message);
  }
}

main();
