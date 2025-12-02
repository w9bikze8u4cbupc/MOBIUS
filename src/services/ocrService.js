import Tesseract from 'tesseract.js';
import sharp from 'sharp';

let worker = null;

async function getWorker() {
  if (!worker) {
    worker = await Tesseract.createWorker('eng');
  }
  return worker;
}

export async function extractTextFromImage(imageBuffer) {
  try {
    const w = await getWorker();
    const { data } = await w.recognize(imageBuffer);
    
    return {
      text: data.text,
      words: data.words.map(word => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0
        }
      })),
      confidence: data.confidence
    };
  } catch (err) {
    console.error('OCR extraction error:', err.message);
    return { text: '', words: [], confidence: 0 };
  }
}

export async function extractTextNearRegion(pageImageBuffer, region, marginPercent = 0.15) {
  try {
    const metadata = await sharp(pageImageBuffer).metadata();
    const { width: pageWidth, height: pageHeight } = metadata;
    
    const regionX = Math.floor(region.x * pageWidth);
    const regionY = Math.floor(region.y * pageHeight);
    const regionW = Math.floor(region.width * pageWidth);
    const regionH = Math.floor(region.height * pageHeight);
    
    const marginX = Math.floor(regionW * marginPercent);
    const marginY = Math.floor(regionH * marginPercent);
    
    const expandedLeft = Math.max(0, regionX - marginX);
    const expandedTop = Math.max(0, regionY - marginY - regionH * 0.5);
    const expandedWidth = Math.min(regionW + marginX * 2, pageWidth - expandedLeft);
    const expandedHeight = Math.min(regionH + marginY * 2 + regionH * 0.5, pageHeight - expandedTop);
    
    if (expandedWidth < 50 || expandedHeight < 50) {
      return { text: '', words: [], nearbyLabels: [] };
    }
    
    const expandedBuffer = await sharp(pageImageBuffer)
      .extract({ 
        left: expandedLeft, 
        top: expandedTop, 
        width: expandedWidth, 
        height: expandedHeight 
      })
      .png()
      .toBuffer();
    
    const ocrResult = await extractTextFromImage(expandedBuffer);
    
    const nearbyLabels = findComponentLabels(ocrResult.words, ocrResult.text);
    
    return {
      text: ocrResult.text,
      words: ocrResult.words,
      nearbyLabels,
      confidence: ocrResult.confidence
    };
    
  } catch (err) {
    console.error('Near-region OCR error:', err.message);
    return { text: '', words: [], nearbyLabels: [], confidence: 0 };
  }
}

function findComponentLabels(words, fullText) {
  const labels = [];
  
  const componentPatterns = [
    /(\d+)\s*x?\s*([A-Z][a-zA-Z\s]+(?:Cards?|Tokens?|Tiles?|Boards?|Dice|Meeples?|Markers?|Cubes?))/gi,
    /([A-Z][a-zA-Z\s]+(?:Cards?|Tokens?|Tiles?|Boards?|Dice|Meeples?|Markers?|Cubes?))\s*\((\d+)\)/gi,
    /([A-Z][a-zA-Z\s]+(?:Cards?|Tokens?|Tiles?|Boards?|Dice|Meeples?|Markers?|Cubes?))/gi
  ];
  
  for (const pattern of componentPatterns) {
    const matches = fullText.matchAll(pattern);
    for (const match of matches) {
      const label = match[0].trim();
      if (label.length >= 3 && label.length <= 50) {
        labels.push({
          text: label,
          normalized: normalizeLabel(label)
        });
      }
    }
  }
  
  const seen = new Set();
  return labels.filter(l => {
    if (seen.has(l.normalized)) return false;
    seen.add(l.normalized);
    return true;
  });
}

function normalizeLabel(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fuzzyMatchComponent(ocrText, components) {
  const normalizedOcr = normalizeLabel(ocrText);
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const component of components) {
    const normalizedName = normalizeLabel(component.name);
    
    if (normalizedOcr.includes(normalizedName) || normalizedName.includes(normalizedOcr)) {
      const score = Math.max(normalizedName.length, normalizedOcr.length) / 
                    Math.min(normalizedName.length, normalizedOcr.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = component;
      }
      continue;
    }
    
    const distance = levenshteinDistance(normalizedOcr, normalizedName);
    const maxLen = Math.max(normalizedOcr.length, normalizedName.length);
    const similarity = 1 - (distance / maxLen);
    
    if (similarity > 0.6 && similarity > bestScore) {
      bestScore = similarity;
      bestMatch = component;
    }
  }
  
  return bestMatch ? { component: bestMatch, score: bestScore } : null;
}

function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
  
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  
  return matrix[b.length][a.length];
}

export async function terminateWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
