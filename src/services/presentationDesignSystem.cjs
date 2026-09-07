const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const PRESENTATION_TOKENS = require('./presentationDesignSystem.json');

function resolveProjectPath(filePath) {
  return path.resolve(process.cwd(), filePath);
}

function hexToFfmpeg(hex, alpha = 1) {
  return `${String(hex).replace('#', '0x')}@${Number(alpha).toFixed(2)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function estimateTextWidth(text, fontSizePx) {
  return String(text || '').split(/\r?\n/).reduce((max, line) => Math.max(max, line.length), 0) * fontSizePx * 0.52;
}

function estimateWrappedLines(text, maxChars) {
  const limit = Math.max(1, Number(maxChars) || 1);
  return String(text || '').split(/\r?\n/).reduce((count, sourceLine) => {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return count + 1;
    let lines = 1;
    let current = '';
    for (const word of words) {
      // Match the renderer's deterministic word wrapping: a logical word is
      // never silently discarded, and a new line is opened only when adding
      // it would exceed the available character budget.
      if (current && `${current} ${word}`.length > limit) {
        lines += 1;
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
      if (current.length > limit) {
        lines += Math.floor((current.length - 1) / limit);
        current = current.slice(-((current.length - 1) % limit || limit));
      }
    }
    return count + lines;
  }, 0);
}

/**
 * Solve a bounded presentation layout from content rather than from a fixed
 * screenshot geometry. The renderer uses the returned bounds as the single
 * source of truth for panel ownership and text placement.
 */
function solvePresentationLayout({
  width = 1920,
  height = 1080,
  sceneType = 'teaching',
  imageAspect = 1,
  title = '',
  heading = '',
  body = '',
  tags = '',
  reference = '',
  itemCount = 1,
  contentDensity = null,
  preferredImageProminence = 0.56,
  preferredFontPx = null,
  minimumFontPx = null,
  textSide = 'left',
  imageSide = 'right',
} = {}) {
  const safeX = Math.round(Number(width) * PRESENTATION_TOKENS.layout.safeMargins.x);
  const safeY = Math.round(Number(height) * PRESENTATION_TOKENS.layout.safeMargins.y);
  const availableWidth = Number(width) - (safeX * 2);
  const availableHeight = Number(height) - (safeY * 2);
  const scale = Math.max(0.5, Number(height) / 1080);
  const preferred = Math.round((preferredFontPx || PRESENTATION_TOKENS.typography.body.preferredPx1080) * scale);
  const minimum = Math.round((minimumFontPx || PRESENTATION_TOKENS.typography.body.minPx1080) * scale);
  const hasTitle = Boolean(String(title).trim());
  const hasHeading = Boolean(String(heading).trim());
  const hasTags = Boolean(String(tags).trim());
  const hasReference = Boolean(String(reference).trim());
  const density = contentDensity || (Number(itemCount) >= 7 || String(body).length > 220 ? 'heavy' : Number(itemCount) >= 4 || String(body).length > 90 ? 'medium' : 'light');
  const panelRatios = sceneType === 'metadata' ? [0.38, 0.41, 0.44, 0.47] : sceneType === 'list' ? [0.42, 0.46, 0.49] : density === 'heavy' ? [0.38, 0.41, 0.44] : [0.34, 0.38, 0.42];
  const imageRatios = sceneType === 'metadata' ? [0.50, 0.54, 0.58] : sceneType === 'list' ? [0.42, 0.46, 0.50] : [Math.max(0.50, preferredImageProminence - 0.04), preferredImageProminence, Math.min(0.62, preferredImageProminence + 0.04)];
  const candidates = [];
  for (const panelRatio of panelRatios) for (const imageRatio of imageRatios) {
    const gap = Math.max(Number(PRESENTATION_TOKENS.layout.panelGapPx1080) * scale, Math.round(availableWidth * 0.025));
    const panelWidth = Math.round(availableWidth * panelRatio);
    const imageWidth = Math.round(availableWidth * imageRatio);
    const fitsHorizontally = panelWidth + imageWidth + gap <= availableWidth;
    const textWidth = Math.max(100, panelWidth - Math.round(PRESENTATION_TOKENS.layout.panelPaddingPx1080 * scale * 2));
    const bodyFontPx = density === 'heavy'
      ? Math.max(minimum, Math.min(preferred, sceneType === 'metadata' ? 48 : 50))
      : preferred;
    const bodyChars = Math.max(14, Math.floor(textWidth / (bodyFontPx * 0.52)));
    const bodyLines = estimateWrappedLines(body, bodyChars);
    const titleFontPx = Math.round((sceneType === 'metadata' ? 64 : 62) * scale);
    const titleChars = Math.max(12, Math.floor(textWidth / (titleFontPx * 0.52)));
    const titleLines = hasTitle ? estimateWrappedLines(title, titleChars) : 0;
    const headingFontPx = Math.round((sceneType === 'metadata' ? 42 : 50) * scale);
    const headingLines = hasHeading ? estimateWrappedLines(heading, Math.max(12, Math.floor(textWidth / (headingFontPx * 0.52)))) : 0;
    const tagsFontPx = Math.round((sceneType === 'metadata' ? 30 : 34) * scale);
    const tagsLines = hasTags ? estimateWrappedLines(tags, Math.max(16, Math.floor(textWidth / (tagsFontPx * 0.52)))) : 0;
    const referenceFontPx = Math.round(26 * scale);
    const referenceLines = hasReference ? estimateWrappedLines(reference, Math.max(16, Math.floor(textWidth / (referenceFontPx * 0.52)))) : 0;
    const bodyLineHeightPx = Math.round(bodyFontPx * PRESENTATION_TOKENS.typography.body.lineHeight);
    const blockGap = Math.round((sceneType === 'metadata' ? 14 : 18) * scale);
    const padding = Math.round(PRESENTATION_TOKENS.layout.panelPaddingPx1080 * scale);
    const contentHeight = (titleLines * Math.round(titleFontPx * 1.12)) + (headingLines * Math.round(headingFontPx * 1.18)) + (bodyLines * bodyLineHeightPx) + (tagsLines * Math.round(tagsFontPx * 1.25)) + (referenceLines * Math.round(referenceFontPx * 1.2)) + Math.max(0, [titleLines, headingLines, bodyLines, tagsLines, referenceLines].filter(Boolean).length - 1) * blockGap;
    const panelHeight = Math.round(clamp(contentHeight + padding * 2, height * (density === 'heavy' ? 0.68 : 0.46), Math.min(availableHeight, height * 0.86)));
    const panelY = Math.round(safeY + Math.max(0, (availableHeight - panelHeight) / 2));
    const panelX = textSide === 'right' ? safeX + imageWidth + gap : safeX;
    const imageX = imageSide === 'left' ? safeX : panelX + panelWidth + gap;
    const imageHeight = Math.round(Math.min(height * 0.82, imageWidth / Math.max(0.35, Number(imageAspect) || 1)));
    const imageY = Math.round((height - imageHeight) / 2);
    const validVertical = panelY >= safeY && panelY + panelHeight <= height - safeY;
    const contentFits = contentHeight + padding * 2 <= panelHeight;
    const overflowPenalty = fitsHorizontally && validVertical && contentFits ? 0 : 100000;
    const wrapPenalty = Math.max(0, bodyLines - Number(itemCount || 1)) * (sceneType === 'list' ? 420 : 75) + Math.max(0, titleLines - 1) * 140;
    const emptyPenalty = Math.max(0, panelHeight - contentHeight - padding * 2) * 0.4;
    const readabilityReward = bodyFontPx >= preferred ? 160 : bodyFontPx >= minimum ? 80 : 0;
    const score = 10000 + readabilityReward + (imageRatio * 700) - overflowPenalty - wrapPenalty - emptyPenalty;
    let cursor = panelY + padding;
    const titleY = cursor; cursor += titleLines * Math.round(titleFontPx * 1.12) + (titleLines ? blockGap : 0);
    const headingY = cursor; cursor += headingLines * Math.round(headingFontPx * 1.18) + (headingLines ? blockGap : 0);
    const bodyY = cursor; cursor += bodyLines * bodyLineHeightPx + (bodyLines ? blockGap : 0);
    const tagsY = cursor; cursor += tagsLines * Math.round(tagsFontPx * 1.25) + (tagsLines ? blockGap : 0);
    const referenceY = cursor;
    candidates.push({ panelRatio, imageRatio, panelWidth, panelHeight, panelX, panelY, imageX, imageY, imageWidth, imageHeight, padding, textWidth, bodyFontPx, bodyLineHeightPx, titleFontPx, headingFontPx, tagsFontPx, referenceFontPx, bodyLines, titleLines, headingLines, tagsLines, referenceLines, titleY, headingY, bodyY, tagsY, referenceY, density, score, hardConstraintsSatisfied: overflowPenalty === 0 });
  }
  const valid = candidates.filter((candidate) => candidate.hardConstraintsSatisfied);
  const chosen = [...(valid.length ? valid : candidates)].sort((a, b) => b.score - a.score)[0];
  return {
    ...chosen,
    sceneType,
    textSide,
    imageSide,
    safeMargins: { x: safeX, y: safeY },
    candidateCount: candidates.length,
    validCandidateCount: valid.length,
    failedHardConstraints: valid.length === 0,
    containment: {
      panelLeft: chosen.panelX,
      panelRight: chosen.panelX + chosen.panelWidth,
      panelTop: chosen.panelY,
      panelBottom: chosen.panelY + chosen.panelHeight,
    },
  };
}

function assertLayoutContainment(layout, elements = []) {
  const violations = elements.filter((element) => element.left < layout.panelX || element.right > layout.panelX + layout.panelWidth || element.top < layout.panelY || element.bottom > layout.panelY + layout.panelHeight);
  return { valid: violations.length === 0, violations };
}

function resolvePresentationLayout({
  width = 1920,
  height = 1080,
  itemCount = 1,
  maxItemLength = 24,
  contentType = 'body',
  adjacentVisualRatio = 0.58,
  preferredFontPx = null,
  minimumFontPx = null,
} = {}) {
  const scale = Math.max(0.5, Number(height) / 1080);
  const preferred = Math.round((preferredFontPx || PRESENTATION_TOKENS.typography.body.preferredPx1080) * scale);
  const minimum = Math.round((minimumFontPx || PRESENTATION_TOKENS.typography.body.minPx1080) * scale);
  const safeContentWidth = Number(width) * (1 - (PRESENTATION_TOKENS.layout.safeMargins.x * 2));
  const listFactor = Math.min(0.12, Math.max(0, Number(itemCount) - 3) * 0.015);
  const lengthFactor = Math.min(0.12, Math.max(0, Number(maxItemLength) - 28) / 260);
  const contentFactor = contentType === 'metadata'
    ? 0.08
    : (contentType === 'list' ? 0.05 : 0);
  // Short identity callouts are editorially important and benefit from a
  // wider panel so a meaningful title stays a single logical line. Longer
  // body copy still grows through lengthFactor and caps at the brand limit.
  const shortCalloutFactor = contentType === 'body' && Number(maxItemLength) <= 40 ? 0.06 : 0;
  const basePanelRatio = contentType === 'body' ? 0.34 : 0.30;
  const panelWidthRatio = clamp(basePanelRatio + shortCalloutFactor + listFactor + lengthFactor + contentFactor, 0.28, PRESENTATION_TOKENS.layout.maxPanelWidthRatio);
  const visualWidthRatio = clamp(Math.max(adjacentVisualRatio, PRESENTATION_TOKENS.layout.minVisualWidthRatio), 0.54, 0.68);
  const panelWidth = Math.round(safeContentWidth * panelWidthRatio);
  const padding = Math.round(PRESENTATION_TOKENS.layout.panelPaddingPx1080 * scale);
  const availableTextWidth = Math.max(120, panelWidth - (padding * 2));
  const fitFont = Math.floor(availableTextWidth / Math.max(1, Number(maxItemLength) * 0.52));
  const fontSizePx = clamp(Math.min(preferred, fitFont || preferred), minimum, preferred);
  const lineHeightPx = Math.round(fontSizePx * PRESENTATION_TOKENS.typography.body.lineHeight);
  const contentHeight = Math.max(lineHeightPx, Number(itemCount) * lineHeightPx);
  const panelHeight = Math.round(clamp(contentHeight + (padding * 2), height * 0.24, height * 0.72));
  return {
    panelWidthRatio: Number(panelWidthRatio.toFixed(3)),
    visualWidthRatio: Number(visualWidthRatio.toFixed(3)),
    panelWidth,
    panelHeight,
    padding,
    fontSizePx,
    minimumFontPx: minimum,
    lineHeightPx,
    contentType,
    oneLogicalItemPerLine: fitFont >= preferred || maxItemLength <= Math.floor(availableTextWidth / (preferred * 0.52)),
  };
}

function resolvePanelStyle(variant = 'WARM_DARK') {
  const key = Object.prototype.hasOwnProperty.call(PRESENTATION_TOKENS.panels, variant) ? variant : 'WARM_DARK';
  const panel = PRESENTATION_TOKENS.panels[key];
  return {
    variant: key,
    ...panel,
    fillFfmpeg: hexToFfmpeg(panel.fill, panel.fillAlpha),
    borderFfmpeg: hexToFfmpeg(panel.border, 0.86),
    highlightFfmpeg: hexToFfmpeg(panel.highlight, 0.24),
    shadowFfmpeg: hexToFfmpeg(panel.shadow, 0.48),
  };
}

function resolveFont(role = 'body') {
  const typography = PRESENTATION_TOKENS.typography[role] || PRESENTATION_TOKENS.typography.body;
  const filePath = resolveProjectPath(typography.fontFile);
  return {
    role,
    family: typography.family,
    fontFile: filePath,
    available: fs.existsSync(filePath),
    weight: typography.weight,
  };
}

async function inspectPresentationBoxArt(filePath, { minimumWidth = 720, minimumHeight = 720, matteThreshold = 245 } = {}) {
  const absolutePath = resolveProjectPath(filePath);
  if (!fs.existsSync(absolutePath)) return { path: absolutePath, exists: false, qualityPass: false, reason: 'missing' };
  const image = sharp(absolutePath);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width; let minY = info.height; let maxX = -1; let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = ((y * info.width) + x) * info.channels;
      const alpha = data[offset + 3];
      const visible = alpha > 12 && (data[offset] < matteThreshold || data[offset + 1] < matteThreshold || data[offset + 2] < matteThreshold);
      if (visible) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    }
  }
  const usefulWidth = maxX >= minX ? maxX - minX + 1 : 0;
  const usefulHeight = maxY >= minY ? maxY - minY + 1 : 0;
  const usefulContentRatio = (usefulWidth * usefulHeight) / (info.width * info.height);
  const excessiveMatte = usefulContentRatio > 0 && usefulContentRatio < 0.42;
  const lowResolution = info.width < minimumWidth || info.height < minimumHeight;
  return {
    path: absolutePath,
    exists: true,
    sourceDimensions: { width: info.width, height: info.height },
    usefulContentBounds: { left: minX, top: minY, width: usefulWidth, height: usefulHeight },
    usefulContentRatio: Number(usefulContentRatio.toFixed(4)),
    excessiveMatte,
    lowResolution,
    qualityPass: !excessiveMatte && !lowResolution,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex'),
    reason: excessiveMatte ? 'excessive-white-matte' : (lowResolution ? 'low-resolution-for-hd' : 'quality-passed'),
  };
}

module.exports = {
  PRESENTATION_TOKENS,
  resolveProjectPath,
  resolvePresentationLayout,
  resolvePanelStyle,
  resolveFont,
  estimateTextWidth,
  hexToFfmpeg,
  inspectPresentationBoxArt,
  solvePresentationLayout,
  assertLayoutContainment,
};
