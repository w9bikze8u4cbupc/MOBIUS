import { buildEnvelopeVolumeExpr, buildSidechainComplex } from '../render/audioDucking';

test('buildEnvelopeVolumeExpr creates an if expression', () => {
  const expr = buildEnvelopeVolumeExpr([{ start: 0, end: 1 }, { start: 2.5, end: 3 }], 0.25);
  expect(expr).toContain('between(t,0,1)');
  expect(expr).toContain('between(t,2.5,3)');
  expect(expr).toMatch(/if\(gt\(.+\),0\.250,1\.0\)/);
});

test('buildEnvelopeVolumeExpr handles empty windows', () => {
  const expr = buildEnvelopeVolumeExpr([], 0.25);
  expect(expr).toBe('1.0');
});

test('buildSidechainComplex returns filter syntax', () => {
  const s = buildSidechainComplex('bgm','vo','ducked',{ threshold:0.05, ratio:8, attackMs:5, releaseMs:50 });
  expect(s).toContain('[bgm][vo]sidechaincompress=');
  expect(s).toContain('[ducked]');
});

test('buildSidechainComplex uses default values', () => {
  const s = buildSidechainComplex();
  expect(s).toContain('threshold=0.05');
  expect(s).toContain('ratio=8');
  expect(s).toContain('attack=5');
  expect(s).toContain('release=50');
});