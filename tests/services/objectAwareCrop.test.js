const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { auditOpticalCenter, auditRasterIsolation, compileObjectAwareCrop } = require('../../src/services/objectAwareCrop.cjs');

describe('object-aware crop contract', () => {
  test('adds padding around a complete isolated object', () => {
    const crop = compileObjectAwareCrop({
      sourceWidth: 1000, sourceHeight: 800, paddingPx: 40,
      intendedObjects: [{ id: 'coin', bounds: { x: 200, y: 180, width: 120, height: 120 } }],
    });
    expect(crop.paddedCropBox).toEqual({ x: 160, y: 140, width: 200, height: 200 });
    expect(crop.cropCompleteness).toBe('complete');
    expect(crop.cropPurity).toBe('clean');
  });

  test('rejects an unrelated component in the crop', () => {
    const crop = compileObjectAwareCrop({
      sourceWidth: 1000, sourceHeight: 800, paddingPx: 40,
      intendedObjects: [{ id: 'coin', bounds: { x: 200, y: 180, width: 120, height: 120 } }],
      forbiddenObjects: [{ id: 'card-fragment', bounds: { x: 330, y: 180, width: 100, height: 150 } }],
    });
    expect(crop.cropPurity).toBe('contaminated');
    expect(crop.violations).toContain('forbidden-object-in-crop:card-fragment');
  });

  test('requires centered placement unless a functional region is declared', () => {
    expect(auditOpticalCenter({
      objectBounds: { x: 100, y: 10, width: 300, height: 200 },
      paneBounds: { x: 0, y: 0, width: 500, height: 600 },
    }).valid).toBe(false);
    expect(auditOpticalCenter({
      objectBounds: { x: 100, y: 10, width: 300, height: 200 },
      paneBounds: { x: 0, y: 0, width: 500, height: 600 },
      declaredPurpose: 'caption-below',
    }).valid).toBe(true);
  });

  test('pixel inspection rejects an opaque rectangular matte mislabeled as clean', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-isolation-'));
    const file = path.join(directory, 'bad-progress-tokens.png');
    await sharp(Buffer.from('<svg width="320" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="320" height="160" fill="#ead9b6"/><circle cx="90" cy="80" r="55" fill="#48733f"/><circle cx="230" cy="80" r="55" fill="#315d35"/></svg>')).png().toFile(file);
    const audit = await auditRasterIsolation(file, { isolatedObjectExpected: true });
    expect(audit.status).toBe('FAIL');
    expect(audit.violations).toContain('opaque-rectangular-matte');
  });

  test('pixel inspection accepts a complete transparent isolated object', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-isolation-'));
    const file = path.join(directory, 'clean-token.png');
    await sharp(Buffer.from('<svg width="180" height="180" xmlns="http://www.w3.org/2000/svg"><circle cx="90" cy="90" r="70" fill="#48733f" stroke="#d9ba67" stroke-width="8"/></svg>')).png().toFile(file);
    const audit = await auditRasterIsolation(file, { isolatedObjectExpected: true });
    expect(audit.status).toBe('PASS');
  });
});
