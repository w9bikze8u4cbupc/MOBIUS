import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function detectComponentBoundingBoxes(openai, imageBuffer, pageNum = 1) {
  const base64Image = imageBuffer.toString('base64');
  const mimeType = 'image/png';
  
  const systemPrompt = `You are a board game component detector. Your job is to find PHYSICAL GAME COMPONENTS in rulebook page images and return their bounding box coordinates.

DETECT ONLY:
- Card images (playing cards, game cards with artwork)
- Token/chip images (cardboard tokens, wooden pieces)
- Game board images
- Dice images
- Miniature/meeple images
- Tile images

DO NOT DETECT:
- Text paragraphs or rules text
- Diagrams showing game flow or arrows
- Icons used in rules explanation
- Decorative borders or backgrounds
- Small UI icons or symbols
- Page numbers or headers

CRITICAL RULES:
1. Only detect RECTANGULAR regions containing PHOTOS of physical components
2. Minimum size: at least 100x100 pixels
3. Each detected region should contain ONE clear component image
4. If a component spans multiple items (like a row of cards), detect each card separately
5. Prefer larger, clearer component images over small thumbnails`;

  const userPrompt = `Analyze this rulebook page and find all PHYSICAL GAME COMPONENT images.

For each component image you find, return the bounding box as percentages of the image dimensions:
- x: left edge as percentage (0-100)
- y: top edge as percentage (0-100)  
- width: width as percentage (0-100)
- height: height as percentage (0-100)

Return a JSON array with this exact format:
[
  {
    "type": "card|token|board|dice|miniature|tile|other",
    "description": "brief description of what the component looks like",
    "box": { "x": 10.5, "y": 20.3, "width": 25.0, "height": 30.0 }
  }
]

If no component images are found, return an empty array: []

IMPORTANT: Only include clear photos of physical game pieces. Ignore text, diagrams, arrows, and decorative elements.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
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
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content || '[]';
    
    let jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.log(`Page ${pageNum}: No JSON array found in response`);
      return [];
    }
    
    let detected;
    try {
      detected = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error(`Page ${pageNum}: Failed to parse JSON:`, content);
      return [];
    }
    
    if (!Array.isArray(detected)) {
      return [];
    }
    
    const valid = detected.filter(item => {
      if (!item.box || typeof item.box !== 'object') return false;
      const { x, y, width, height } = item.box;
      if (typeof x !== 'number' || typeof y !== 'number' || 
          typeof width !== 'number' || typeof height !== 'number') return false;
      if (width < 5 || height < 5) return false;
      if (x < 0 || y < 0 || x + width > 100 || y + height > 100) return false;
      return true;
    });
    
    console.log(`Page ${pageNum}: Detected ${valid.length} component regions`);
    return valid;
    
  } catch (err) {
    console.error(`Page ${pageNum}: Detection error:`, err.message);
    return [];
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
    const { box, type, description } = detection;
    
    const left = Math.floor((box.x / 100) * imgWidth);
    const top = Math.floor((box.y / 100) * imgHeight);
    const cropWidth = Math.floor((box.width / 100) * imgWidth);
    const cropHeight = Math.floor((box.height / 100) * imgHeight);
    
    const safeLeft = Math.max(0, Math.min(left, imgWidth - 10));
    const safeTop = Math.max(0, Math.min(top, imgHeight - 10));
    const safeWidth = Math.min(cropWidth, imgWidth - safeLeft);
    const safeHeight = Math.min(cropHeight, imgHeight - safeTop);
    
    if (safeWidth < 50 || safeHeight < 50) {
      console.log(`  Skipping crop ${i}: too small (${safeWidth}x${safeHeight})`);
      continue;
    }
    
    const filename = `page${pageNum}-crop${i}-${type || 'component'}.png`;
    const filePath = path.join(outputDir, filename);
    
    try {
      await sharp(imageBuffer)
        .extract({ left: safeLeft, top: safeTop, width: safeWidth, height: safeHeight })
        .png()
        .toFile(filePath);
      
      croppedImages.push({
        id: `crop-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        source: 'ai-component-crop',
        fileKey: filePath,
        type: type || 'other',
        description: description || '',
        pageNum,
        cropIndex: i,
        dimensions: { width: safeWidth, height: safeHeight },
        tags: ['component-crop', type || 'other', `page-${pageNum}`]
      });
      
      console.log(`  Saved crop: ${filename} (${safeWidth}x${safeHeight}) - ${type}: ${description}`);
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
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`Extraction complete: ${allCrops.length} components cropped from ${pageImagePaths.length} pages`);
  return allCrops;
}
