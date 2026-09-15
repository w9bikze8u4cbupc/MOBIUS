#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(process.cwd());
const SOURCE_ROOT = path.join(ROOT, 'out', 'publishability-r6', 'authorized-source-audit', 'repos-production');
const OUTPUT = path.join(SOURCE_ROOT, 'manifest.json');
const CONTACT = path.join(SOURCE_ROOT, 'contact-sheet.png');
const URLS = Object.freeze({
  fr: 'https://cdn.svc.asmodee.net/production-rprod/storage/downloads/games/7wonders-duel/press/7wd-press-fr-1632402556SavqL.zip',
  en: 'https://cdn.svc.asmodee.net/production-rprod/storage/downloads/games/7wonders-duel/press/7wd-press-en-1632402532kYctz.zip',
});
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const files = [];
for (const locale of ['fr', 'en']) {
  const localeRoot = path.join(SOURCE_ROOT, locale);
  for (const item of fs.readdirSync(localeRoot, { recursive: true, withFileTypes: true })) {
    if (!item.isFile() || /^\._|\.DS_Store$/i.test(item.name)) continue;
    const file = path.join(item.parentPath || item.path, item.name);
    if (!/\.(png|jpe?g|tiff?|pdf|ai)$/i.test(file)) continue;
    let image = null;
    try {
      const metadata = await sharp(file).metadata();
      image = { width: metadata.width, height: metadata.height, format: metadata.format, colorspace: metadata.space, alpha: metadata.hasAlpha };
    } catch {
      image = null;
    }
    files.push({
      id: `repos-${locale}-${path.basename(file, path.extname(file)).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      locale,
      filePath: file,
      relativePath: path.relative(SOURCE_ROOT, file),
      bytes: fs.statSync(file).size,
      sha256: sha256(file),
      image,
      sourceUrl: URLS[locale],
      publisher: 'Repos Production',
      platform: 'official Repos Production press portal',
      edition: '7 Wonders Duel — Repos Production, 2015',
      retrievalDate: '2026-09-06',
      licenseProvenanceState: 'OFFICIAL_PUBLISHER_PRESS_ASSET',
      canonicalMaster: true,
      resizedDuringAcquisition: false,
    });
  }
}
const imageFiles = files.filter((item) => item.image);
const columns = 3;
const cellWidth = 640;
const cellHeight = 440;
const rows = Math.ceil(imageFiles.length / columns);
const composites = [];
for (let index = 0; index < imageFiles.length; index += 1) {
  const item = imageFiles[index];
  const preview = await sharp(item.filePath).resize(cellWidth - 28, cellHeight - 82, { fit: 'contain', background: '#21150f' }).png().toBuffer();
  const label = Buffer.from(`<svg width="${cellWidth}" height="${cellHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="${cellWidth}" height="70" fill="#21150f"/><text x="14" y="27" fill="#f7ecd2" font-family="Arial" font-size="19">${item.relativePath.replace(/&/g, '&amp;')}</text><text x="14" y="54" fill="#cda35e" font-family="Arial" font-size="18">${item.image.width} × ${item.image.height} · ${item.image.format}</text></svg>`);
  const tile = await sharp({ create: { width: cellWidth, height: cellHeight, channels: 3, background: '#21150f' } })
    .composite([{ input: label, left: 0, top: 0 }, { input: preview, left: 14, top: 76 }]).png().toBuffer();
  composites.push({ input: tile, left: (index % columns) * cellWidth, top: Math.floor(index / columns) * cellHeight });
}
await sharp({ create: { width: cellWidth * columns, height: cellHeight * rows, channels: 3, background: '#170f0b' } }).composite(composites).png().toFile(CONTACT);
const contactMetadata = await sharp(CONTACT).metadata();
const manifest = {
  contract: 'mobius-authorized-high-resolution-source-manifest-v1',
  generatedAt: new Date().toISOString(),
  projectId: '7-wonders-duel',
  sourceHierarchyTier: 'official-publisher-press-assets',
  archives: ['fr', 'en'].map((locale) => ({
    locale,
    path: path.join(SOURCE_ROOT, `7wd-press-${locale}.zip`),
    sourceUrl: URLS[locale],
    sha256: sha256(path.join(SOURCE_ROOT, `7wd-press-${locale}.zip`)),
  })),
  assetCount: files.length,
  imageAssetCount: imageFiles.length,
  assets: files,
  contactSheet: { path: CONTACT, sha256: sha256(CONTACT), width: contactMetadata.width, height: contactMetadata.height, decoderValidated: contactMetadata.format === 'png' },
};
writeJson(OUTPUT, manifest);
process.stdout.write(`${JSON.stringify({ status: 'PASS', assets: files.length, images: imageFiles.length, manifest: OUTPUT, contactSheet: CONTACT }, null, 2)}\n`);
