#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const srcRoot = 'artifacts/frames';
const dstRoot = 'artifacts/frames_slim';

function sha256File(p) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(p));
  return hash.digest('hex');
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

if (!fs.existsSync(srcRoot)) process.exit(0);
ensureDir(dstRoot);

for (const gameDir of fs.readdirSync(srcRoot)) {
  const srcDir = path.join(srcRoot, gameDir);
  if (!fs.statSync(srcDir).isDirectory()) continue;
  const dstDir = path.join(dstRoot, gameDir);
  ensureDir(dstDir);

  const files = fs.readdirSync(srcDir).filter(f => /\.(png|jpg|jpeg)$/i.test(f)).sort();
  const pick = new Set(files.slice(0, 5).concat(files.length > 5 ? [files[files.length - 1]] : []));
  for (const f of pick) fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f));

  const lines = files.map(f => `${sha256File(path.join(srcDir, f))}  ${f}`);
  fs.writeFileSync(path.join(dstDir, 'sha256.txt'), lines.join('\n'));
}
console.log('Slim artifacts prepared at', dstRoot);