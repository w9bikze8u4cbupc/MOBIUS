import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ffmpegStatic from 'ffmpeg-static';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const FFMPEG = process.env.MOBIUS_FFMPEG_PATH || ffmpegStatic || 'ffmpeg';

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    out[argv[i].slice(2)] = argv[i + 1]; i += 1;
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const configPath = path.resolve(args.config);
  const videoPath = path.resolve(args.video);
  const outPath = path.resolve(args.out);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const preferred = [
    'brand-signature', 'presentation-opening-metadata-card', 'knowledge-objective-victory-overview',
    'knowledge-components-overview', 'knowledge-setup-wonder-selection', 'knowledge-setup-age-layouts', 'knowledge-setup-later-age-layouts',
    'knowledge-accessible-card', 'knowledge-construct-building', 'knowledge-trade-missing-resources',
    'knowledge-chain-construction', 'knowledge-discard-for-coins', 'knowledge-construct-wonder',
    'knowledge-military-system', 'knowledge-science-pair-progress', 'knowledge-science-supremacy',
    'knowledge-endgame-trigger', 'knowledge-scoring-ledger', 'knowledge-scoring-buildings',
    'knowledge-scoring-treasury', 'brand-outro',
  ];
  let cursor = 0; const starts = new Map();
  for (const scene of config.scenes) { starts.set(scene.id, cursor); cursor += Number(scene.durationSec || 0); }
  const allInstructional = process.argv.includes('--all-instructional');
  const selected = allInstructional
    ? config.scenes.filter((scene) => String(scene.id || '').startsWith('knowledge-'))
    : preferred.map((id) => config.scenes.find((scene) => scene.id === id)).filter(Boolean);
  const frameDir = path.join(path.dirname(outPath), 'review-frames'); fs.mkdirSync(frameDir, { recursive: true });
  const frames = [];
  for (const scene of selected) {
    const time = Number(starts.get(scene.id)) + Math.min(1, Number(scene.durationSec || 1) / 2);
    const target = path.join(frameDir, `${String(frames.length + 1).padStart(2, '0')}-${scene.id}.png`);
    execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', time.toFixed(3), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=480:270', target]);
    const metadata = await sharp(target).metadata();
    if (metadata.width !== 480 || metadata.height !== 270) throw new Error(`Invalid review frame: ${target}`);
    frames.push({ sceneId: scene.id, timeSec: Number(time.toFixed(3)), path: target });
  }
  const columns = 4; const rows = Math.ceil(frames.length / columns);
  const background = await sharp({ create: { width: columns * 480, height: rows * 270, channels: 3, background: '#211a16' } })
    .composite(frames.map((frame, index) => ({ input: frame.path, left: (index % columns) * 480, top: Math.floor(index / columns) * 270 })))
    .png({ compressionLevel: 9 }).toFile(outPath);
  const decoded = await sharp(outPath).metadata();
  if (!decoded.width || !decoded.height || background.size <= 0) throw new Error('Review board failed image integrity validation.');
  const manifest = { contract: 'mobius-physical-review-board-r4-v1', status: 'PASS', videoPath, durationSec: Number(cursor.toFixed(3)), boardPath: outPath, width: decoded.width, height: decoded.height, fileSize: background.size, frames };
  fs.writeFileSync(path.join(path.dirname(outPath), 'review-board-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
