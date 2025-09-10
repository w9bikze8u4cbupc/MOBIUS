import fs from 'fs';
import { execSync } from 'child_process';

// Use full path to FFmpeg
const FFMPEG_PATH = 'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe';

/*
timeline: [{ id, type, start, end, data }]
assets: directory with board.png, card.png, token.png, etc. (placeholder ok)
*/

// Check if FFmpeg is available
let ffmpegAvailable = false;
try {
  execSync(`${FFMPEG_PATH} -version`, { stdio: 'ignore' });
  ffmpegAvailable = true;
} catch (error) {
  console.warn('FFmpeg not found. Please install FFmpeg to render videos.');
  console.warn('Download from: https://ffmpeg.org/download.html');
  console.warn('Add to PATH or update the script with the full path to ffmpeg.');
  process.exit(1);
}

function buildFilterGraph(timeline, assetsDir, isPreview = false) {
  const bg = `${assetsDir}/table_bg.png`;
  const inputs = [`-loop 1 -t ${Math.ceil(timeline.at(-1).end)} -i ${bg}`];
  let filter = `[0:v]setpts=PTS-STARTPTS${isPreview ? ',scale=960:540' : ''}`;
  
  // Add debug overlay if in preview mode
  if (isPreview) {
    filter += `,drawbox=x=96:y=54:w=768:h=432:t=2:color=red@0.5`; // Safe area overlay
  }
  
  filter += '[v0]';
  let lastLabel = 'v0';
  
  let idx = 1;
  for (const seg of timeline) {
    // Substitute specific overlays by type
    const overlay = seg.type === 'components' ? `${assetsDir}/components.png`
      : seg.type === 'phaseHeader' ? `${assetsDir}/phase.png`
      : seg.type === 'setupOp' ? `${assetsDir}/op_${seg.data.template || 'generic'}.png`
      : `${assetsDir}/placeholder.png`;

    // Check if overlay file exists, if not use placeholder
    const overlayPath = fs.existsSync(overlay) ? overlay : `${assetsDir}/placeholder.png`;

    inputs.push(`-i ${overlayPath}`);
    const inLabel = `[${idx}:v]`;
    const outLabel = `v${idx}`;
    const start = seg.start.toFixed(2);
    const end = seg.end.toFixed(2);

    // Add metadata for shot ID in preview mode
    let overlayFilter = `${inLabel}format=rgba`;
    if (isPreview) {
      overlayFilter += `,scale=400:300`; // Scale for preview
    }
    
    overlayFilter += `,fade=t=in:st=${start}:d=0.2:alpha=1,fade=t=out:st=${(seg.end-0.2).toFixed(2)}:d=0.2:alpha=1[ov${idx}]`;
    overlayFilter += `;[${lastLabel}][ov${idx}]overlay=x=100:y=100:enable='between(t,${start},${end})'[${outLabel}]`;
    
    filter += `;${overlayFilter}`;
    lastLabel = outLabel;
    idx++;
  }

  // Add format and setsar filters for safe output
  const finalLabel = `${lastLabel}_final`;
  filter += `;[${lastLabel}]format=yuv420p,setsar=1[${finalLabel}]`;

  return { inputs, filter, outputLabel: finalLabel };
}

// Check if we're in preview mode
const isPreview = process.argv.includes('--preview') || process.argv.includes('-p');

const timelineFile = process.argv[2];
const assetsDir = process.argv[3];
const out = process.argv[4];

if (!timelineFile || !assetsDir || !out) {
  console.error('Usage: node scripts/render-ffmpeg.mjs <timeline.json> <assets_dir> <output.mp4> [--preview]');
  process.exit(1);
}

const timeline = JSON.parse(fs.readFileSync(timelineFile, 'utf8')).timeline;

const { inputs, filter, outputLabel } = buildFilterGraph(timeline, assetsDir, isPreview);
const fps = isPreview ? 30 : 60;

const cmd = `${FFMPEG_PATH} ${inputs.join(' ')} -filter_complex "${filter}" -map [${outputLabel}] -r ${fps} -c:v libx264 -preset ultrafast -y ${out}`;
console.log(`Executing command: ${cmd}`);
try {
  execSync(cmd, { stdio: 'inherit' });
  console.log(`Video rendered successfully to ${out}`);
} catch (error) {
  console.error('Error rendering video:', error.message);
  process.exit(1);
}