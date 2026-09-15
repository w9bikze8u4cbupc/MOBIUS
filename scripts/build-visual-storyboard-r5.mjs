#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { compileVisualPlans, auditVisualCoverage } = require('../src/services/visualPlan.cjs');

const ROOT = path.resolve(process.cwd());
const WIDTH = 1920;
const HEIGHT = 1080;
const PALETTE = Object.freeze({
  espresso: '#21150f', walnut: '#3b281d', walnut2: '#513725', cream: '#f7ecd2',
  gold: '#cda35e', green: '#a8dc55', muted: '#d8c7a7', ink: '#1b120d',
});

function parseArgs(argv = process.argv.slice(2)) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    out[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return out;
}

function absolute(value) { return path.isAbsolute(value) ? path.resolve(value) : path.resolve(ROOT, value); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function escapeXml(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }

function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > maxChars) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

function frameChrome(title, reference, { compact = false } = {}) {
  const titleSize = compact ? 50 : 58;
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#20130d"/><stop offset=".42" stop-color="#4a3020"/><stop offset=".68" stop-color="#5a3a25"/><stop offset="1" stop-color="#21140e"/></linearGradient>
      <radialGradient id="tableGlow"><stop stop-color="#d5a65f" stop-opacity=".16"/><stop offset="1" stop-color="#180f0b" stop-opacity="0"/></radialGradient>
      <filter id="tactile" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".012 .09" numOctaves="2" seed="17" result="noise"/><feColorMatrix in="noise" type="matrix" values="0 0 0 0 .34 0 0 0 0 .22 0 0 0 0 .14 0 0 0 .13 0"/><feBlend in="SourceGraphic" mode="soft-light"/></filter>
    </defs>
    <rect width="1920" height="1080" fill="#160f0b" fill-opacity=".24"/>
    <rect x="34" y="30" width="1852" height="1020" rx="42" fill="url(#wood)" fill-opacity=".11" stroke="${PALETTE.gold}" stroke-width="3"/>
    <rect x="34" y="30" width="1852" height="1020" rx="42" fill="url(#tableGlow)" filter="url(#tactile)"/>
    <rect x="72" y="54" width="1776" height="92" rx="26" fill="#21150f" fill-opacity=".86" stroke="${PALETTE.gold}" stroke-width="2"/>
    <text x="960" y="${compact ? 116 : 119}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Lora,Georgia,serif" font-size="${titleSize}" font-weight="700">${escapeXml(title)}</text>
    <rect x="1532" y="982" width="292" height="48" rx="16" fill="#21150f" fill-opacity=".96" stroke="${PALETTE.gold}" stroke-width="2"/>
    <text x="1678" y="1014" text-anchor="middle" fill="${PALETTE.muted}" font-family="Nunito,Arial,sans-serif" font-size="23" font-weight="700">${escapeXml(reference)}</text>
  </svg>`);
}

async function baseCanvas(backgroundPath) {
  const background = await sharp(backgroundPath)
    .resize(WIDTH, HEIGHT, { fit: 'cover' })
    .blur(12)
    .modulate({ brightness: 0.74, saturation: 1.18 })
    .png()
    .toBuffer();
  return sharp(background);
}

function referenceText(atom) {
  return `Livret p. ${[...new Set((atom.sourceRefs || []).map((ref) => ref.page))].join(', ')}`;
}

function lowerCaption(atom, plan, { topLimit = 884, maxWidth = 1440 } = {}) {
  const sourceLines = (plan.bulletLines?.length ? plan.bulletLines : atom.teaching?.displayLines || []).slice(0, 5);
  const useBullets = plan.multiIdeaBullets === true && sourceLines.length > 1;
  const copy = useBullets ? '' : sourceLines.join('   •   ');
  maxWidth = Number(plan.captionMaxWidth || maxWidth);
  const preferredFont = Number(plan.captionPreferredFontPx || 34);
  const minimumFont = 27;
  let fontSize = preferredFont;
  let lines = [];
  let width = maxWidth;
  for (; fontSize >= minimumFont; fontSize -= 1) {
    const maxChars = Math.max(42, Math.floor((width - 96) / (fontSize * 0.53)));
    lines = useBullets
      ? sourceLines.flatMap((line) => wrapText(line, Math.max(28, maxChars - 3)).map((part, index) => `${index ? '  ' : '• '}${part}`)).slice(0, 4)
      : wrapText(copy, maxChars).slice(0, 3);
    if (lines.length <= 2) break;
  }
  const lineHeight = Math.round(fontSize * 1.28);
  const requiredHeight = Math.max(76, lines.length * lineHeight + 34);
  const box = {
    x: Math.round((WIDTH - width) / 2),
    y: Math.min(topLimit, 970 - requiredHeight),
    width,
    height: requiredHeight,
  };
  const centerX = box.x + box.width / 2;
  const contentHeight = lines.length * lineHeight;
  const firstBaseline = Math.round(box.y + (box.height - contentHeight) / 2 + fontSize * 0.82);
  const rows = lines.map((line, index) => `<text x="${useBullets ? box.x + 52 : centerX}" y="${firstBaseline + index * lineHeight}"${useBullets ? '' : ' text-anchor="middle"'} fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="${fontSize}" font-weight="750">${escapeXml(line)}</text>`).join('');
  return {
    box,
    lines,
    fontSize,
    buffer: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="25" fill="#2b1c14" fill-opacity=".94" stroke="${PALETTE.gold}" stroke-width="3"/>${rows}</svg>`),
    centered: !useBullets,
    bulletStructure: useBullets,
    enlargedBeforeFontReduction: fontSize === preferredFont,
  };
}

function containGeometry(asset, box, maxScale = 1.15) {
  const availableScale = Math.min(box.width / asset.width, box.height / asset.height);
  const scale = Math.min(availableScale, maxScale);
  const width = Math.max(1, Math.round(asset.width * scale));
  const height = Math.max(1, Math.round(asset.height * scale));
  return {
    x: Math.round(box.x + (box.width - width) / 2),
    y: Math.round(box.y + (box.height - height) / 2),
    width,
    height,
    scale: Number(scale.toFixed(3)),
  };
}

function panelSvg(box, opacity = 0.9) {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="s"><feDropShadow dx="0" dy="12" stdDeviation="11" flood-opacity=".45"/></filter><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".006 .085" numOctaves="4" seed="31" result="n"/><feColorMatrix in="n" type="matrix" values=".38 0 0 0 .18 .12 .28 0 0 .10 .04 .08 .24 0 .05 0 0 0 .18 0"/><feBlend in="SourceGraphic" mode="soft-light"/></filter><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#21140e"/><stop offset=".24" stop-color="#563824"/><stop offset=".49" stop-color="#3d281b"/><stop offset=".76" stop-color="#5b3b25"/><stop offset="1" stop-color="#21140e"/></linearGradient><linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f3ce83" stop-opacity=".13"/><stop offset=".22" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#1a0f09" stop-opacity=".05"/><stop offset="1" stop-color="#090503" stop-opacity=".21"/></linearGradient></defs><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${box.radius || 28}" fill="url(#p)" fill-opacity="${opacity}" stroke="${PALETTE.gold}" stroke-width="3" filter="url(#s)"/><rect x="${box.x + 3}" y="${box.y + 3}" width="${Math.max(1, box.width - 6)}" height="${Math.max(1, box.height - 6)}" rx="${Math.max(4, (box.radius || 28) - 3)}" fill="url(#p)" filter="url(#grain)" opacity=".30"/><rect x="${box.x + 3}" y="${box.y + 3}" width="${Math.max(1, box.width - 6)}" height="${Math.max(1, box.height - 6)}" rx="${Math.max(4, (box.radius || 28) - 3)}" fill="url(#h)"/></svg>`);
}

async function rawAssetInput(asset, box, { maxScale = null } = {}) {
  const source = sharp(asset.filePath);
  const metadata = await source.metadata();
  // Transparent page/composite margins are not instructional space. Trimming
  // them before contain-fit prevents the visible object from appearing
  // off-centre and avoids single-pixel matte seams at a resized alpha edge.
  const prepared = metadata.hasAlpha
    ? await source.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true })
    : { data: await source.png().toBuffer(), info: { width: metadata.width, height: metadata.height } };
  const geometry = containGeometry(
    { ...asset, width: prepared.info.width, height: prepared.info.height },
    box,
    Number(maxScale ?? asset.maxDisplayScale ?? 1.15),
  );
  const input = await sharp(prepared.data).resize(geometry.width, geometry.height, { fit: 'contain', withoutEnlargement: false }).png().toBuffer();
  return { input: { input, left: geometry.x, top: geometry.y }, bounds: geometry };
}

