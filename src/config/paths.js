// src/config/paths.js
import path from 'path';
import fs from 'fs';

const DEFAULT_DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

export function getDataDir() {
  ensureDir(DEFAULT_DATA_DIR);
  return DEFAULT_DATA_DIR;
}

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

export function resolveDataPath(...segments) {
  const p = path.join(getDataDir(), ...segments);
  ensureDir(path.dirname(p));
  return p;
}

export function getDirs() {
  const root = getDataDir();
  const dirs = {
    root,
    uploads: path.join(root, 'uploads'),
    output: path.join(root, 'output'),
    pdfImages: path.join(root, 'pdf_images'),
    fixtures: path.join(root, 'fixtures'),
  };
  Object.values(dirs).forEach(ensureDir);
  return dirs;
}