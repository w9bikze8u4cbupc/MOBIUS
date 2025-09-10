// compare_ffprobe_vs_container.cjs
// Usage: node compare_ffprobe_vs_container.cjs dist/sushi-go/mac/artifacts-ffprobe.json dist/sushi-go/mac/container.json
const fs = require('fs');

const ffprobePath = process.argv[2] || 'artifacts/sushi-go-mac-ffprobe.json';
const containerPath = process.argv[3] || 'dist/sushi-go/mac/container.json';

const toDec = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.includes('/')) {
    const [n, d] = v.split('/').map(Number);
    return d ? n / d : Number(n);
  }
  return Number(v);
};

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const ff = read(ffprobePath);
const s = (ff.streams && ff.streams[0]) || {};
const cj = read(containerPath);

// Support media.video as object or array
const v = Array.isArray(cj.media?.video) ? cj.media.video[0] : cj.media?.video;

const issues = [];
const sameFps = (a, b) => {
  const da = toDec(a);
  const db = toDec(b);
  if (!isFinite(da) || !isFinite(db)) return false;
  return Math.abs(da - db) < 1e-3;
};

if (!sameFps(s.avg_frame_rate, v?.fps)) {
  issues.push(`fps mismatch: ffprobe=${s.avg_frame_rate} vs container=${v?.fps}`);
}
if ((s.pix_fmt || '').toLowerCase() !== (v?.pix_fmt || '').toLowerCase()) {
  issues.push(`pix_fmt mismatch: ffprobe=${s.pix_fmt} vs container=${v?.pix_fmt}`);
}
const sarFF = s.sample_aspect_ratio || '1:1';
const sarCJ = v?.sar || '1:1';
if (sarFF !== sarCJ) {
  issues.push(`SAR mismatch: ffprobe=${sarFF} vs container=${sarCJ}`);
}
if (s.width !== v?.width || s.height !== v?.height) {
  issues.push(`dimensions mismatch: ffprobe=${s.width}x${s.height} vs container=${v?.width}x${v?.height}`);
}

if (issues.length) {
  console.log('MISMATCHES:\n- ' + issues.join('\n- '));
  process.exitCode = 1;
} else {
  console.log('ffprobe vs container.json: OK');
}