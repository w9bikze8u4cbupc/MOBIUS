import * as path from 'path';
import { promises as fsPromises } from 'fs';
import * as pdfToImg from 'pdf-to-img';
import sharp from 'sharp';

function createCropId(prefix = 'crop') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function detectComponentRegions(pageImageBuffer, pageNumber, components, openai) {
  if (!openai) {
    console.log('OpenAI not available, skipping vision detection');
    return [];
  }

  try {
    const base64Image = pageImageBuffer.toString('base64');
    const componentList = components.map(c => `- ${c.name} (${c.category})`).join('\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this board game rulebook page and identify distinct images/illustrations of game components.

GAME COMPONENTS TO LOOK FOR:
${componentList}

For each distinct image or illustration you find (NOT text, diagrams, or decorative elements), provide:
1. A bounding box as percentages of the image dimensions (x, y, width, height) where x,y is top-left corner
2. What component it likely shows
3. Confidence level (high/medium/low)

IMPORTANT:
- Only identify actual photographs or illustrations of physical game components
- Skip text boxes, tables, rules text, and decorative borders
- Focus on images showing cards, dice, tokens, meeples, boards, tiles, miniatures
- Provide coordinates as percentages (0-100) of image dimensions

Return ONLY a JSON array like this (no other text):
[
  {
    "bbox": {"x": 10, "y": 20, "width": 30, "height": 25},
    "label": "Player tokens",
    "category": "tokens",
    "confidence": "high"
  }
]

If no component images are found on this page, return an empty array: []`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_completion_tokens: 2000
    });

    let content = response.choices[0]?.message?.content?.trim() || '[]';
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }
    
    const regions = JSON.parse(content);
    console.log(`Page ${pageNumber}: Found ${regions.length} component regions`);
    
    return regions.map(r => ({
      ...r,
      pageNumber
    }));
  } catch (err) {
    console.error(`Vision detection failed for page ${pageNumber}:`, err.message);
    return [];
  }
}

async function cropRegion(pageBuffer, bbox, outputPath, imageWidth, imageHeight) {
  const x = Math.floor((bbox.x / 100) * imageWidth);
  const y = Math.floor((bbox.y / 100) * imageHeight);
  const width = Math.floor((bbox.width / 100) * imageWidth);
  const height = Math.floor((bbox.height / 100) * imageHeight);
  
  const safeX = Math.max(0, Math.min(x, imageWidth - 10));
  const safeY = Math.max(0, Math.min(y, imageHeight - 10));
  const safeWidth = Math.max(50, Math.min(width, imageWidth - safeX));
  const safeHeight = Math.max(50, Math.min(height, imageHeight - safeY));
  
  await sharp(pageBuffer)
    .extract({ left: safeX, top: safeY, width: safeWidth, height: safeHeight })
    .toFile(outputPath);
  
  return { x: safeX, y: safeY, width: safeWidth, height: safeHeight };
}

async function extractComponentCrops(projectId, pdfFilePath, components, openai, options = {}) {
  const { maxPages = 20, dpi = 200 } = options;
  
  if (!pdfFilePath) {
    throw new Error('PDF file path is required');
  }

  const outputDir = path.join(process.cwd(), 'data', 'rulebook-images', String(projectId), 'crops');
  await fsPromises.mkdir(outputDir, { recursive: true });

  console.log('Extracting component crops from PDF with AI vision...');
  
  const pdfResult = await pdfToImg.pdf(pdfFilePath, { scale: dpi / 72 });
  const allCrops = [];
  let pageIndex = 0;
  
  for await (const pageBuffer of pdfResult) {
    pageIndex += 1;
    if (pageIndex > maxPages) {
      console.log(`Reached max pages limit (${maxPages}), stopping`);
      break;
    }
    
    console.log(`Processing page ${pageIndex}...`);
    
    const metadata = await sharp(pageBuffer).metadata();
    const imageWidth = metadata.width;
    const imageHeight = metadata.height;
    
    const regions = await detectComponentRegions(pageBuffer, pageIndex, components, openai);
    
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const cropId = createCropId('crop');
      const filename = `page${pageIndex}-${i + 1}-${cropId}.png`;
      const outputPath = path.join(outputDir, filename);
      
      try {
        const actualBbox = await cropRegion(pageBuffer, region.bbox, outputPath, imageWidth, imageHeight);
        
        allCrops.push({
          id: cropId,
          source: 'ai-crop',
          fileKey: outputPath,
          parentPage: pageIndex,
          bbox: actualBbox,
          aiLabels: [region.label],
          category: region.category,
          confidence: region.confidence,
          tags: ['crop', `page-${pageIndex}`, region.category, region.label.toLowerCase().replace(/\s+/g, '-')],
          width: actualBbox.width,
          height: actualBbox.height,
          quality: { 
            score: region.confidence === 'high' ? 0.9 : region.confidence === 'medium' ? 0.7 : 0.5, 
            notes: `AI detected: ${region.label}` 
          }
        });
        
        console.log(`  Cropped: ${region.label} (${region.confidence})`);
      } catch (err) {
        console.error(`  Failed to crop region: ${err.message}`);
      }
    }
    
    if (pageIndex >= 3 && allCrops.length === 0) {
      console.log('No crops found in first 3 pages, trying full page extraction fallback');
      break;
    }
  }
  
  if (allCrops.length === 0) {
    console.log('No AI crops found, falling back to full page images');
    return { crops: [], fallbackToPages: true };
  }
  
  console.log(`Extracted ${allCrops.length} component crops from PDF`);
  return { crops: allCrops, fallbackToPages: false };
}

async function matchCropsToComponents(crops, components) {
  const matches = {};
  
  for (const crop of crops) {
    const category = (crop.category || '').toLowerCase();
    const label = (crop.aiLabels?.[0] || '').toLowerCase();
    
    for (const component of components) {
      const compName = (component.name || '').toLowerCase();
      const compCategory = (component.category || '').toLowerCase();
      
      const categoryMatch = category === compCategory || 
                           category.includes(compCategory) || 
                           compCategory.includes(category);
      
      const nameMatch = label.includes(compName.split(' ')[0]) || 
                       compName.includes(label.split(' ')[0]) ||
                       label.includes(compCategory);
      
      if (categoryMatch || nameMatch) {
        if (!matches[component.id]) {
          matches[component.id] = [];
        }
        matches[component.id].push(crop.id);
      }
    }
  }
  
  return matches;
}

export {
  extractComponentCrops,
  matchCropsToComponents,
  detectComponentRegions,
  cropRegion,
};
