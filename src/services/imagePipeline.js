import axios from 'axios';
import * as path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { XMLParser } from 'fast-xml-parser';
import * as pdfToImg from 'pdf-to-img';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

function createImageId(prefix = 'img') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeImageAsset(asset = {}) {
  return {
    id: asset.id || createImageId(asset.source || 'img'),
    source: asset.source || 'manual',
    originalUrl: asset.originalUrl || null,
    fileKey: asset.fileKey || null,
    width: asset.width || null,
    height: asset.height || null,
    crops: Array.isArray(asset.crops) ? asset.crops : [],
    tags: Array.isArray(asset.tags) ? asset.tags : [],
    quality: asset.quality || { score: 0.5, notes: 'pending' },
    license: asset.license || null,
  };
}

function parseBggId(raw) {
  if (!raw) return null;
  if (/^\d+$/.test(String(raw))) {
    return String(raw);
  }
  const match = /boardgame(?:\/|\.php\?id=)(\d+)/.exec(raw);
  return match ? match[1] : null;
}

async function fetchBggImages(projectId, bggIdOrUrl) {
  const bggId = parseBggId(bggIdOrUrl);
  if (!bggId) {
    throw new Error('Invalid BGG id or URL');
  }

  const response = await axios.get(`https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`);
  const parsed = xmlParser.parse(response.data || '');
  const item = parsed?.items?.item || {};
  const candidates = [];

  if (item.image) {
    candidates.push({ originalUrl: item.image, tags: ['box'], source: 'bgg' });
  }
  if (item.thumbnail) {
    candidates.push({ originalUrl: item.thumbnail, tags: ['thumbnail'], source: 'bgg' });
  }

  const gallery = Array.isArray(item.link) ? item.link : [];
  gallery
    .filter((link) => link.type === 'image')
    .forEach((link) => {
      if (link.href) {
        candidates.push({ originalUrl: link.href, tags: ['gallery'], source: 'bgg' });
      }
    });

  return candidates.map((c) => normalizeImageAsset({ ...c }));
}

async function extractRulebookImages(projectId, pdfFileKeyOrPath) {
  if (!pdfFileKeyOrPath) {
    throw new Error('pdfFileKeyOrPath is required');
  }

  const outputDir = path.join(process.cwd(), 'data', 'rulebook-images', String(projectId));
  await fsPromises.mkdir(outputDir, { recursive: true });

  const pdfResult = await pdfToImg.pdf(pdfFileKeyOrPath);
  const images = [];
  let pageIndex = 0;
  for await (const page of pdfResult) {
    pageIndex += 1;
    const filename = `page-${pageIndex}.png`;
    const filePath = path.join(outputDir, filename);
    await fsPromises.writeFile(filePath, page);
    images.push(
      normalizeImageAsset({
        id: createImageId('rulebook'),
        source: 'rulebook',
        fileKey: filePath,
        tags: ['rulebook', `page-${pageIndex}`],
      })
    );
  }

  return images;
}

async function ingestManualImage(projectId, uploadInfo) {
  if (!uploadInfo?.filePath) {
    throw new Error('filePath is required for manual images');
  }
  const stats = fs.existsSync(uploadInfo.filePath) ? fs.statSync(uploadInfo.filePath) : null;
  return normalizeImageAsset({
    id: createImageId('manual'),
    source: 'manual',
    fileKey: uploadInfo.filePath,
    tags: ['manual'],
    width: uploadInfo.width || null,
    height: uploadInfo.height || null,
    quality: { score: stats ? 0.7 : 0.5, notes: 'uploaded' },
  });
}

function runImageEnhancement(imageAsset) {
  return {
    ...imageAsset,
    quality: imageAsset.quality || { score: 0.6, notes: 'normalized' },
  };
}

export {
  createImageId,
  normalizeImageAsset,
  fetchBggImages,
  extractRulebookImages,
  ingestManualImage,
  runImageEnhancement,
};

