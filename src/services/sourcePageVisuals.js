import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

export const SOURCE_PAGE_VISUALS_CONTRACT = 'mobius-source-page-visuals-v2';

/** Read-only API hydration. Never extracts, guesses a storage root, or searches the web. */
export async function hydrateSourcePageVisuals({ baseUrl, projectId, sourceSha256, pageCount, pageDir, fetchImpl = fetch, apiKey } = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(projectId || '') || !/^[a-f0-9]{64}$/.test(sourceSha256 || '') || !(pageCount > 0)) throw new Error('SOURCE_PAGE_IDENTITY_INVALID');
  const manifestPath = path.join(pageDir, 'source-page-visuals.json');
  if (fs.existsSync(manifestPath)) {
    const prior = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (prior.contract === SOURCE_PAGE_VISUALS_CONTRACT && prior.projectId === projectId && prior.sourceSha256 === sourceSha256
      && prior.pages.length === pageCount && prior.pages.every((p, i) => p.page === i + 1 && fs.existsSync(path.join(pageDir, `page-${p.page}.png`))
        && sha256(fs.readFileSync(path.join(pageDir, `page-${p.page}.png`))) === p.sha256)) return { ...prior, reused: true };
  }
  const prefix = `/api/projects/${encodeURIComponent(projectId)}`;
  const get = async (route) => {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}${route}`, { headers: apiKey ? { 'x-api-key': apiKey } : {} });
    if (!response.ok) throw new Error(`SOURCE_PAGE_API_HTTP_${response.status}`);
    return response;
  };
  const identity = await (await get(`${prefix}/source-pdf`)).json();
  if (identity.sourcePdf?.sha256 !== sourceSha256 || identity.sourcePdf?.pageCount !== pageCount) throw new Error('SOURCE_PAGE_IDENTITY_MISMATCH');
  const inventory = await (await get(`${prefix}/images`)).json();
  const rows = new Map();
  for (const asset of inventory.images || []) {
    if (asset.source !== 'rulebook') continue;
    const tag = (asset.tags || []).find((value) => /^page-[1-9][0-9]*$/.test(value));
    const page = tag ? Number(tag.slice(5)) : Number(asset.page);
    if (page >= 1 && page <= pageCount) rows.set(page, asset);
  }
  if (rows.size !== pageCount) throw Object.assign(new Error('SOURCE_PAGE_VISUALS_MISSING'), { code: 'SOURCE_PAGE_VISUALS_MISSING' });
  fs.mkdirSync(pageDir, { recursive: true });
  const pages = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const asset = rows.get(page);
    const route = `${prefix}/images/${encodeURIComponent(asset.id)}/file`;
    const bytes = Buffer.from(await (await get(route)).arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) throw new Error('SOURCE_PAGE_PIXELS_INVALID');
    const target = path.join(pageDir, `page-${page}.png`);
    fs.writeFileSync(`${target}.tmp`, bytes);
    fs.renameSync(`${target}.tmp`, target);
    pages.push({ page, assetId: asset.id, sha256: sha256(bytes), width: metadata.width, height: metadata.height, sourceRoute: route });
  }
  const report = { contract: SOURCE_PAGE_VISUALS_CONTRACT, projectId, sourceSha256, pages, reused: false, extractionCalls: 0 };
  fs.writeFileSync(`${manifestPath}.tmp`, JSON.stringify(report, null, 2));
  fs.renameSync(`${manifestPath}.tmp`, manifestPath);
  return report;
}

function normalizeLabel(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function pageHasColumns(page, imageWidth) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  const maxX = blocks.reduce((max, block) => Math.max(max, Number(block.x || 0) + Number(block.width || 0)), 0);
  if (!maxX) return imageWidth > 1.35;
  const centers = blocks
    .map((block) => (Number(block.x || 0) + (Number(block.width || 0) / 2)) / maxX)
    .filter((center) => Number.isFinite(center));
  return centers.some((center) => center < 0.43) && centers.some((center) => center > 0.57);
}

function labelsForColumn(page, side) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  const maxX = blocks.reduce((max, block) => Math.max(max, Number(block.x || 0) + Number(block.width || 0)), 0) || 1;
  return blocks
    .filter((block) => {
      const center = (Number(block.x || 0) + (Number(block.width || 0) / 2)) / maxX;
      const text = normalizeLabel(block.text);
      const uppercase = text && text === text.toUpperCase() && /[A-ZÀ-Ü]/.test(text);
      const heading = Number(block.fontSize || 0) >= 10 || uppercase;
      return heading && (side === 'left' ? center <= 0.5 : center > 0.5);
    })
    .map((block) => normalizeLabel(block.text))
    .filter((label, index, labels) => label && labels.indexOf(label) === index)
    .slice(0, 24);
}

function layoutTextForColumn(page, side) {
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  const maxX = blocks.reduce((max, block) => Math.max(max, Number(block.x || 0) + Number(block.width || 0)), 0) || 1;
  return blocks
    .filter((block) => {
      const center = (Number(block.x || 0) + (Number(block.width || 0) / 2)) / maxX;
      return side === 'left' ? center <= 0.5 : center > 0.5;
    })
    .map((block) => normalizeLabel(block.text))
    .filter(Boolean)
    .join(' ');
}

function visualRegionTop(page, imageHeight) {
  const starts = [...new Set((Array.isArray(page?.blocks) ? page.blocks : [])
    .map((block) => Number(block.y))
    .filter((value) => Number.isFinite(value) && value >= 0 && value < imageHeight))]
    .sort((a, b) => a - b);
  if (starts.length < 2) return null;
  let best = null;
  for (let index = 1; index < starts.length; index += 1) {
    const gap = starts[index] - starts[index - 1];
    if (gap < Math.max(32, imageHeight * 0.045) || starts[index] < imageHeight * 0.25 || starts[index] > imageHeight * 0.72) continue;
    // The first substantial layout gap after the text-heavy upper block is
    // the most stable signal for where a visual demonstration begins. Using
    // the first gap avoids selecting a later gap between two annotations.
    best = { gap, next: starts[index] };
    break;
  }
  if (!best) return null;
  const top = Math.round(best.next - (best.gap * 0.25));
  return Math.min(imageHeight - 1, Math.max(Math.round(imageHeight * 0.18), top));
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Create stable, layout-derived visual candidates for two-column rulebook
 * spreads. The split is inferred from extracted text-block distribution; no
 * game-specific coordinates or assignments are used. These crops preserve the
 * authoritative page and pixel bounding-box provenance.
 */
export async function generateFocusedPageCrops({ pageDir, pages = [], outputDir, sourceSha256 }) {
  if (!pageDir || !outputDir) return { version: 1, sourceSha256, assets: [] };
  await fs.promises.mkdir(outputDir, { recursive: true });
  const assets = [];
  for (const page of pages) {
    const pageNumber = Number(page?.number);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue;
    const pagePath = path.resolve(pageDir, `page-${pageNumber}.png`);
    if (!fs.existsSync(pagePath)) continue;
    const metadata = await sharp(pagePath).metadata();
    const imageWidth = Number(metadata.width || 0);
    const imageHeight = Number(metadata.height || 0);
    if (!imageWidth || !imageHeight || !pageHasColumns(page, imageWidth)) continue;

    const halfWidth = Math.floor(imageWidth / 2);
    const regionTop = visualRegionTop(page, imageHeight);
    for (const [side, left, width] of [
      ['left', 0, halfWidth],
      ['right', halfWidth, imageWidth - halfWidth],
    ]) {
      const labels = labelsForColumn(page, side);
      const layoutText = layoutTextForColumn(page, side);
      const content = await sharp(pagePath).extract({ left, top: 0, width, height: imageHeight }).png().toBuffer();
      const contentHash = sha256(content);
      const filename = `focused-page-${pageNumber}-${side}-${String(sourceSha256 || contentHash).slice(0, 12)}.png`;
      const outputPath = path.join(outputDir, filename);
      if (!fs.existsSync(outputPath) || sha256(await fs.promises.readFile(outputPath)) !== contentHash) {
        await fs.promises.writeFile(outputPath, content);
      }
      assets.push({
        id: `focused-p${pageNumber}-${side}`,
        file_name: filename,
        file_path: outputPath,
        page_index: pageNumber - 1,
        source_page: pageNumber,
        native: false,
        type: 'focused-crop',
        classification: 'focused-page-crop',
        visual_kind: 'focused-page-crop',
        cropCompleteness: 'unknown',
        cropPurity: 'unknown',
        evidenceStatus: 'LAYOUT_HYPOTHESIS',
        is_component: null,
        confidence: null,
        label: `Focused rulebook panel — page ${pageNumber}, ${side}`,
        layout_labels: labels,
        layout_text: layoutText,
        bbox: { x: left, y: 0, width, height: imageHeight },
        normalized_bbox: { x: left / imageWidth, y: 0, width: width / imageWidth, height: 1 },
        contentHash,
        sourcePdfSha256: sourceSha256 || null,
        provenance: {
          sourcePdfSha256: sourceSha256 || null,
          sourcePage: pageNumber,
          bbox: { x: left, y: 0, width, height: imageHeight },
          extraction: 'layout-derived-column-crop',
        },
        dimensions: { width, height: imageHeight },
        visual_metrics: { nearBlank: null },
      });

      if (regionTop !== null && imageHeight - regionTop >= 96) {
        const regionHeight = imageHeight - regionTop;
        const region = await sharp(pagePath).extract({ left, top: regionTop, width, height: regionHeight }).png().toBuffer();
        const regionHash = sha256(region);
        const regionFilename = `focused-region-${pageNumber}-${side}-${String(sourceSha256 || regionHash).slice(0, 12)}.png`;
        const regionPath = path.join(outputDir, regionFilename);
        if (!fs.existsSync(regionPath) || sha256(await fs.promises.readFile(regionPath)) !== regionHash) {
          await fs.promises.writeFile(regionPath, region);
        }
        assets.push({
          id: `focused-region-p${pageNumber}-${side}`,
          file_name: regionFilename,
          file_path: regionPath,
          page_index: pageNumber - 1,
          source_page: pageNumber,
          native: false,
          type: 'focused-crop',
          classification: 'focused-page-region',
          visual_kind: 'focused-page-region',
          cropCompleteness: 'unknown',
          cropPurity: 'unknown',
          evidenceStatus: 'LAYOUT_HYPOTHESIS',
          is_component: null,
          confidence: null,
          label: `Focused visual region — page ${pageNumber}, ${side}`,
          layout_labels: labels,
          layout_text: layoutText,
          bbox: { x: left, y: regionTop, width, height: regionHeight },
          normalized_bbox: { x: left / imageWidth, y: regionTop / imageHeight, width: width / imageWidth, height: regionHeight / imageHeight },
          contentHash: regionHash,
          sourcePdfSha256: sourceSha256 || null,
          provenance: {
            sourcePdfSha256: sourceSha256 || null,
            sourcePage: pageNumber,
            bbox: { x: left, y: regionTop, width, height: regionHeight },
            extraction: 'layout-derived-visual-region',
          },
          dimensions: { width, height: regionHeight },
          visual_metrics: { nearBlank: null },
        });
      }
    }
  }
  return { version: 1, sourceSha256: sourceSha256 || null, assets };
}
