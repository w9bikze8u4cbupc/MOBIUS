// src/jobs/janitor.js
import fs from 'fs';
import path from 'path';
import { getDirs } from '../config/paths.js';

const MS_DAY = 24 * 60 * 60 * 1000;
const KEEP_UPLOADS_DAYS = Number(process.env.KEEP_UPLOADS_DAYS || 30);
const KEEP_OUTPUT_DAYS = Number(process.env.KEEP_OUTPUT_DAYS || 90);

export function runJanitor() {
  const { uploads, output } = getDirs();
  pruneDir(uploads, KEEP_UPLOADS_DAYS);
  pruneDir(output, KEEP_OUTPUT_DAYS);
}

function pruneDir(dir, keepDays) {
  const cutoff = Date.now() - keepDays * MS_DAY;
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs < cutoff) {
        try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
      }
    } catch (e) {
      // Ignore errors accessing file stats
    }
  }
}