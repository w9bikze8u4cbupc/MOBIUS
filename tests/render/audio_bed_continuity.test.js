const { readFileSync } = require('node:fs');

describe('narration bed continuity contract', () => {
  test('uses smooth sidechain attack/release instead of speech-gated bed cuts', () => {
    const source = readFileSync('scripts/render-storyboard-ffmpeg.mjs', 'utf8');
    expect(source).toContain('sidechaincompress=threshold=0.035:ratio=3:attack=60:release=420:makeup=1:link=average');
    expect(source).toContain('asplit=2[voice_main][voice_sc]');
    expect(source).toContain('afade=t=in:st=0:d=0.18');
    expect(source).toContain('afade=t=out:st=');
    expect(source).not.toContain('volume=0:enable=');
  });
});
