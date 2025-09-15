const { spawnSync } = require('child_process');

module.exports = function probeVideo(videoPath) {
  const res = spawnSync('ffprobe', [
    '-v','error',
    '-select_streams','v:0',
    '-show_entries','stream=width,height,codec_name,avg_frame_rate',
    '-of','json', videoPath
  ], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`ffprobe failed: ${res.stderr || res.stdout}`);
  const s = JSON.parse(res.stdout).streams?.[0] || {};
  const [n, d] = (s.avg_frame_rate || '0/1').split('/').map(Number);
  const fps = d ? n / d : 0;
  const resolution = s.width && s.height ? `${s.width}x${s.height}` : 'unknown';
  return { width: s.width, height: s.height, resolution, codec: s.codec_name || 'unknown', fps };
};