function textPanelSvg(atom, box) {
  const sourceLines = (atom.teaching?.displayLines || []).slice(0, 5);
  const fontSize = sourceLines.length >= 5 ? 32 : sourceLines.length >= 4 ? 35 : 39;
  const wrapped = sourceLines.flatMap((line) => wrapText(line, Math.max(18, Math.floor((box.width - 82) / (fontSize * 0.53))))).slice(0, 7);
  const lineHeight = Math.round(fontSize * 1.38);
  const contentHeight = wrapped.length * lineHeight;
  const startY = Math.round(box.y + (box.height - contentHeight) / 2 + fontSize * 0.35);
  const centerShortCopy = sourceLines.length <= 2 && wrapped.length <= 3;
  const textX = centerShortCopy ? box.x + box.width / 2 : box.x + 42;
  const rows = wrapped.map((line, index) => `<text x="${textX}" y="${startY + index * lineHeight}"${centerShortCopy ? ' text-anchor="middle"' : ''} fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="${fontSize}" font-weight="700">${escapeXml(line)}</text>`).join('');
  return {
    buffer: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="28" fill="#2b1c14" fill-opacity=".92" stroke="${PALETTE.gold}" stroke-width="3"/>${rows}</svg>`),
    lineCount: wrapped.length,
    fontSize,
    occupiedHeight: contentHeight,
    opticalCentering: centerShortCopy ? 'CENTER' : 'SEMANTIC_LIST_LEFT',
  };
}

async function imageComposite(asset, box, label = null) {
  const labelHeight = label ? 58 : 0;
  const imageBox = { ...box, height: box.height - labelHeight };
  const geometry = containGeometry(asset, imageBox, Number(asset.maxDisplayScale || 1.15));
  const image = await sharp(asset.filePath)
    .resize(geometry.width, geometry.height, { fit: 'fill', withoutEnlargement: false })
    .png()
    .toBuffer();
  const frame = panelSvg({ x: box.x, y: box.y, width: box.width, height: box.height, radius: 24 }, 0.82);
  const labelSvg = label ? Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><text x="${box.x + box.width / 2}" y="${box.y + box.height - 17}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="30" font-weight="800">${escapeXml(label)}</text></svg>`) : null;
  return {
    inputs: [{ input: frame, left: 0, top: 0 }, { input: image, left: geometry.x, top: geometry.y }, ...(labelSvg ? [{ input: labelSvg, left: 0, top: 0 }] : [])],
    bounds: geometry,
  };
}

async function renderStandard({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom)), left: 0, top: 0 }];
  const textLines = atom.teaching?.displayLines || [];
  const desiredTextHeight = Math.min(700, Math.max(250, 100 + textLines.length * 72));
  const textBox = { x: 72, y: Math.round((HEIGHT - desiredTextHeight) / 2 + 40), width: 500, height: desiredTextHeight };
  const text = textPanelSvg(atom, textBox);
  composites.push({ input: text.buffer, left: 0, top: 0 });
  const visualRegion = { x: 620, y: 168, width: 1228, height: 806 };
  const gap = 26;
  const count = assets.length;
  const columns = count === 1 ? 1 : count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / columns);
  const cellWidth = Math.floor((visualRegion.width - gap * (columns - 1)) / columns);
  const cellHeight = Math.floor((visualRegion.height - gap * (rows - 1)) / rows);
  const visualBounds = [];
  for (let index = 0; index < count; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const box = { x: visualRegion.x + col * (cellWidth + gap), y: visualRegion.y + row * (cellHeight + gap), width: cellWidth, height: cellHeight };
    const image = await imageComposite(assets[index], box, count > 1 ? plan.labels?.[index] || null : null);
    composites.push(...image.inputs);
    visualBounds.push({ assetId: assets[index].id, ...image.bounds });
  }
  if (count > 1 && ['REAL_COMPONENT_SEQUENCE', 'REAL_CARD_COST_FOCUS'].includes(plan.compositionType) && plan.connectorStyle === 'SUBTLE') {
    const from = visualBounds[0];
    const to = visualBounds[1];
    const startX = Math.round(from.x + from.width + 10);
    const endX = Math.round(to.x - 10);
    const arrowY = Math.round((from.y + from.height / 2 + to.y + to.height / 2) / 2);
    composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><path d="M${startX} ${arrowY} H${endX - 13}" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".78" stroke-width="4" stroke-linecap="round"/><path d="M${endX - 22} ${arrowY - 8} L${endX - 10} ${arrowY} L${endX - 22} ${arrowY + 8}" fill="none" stroke="${PALETTE.gold}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`), left: 0, top: 0 });
  }
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: textBox, textLineCount: text.lineCount, visualRegion, visualBounds };
}

async function renderComponentFlow({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 92, y: 176, width: 1736, height: 585 };
  const gap = 58;
  const cellWidth = Math.floor((visualRegion.width - gap * Math.max(0, assets.length - 1)) / Math.max(1, assets.length));
  const visualBounds = [];
  for (let index = 0; index < assets.length; index += 1) {
    const box = { x: visualRegion.x + index * (cellWidth + gap), y: visualRegion.y, width: cellWidth, height: visualRegion.height };
    const image = await imageComposite(assets[index], box, plan.labels?.[index] || null);
    composites.push(...image.inputs);
    visualBounds.push({ assetId: assets[index].id, ...image.bounds });
  }
  const arrowPaths = [];
  for (let index = 0; index < visualBounds.length - 1; index += 1) {
    const from = visualBounds[index];
    const to = visualBounds[index + 1];
    const y = Math.round((from.y + from.height / 2 + to.y + to.height / 2) / 2);
    arrowPaths.push(`<path d="M${Math.round(from.x + from.width + 12)} ${y} H${Math.round(to.x - 27)}" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".76" stroke-width="4" stroke-linecap="round"/><path d="M${Math.round(to.x - 36)} ${y - 8} L${Math.round(to.x - 24)} ${y} L${Math.round(to.x - 36)} ${y + 8}" fill="none" stroke="${PALETTE.gold}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  if (plan.connectorStyle === 'SUBTLE') composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${arrowPaths.join('')}</svg>`), left: 0, top: 0 });
  const summary = plan.summaryLine || plan.labels?.at(-1) || (atom.teaching?.displayLines || []).at(-1) || '';
  const summaryBox = { x: 280, y: 805, width: 1360, height: 108 };
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="${summaryBox.x}" y="${summaryBox.y}" width="${summaryBox.width}" height="${summaryBox.height}" rx="25" fill="#2b1c14" fill-opacity=".95" stroke="${PALETTE.gold}" stroke-width="3"/><text x="960" y="873" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="35" font-weight="850">${escapeXml(summary)}</text></svg>`), left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: summaryBox, textLineCount: 1, visualRegion, visualBounds, lowerZonePurpose: 'state-transition-summary', captionCentered: true };
}

async function renderCardFamilyTableau({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const base = await baseCanvas(backgroundPath);
  const chrome = { input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 };
  const composites = [chrome];
  const baseComposites = [chrome];
  const rows = Math.ceil(Math.max(1, assets.length) / (assets.length > 4 ? 4 : Math.max(1, assets.length)));
  const visualRegion = { x: 70, y: 165, width: 1780, height: rows > 1 ? 650 : 620 };
  const gap = 20;
  const count = Math.max(1, assets.length);
  // Families must remain inspectable on a phone. Equal seven-column grids made
  // Guild cards unreadable and preserved empty geometry for symmetry. Use a
  // bounded four-column tableau and let each family own a useful card-sized cell.
  const columns = count > 4 ? 4 : count;
  // rows is calculated above because it also controls the owned visual region.
  const cellWidth = Math.floor((visualRegion.width - gap * (columns - 1)) / columns);
  const cellHeight = Math.floor((visualRegion.height - gap * (rows - 1)) / rows);
  const visualBounds = [];
  for (let index = 0; index < assets.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const box = { x: visualRegion.x + column * (cellWidth + gap), y: visualRegion.y + row * (cellHeight + gap), width: cellWidth, height: cellHeight };
    const label = plan.labels?.[index] || null;
    const panel = panelSvg({ ...box, radius: 22 }, 0.82);
    baseComposites.push({ input: panel, left: 0, top: 0 });
    if (label) baseComposites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><text x="${box.x + box.width / 2}" y="${box.y + box.height - 17}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="${rows > 1 ? 27 : 31}" font-weight="850">${escapeXml(label)}</text></svg>`), left: 0, top: 0 });
    const image = await imageComposite(assets[index], box, label);
    composites.push(...image.inputs);
    visualBounds.push({ assetId: assets[index].id, ...image.bounds });
  }
  const caption = lowerCaption(atom, plan, { topLimit: 904, maxWidth: 1700 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  baseComposites.push({ input: caption.buffer, left: 0, top: 0 });
  const animationBaseFramePath = plan.progressiveReveal === true ? target.replace(/\.png$/i, '.animation-base.png') : null;
  if (animationBaseFramePath) await base.composite(baseComposites).png({ compressionLevel: 9 }).toFile(animationBaseFramePath);
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, animationBaseFramePath, captionCentered: true, lowerZonePurpose: 'real-card-family-tableau' };
}

