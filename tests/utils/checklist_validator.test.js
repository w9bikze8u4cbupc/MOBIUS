const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  evaluateChecklist,
  generateJUnitXml,
  buildJsonSummary,
} = require('../../scripts/validate_mobius_checklist.cjs');

describe('validate_mobius_checklist', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'checklist-fixture-'));
  fs.mkdirSync(path.join(tempRoot, 'out'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'out', 'video.mp4'), 'video-content');

  const passingContainer = {
    exists: true,
    data: {
      media: {
        video: [{ path: 'out/video.mp4', durationSec: 120, sha256: 'abc' }],
        captions: [{ path: 'captions.vtt', sha256: 'def' }],
      },
      referenceDurationSec: 119.5,
    },
  };

  const passingJUnit = { exists: true, tests: 3, failures: 0, errors: 0 };

  const failingContainer = {
    exists: false,
    data: null,
    error: 'File not found: exports/missing/container.json',
  };

  const failingJUnit = { exists: false, tests: 0, failures: 0, errors: 0 };

  const findResult = (results, id) => results.find((r) => r.id === id);

  afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('maps container and junit artifacts to checklist pass/fail results', () => {
    const results = evaluateChecklist({
      container: passingContainer,
      containerPath: path.join(tempRoot, 'container.json'),
      junitSummary: passingJUnit,
      junitPath: 'exports/sushi-go/windows/golden.junit.xml',
    });

    expect(results.every((r) => r.passed)).toBe(true);

    const summary = buildJsonSummary(results);
    expect(summary.stats.passed).toBe(results.length);
    expect(summary.stats.failed).toBe(0);
    expect(summary.results.G05.passed).toBe(true);
    expect(summary.results.J03.passed).toBe(true);
  });

  test('treats missing artifacts as explicit failures', () => {
    const results = evaluateChecklist({
      container: failingContainer,
      containerPath: 'exports/missing/container.json',
      junitSummary: failingJUnit,
      junitPath: 'exports/missing/golden.junit.xml',
    });

    expect(results.some((r) => !r.passed)).toBe(true);

    const i01 = findResult(results, 'I01');
    const g05 = findResult(results, 'G05');
    const j01 = findResult(results, 'J01');

    expect(i01.passed).toBe(false);
    expect(i01.reason).toContain('File not found');
    expect(g05.passed).toBe(false);
    expect(j01.passed).toBe(false);
  });

  test('generates junit xml with one testcase per checklist item and marks failures', () => {
    const junitXml = generateJUnitXml([
      { id: 'G05', description: 'has video', passed: true, reason: '' },
      { id: 'J01', description: 'junit exists', passed: false, reason: 'Missing JUnit report' },
    ]);

    expect(junitXml).toContain('tests="2"');
    expect(junitXml).toContain('failures="1"');
    expect(junitXml).toContain('<testcase classname="checklist" name="J01"');
    expect(junitXml).toContain('<failure message="Missing JUnit report">');
  });
});
