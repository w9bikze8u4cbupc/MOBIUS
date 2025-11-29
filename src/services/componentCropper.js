import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const activeJobs = new Map();

const DETECTION_PROMPT = `Find ONLY standalone game component photographs in this rulebook page image.

INCLUDE: Clear photos of physical game items displayed separately (not in-game):
- Individual cards shown face-up with visible artwork
- Token/chip collections on neutral backgrounds  
- Board game tiles arranged for display
- Game box contents laid out

EXCLUDE:
- Gameplay screenshots or in-action photos
- Diagrams with text labels or arrows
- Small icons within text paragraphs
- Decorative page backgrounds or borders
- Text-heavy regions

Return JSON with bounding boxes for ONLY clear standalone component photos:
{
  "components": [
    {"name": "description", "type": "card|token|board|tile|other", "confidence": 8-10, "bbox": {"x": 0-1, "y": 0-1, "width": 0-1, "height": 0-1}}
  ]
}

Only include items with confidence 9 or 10. If no clear standalone components, return {"components": []}.`;

export async function detectComponentBoundingBoxes(openai, imageBuffer, pageNum = 1) {
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/png';
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: DETECTION_PROMPT },
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
      console.error(`Page ${pageNum}: Failed to parse JSON:`, content);
      return [];
    }
    
    if (!detected.components || !Array.isArray(detected.components)) {
      console.log(`Page ${pageNum}: No components array in response`);
      return [];
    }
    
    const valid = detected.components.filter(item => {
      if (!item.bbox || typeof item.bbox !== 'object') return false;
      const { x, y, width, height } = item.bbox;
      if (typeof x !== 'number' || typeof y !== 'number' || 
          typeof width !== 'number' || typeof height !== 'number') return false;
      
      if (!item.confidence || item.confidence < 9) {
        console.log(`  Skipping ${item.name}: confidence too low (${item.confidence})`);
        return false;
      }
      
      const area = width * height;
      if (area < 0.02) {
        console.log(`  Skipping ${item.name}: too small (area: ${(area * 100).toFixed(1)}%)`);
        return false;
      }
      if (area > 0.6) {
        console.log(`  Skipping ${item.name}: too large (area: ${(area * 100).toFixed(1)}%)`);
        return false;
      }
      
      const aspectRatio = width / height;
      if (aspectRatio > 4 || aspectRatio < 0.25) {
        console.log(`  Skipping ${item.name}: extreme aspect ratio (${aspectRatio.toFixed(2)})`);
        return false;
      }
      
      if (x < 0 || y < 0 || x + width > 1.05 || y + height > 1.05) {
        console.log(`  Skipping ${item.name}: out of bounds`);
        return false;
      }
      
      return true;
    });
    
    console.log(`Page ${pageNum}: Detected ${valid.length} valid components (from ${detected.components.length} candidates)`);
    return valid;
    
  } catch (err) {
    console.error(`Page ${pageNum}: Detection error:`, err.message);
    return [];
  }
}

async function calculateImageEntropy(imageBuffer) {
  try {
    const { data, info } = await sharp(imageBuffer)
      .resize(200, 200, { fit: 'inside' })
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

    return entropy;
  } catch (err) {
    console.error('Entropy check failed:', err.message);
    return 8;
  }
}

async function isLikelyRealPhoto(croppedBuffer) {
  const entropy = await calculateImageEntropy(croppedBuffer);
  return entropy > 5.8;
}

async function hasMinimumColorVariety(croppedBuffer) {
  try {
    const { data } = await sharp(croppedBuffer)
      .resize(50, 50, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const colorSet = new Set();
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.floor(data[i] / 32);
      const g = Math.floor(data[i + 1] / 32);
      const b = Math.floor(data[i + 2] / 32);
      colorSet.add(`${r}-${g}-${b}`);
    }
    
    return colorSet.size > 20;
  } catch (err) {
    return true;
  }
}

export async function cropComponentsFromPage(openai, pageImagePath, projectId, pageNum) {
  const outputDir = path.join(process.cwd(), 'data', 'component-crops', String(projectId));
  await fs.promises.mkdir(outputDir, { recursive: true });
  
  const imageBuffer = await fs.promises.readFile(pageImagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const { width: imgWidth, height: imgHeight } = metadata;
  
  console.log(`Processing page ${pageNum} (${imgWidth}x${imgHeight})`);
  
  const detections = await detectComponentBoundingBoxes(openai, imageBuffer, pageNum);
  
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
    
    const paddingX = Math.floor(cropWidth * 0.03);
    const paddingY = Math.floor(cropHeight * 0.03);
    
    const safeLeft = Math.max(0, left - paddingX);
    const safeTop = Math.max(0, top - paddingY);
    const safeWidth = Math.min(cropWidth + paddingX * 2, imgWidth - safeLeft);
    const safeHeight = Math.min(cropHeight + paddingY * 2, imgHeight - safeTop);
    
    if (safeWidth < 100 || safeHeight < 100) {
      console.log(`  Skipping crop ${i}: too small (${safeWidth}x${safeHeight})`);
      continue;
    }
    
    const safeName = (name || 'component').replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 40);
    const filename = `page${pageNum}-${i}-${safeName}.png`;
    const filePath = path.join(outputDir, filename);
    
    try {
      const croppedBuffer = await sharp(imageBuffer)
        .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
        .png()
        .toBuffer();
      
      const isPhoto = await isLikelyRealPhoto(croppedBuffer);
      if (!isPhoto) {
        console.log(`  Skipping ${filename}: low entropy (likely text/diagram)`);
        continue;
      }
      
      const hasColors = await hasMinimumColorVariety(croppedBuffer);
      if (!hasColors) {
        console.log(`  Skipping ${filename}: insufficient color variety`);
        continue;
      }
      
      await fs.promises.writeFile(filePath, croppedBuffer);
      
      croppedImages.push({
        id: `crop-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        source: 'ai-component-crop',
        fileKey: filePath,
        type: type || 'other',
        name: name || '',
        confidence: detection.confidence,
        pageNum,
        cropIndex: i,
        dimensions: { width: safeWidth, height: safeHeight },
        tags: ['component-crop', type || 'other', `page-${pageNum}`]
      });
      
      console.log(`  Saved: ${filename} (${safeWidth}x${safeHeight}) - ${type}: ${name}`);
    } catch (cropErr) {
      console.error(`  Failed to crop ${filename}:`, cropErr.message);
    }
  }
  
  return croppedImages;
}

export async function extractComponentsFromAllPages(openai, projectId, pageImagePaths) {
  const jobKey = `crop-${projectId}`;
  
  if (activeJobs.has(jobKey)) {
    const existing = activeJobs.get(jobKey);
    if (Date.now() - existing.startTime < 300000) {
      console.log(`Cropping job already in progress for ${projectId}, skipping duplicate request`);
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
      console.log(`Cleared ${existingFiles.length} existing crops`);
    }
    
    console.log(`Starting component extraction from ${pageImagePaths.length} pages`);
    
    const allCrops = [];
    
    for (let i = 0; i < pageImagePaths.length; i++) {
      const pagePath = pageImagePaths[i];
      const pageNum = i + 1;
      
      try {
        const crops = await cropComponentsFromPage(openai, pagePath, projectId, pageNum);
        allCrops.push(...crops);
      } catch (err) {
        console.error(`Failed to process page ${pageNum}:`, err.message);
      }
      
      if (i < pageImagePaths.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`Extraction complete: ${allCrops.length} components cropped from ${pageImagePaths.length} pages`);
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