async function renderGuildDeckPreparation({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 70, y: 165, width: 1780, height: 700 };
  const visualBounds = [];
  const deckWidth = 255;
  for (let index = 0; index < Math.min(4, assets.length); index += 1) {
    const box = { x: 82 + index * 278, y: 180, width: deckWidth, height: 345 };
    const item = await imageComposite(assets[index], box, plan.labels?.[index] || null);
    composites.push(...item.inputs);
    visualBounds.push({ assetId: assets[index].id, ...item.bounds });
  }
  if (assets[4]) {
    const box = { x: 1215, y: 180, width: 615, height: 345 };
    const item = await imageComposite(assets[4], box, plan.labels?.[4] || 'Exemples de Guildes');
    composites.push(...item.inputs);
    visualBounds.push({ assetId: assets[4].id, ...item.bounds });
  }
  const statements = plan.preparationLines || ['Jeu séparé avant la mise en place', '3 Guildes au hasard dans l’Âge III', 'Guildes inutilisées : retour dans la boîte'];
  const lineBox = { x: 150, y: 550, width: 1620, height: 220 };
  composites.push({ input: panelSvg(lineBox, 0.94), left: 0, top: 0 });
  const rows = statements.slice(0, 3).map((line, index) => `<text x="960" y="${610 + index * 62}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="38" font-weight="830">${escapeXml(line)}</text>`).join('');
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`), left: 0, top: 0 });
  const caption = lowerCaption(atom, plan, { topLimit: 880, maxWidth: 1660 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: lineBox, textLineCount: statements.length, visualRegion, visualBounds, captionCentered: true, lowerZonePurpose: 'guild-deck-preparation' };
}

async function renderSetupPlacement({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 70, y: 165, width: 1780, height: 715 };
  const visualBounds = [];
  const main = await imageComposite(assets[0], { x: 75, y: 170, width: 1770, height: 440 }, plan.labels?.[0] || null);
  composites.push(...main.inputs);
  visualBounds.push({ assetId: assets[0].id, ...main.bounds });
  const support = assets.slice(1, 4);
  const gap = 24;
  const cellWidth = Math.floor((1770 - gap * 2) / 3);
  for (let index = 0; index < support.length; index += 1) {
    const item = await imageComposite(support[index], { x: 75 + index * (cellWidth + gap), y: 630, width: cellWidth, height: 210 }, plan.labels?.[index + 1] || null);
    composites.push(...item.inputs);
    visualBounds.push({ assetId: support[index].id, ...item.bounds });
  }
  const caption = lowerCaption(atom, plan, { topLimit: 890, maxWidth: 1700 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: true, lowerZonePurpose: 'complete-source-grounded-setup-placement' };
}

async function renderWonderDraft({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 70, y: 165, width: 1780, height: 695 };
  const visualBounds = [];
  const gap = 30;
  const width = Math.floor((visualRegion.width - gap) / 2);
  for (let index = 0; index < Math.min(2, assets.length); index += 1) {
    const item = await imageComposite(assets[index], { x: visualRegion.x + index * (width + gap), y: 175, width, height: 435 }, plan.labels?.[index] || `Groupe ${index + 1}`);
    composites.push(...item.inputs);
    visualBounds.push({ assetId: assets[index].id, ...item.bounds });
  }
  const lines = plan.selectionLines || ['1er groupe : J1 → J2 → J2 → J1', '2e groupe : J2 → J1 → J1 → J2', '4 Merveilles chacun'];
  const box = { x: 185, y: 630, width: 1550, height: 230 };
  composites.push({ input: panelSvg(box, 0.95), left: 0, top: 0 });
  const rows = lines.map((line, index) => `<text x="960" y="${695 + index * 62}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="${index === 2 ? 46 : 48}" font-weight="880">${escapeXml(line)}</text>`).join('');
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`), left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: box, textLineCount: lines.length, visualRegion, visualBounds, captionCentered: true, lowerZonePurpose: 'verified-wonder-draft-order' };
}

async function renderDiscardPileFlow({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 70, y: 165, width: 1780, height: 650 };
  const visualBounds = [];
  const labels = plan.labels || [];
  const gap = 24;
  const cellWidth = Math.floor((visualRegion.width - gap * 3) / 4);
  for (let index = 0; index < Math.min(4, assets.length); index += 1) {
    const box = { x: visualRegion.x + index * (cellWidth + gap), y: 180, width: cellWidth, height: 485 };
    const item = await imageComposite(assets[index], box, labels[index] || null);
    composites.push(...item.inputs);
    visualBounds.push({ assetId: assets[index].id, ...item.bounds });
  }
  const connector = visualBounds.slice(0, -1).map((from, index) => {
    const to = visualBounds[index + 1];
    const y = Math.round((from.y + from.height / 2 + to.y + to.height / 2) / 2);
    const x1 = Math.round(from.x + from.width + 8);
    const x2 = Math.round(to.x - 8);
    return `<path d="M${x1} ${y} H${x2 - 12}" stroke="${PALETTE.gold}" stroke-width="4" stroke-linecap="round"/><path d="M${x2 - 20} ${y - 7} L${x2 - 9} ${y} L${x2 - 20} ${y + 7}" fill="none" stroke="${PALETTE.gold}" stroke-width="4" stroke-linecap="round"/>`;
  }).join('');
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${connector}</svg>`), left: 0, top: 0 });
  const statements = plan.discardLines || ['Défausse face cachée à côté du plateau', 'Cartes retirées à la mise en place : retour dans la boîte', 'Gain = 2 pièces + 1 par carte jaune dans votre cité'];
  const box = { x: 120, y: 700, width: 1680, height: 180 };
  composites.push({ input: panelSvg(box, 0.95), left: 0, top: 0 });
  const rows = statements.map((line, index) => `<text x="960" y="${755 + index * 49}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="31" font-weight="820">${escapeXml(line)}</text>`).join('');
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`), left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: box, textLineCount: statements.length, visualRegion, visualBounds, captionCentered: true, connectorBounds: visualBounds.slice(0, -1).map((from, index) => ({ fromAssetId: from.assetId, toAssetId: visualBounds[index + 1].assetId })) };
}

async function renderComponentOverview({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 72, y: 162, width: 1776, height: 650 };
  const visualBounds = [];
  if (assets[0]) {
    const hero = await imageComposite(assets[0], { x: 90, y: 168, width: 1740, height: 220 }, plan.labels?.[0] || null);
    composites.push(...hero.inputs);
    visualBounds.push({ assetId: assets[0].id, ...hero.bounds });
  }
  const supporting = assets.slice(1);
  const columns = supporting.length === 6 ? 3 : Math.min(4, Math.max(1, supporting.length));
  const rows = Math.ceil(supporting.length / columns);
  const gap = 18;
  const cellWidth = Math.floor((1740 - gap * (columns - 1)) / columns);
  const cellHeight = Math.floor((390 - gap * Math.max(0, rows - 1)) / Math.max(1, rows));
  for (let index = 0; index < supporting.length; index += 1) {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const box = { x: 90 + col * (cellWidth + gap), y: 405 + row * (cellHeight + gap), width: cellWidth, height: cellHeight };
    const item = await imageComposite(supporting[index], box, plan.labels?.[index + 1] || null);
    composites.push(...item.inputs);
    visualBounds.push({ assetId: supporting[index].id, ...item.bounds });
  }
  const caption = lowerCaption(atom, plan, { topLimit: 908, maxWidth: 1740 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: caption.centered, lowerZonePurpose: 'dense-real-component-overview' };
}

async function renderAgeReferenceGrid({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const groups = plan.ageGroups?.length ? plan.ageGroups : [{ label: 'Structure', diagramAssetId: assets[0]?.id, exampleAssetIds: assets.slice(1).map((asset) => asset.id) }];
  const visualRegion = { x: 72, y: 160, width: 1776, height: 725 };
  const gap = 26;
  const groupWidth = Math.floor((visualRegion.width - gap * (groups.length - 1)) / groups.length);
  const visualBounds = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const gx = visualRegion.x + index * (groupWidth + gap);
    const panel = { x: gx, y: 166, width: groupWidth, height: 700 };
    composites.push({ input: panelSvg(panel, 0.78), left: 0, top: 0 });
    const diagram = byId.get(group.diagramAssetId);
    if (diagram) {
      const item = await rawAssetInput(diagram, { x: gx + 18, y: 180, width: groupWidth - 36, height: groups.length === 1 ? 350 : 330 }, { maxScale: 1 });
      composites.push(item.input);
      visualBounds.push({ assetId: diagram.id, ...item.bounds });
    }
    const examples = (group.exampleAssetIds || []).map((id) => byId.get(id)).filter(Boolean);
    const exampleY = groups.length === 1 ? 520 : 520;
    const exampleHeight = groups.length === 1 ? 310 : 305;
    const exampleGap = 24;
    const exampleWidth = Math.floor((groupWidth - 48 - exampleGap * Math.max(0, examples.length - 1)) / Math.max(1, examples.length));
    for (let exampleIndex = 0; exampleIndex < examples.length; exampleIndex += 1) {
      const box = { x: gx + 24 + exampleIndex * (exampleWidth + exampleGap), y: exampleY, width: exampleWidth, height: exampleHeight };
      const item = await rawAssetInput(examples[exampleIndex], box, { maxScale: 1.08 });
      composites.push(item.input);
      visualBounds.push({ assetId: examples[exampleIndex].id, ...item.bounds });
    }
    composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><text x="${gx + groupWidth / 2}" y="850" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="30" font-weight="900">${escapeXml(group.label || '')}</text></svg>`), left: 0, top: 0 });
  }
  const caption = lowerCaption(atom, plan, { topLimit: 910, maxWidth: 1720 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: caption.centered, lowerZonePurpose: 'independently-maximized-age-reference-groups' };
}

