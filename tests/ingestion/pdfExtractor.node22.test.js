/**
 * Node 22+ real pdfjs-dist extraction validation.
 *
 * This test file validates that the direct pdfjs-dist engine activates on
 * Node 22+ and correctly extracts structured blocks from a real PDF generated
 * at test time via pdf-lib. It is gated by:
 *   1. Node.js major version >= 22
 *   2. Environment variable MOBIUS_ENABLE_PDFJS_DIST_REAL_TEST=1
 *
 * On Node 18/20 or without the env flag, all tests are skipped.
 */

const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
const envEnabled = process.env.MOBIUS_ENABLE_PDFJS_DIST_REAL_TEST === '1';
const shouldRun = nodeVersion >= 22 && envEnabled;

const describeIfNode22 = shouldRun ? describe : describe.skip;

describeIfNode22('pdfExtractor – Node 22 real pdfjs-dist extraction', () => {
  const path = require('path');
  const fs = require('fs');
  const os = require('os');
  const { extractPdfToIngestionInput, detectPdfjsDistCapability } = require('../../src/ingestion/pdfExtractor');

  let tempDir;
  let pdfPath;

  beforeAll(async () => {
    // Generate a modern PDF using pdf-lib (available in project deps)
    const { PDFDocument, StandardFonts } = require('pdf-lib');

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const page = doc.addPage([612, 792]);
    page.drawText('Game Setup', { x: 72, y: 720, size: 24, font: fontBold });
    page.drawText('Place all tokens on the board.', { x: 72, y: 680, size: 12, font });
    page.drawText('Gameplay', { x: 72, y: 620, size: 24, font: fontBold });
    page.drawText('Players take turns clockwise.', { x: 72, y: 580, size: 12, font });

    const page2 = doc.addPage([612, 792]);
    page2.drawText('Scoring', { x: 72, y: 720, size: 24, font: fontBold });
    page2.drawText('Count victory points at game end.', { x: 72, y: 680, size: 12, font });

    const pdfBytes = await doc.save();

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobius-pdf-test-'));
    pdfPath = path.join(tempDir, 'test-game-rules.pdf');
    fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));
  });

  afterAll(() => {
    // Cleanup temp files
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('capability detection reports supported on Node 22+', () => {
    const cap = detectPdfjsDistCapability();
    expect(cap.supported).toBe(true);
    expect(cap.nodeVersion).toBeGreaterThanOrEqual(22);
  });

  it('auto engine selects pdfjs-dist on Node 22+', async () => {
    const result = await extractPdfToIngestionInput(pdfPath, { engine: 'auto' });

    expect(result.metadata.extractionEngine).toBe('pdfjs-dist');
    expect(result.metadata.runtime.pdfjsDistSupported).toBe(true);
    expect(result.metadata.runtime.nodeVersion).toMatch(/^22\./);
  });

  it('extracts structured pages from generated PDF', async () => {
    const result = await extractPdfToIngestionInput(pdfPath);

    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].number).toBe(1);
    expect(result.pages[1].number).toBe(2);

    // Page 1 should have blocks with expected text
    const page1Blocks = result.pages[0].blocks;
    expect(page1Blocks.length).toBeGreaterThanOrEqual(2);

    const texts = page1Blocks.map((b) => b.text);
    expect(texts.some((t) => t.includes('Game Setup'))).toBe(true);
    expect(texts.some((t) => t.includes('Gameplay'))).toBe(true);

    // Page 2 should have scoring content
    const page2Blocks = result.pages[1].blocks;
    expect(page2Blocks.length).toBeGreaterThanOrEqual(1);
    const page2Texts = page2Blocks.map((b) => b.text);
    expect(page2Texts.some((t) => t.includes('Scoring'))).toBe(true);
  });

  it('blocks have valid numeric coordinates and fontSize', async () => {
    const result = await extractPdfToIngestionInput(pdfPath);

    for (const page of result.pages) {
      for (const block of page.blocks) {
        expect(typeof block.text).toBe('string');
        expect(block.text.length).toBeGreaterThan(0);
        expect(typeof block.fontSize).toBe('number');
        expect(block.fontSize).toBeGreaterThan(0);
        expect(typeof block.x).toBe('number');
        expect(typeof block.y).toBe('number');
        expect(typeof block.width).toBe('number');
        expect(block.width).toBeGreaterThan(0);
        expect(typeof block.height).toBe('number');
        expect(block.height).toBeGreaterThan(0);
      }
    }
  });

  it('heading blocks have fontSize >= 24', async () => {
    const result = await extractPdfToIngestionInput(pdfPath);

    const headingBlocks = result.pages
      .flatMap((p) => p.blocks)
      .filter((b) => ['Game Setup', 'Gameplay', 'Scoring'].some((h) => b.text.includes(h)));

    expect(headingBlocks.length).toBeGreaterThanOrEqual(3);
    for (const block of headingBlocks) {
      expect(block.fontSize).toBeGreaterThanOrEqual(24);
    }
  });

  it('produces deterministic output for the same PDF', async () => {
    const result1 = await extractPdfToIngestionInput(pdfPath);
    const result2 = await extractPdfToIngestionInput(pdfPath);

    expect(result1.pages).toEqual(result2.pages);
    expect(result1.ocr).toEqual(result2.ocr);
    expect(result1.metadata.sha256).toBe(result2.metadata.sha256);
  });

  it('output is compatible with runIngestionPipeline', async () => {
    const { runIngestionPipeline } = require('../../src/ingestion/pipeline');
    const result = await extractPdfToIngestionInput(pdfPath);

    const manifest = runIngestionPipeline({
      documentId: 'node22-real-test',
      metadata: { title: 'Test Game', gameId: 'test-game', source: 'test-game-rules.pdf' },
      pages: result.pages,
      ocr: result.ocr
    });

    expect(manifest).toHaveProperty('version');
    expect(manifest).toHaveProperty('outline');
    expect(manifest).toHaveProperty('components');
    expect(manifest.outline.length).toBeGreaterThanOrEqual(3); // Game Setup, Gameplay, Scoring
    expect(manifest.stats.pageCount).toBe(2);
  });

  it('metadata includes correct engine and version info', async () => {
    const result = await extractPdfToIngestionInput(pdfPath);

    expect(result.metadata.engine).toBe('mobius-pdf-extractor');
    expect(result.metadata.engineVersion).toBe('2.0.0');
    expect(result.metadata.extractionEngine).toBe('pdfjs-dist');
    expect(result.metadata.source).toBe('test-game-rules.pdf');
    expect(typeof result.metadata.sha256).toBe('string');
    expect(result.metadata.sha256.length).toBe(64);
    expect(result.metadata.pageCount).toBe(2);
  });

  it('no OCR flags on text-based PDF', async () => {
    const result = await extractPdfToIngestionInput(pdfPath);

    expect(result.ocr).toEqual({});
    // No EMPTY_PAGE diagnostics expected
    const emptyPageDiags = result.diagnostics.filter((d) => d.type === 'EMPTY_PAGE');
    expect(emptyPageDiags).toHaveLength(0);
  });
});
