import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DETECTION_PROMPT = `You are an expert in board game rulebook analysis. Your task is to detect ONLY real photographic images of physical game components on this page. Ignore everything else.

Extract ONLY components that meet ALL these criteria:
- It is a real photograph (not a drawing, illustration, diagram, icon, or digital render)
- It shows a physical game piece with realistic lighting, shadows, texture, and material (plastic, wood, cardboard, metal)
- It is a complete component or a clear group of identical components (not a tiny icon in text)
- Common examples: full-size cards, tokens, miniatures, dice, punchboards, tiles, player boards, the main game board — photographed on a table or neutral background

DO NOT detect:
- Text blocks, rules, diagrams, flowcharts
- Stylized illustrations or digital art of components
- Small icons next to bullet points
- Component diagrams with arrows/labels
- Decorative borders or page furniture
- Headers, footers, page numbers

Return a JSON object with this exact structure:
{
  "components": [
    {
      "name": "short descriptive name (e.g., Resource Tokens, Character Cards, Main Game Board)",
      "type": "card|token|board|dice|miniature|tile|meeple|other",
      "confidence": 1-10 (10 = absolutely certain it's a real photo),
      "bbox": {
        "x": float (0-1 normalized left coordinate),
        "y": float (0-1 normalized top coordinate),
        "width": float (0-1 normalized width),
        "height": float (0-1 normalized height)
      }
    }
  ]
}

CRITICAL RULES:
- Only include items with confidence >= 8
- Coordinates are normalized (0.0 to 1.0) relative to image dimensions
- Be pixel-accurate with bounding boxes — crop tightly but include slight margin
- If no real photographic components are present, return: {"components": []}
- ONLY return valid JSON, no explanations`;

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
      
      if (item.confidence && item.confidence < 8) {
        console.log(`  Skipping ${item.name}: low confidence (${item.confidence})`);
        return false;
      }
      
      const area = width * height;
      if (area < 0.01) {
        console.log(`  Skipping ${item.name}: too small (area: ${(area * 100).toFixed(1)}%)`);
        return false;
      }
      if (area > 0.7) {
        console.log(`  Skipping ${item.name}: too large (area: ${(area * 100).toFixed(1)}%)`);
        return false;
      }
      
      const aspectRatio = width / height;
      if (aspectRatio > 6 || aspectRatio < 0.16) {
        console.log(`  Skipping ${item.name}: extreme aspect ratio (${aspectRatio.toFixed(2)})`);
        return false;
      }
      
      if (x < 0 || y < 0 || x + width > 1.05 || y + height > 1.05) {
        console.log(`  Skipping ${item.name}: out of bounds`);
        return false;
      }
      
      return true;
    });
    
    console.log(`Page ${pageNum}: Detected ${valid.length} component regions (filtered from ${detected.components.length})`);
    return valid;
    
  } catch (err) {
    console.error(`Page ${pageNum}: Detection error:`, err.message);
    return [];
  }
}

async function isLikelyRealPhoto(croppedImagePath) {
  try {
    const { data, info } = await sharp(croppedImagePath)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 3) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histogram[gray]++;
    }

    let entropy = 0;
    const totalPixels = info.width * info.height;
    for (const count of histogram) {
      if (count > 0) {
        const p = count / totalPixels;
        entropy -= p * Math.log2(p);
      }
    }

    return entropy > 5.5;
  } catch (err) {
    console.error('Entropy check failed:', err.message);
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
    
    const paddingX = Math.floor(cropWidth * 0.02);
    const paddingY = Math.floor(cropHeight * 0.02);
    
    const safeLeft = Math.max(0, left - paddingX);
    const safeTop = Math.max(0, top - paddingY);
    const safeWidth = Math.min(cropWidth + paddingX * 2, imgWidth - safeLeft);
    const safeHeight = Math.min(cropHeight + paddingY * 2, imgHeight - safeTop);
    
    if (safeWidth < 80 || safeHeight < 80) {
      console.log(`  Skipping crop ${i}: too small after bounds check (${safeWidth}x${safeHeight})`);
      continue;
    }
    
    const safeName = (name || 'component').replace(/[^a-zA-Z0-9\-_]/g, '_').slice(0, 40);
    const filename = `page${pageNum}-${i}-${safeName}.png`;
    const filePath = path.join(outputDir, filename);
    
    try {
      await sharp(imageBuffer)
        .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
        .png()
        .toFile(filePath);
      
      const isPhoto = await isLikelyRealPhoto(filePath);
      if (!isPhoto) {
        console.log(`  Removing ${filename}: failed entropy check (likely not a photo)`);
        await fs.promises.unlink(filePath);
        continue;
      }
      
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
      
      console.log(`  Saved: ${filename} (${safeWidth}x${safeHeight}) - ${type}: ${name} [confidence: ${detection.confidence}]`);
    } catch (cropErr) {
      console.error(`  Failed to crop ${filename}:`, cropErr.message);
    }
  }
  
  return croppedImages;
}

export async function extractComponentsFromAllPages(openai, projectId, pageImagePaths) {
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
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log(`Extraction complete: ${allCrops.length} components cropped from ${pageImagePaths.length} pages`);
  return allCrops;
}