async function renderAccessibleCardDemonstration({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 98, y: 170, width: 1724, height: 680 };
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const layout = plan.cardLayout || [];
  const visualBounds = [];
  const outlines = [];
  for (const placement of layout) {
    const asset = byId.get(placement.assetId);
    if (!asset) continue;
    const box = {
      x: Math.round(visualRegion.x + Number(placement.x) * visualRegion.width),
      y: Math.round(visualRegion.y + Number(placement.y) * visualRegion.height),
      width: Math.round(Number(placement.width) * visualRegion.width),
      height: Math.round(Number(placement.height) * visualRegion.height),
    };
    const item = await rawAssetInput(asset, box, { maxScale: 1.1 });
    composites.push(item.input);
    visualBounds.push({ assetId: asset.id, ...item.bounds });
    const color = placement.state === 'ACCESSIBLE' ? '#a8dc55' : '#cda35e';
    const opacity = placement.state === 'ACCESSIBLE' ? 1 : 0.48;
    outlines.push(`<rect x="${item.bounds.x - 6}" y="${item.bounds.y - 6}" width="${item.bounds.width + 12}" height="${item.bounds.height + 12}" rx="15" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${placement.state === 'ACCESSIBLE' ? 7 : 3}"/>`);
  }
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${outlines.join('')}<rect x="660" y="812" width="600" height="66" rx="20" fill="#21150f" fill-opacity=".94" stroke="${PALETTE.gold}" stroke-width="3"/><text x="960" y="856" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="31" font-weight="900"><tspan fill="${PALETTE.green}">Vert</tspan> : accessible · Doré : encore recouverte</text></svg>`), left: 0, top: 0 });
  const caption = lowerCaption(atom, plan, { topLimit: 902, maxWidth: 1700 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: caption.centered, lowerZonePurpose: 'legal-card-accessibility-state' };
}

async function renderEndOfAgeTransition({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const stages = plan.stateStages || [];
  const visualRegion = { x: 76, y: 166, width: 1768, height: 690 };
  const gap = 24;
  const width = Math.floor((visualRegion.width - gap * Math.max(0, stages.length - 1)) / Math.max(1, stages.length));
  const visualBounds = [];
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const box = { x: visualRegion.x + index * (width + gap), y: 176, width, height: 610 };
    composites.push({ input: panelSvg(box, 0.82), left: 0, top: 0 });
    const stageAssets = (stage.assetIds || []).map((id) => byId.get(id)).filter(Boolean);
    const cellHeight = Math.floor(470 / Math.max(1, stageAssets.length));
    for (let assetIndex = 0; assetIndex < stageAssets.length; assetIndex += 1) {
      const item = await rawAssetInput(stageAssets[assetIndex], { x: box.x + 24, y: 198 + assetIndex * cellHeight, width: box.width - 48, height: cellHeight - 12 }, { maxScale: 1.08 });
      composites.push(item.input);
      visualBounds.push({ assetId: stageAssets[assetIndex].id, ...item.bounds });
    }
    if (!stageAssets.length) {
      composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="${box.x + 60}" y="260" width="${box.width - 120}" height="300" rx="28" fill="#160f0b" fill-opacity=".36" stroke="${PALETTE.gold}" stroke-width="3" stroke-dasharray="12 12"/><text x="${box.x + box.width / 2}" y="425" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="42" font-weight="900">Structure vide</text></svg>`), left: 0, top: 0 });
    }
    const labelLines = wrapText(stage.label || '', Math.max(16, Math.floor((box.width - 40) / 17))).slice(0, 2);
    const labelRows = labelLines.map((line, row) => `<text x="${box.x + box.width / 2}" y="${724 + row * 30}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="25" font-weight="900">${escapeXml(line)}</text>`).join('');
    composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${labelRows}</svg>`), left: 0, top: 0 });
  }
  const caption = lowerCaption(atom, plan, { topLimit: 902, maxWidth: 1710 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: caption.centered, lowerZonePurpose: 'before-last-card-after-next-age-transition' };
}

async function renderChainComparison({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 82, y: 168, width: 1756, height: 690 };
  const pairGap = 54;
  const cardGap = 26;
  const pairWidth = Math.floor((visualRegion.width - pairGap) / 2);
  const requestedCardWidth = Number(plan.comparisonCardWidthPx || 0);
  const cardWidth = requestedCardWidth > 0
    ? Math.min(requestedCardWidth, Math.floor((pairWidth - cardGap) / 2))
    : Math.floor((pairWidth - cardGap) / 2);
  const cardHeight = Number(plan.comparisonCardHeightPx || 535);
  const visualBounds = [];
  for (let index = 0; index < Math.min(4, assets.length); index += 1) {
    const pair = Math.floor(index / 2);
    const within = index % 2;
    const pairX = visualRegion.x + pair * (pairWidth + pairGap);
    const usedWidth = cardWidth * 2 + cardGap;
    const x = Math.round(pairX + (pairWidth - usedWidth) / 2 + within * (cardWidth + cardGap));
    const y = Math.round(180 + (535 - cardHeight) / 2);
    const item = await rawAssetInput(assets[index], { x, y, width: cardWidth, height: cardHeight }, { maxScale: 1 });
    composites.push(item.input);
    visualBounds.push({ assetId: assets[index].id, ...item.bounds });
  }
  const connectors = [0, 2].flatMap((index) => {
    const from = visualBounds[index]; const to = visualBounds[index + 1];
    if (!from || !to) return [];
    const y = Math.round((from.y + from.height / 2 + to.y + to.height / 2) / 2);
    return [`<path d="M${from.x + from.width + 8} ${y} H${to.x - 12}" stroke="${PALETTE.gold}" stroke-width="5" stroke-linecap="round"/><circle cx="${Math.round((from.x + from.width + to.x) / 2)}" cy="${y}" r="12" fill="${PALETTE.green}" stroke="#21150f" stroke-width="3"/>`];
  }).join('');
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${connectors}<text x="${visualRegion.x + pairWidth / 2}" y="755" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="32" font-weight="900">${escapeXml(plan.pairLabels?.[0] || 'Exemple 1')}</text><text x="${visualRegion.x + pairWidth + pairGap + pairWidth / 2}" y="755" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="32" font-weight="900">${escapeXml(plan.pairLabels?.[1] || 'Exemple 2')}</text></svg>`), left: 0, top: 0 });
  const caption = lowerCaption(atom, plan, { topLimit: 898, maxWidth: 1700 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: caption.centered, lowerZonePurpose: 'native-card-chain-symbol-comparison' };
}

