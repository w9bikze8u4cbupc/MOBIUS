import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const activeJobs = new Map();

function buildComponentAwarePrompt(components) {
  if (!components || components.length === 0) {
    return `Find clear standalone photographs of game components on this rulebook page.

INCLUDE ONLY: Photos of physical items like cards, tokens, boards, tiles, dice, meeples
EXCLUDE: Text paragraphs, diagrams with arrows/labels, icons, decorative borders

Return JSON:
{"components": [{"name": "description", "type": "card|token|board|tile|dice|meeple|other", "confidence": 9-10, "bbox": {"x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1}}]}

Only items with confidence 9+. If none found: {"components": []}`;
  }

  const componentList = components.map(c => {
    const qty = c.quantity ? ` (${c.quantity})` : '';
    return `- ${c.name}${qty}: ${c.category || 'component'}`;
  }).join('\n');
  
  if (components.length > 20) {
    console.log(`Note: Large component list (${components.length} items) included in vision prompt`);
  }

  return `This is a board game rulebook page. Find photos of these SPECIFIC game components:

${componentList}

RULES:
1. Only detect clear PHOTOGRAPHS of physical game pieces - NOT text, diagrams, or icons
2. Match detected regions to the component list above
3. Use the component name from the list in your response
4. Skip text blocks, arrows, labels, decorative elements
5. Skip small icons embedded in text paragraphs

Return JSON with bounding boxes for each component photo found:
{"components": [{"name": "exact name from list", "type": "card|token|board|tile|dice|meeple|other", "confidence": 9-10, "bbox": {"x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1}}]}

Only high confidence (9-10). If no matching component photos: {"components": []}`;
}

function scorePageForComponents(pageIndex, totalPages) {
  if (pageIndex <= 2) return 1.0;
  if (pageIndex <= 4) return 0.8;
  if (pageIndex === totalPages - 1) return 0.3;
  return 0.5;
}

export async function detectComponentBoundingBoxes(openai, imageBuffer, pageNum, components = []) {
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/png';
  const prompt = buildComponentAwarePrompt(components);
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0]?.message?.content || '{"components": []}';
    
    let detected;
    try {
      detected = JSON.parse(content);
    } catch (parseErr) {
      console.error(`Page ${pageNum}: Failed to parse JSON:`, content.substring(0, 200));
      return [];
    }
    
    if (!detected.components || !Array.isArray(detected.components)) {
      return [];
    }
    
    const valid = detected.components.filter(item => {
      if (!item.bbox || typeof item.bbox !== 'object') return false;
      const { x, y, width, height } = item.bbox;
      if (typeof x !== 'number' || typeof y !== 'number' || 
          typeof width !== 'number' || typeof height !== 'number') return false;
      
      if (!item.confidence || item.confidence < 9) {
        return false;
      }
      
      const area = width * height;
      if (area < 0.015 || area > 0.65) {
        return false;
      }
      
      const aspectRatio = width / height;
      if (aspectRatio > 5 || aspectRatio < 0.2) {
        return false;
      }
      
      if (x < 0 || y < 0 || x + width > 1.05 || y + height > 1.05) {
        return false;
      }
      
      return true;
    });
    
    console.log(`Page ${pageNum}: Found ${valid.length} component photos (from ${detected.components.length} candidates)`);
    return valid;
    
  } catch (err) {
    console.error(`Page ${pageNum}: Detection error:`, err.message);
    return [];
  }
}

