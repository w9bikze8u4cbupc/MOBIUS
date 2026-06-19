const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const SCRIPT = path.resolve(__dirname, '../../scripts/score-tutorial-preview-quality.mjs');

function createTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'quality-score-'));
}

function run(dir, outPath) {
  const result = { stdout: '', stderr: '', exitCode: 0 };
  const args = [SCRIPT, '--dir', dir];
  if (outPath) args.push('--out', outPath);
  try {
    const output = execFileSync('node', args, {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 15000,
    });
    result.stdout = output;
  } catch (err) {
    result.stdout = err.stdout || '';
    result.stderr = err.stderr || '';
    result.exitCode = err.status || 1;
  }
  return result;
}

function createValidArtifact(dir) {
  const vqaDir = path.join(dir, 'visual-qa', 'frames');
  fs.mkdirSync(vqaDir, { recursive: true });

  const segments = [
    { id: 's1', type: 'hook', narration: 'After this video you will know how to play Gem Collectors from start to finish.', durationSec: 5 },
    { id: 's2', type: 'game_identity', narration: 'Gem Collectors is a card drafting game for two to four players lasting about twenty minutes.', durationSec: 6 },
    { id: 's3', type: 'objective', narration: 'Your goal is to collect the most valuable set of gems by drafting cards from the market.', durationSec: 7 },
    { id: 's4', type: 'components', narration: 'You will need sixty gem cards, the market board, score tokens, and the first player marker.', durationSec: 8 },
    { id: 's5', type: 'setup', narration: 'Shuffle all gem cards and place them face down. Reveal five cards to the market board.', durationSec: 8 },
    { id: 's6', type: 'turn_structure', narration: 'On your turn you take one card from the market then refill the empty slot.', durationSec: 7 },
    { id: 's7', type: 'core_mechanic', narration: 'Set collection is the core mechanic. Three matching gems score five points. Mixed pairs score two.', durationSec: 9 },
    { id: 's8', type: 'scoring', narration: 'At game end count your complete sets and pairs. The player with the most points wins.', durationSec: 8 },
    { id: 's9', type: 'edge_cases', narration: 'If the market runs empty the game ends immediately. Wild gem cards count as any color.', durationSec: 7 },
    { id: 's10', type: 'recap', narration: 'Remember your goal is to collect valuable gem sets through smart card drafting.', durationSec: 6 },
    { id: 's11', type: 'end_card', narration: 'You are now ready to play Gem Collectors. Enjoy your first game!', durationSec: 5 },
  ];

  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify({ segments, warnings: [], metadata: { totalDurationSec: 85 } }));
  fs.writeFileSync(path.join(dir, 'storyboard.json'), JSON.stringify({
    scenes: Array.from({ length: 13 }, (_, i) => ({ id: `sc${i}`, durationSec: 6.5 })),
  }));

  let srt = '';
  for (let i = 1; i <= 23; i++) {
    srt += `${i}\n00:00:${String(i * 3).padStart(2, '0')},000 --> 00:00:${String(i * 3 + 2).padStart(2, '0')},500\nCaption ${i}\n\n`;
  }
  fs.writeFileSync(path.join(dir, 'captions.srt'), srt);

  fs.writeFileSync(path.join(dir, 'render-config.json'), JSON.stringify({
    projectId: 'gem-collectors',
    video: { resolution: { width: 1920, height: 1080 }, fps: 30 },
    scenes: segments.map((s) => ({ id: s.id, durationSec: s.durationSec, background: { color: '#000' } })),
  }));

  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    generatedAt: '2026-06-19T00:00:00Z',
    game: { id: 'gem-collectors', name: 'Gem Collectors' },
    script: { segments: 11 }, storyboard: { scenes: 13 }, captions: { cues: 23 }, render: { scenes: 11 },
  }));

  fs.writeFileSync(path.join(dir, 'ffprobe.json'), JSON.stringify({
    streams: [
      { codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
    format: { duration: '85.0', size: '581180' },
  }));

  fs.writeFileSync(path.join(dir, 'preview.mp4'), Buffer.alloc(1024, 0xFF));

  fs.writeFileSync(path.join(dir, 'visual-qa', 'contact-sheet.jpg'), Buffer.alloc(512));
  fs.writeFileSync(path.join(dir, 'visual-qa', 'visual-qa-manifest.json'), JSON.stringify({
    frameCount: 8, timestamps: [4.25, 15.18, 26.11, 37.05, 47.98, 58.91, 69.84, 80.77],
    videoDuration: 85.0, grid: { cols: 4, rows: 2 }, ffmpegVersion: 'n7.1.4-test',
  }));
}

function cleanDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

describe('score-tutorial-preview-quality.mjs', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTmpDir(); });
  afterEach(() => { cleanDir(tmpDir); });

  describe('valid artifact produces stable score', () => {
    test('exits 0 and writes quality-report.json', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      const outFile = path.join(tmpDir, 'report.json');
      const result = run(artDir, outFile);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Overall:');
      expect(fs.existsSync(outFile)).toBe(true);
      const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(report.version).toBe('1.0.0');
      expect(report.mode).toBe('advisory');
      expect(report.overallScore.pct).toBeGreaterThan(70);
    });

    test('report has all expected categories', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      const outFile = path.join(tmpDir, 'report.json');
      run(artDir, outFile);
      const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      const expectedCats = ['structureClarity', 'stepSequencing', 'captionCoverage', 'visualReviewCoverage', 'pacing', 'reproducibility', 'assetCompleteness', 'readability'];
      for (const cat of expectedCats) {
        expect(report.categories[cat]).toBeDefined();
        expect(report.categories[cat].score).toBeGreaterThanOrEqual(0);
        expect(report.categories[cat].maxScore).toBeGreaterThan(0);
      }
    });
  });

  describe('missing optional files produce warnings', () => {
    test('exits 0 with lower score when visual QA manifest missing', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      fs.unlinkSync(path.join(artDir, 'visual-qa', 'visual-qa-manifest.json'));
      const outFile = path.join(tmpDir, 'report.json');
      const result = run(artDir, outFile);
      expect(result.exitCode).toBe(0);
      const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(report.categories.visualReviewCoverage.score).toBe(0);
    });
  });

  describe('missing required files fail clearly', () => {
    test('exits 1 when script.json is missing', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      fs.unlinkSync(path.join(artDir, 'script.json'));
      const result = run(artDir);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Required files missing');
    });
  });

  describe('duration out of range lowers pacing score', () => {
    test('short duration scores lower on pacing', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      fs.writeFileSync(path.join(artDir, 'ffprobe.json'), JSON.stringify({
        streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '30/1' }, { codec_type: 'audio', codec_name: 'aac' }],
        format: { duration: '20.0' },
      }));
      const outFile = path.join(tmpDir, 'report.json');
      run(artDir, outFile);
      const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(report.categories.pacing.pct).toBeLessThan(50);
    });
  });

  describe('insufficient visual QA frames lowers score', () => {
    test('2 frames scores lower than 8', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      fs.writeFileSync(path.join(artDir, 'visual-qa', 'visual-qa-manifest.json'), JSON.stringify({
        frameCount: 2, timestamps: [10, 70], videoDuration: 85, grid: { cols: 2, rows: 1 },
      }));
      const outFile = path.join(tmpDir, 'report.json');
      run(artDir, outFile);
      const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(report.categories.visualReviewCoverage.pct).toBeLessThan(80);
    });
  });

  describe('malformed JSON fails clearly', () => {
    test('exits 1 when script.json is not valid JSON', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      fs.writeFileSync(path.join(artDir, 'script.json'), 'not json');
      const result = run(artDir);
      expect(result.exitCode).toBe(1);
    });
  });

  describe('output schema stability', () => {
    test('report includes version, mode, overallScore, categories, observations, recommendations', () => {
      const artDir = path.join(tmpDir, 'art');
      fs.mkdirSync(artDir, { recursive: true });
      createValidArtifact(artDir);
      const outFile = path.join(tmpDir, 'report.json');
      run(artDir, outFile);
      const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      expect(report).toHaveProperty('version');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('mode');
      expect(report).toHaveProperty('overallScore');
      expect(report).toHaveProperty('categories');
      expect(report).toHaveProperty('observations');
      expect(report).toHaveProperty('recommendations');
      expect(Array.isArray(report.observations)).toBe(true);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });
});