async function renderGuildTeaching({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 74, y: 166, width: 1772, height: 690 };
  const count = Math.min(3, assets.length);
  const gap = count === 2 ? 64 : 28;
  const width = Math.floor((visualRegion.width - gap * Math.max(0, count - 1)) / Math.max(1, count));
  const visualBounds = [];
  for (let index = 0; index < count; index += 1) {
    const box = { x: visualRegion.x + index * (width + gap), y: 178, width, height: 520 };
    const item = await imageComposite(assets[index], box, plan.labels?.[index] || null);
    composites.push(...item.inputs);
    visualBounds.push({ assetId: assets[index].id, ...item.bounds });
    const explanation = wrapText(plan.guildExamples?.[index]?.explanation || '', 42).slice(0, 3);
    const rows = explanation.map((line, row) => `<text x="${box.x + box.width / 2}" y="${723 + row * 31}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="25" font-weight="800">${escapeXml(line)}</text>`).join('');
    composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`), left: 0, top: 0 });
  }
  const caption = lowerCaption(atom, plan, { topLimit: 894, maxWidth: 1710 });
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: caption.centered, lowerZonePurpose: 'dedicated-complex-component-family-teaching' };
}

async function renderHero({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 76, y: 164, width: 1768, height: 680 };
  const count = assets.length;
  const gap = 26;
  const cellWidth = Math.floor((visualRegion.width - gap * (count - 1)) / count);
  const visualBounds = [];
  for (let index = 0; index < count; index += 1) {
    let box = { x: visualRegion.x + index * (cellWidth + gap), y: visualRegion.y, width: cellWidth, height: visualRegion.height };
    // Do not wrap a small, resolution-bounded component in a giant empty
    // rectangle. Shrink the owned visual panel around the complete object and
    // keep that panel optically centered in the available region.
    if (count === 1) {
      const fitted = containGeometry(assets[index], box);
      if ((fitted.width * fitted.height) / (box.width * box.height) < 0.28) {
        box = {
          x: Math.round(visualRegion.x + (visualRegion.width - Math.min(visualRegion.width, fitted.width + 96)) / 2),
          y: Math.round(visualRegion.y + (visualRegion.height - Math.min(visualRegion.height, fitted.height + 96)) / 2),
          width: Math.min(visualRegion.width, fitted.width + 96),
          height: Math.min(visualRegion.height, fitted.height + 96),
        };
      }
    }
    const image = await imageComposite(assets[index], box, count > 1 ? plan.labels?.[index] || null : null);
    composites.push(...image.inputs);
    visualBounds.push({ assetId: assets[index].id, ...image.bounds });
  }
  const caption = lowerCaption(atom, plan);
  const footer = caption.box;
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  const effectiveVisualRegion = count === 1
    ? { x: visualBounds[0].x - 48, y: visualBounds[0].y - 48, width: visualBounds[0].width + 96, height: visualBounds[0].height + 96 }
    : visualRegion;
  return { textBounds: footer, textLineCount: caption.lines.length, visualRegion: effectiveVisualRegion, visualBounds, captionCentered: caption.centered };
}

async function renderWideTrack({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 76, y: 164, width: 1768, height: 710 };
  const trackBox = { x: 140, y: 182, width: 1640, height: 400 };
  const track = await imageComposite(assets[0], trackBox, null);
  composites.push(...track.inputs);
  const visualBounds = [{ assetId: assets[0].id, ...track.bounds }];
  const callouts = (plan.labels?.length ? plan.labels : atom.teaching?.displayLines || []).slice(0, 4);
  const gap = 20;
  const calloutWidth = Math.floor((1640 - gap * Math.max(0, callouts.length - 1)) / Math.max(1, callouts.length));
  const calloutRows = callouts.map((label, index) => {
    const x = 140 + index * (calloutWidth + gap);
    const lines = wrapText(label, Math.max(12, Math.floor(calloutWidth / 20))).slice(0, 2);
    const textRows = lines.map((line, lineIndex) => `<text x="${x + calloutWidth / 2}" y="${647 + lineIndex * 34}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="28" font-weight="800">${escapeXml(line)}</text>`).join('');
    return `<rect x="${x}" y="602" width="${calloutWidth}" height="112" rx="20" fill="#2b1c14" fill-opacity=".94" stroke="${PALETTE.gold}" stroke-width="3"/>${textRows}`;
  }).join('');
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${calloutRows}</svg>`), left: 0, top: 0 });
  const caption = lowerCaption(atom, plan);
  const footer = caption.box;
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: footer, textLineCount: caption.lines.length, visualRegion, visualBounds, lowerZonePurpose: 'instructional-track-callouts', captionCentered: true };
}

async function renderMilitaryDemonstration({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 76, y: 164, width: 1768, height: 710 };
  const trackBox = { x: 110, y: 190, width: 1700, height: 395 };
  const track = await imageComposite(assets[0], trackBox, null);
  composites.push(...track.inputs);
  const visualBounds = [{ assetId: assets[0].id, ...track.bounds }];
  const motionCue = (plan.motionCues || [])[0];
  const startX = motionCue ? Math.round(track.bounds.x + track.bounds.width * Number(motionCue.startPosition?.x ?? 0.48)) : 960;
  const endX = motionCue ? Math.round(track.bounds.x + track.bounds.width * Number(motionCue.endPosition?.x ?? 0.78)) : 1360;
  const pathY = motionCue ? Math.round(track.bounds.y + track.bounds.height * Number(motionCue.startPosition?.y ?? 0.48)) : 430;
  const movementOverlay = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><defs><marker id="goldArrow" markerWidth="12" markerHeight="12" refX="10" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${PALETTE.gold}"/></marker><filter id="s"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity=".75"/></filter></defs><path d="M${startX} ${pathY} C${Math.round((startX + endX) / 2)} ${pathY - 34},${Math.round((startX + endX) / 2)} ${pathY - 34},${endX} ${pathY}" fill="none" stroke="${PALETTE.gold}" stroke-opacity=".88" stroke-width="7" stroke-dasharray="14 12" marker-end="url(#goldArrow)" filter="url(#s)"/><text x="960" y="548" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="29" font-weight="900">Boucliers → déplacement → seuil → capitale</text></svg>`);
  composites.push({ input: movementOverlay, left: 0, top: 0 });
  const callouts = (plan.labels || []).slice(0, 3);
  const gap = 22;
  const width = Math.floor((1660 - gap * 2) / 3);
  const rows = callouts.map((label, index) => {
    const x = 130 + index * (width + gap);
    const lines = wrapText(label, Math.max(18, Math.floor(width / 19))).slice(0, 2);
    const contentHeight = lines.length * 33;
    const first = 632 + (82 - contentHeight) / 2 + 26;
    const text = lines.map((line, row) => `<text x="${x + width / 2}" y="${first + row * 33}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="27" font-weight="850">${escapeXml(line)}</text>`).join('');
    return `<rect x="${x}" y="622" width="${width}" height="102" rx="20" fill="#2b1c14" fill-opacity=".94" stroke="${PALETTE.gold}" stroke-width="3"/>${text}`;
  }).join('');
  composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`), left: 0, top: 0 });
  const caption = lowerCaption(atom, plan);
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  const animationBaseFramePath = target.replace(/\.png$/i, '.animation-base.png');
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(animationBaseFramePath);
  const reviewCanvas = await baseCanvas(backgroundPath);
  const reviewComposites = [...composites];
  if (assets[1]) {
    const requestedWidth = Number(motionCue?.widthPx || 108);
    const scale = Math.min(1, requestedWidth / assets[1].width);
    const pawnWidth = Math.max(24, Math.round(assets[1].width * scale));
    const pawnHeight = Math.max(24, Math.round(assets[1].height * scale));
    const pawn = await sharp(assets[1].filePath).resize(pawnWidth, pawnHeight, { fit: 'fill' }).png().toBuffer();
    const pawnGeometry = { x: Math.round(endX - pawnWidth / 2), y: Math.round(pathY - pawnHeight / 2), width: pawnWidth, height: pawnHeight, scale: Number(scale.toFixed(3)) };
    reviewComposites.push({ input: pawn, left: pawnGeometry.x, top: pawnGeometry.y });
    visualBounds.push({ assetId: assets[1].id, ...pawnGeometry });
  }
  await reviewCanvas.composite(reviewComposites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, lowerZonePurpose: 'military-movement-and-threshold-demonstration', captionCentered: true, animationBaseFramePath };
}

async function renderAgeGuildIdentity({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const visualRegion = { x: 76, y: 164, width: 1768, height: 710 };
  const identityBox = { x: 92, y: 174, width: 650, height: 690 };
  const identity = await imageComposite(assets[0], identityBox, plan.labels?.[0] || 'Dos des paquets et guildes');
  composites.push(...identity.inputs);
  const visualBounds = [{ assetId: assets[0].id, ...identity.bounds }];
  const examples = assets.slice(1, 4);
  const gap = 18;
  const rowHeight = Math.floor((identityBox.height - gap * 2) / 3);
  for (let index = 0; index < examples.length; index += 1) {
    const box = { x: 775, y: identityBox.y + index * (rowHeight + gap), width: 1055, height: rowHeight };
    const item = await imageComposite(examples[index], box, plan.labels?.[index + 1] || null);
    composites.push(...item.inputs);
    visualBounds.push({ assetId: examples[index].id, ...item.bounds });
  }
  const caption = lowerCaption(atom, plan);
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: caption.box, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: true, lowerZonePurpose: 'age-and-guild-physical-identity' };
}

async function renderProgressiveScorepad({ atom, plan, assets, backgroundPath, target }) {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const rows = plan.scoreExample?.rows || [];
  const total = plan.scoreExample?.total || null;
  const base = await baseCanvas(backgroundPath);
  const baseComposites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  const scorepadBox = { x: 82, y: 176, width: 500, height: 700 };
  const scorepad = await imageComposite(assets[0], scorepadBox, 'Carnet de score officiel');
  baseComposites.push(...scorepad.inputs);
  const ledger = { x: 620, y: 176, width: 1210, height: 700 };
  baseComposites.push({ input: panelSvg(ledger, 0.92), left: 0, top: 0 });
  const allRows = [...rows, total];
  const rowHeight = Math.floor((ledger.height - 34) / Math.max(1, allRows.length));
  const visualBounds = [{ assetId: assets[0].id, ...scorepad.bounds }];
  const valueElements = [];
  const timedOverlayTimeline = [];
  for (let index = 0; index < allRows.length; index += 1) {
    const row = allRows[index];
    const y = ledger.y + 17 + index * rowHeight;
    const asset = row?.assetId ? byId.get(row.assetId) : null;
    if (asset) {
      const thumb = await imageComposite(asset, { x: ledger.x + 18, y: y + 7, width: 190, height: rowHeight - 14 }, null);
      baseComposites.push(...thumb.inputs);
      visualBounds.push({ assetId: asset.id, ...thumb.bounds });
    }
    const fill = index === allRows.length - 1 ? '#3f2a1d' : '#f4e6ca';
    const ink = index === allRows.length - 1 ? PALETTE.cream : PALETTE.ink;
    baseComposites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="${ledger.x + 224}" y="${y + 7}" width="${ledger.width - 246}" height="${rowHeight - 14}" rx="18" fill="${fill}" fill-opacity=".96" stroke="${PALETTE.gold}" stroke-width="2"/><text x="${ledger.x + 258}" y="${y + rowHeight / 2 + 12}" fill="${ink}" font-family="Nunito,Arial,sans-serif" font-size="34" font-weight="850">${escapeXml(row.label)}</text>${row.formula ? `<text x="${ledger.x + 650}" y="${y + rowHeight / 2 + 10}" fill="${ink}" fill-opacity=".76" font-family="Nunito,Arial,sans-serif" font-size="27" font-weight="700">${escapeXml(row.formula)}</text>` : ''}</svg>`), left: 0, top: 0 });
    const valueX = ledger.x + ledger.width - 86;
    const valueY = Math.round(y + rowHeight / 2 + 13);
    valueElements.push(`<text x="${valueX}" y="${valueY}" text-anchor="middle" fill="${ink}" font-family="Nunito,Arial,sans-serif" font-size="39" font-weight="950">${escapeXml(row.value)}</text>`);
    timedOverlayTimeline.push({ text: String(row.value), x: valueX, y: valueY, startRatio: Number(row.revealRatio ?? (0.12 + index * 0.12)), endRatio: 1, fontSize: 39, fontColor: ink, background: index === allRows.length - 1 ? '#3f2a1d' : '#f4e6ca' });
  }
  baseComposites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><text x="960" y="922" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="28" font-weight="800">Exemple pédagogique source-valide · les valeurs apparaissent une ligne à la fois</text></svg>`), left: 0, top: 0 });
  const animationBaseFramePath = target.replace(/\.png$/i, '.animation-base.png');
  await base.composite(baseComposites).png({ compressionLevel: 9 }).toFile(animationBaseFramePath);
  const finalCanvas = await baseCanvas(backgroundPath);
  const finalComposites = [...baseComposites, { input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${valueElements.join('')}</svg>`), left: 0, top: 0 }];
  await finalCanvas.composite(finalComposites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: ledger, textLineCount: allRows.length, visualRegion: { x: 76, y: 164, width: 1768, height: 730 }, visualBounds, animationBaseFramePath, timedOverlayTimeline, captionCentered: false, explanatoryLineCentered: true, lowerZonePurpose: 'progressive-source-grounded-scoring-example' };
}