async function calculateImageQuality(imageBuffer) {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(150, 150, { fit: 'inside' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) {
      histogram[data[i]]++;
    }

    let entropy = 0;
    const totalPixels = data.length;
    for (const count of histogram) {
      if (count > 0) {
        const p = count / totalPixels;
        entropy -= p * Math.log2(p);
      }
    }

    const { data: colorData } = await sharp(imageBuffer)
      .resize(50, 50, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorSet = new Set();
    for (let i = 0; i < colorData.length; i += 3) {
      const r = Math.floor(colorData[i] / 32);
      const g = Math.floor(colorData[i + 1] / 32);
      const b = Math.floor(colorData[i + 2] / 32);
      colorSet.add(`${r}-${g}-${b}`);
    }

    return {
      entropy,
      colorVariety: colorSet.size,
      isPhoto: entropy > 4.8 && colorSet.size > 12
    };
  } catch (err) {
    return { entropy: 8, colorVariety: 50, isPhoto: true };
  }
}

export async function cropComponentsFromPage(openai, pageImagePath, projectId, pageNum, components = []) {
  const outputDir = path.join(process.cwd(), 'data', 'component-crops', String(projectId));
  await fs.promises.mkdir(outputDir, { recursive: true });
  
  const imageBuffer = await fs.promises.readFile(pageImagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const { width: imgWidth, height: imgHeight } = metadata;
  
  console.log(`Analyzing page ${pageNum} for component photos...`);
  
  const detections = await detectComponentBoundingBoxes(openai, imageBuffer, pageNum, components);
  
  if (detections.length === 0) {
    return [];
  }
  
  const croppedImages = [];
  
  for (let i = 0; i < detections.length; i++) {
    const detection = detections[i];
    const { bbox, type, name } = detection;
    
    const left = Math.floor(bbox.x * imgWidth);
    const top = Math.floor(bbox.y * imgHeight);
    const cropWidth = Math.floor(bbox.width * imgWidth);
    const cropHeight = Math.floor(bbox.height * imgHeight);
    
    const paddingX = Math.floor(cropWidth * 0.02);
    const paddingY = Math.floor(cropHeight * 0.02);
    
    const safeLeft = Math.max(0, left - paddingX);
    const safeTop = Math.max(0, top - paddingY);
    const safeWidth = Math.min(cropWidth + paddingX * 2, imgWidth - safeLeft);
    const safeHeight = Math.min(cropHeight + paddingY * 2, imgHeight - safeTop);
    
    if (safeWidth < 80 || safeHeight < 80) {
      continue;
    }
    
    try {
      const croppedBuffer = await sharp(imageBuffer)
        .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
        .png()
        .toBuffer();
      
      const quality = await calculateImageQuality(croppedBuffer);
      if (!quality.isPhoto) {
        console.log(`  Skipping "${name}": not a photo (entropy: ${quality.entropy.toFixed(1)}, colors: ${quality.colorVariety})`);
        continue;
      }
      
      const safeName = (name || 'component').replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 40);
      const filename = `page${pageNum}-${safeName}.png`;
      const filePath = path.join(outputDir, filename);
      
      await fs.promises.writeFile(filePath, croppedBuffer);
      
      croppedImages.push({
        id: `crop-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        source: 'ai-component-crop',
        fileKey: filePath,
        type: type || 'other',
        name: name || '',
        confidence: detection.confidence,
        pageNum,
        dimensions: { width: safeWidth, height: safeHeight },
        tags: ['component-crop', type || 'other', `page-${pageNum}`]
      });
      
      console.log(`  Cropped: "${name}" (${safeWidth}x${safeHeight})`);
    } catch (cropErr) {
      console.error(`  Failed to crop "${name}":`, cropErr.message);
    }
  }
  
  return croppedImages;
}

export async function extractComponentsFromAllPages(openai, projectId, pageImagePaths, components = []) {
  const jobKey = `crop-${projectId}`;
  
  if (activeJobs.has(jobKey)) {
    const existing = activeJobs.get(jobKey);
    if (Date.now() - existing.startTime < 300000) {
      console.log(`Cropping already in progress for ${projectId}`);
      throw new Error('Component detection already in progress. Please wait for it to complete.');
    }
  }
  
  activeJobs.set(jobKey, { startTime: Date.now(), pageCount: pageImagePaths.length });
  
  try {
    const outputDir = path.join(process.cwd(), 'data', 'component-crops', String(projectId));
    if (fs.existsSync(outputDir)) {
      const existingFiles = await fs.promises.readdir(outputDir);
      for (const file of existingFiles) {
        await fs.promises.unlink(path.join(outputDir, file));
      }
      console.log(`Cleared ${existingFiles.length} previous crops`);
    }
    
    const componentNames = components.map(c => c.name).join(', ');
    console.log(`\nSearching ${pageImagePaths.length} pages for: ${componentNames || 'any components'}`);
    
    const scoredPages = pageImagePaths.map((pagePath, index) => ({
      pagePath,
      pageNum: index + 1,
      score: scorePageForComponents(index, pageImagePaths.length)
    }));
    
    scoredPages.sort((a, b) => b.score - a.score);
    
    const priorityPages = scoredPages.filter(p => p.score >= 0.5);
    console.log(`Prioritizing ${priorityPages.length} pages likely to contain component photos`);
    
    const allCrops = [];
    const foundComponentNames = new Set();
    
    for (const { pagePath, pageNum } of priorityPages) {
      try {
        const crops = await cropComponentsFromPage(openai, pagePath, projectId, pageNum, components);
        
        for (const crop of crops) {
          if (foundComponentNames.has(crop.name)) {
            console.log(`  Skipping duplicate: "${crop.name}"`);
            continue;
          }
          foundComponentNames.add(crop.name);
          allCrops.push(crop);
        }
        
        if (components.length > 0 && allCrops.length >= components.length) {
          console.log(`Found all ${components.length} expected components, stopping early`);
          break;
        }
        
      } catch (err) {
        console.error(`Failed to process page ${pageNum}:`, err.message);
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log(`\nExtraction complete: ${allCrops.length} component photos from ${priorityPages.length} pages`);
    return allCrops;
  } finally {
    activeJobs.delete(jobKey);
  }
}

export function isJobInProgress(projectId) {
  const jobKey = `crop-${projectId}`;
  if (activeJobs.has(jobKey)) {
    const existing = activeJobs.get(jobKey);
    return Date.now() - existing.startTime < 300000;
  }
  return false;
}
