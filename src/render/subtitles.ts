import fs from 'node:fs/promises';
import path from 'node:path';

function toSrtTime(sec: number) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msR = ms % 1000;
  const pad = (n: number, w: number) => String(n).padStart(w, '0');
  return `${pad(h,2)}:${pad(m,2)}:${pad(s,2)},${pad(msR,3)}`;
}

export async function writeSrt(captions: { start: number; end: number; text: string }[], outDir: string, base = 'captions'): Promise<string> {
  const lines: string[] = [];
  captions.forEach((c, idx) => {
    lines.push(String(idx + 1));
    lines.push(`${toSrtTime(c.start)} --> ${toSrtTime(c.end)}`);
    lines.push((c.text || '').replace(/\r?\n/g, ' ').trim());
    lines.push(''); // blank line
  });
  const srtPath = path.join(outDir, `${base}.srt`);
  await fs.writeFile(srtPath, lines.join('\n'), 'utf8');
  return srtPath;
}