async function renderAspectMosaic({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  // Reserve a real gap above the lower caption. Grid labels may not sit under
  // an overlapping caption panel.
  const visualRegion = { x: 76, y: 164, width: 1768, height: 670 };
  const gap = 24;
  const visualBounds = [];
  const widestIndex = assets.reduce((best, asset, index) => (asset.width / asset.height) > (assets[best].width / assets[best].height) ? index : best, 0);
  const ordered = [assets[widestIndex], ...assets.filter((_, index) => index !== widestIndex)];
  const orderedLabels = [plan.labels?.[widestIndex], ...assets.map((_, index) => plan.labels?.[index]).filter((_, index) => index !== widestIndex)];
  const topHeight = ordered.length > 1 ? 324 : visualRegion.height;
  const topBox = { x: visualRegion.x, y: visualRegion.y, width: visualRegion.width, height: topHeight };
  const top = await imageComposite(ordered[0], topBox, orderedLabels[0] || null);
  composites.push(...top.inputs);
  visualBounds.push({ assetId: ordered[0].id, ...top.bounds });
  const remainder = ordered.slice(1);
  if (remainder.length) {
    const bottomY = visualRegion.y + topHeight + gap;
    const bottomHeight = visualRegion.height - topHeight - gap;
    const cellWidth = Math.floor((visualRegion.width - gap * (remainder.length - 1)) / remainder.length);
    for (let index = 0; index < remainder.length; index += 1) {
      const box = { x: visualRegion.x + index * (cellWidth + gap), y: bottomY, width: cellWidth, height: bottomHeight };
      const item = await imageComposite(remainder[index], box, orderedLabels[index + 1] || null);
      composites.push(...item.inputs);
      visualBounds.push({ assetId: remainder[index].id, ...item.bounds });
    }
  }
  const caption = lowerCaption(atom, plan);
  const footer = caption.box;
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: footer, textLineCount: caption.lines.length, visualRegion, visualBounds, captionCentered: true };
}

async function renderSourceFaithful({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom), { compact: true }), left: 0, top: 0 }];
  // Reserve a real lower zone for the instructional footer.  Source-faithful
  // diagrams must remain fully visible; the footer may never cover their
  // lowest semantic row (the previous Age-layout frame did exactly that).
  const mainBox = { x: 76, y: 165, width: 1768, height: 720 };
  const main = await imageComposite(assets[0], mainBox, null);
  composites.push(...main.inputs);
  const visualBounds = [{ assetId: assets[0].id, ...main.bounds }];
  if (assets[1]) {
    const supportBox = { x: 1570, y: 670, width: 220, height: 190 };
    const support = await imageComposite(assets[1], supportBox, null);
    composites.push(...support.inputs);
    visualBounds.push({ assetId: assets[1].id, ...support.bounds });
  }
  const caption = lowerCaption(atom, plan);
  const footer = caption.box;
  composites.push({ input: caption.buffer, left: 0, top: 0 });
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: footer, textLineCount: caption.lines.length, visualRegion: mainBox, visualBounds, captionCentered: true };
}

