// scripts/migrate-data.js
import fs from 'fs';
import path from 'path';
import { getDataDir, ensureDir } from '../src/config/paths.js';

const LEGACY_LOCATIONS = [
  { from: './uploads', to: 'uploads' },
  { from: './output', to: 'output' },
  { from: './pdf_images', to: 'pdf_images' },
  { from: './projects.db', to: 'projects.db' },
  { from: './src/api/uploads', to: 'uploads' },
  { from: './src/api/projects.db', to: 'projects.db' },
];

function moveItem(src, dst) {
  try {
    if (!fs.existsSync(src)) return false;
    const dstDir = path.dirname(dst);
    ensureDir(dstDir);
    fs.renameSync(src, dst);
    return true;
  } catch (e) {
    // Fallback to copy if rename across devices
    try {
      if (fs.lstatSync(src).isDirectory()) {
        copyDir(src, dst);
        fs.rmSync(src, { recursive: true, force: true });
      } else {
        fs.copyFileSync(src, dst);
        fs.rmSync(src, { force: true });
      }
      return true;
    } catch (err) {
      console.error('migrate_error', { src, dst, error: String(err) });
      return false;
    }
  }
}

function copyDir(src, dst) {
  ensureDir(dst);
  for (const e of fs.readdirSync(src)) {
    const s = path.join(src, e);
    const d = path.join(dst, e);
    if (fs.lstatSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

(function main() {
  const dataDir = getDataDir();
  console.log(`Migrating to data dir: ${dataDir}`);
  for (const m of LEGACY_LOCATIONS) {
    const src = path.resolve(m.from);
    const dst = path.resolve(path.join(dataDir, m.to));
    const changed = moveItem(src, dst);
    if (changed) console.log(`Moved ${src} -> ${dst}`);
  }
  console.log('Migration complete.');
})();