async function renderScoring({ atom, plan, assets, backgroundPath, target }) {
  const canvas = await baseCanvas(backgroundPath);
  const composites = [{ input: frameChrome(atom.teaching?.heading || atom.title, referenceText(atom)), left: 0, top: 0 }];
  const rows = plan.labels?.length > 1 ? plan.labels : (atom.teaching?.displayLines || plan.labels || []).slice(0, 6);
  const ledger = { x: 88, y: 170, width: 1744, height: 790 };
  composites.push({ input: panelSvg(ledger, 0.92), left: 0, top: 0 });
  const rowHeight = Math.floor((ledger.height - 50) / Math.max(1, rows.length));
  const visualBounds = [];
  for (let index = 0; index < rows.length; index += 1) {
    const asset = assets[index % assets.length];
    const y = ledger.y + 25 + index * rowHeight;
    const thumbBox = { x: ledger.x + 26, y: y + 7, width: 260, height: rowHeight - 14 };
    const image = await imageComposite(asset, thumbBox, null);
    composites.push(...image.inputs);
    visualBounds.push({ assetId: asset.id, ...image.bounds });
    composites.push({ input: Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="${ledger.x + 305}" y="${y + 7}" width="${ledger.width - 340}" height="${rowHeight - 14}" rx="19" fill="#f5ead2" fill-opacity=".94" stroke="${PALETTE.gold}" stroke-width="2"/><circle cx="${ledger.x + 350}" cy="${y + rowHeight / 2}" r="24" fill="${PALETTE.walnut2}" stroke="${PALETTE.gold}" stroke-width="2"/><text x="${ledger.x + 350}" y="${y + rowHeight / 2 + 10}" text-anchor="middle" fill="${PALETTE.cream}" font-family="Nunito,Arial,sans-serif" font-size="26" font-weight="900">${index + 1}</text><text x="${ledger.x + 395}" y="${y + rowHeight / 2 + 14}" fill="${PALETTE.ink}" font-family="Nunito,Arial,sans-serif" font-size="38" font-weight="850">${escapeXml(rows[index])}</text><path d="M${ledger.x + ledger.width - 165} ${y + rowHeight / 2} h70" stroke="${PALETTE.gold}" stroke-width="5" stroke-linecap="round"/><text x="${ledger.x + ledger.width - 72}" y="${y + rowHeight / 2 + 12}" text-anchor="middle" fill="${PALETTE.walnut2}" font-family="Nunito,Arial,sans-serif" font-size="28" font-weight="900">+</text></svg>`), left: 0, top: 0 });
  }
  await canvas.composite(composites).png({ compressionLevel: 9 }).toFile(target);
  return { textBounds: ledger, textLineCount: rows.length, visualRegion: ledger, visualBounds };
}

function resolveFocusCueTimeline(project, plan, visualBounds) {
  const regionsByAsset = project.cardSemanticRegions || {};
  const cues = [];
  for (const cue of plan.focusCues || []) {
    let resolved = 0;
    for (const bounds of visualBounds) {
      if (cue.assetId && bounds.assetId !== cue.assetId) continue;
      const normalized = regionsByAsset[bounds.assetId]?.[cue.semanticRegion];
      if (!Array.isArray(normalized) || normalized.length !== 4) continue;
      const [x0, y0, x1, y1] = normalized.map(Number);
      cues.push({
        narrationClause: cue.narrationClause,
        semanticRegion: cue.semanticRegion,
        assetId: bounds.assetId,
        startRatio: Number(cue.startRatio),
        endRatio: Number(cue.endRatio),
        focusStyle: 'MOBIUS_RESTRAINED_GOLD_OUTLINE',
        absoluteBounds: {
          x: Math.round(bounds.x + x0 * bounds.width),
          y: Math.round(bounds.y + y0 * bounds.height),
          width: Math.round((x1 - x0) * bounds.width),
          height: Math.round((y1 - y0) * bounds.height),
        },
        confidence: 1,
        sourceRefs: plan.sourceRefs || [],
      });
      resolved += 1;
    }
    if (!resolved) cues.push({ ...cue, unresolved: true, reason: `No verified ${cue.semanticRegion} annotation for selected assets.` });
  }
  return cues;
}

function resolveMotionCueTimeline(plan, visualBounds, assetsById) {
  const byBound = new Map(visualBounds.map((bounds) => [bounds.assetId, bounds]));
  return (plan.motionCues || []).map((cue) => {
    const relative = byBound.get(cue.relativeToAssetId);
    const asset = assetsById.get(cue.assetId);
    if (!relative || !asset) return { ...cue, unresolved: true, reason: 'Motion cue asset or reference bounds unavailable.' };
    const width = Math.max(24, Math.min(Number(cue.widthPx || asset.width), Number(asset.width)));
    const height = Math.max(24, Math.round(width * Number(asset.height) / Number(asset.width)));
    const point = (position = {}) => ({
      x: Math.round(relative.x + relative.width * Number(position.x ?? 0.5) - width / 2),
      y: Math.round(relative.y + relative.height * Number(position.y ?? 0.5) - height / 2),
    });
    return {
      ...cue,
      assetPath: asset.filePath,
      spriteWidthPx: width,
      spriteHeightPx: height,
      startAbsolute: point(cue.startPosition),
      endAbsolute: point(cue.endPosition),
      confidence: Number(cue.confidence ?? 1),
    };
  });
}

async function main() {
  const args = parseArgs();
  if (!args.project || !args.knowledge || !args.assets || !args.out) throw new Error('Usage: --project <visual-plan.json> --knowledge <knowledge.json> --assets <manifest.json> --out <directory>');
  const project = readJson(absolute(args.project));
  const knowledge = readJson(absolute(args.knowledge));
  const assetLibrary = readJson(absolute(args.assets));
  const outputDir = absolute(args.out);
  fs.mkdirSync(outputDir, { recursive: true });
  const projectPlans = project.plans.map((plan) => ({ ...plan, reviewState: plan.reviewState || project.defaultReviewState }));
  const plans = compileVisualPlans({ atoms: knowledge.ruleAtoms, projectPlans, assets: assetLibrary.assets });
  const byId = new Map(assetLibrary.assets.map((asset) => [asset.id, asset]));
  const atomById = new Map(knowledge.ruleAtoms.map((atom) => [atom.id, atom]));
  const frames = [];

  for (const plan of plans) {
    if (!plan.validation.valid) throw new Error(`${plan.ruleAtomId}: invalid VisualPlan ${JSON.stringify(plan.validation.violations)}`);
    const atom = atomById.get(plan.ruleAtomId);
    const assets = plan.actualGameAssetIds.map((id) => byId.get(id));
    const target = path.join(outputDir, `${plan.ruleAtomId}.png`);
    const requestedBackground = plan.backgroundAssetId ? byId.get(plan.backgroundAssetId) : null;
    const primaryBackground = requestedBackground
      || (project.policy?.sceneMatchedBackground === true
        ? assets.find((asset) => Number(asset.width || 0) * Number(asset.height || 0) >= 250000)
        : null);
    const parameters = {
      atom,
      plan,
      assets,
      backgroundPath: primaryBackground?.filePath || absolute(project.identityBackground),
      target,
    };
    const layout = plan.compositionType === 'REAL_PROGRESSIVE_SCOREPAD'
      ? await renderProgressiveScorepad(parameters)
      : plan.compositionType === 'REAL_COMPONENT_OVERVIEW'
        ? await renderComponentOverview(parameters)
      : plan.compositionType === 'REAL_AGE_REFERENCE_GRID'
        ? await renderAgeReferenceGrid(parameters)
      : plan.compositionType === 'REAL_ACCESSIBLE_CARD_DEMONSTRATION'
        ? await renderAccessibleCardDemonstration(parameters)
      : plan.compositionType === 'REAL_END_OF_AGE_TRANSITION'
        ? await renderEndOfAgeTransition(parameters)
      : plan.compositionType === 'REAL_CHAIN_COMPARISON'
        ? await renderChainComparison(parameters)
      : plan.compositionType === 'REAL_GUILD_TEACHING'
        ? await renderGuildTeaching(parameters)
      : plan.compositionType === 'REAL_CARD_FAMILY_TABLEAU'
        ? await renderCardFamilyTableau(parameters)
      : plan.compositionType === 'REAL_GUILD_DECK_PREPARATION'
        ? await renderGuildDeckPreparation(parameters)
      : plan.compositionType === 'REAL_SETUP_PLACEMENT'
        ? await renderSetupPlacement(parameters)
      : plan.compositionType === 'REAL_WONDER_DRAFT'
        ? await renderWonderDraft(parameters)
      : plan.compositionType === 'REAL_DISCARD_PILE_FLOW'
        ? await renderDiscardPileFlow(parameters)
      : plan.compositionType === 'REAL_AGE_GUILD_IDENTITY'
        ? await renderAgeGuildIdentity(parameters)
      : plan.compositionType === 'REAL_SCORING_LEDGER'
      ? await renderScoring(parameters)
      : plan.compositionType === 'REAL_MILITARY_DEMONSTRATION'
        ? await renderMilitaryDemonstration(parameters)
      : plan.compositionType === 'REAL_COMPONENT_FLOW'
        ? await renderComponentFlow(parameters)
      : plan.compositionType === 'REAL_BOARD_TRACK_FOCUS'
        ? await renderWideTrack(parameters)
      : plan.compositionType === 'REAL_MILITARY_ZONE_OVERLAY'
        ? await renderWideTrack(parameters)
      : ['REAL_SYMBOL_COMPARISON', 'REAL_SETUP_LAYOUT'].includes(plan.compositionType)
        ? await renderAspectMosaic(parameters)
      : plan.compositionType === 'SOURCE_FAITHFUL_DIAGRAM'
        ? await renderSourceFaithful(parameters)
      : ['REAL_COMPONENT_HERO', 'REAL_BOARD_TRACK_FOCUS', 'SOURCE_FAITHFUL_DIAGRAM'].includes(plan.compositionType)
        ? await renderHero(parameters)
        : await renderStandard(parameters);
    const metadata = await sharp(target).metadata();
    const actualPixelArea = layout.visualBounds.reduce((sum, bounds) => sum + bounds.width * bounds.height, 0);
    const visualPaneArea = layout.visualRegion.width * layout.visualRegion.height;
    const occupancy = Number((actualPixelArea / visualPaneArea).toFixed(3));
    const minimumOccupancy = plan.compositionType === 'REAL_SCORING_LEDGER'
      ? 0.055
      : plan.compositionType === 'REAL_PROGRESSIVE_SCOREPAD'
        ? 0.18
        : plan.compositionType === 'REAL_END_OF_AGE_TRANSITION'
          ? 0.12
        : 0.20;
    const focusCueTimeline = resolveFocusCueTimeline(project, plan, layout.visualBounds);
    const motionCueTimeline = resolveMotionCueTimeline(plan, layout.visualBounds, byId);
    const unresolvedFocusCues = focusCueTimeline.filter((cue) => cue.unresolved);
    const unresolvedMotionCues = motionCueTimeline.filter((cue) => cue.unresolved);
    const undersizedInstructionalBounds = plan.mobileMinimumAssetWidthPx > 0
      ? layout.visualBounds.filter((bounds) => Number(bounds.width) < plan.mobileMinimumAssetWidthPx)
      : [];
    frames.push({
      sceneId: `knowledge-${atom.id}`,
      ruleAtomId: atom.id,
      filePath: target,
      sha256: sha256(target),
      width: metadata.width,
      height: metadata.height,
      visualPlan: plan,
      actualGameAssetIds: plan.actualGameAssetIds,
      containsActualGamePixels: true,
      visualClassification: assets.length > 1 ? 'SOURCE_FAITHFUL_DIAGRAM_WITH_REAL_ASSETS' : assets[0].visualClassification,
      sourceType: 'DETERMINISTIC_COMPOSITE_WITH_REAL_ASSETS',
      sourceRefs: atom.sourceRefs,
      provenance: { projectId: project.projectId, sourcePdfSha256: project.sourcePdfSha256, componentAssets: assets.map((asset) => ({ id: asset.id, sha256: asset.sha256, provenance: asset.provenance })) },
      layout: {
        ...layout,
        actualPixelOccupancy: occupancy,
        visualAreaTarget: plan.visualAreaTarget,
        centered: true,
        fit: 'CONTAIN',
        backgroundTreatment: primaryBackground
          ? { mode: 'MATCH_PRIMARY_VISUAL', assetId: primaryBackground.id }
          : { mode: 'IDENTITY_FALLBACK', assetId: null },
      },
      focusCueTimeline,
      motionCueTimeline,
      timedOverlayTimeline: layout.timedOverlayTimeline || [],
      animationBaseFramePath: layout.animationBaseFramePath || null,
      cropCompleteness: 'complete',
      cropPurity: 'clean',
      visualUtility: 'EXACT_INSTRUCTIONAL',
      reviewState: 'accepted',
      includesPauseCue: false,
      qaStatus: occupancy >= minimumOccupancy && unresolvedFocusCues.length === 0 && unresolvedMotionCues.length === 0 && undersizedInstructionalBounds.length === 0 ? 'PASS' : 'FAIL',
      qaViolations: [
        ...(occupancy >= minimumOccupancy ? [] : ['insufficient-actual-game-pixel-occupancy']),
        ...unresolvedFocusCues.map((cue) => `unresolved-focus-cue:${cue.semanticRegion}`),
        ...unresolvedMotionCues.map(() => 'unresolved-motion-cue'),
        ...undersizedInstructionalBounds.map((bounds) => `instructional-asset-below-mobile-minimum:${bounds.assetId}:${bounds.width}<${plan.mobileMinimumAssetWidthPx}`),
      ],
    });
  }

  const coverage = auditVisualCoverage({ atoms: knowledge.ruleAtoms, plans, assets: assetLibrary.assets });
  const frameViolations = frames.flatMap((frame) => frame.qaViolations.map((violation) => ({ sceneId: frame.sceneId, violation })));
  const manifest = {
    contract: 'mobius-visual-first-storyboard-v1',
    generatedAt: new Date().toISOString(),
    projectId: project.projectId,
    sourcePdfSha256: project.sourcePdfSha256,
    width: WIDTH,
    height: HEIGHT,
    assetCount: frames.length,
    frameCount: frames.length,
    assets: frames.map((frame) => ({
      id: `visual-${frame.ruleAtomId}`,
      atomIds: [frame.ruleAtomId],
      filePath: frame.filePath,
      width: frame.width,
      height: frame.height,
      containsActualGamePixels: true,
      visualClassification: frame.visualClassification,
      sourceType: frame.sourceType,
      visualUtility: frame.visualUtility,
      semanticObjects: atomById.get(frame.ruleAtomId).visualRequirement?.requiredObjects || [],
      visibleLabels: [...new Set([
        atomById.get(frame.ruleAtomId).teaching?.heading,
        ...(atomById.get(frame.ruleAtomId).teaching?.displayLines || []),
        ...(frame.visualPlan.labels || []),
        ...frame.visualPlan.actualGameAssetIds.flatMap((id) => byId.get(id)?.visibleLabels || []),
      ].filter(Boolean))],
      relationship: atomById.get(frame.ruleAtomId).visualRequirement?.requiredRelationship || null,
      sourceDimensions: { width: frame.width, height: frame.height },
      nativeMaster: false,
      reviewedDerivative: true,
      dominantInstructionalLanguage: 'fr-CA',
      cropCompleteness: frame.cropCompleteness,
      cropPurity: frame.cropPurity,
      sourceRefs: frame.sourceRefs,
      provenance: frame.provenance,
      sha256: frame.sha256,
      reviewState: frame.reviewState,
      renderMode: 'visual-first-full-frame',
      includesPauseCue: frame.includesPauseCue,
      layoutMetrics: frame.layout,
      focusCueTimeline: frame.focusCueTimeline,
      motionCueTimeline: frame.motionCueTimeline,
      timedOverlayTimeline: frame.timedOverlayTimeline,
      animationBaseFramePath: frame.animationBaseFramePath,
    })),
    frames,
    visualCoverage: coverage,
    qa: { status: coverage.status === 'PASS' && frameViolations.length === 0 ? 'PASS' : 'FAIL', violations: frameViolations },
  };
  const manifestPath = path.join(outputDir, 'manifest.json');
  writeJson(manifestPath, manifest);
  process.stdout.write(`${JSON.stringify({ status: manifest.qa.status, frames: frames.length, coverage: coverage.metrics, manifestPath }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
