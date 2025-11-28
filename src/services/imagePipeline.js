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

async function searchBggByName(gameName) {
  try {
    const searchResponse = await axios.get(
      `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(gameName)}&type=boardgame&exact=1`,
      { timeout: 10000 }
    );
    const searchParsed = xmlParser.parse(searchResponse.data || '');
    const items = searchParsed?.items?.item;
    const gameItem = Array.isArray(items) ? items[0] : items;
    
    if (gameItem?.id) {
      return String(gameItem.id);
    }
    
    // Try non-exact search if exact fails
    const fuzzyResponse = await axios.get(
      `https://boardgamegeek.com/xmlapi2/search?query=${encodeURIComponent(gameName)}&type=boardgame`,
      { timeout: 10000 }
    );
    const fuzzyParsed = xmlParser.parse(fuzzyResponse.data || '');
    const fuzzyItems = fuzzyParsed?.items?.item;
    const fuzzyItem = Array.isArray(fuzzyItems) ? fuzzyItems[0] : fuzzyItems;
    
    return fuzzyItem?.id ? String(fuzzyItem.id) : null;
  } catch (err) {
    // Handle 401/403 gracefully - BGG requires authentication as of 2024
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.log('BGG API requires authentication - skipping BGG image search');
      return null;
    }
    console.log('BGG search failed:', err.message);
    return null;
  }
}

async function fetchBggImages(projectId, bggIdOrUrl) {
  let bggId = parseBggId(bggIdOrUrl);
  
  // If not a valid ID/URL, try searching by name
  if (!bggId && bggIdOrUrl && typeof bggIdOrUrl === 'string') {
    console.log('Searching BGG by game name:', bggIdOrUrl);
    bggId = await searchBggByName(bggIdOrUrl);
  }
  
  if (!bggId) {
    console.log('Could not find BGG ID for:', bggIdOrUrl);
    return []; // Return empty array instead of throwing
  }

  console.log('Fetching BGG images for ID:', bggId);
  const response = await axios.get(`https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`);
  const parsed = xmlParser.parse(response.data || '');
  const item = parsed?.items?.item || {};
  const candidates = [];

  if (item.image) {
    candidates.push({ originalUrl: item.image, tags: ['box', 'cover'], source: 'bgg' });
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

  console.log('Found', candidates.length, 'BGG images');
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

// Search for additional component images - leverages BGG search
async function searchWebForComponentImages(gameName, components, openai) {
  if (!gameName || !components || components.length === 0) {
    return [];
  }
  
  // Since fetchBggImages now handles name search, this function provides additional
  // context by tagging images with component categories for better AI matching
  const images = [];
  
  try {
    // Search BGG for the game
    const bggId = await searchBggByName(gameName);
    
    if (bggId) {
      // Fetch game images from BGG API
      const thingResponse = await axios.get(
        `https://boardgamegeek.com/xmlapi2/thing?id=${bggId}&stats=1`
      );
      const thingParsed = xmlParser.parse(thingResponse.data || '');
      const thing = thingParsed?.items?.item || {};
      
      // Get box art which often shows components
      if (thing.image) {
        const componentCategories = [...new Set(components.map(c => c.category))];
        images.push(normalizeImageAsset({
          originalUrl: thing.image,
          source: 'bgg-components',
          tags: ['box', 'components', ...componentCategories],
        }));
      }
      
      console.log('Found', images.length, 'additional BGG images for component matching');
    }
  } catch (err) {
    console.log('Web search for components failed:', err.message);
  }
  
  return images;
}

// AI-powered matching of components to images
async function matchComponentsToImages(components, images, gameName, openai) {
  if (!components || components.length === 0 || !images || images.length === 0) {
    return {};
  }
  
  const matches = {};
  
  // Create a description of available images
  const imageDescriptions = images.map((img, idx) => ({
    id: img.id,
    index: idx,
    source: img.source,
    tags: img.tags || [],
    description: `Image ${idx + 1}: source=${img.source}, tags=[${(img.tags || []).join(', ')}]`
  }));
  
  // Create component list for AI
  const componentList = components.map(c => ({
    id: c.id,
    name: c.name,
    category: c.category,
    quantity: c.quantity,
    details: c.details
  }));
  
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `You are matching game components to images for "${gameName}".

COMPONENTS:
${componentList.map(c => `- ${c.id}: "${c.name}" (${c.category}, qty: ${c.quantity}${c.details ? ', ' + c.details : ''})`).join('\n')}

AVAILABLE IMAGES:
${imageDescriptions.map(img => img.description).join('\n')}

For each component, identify which images are most likely to show that component based on:
1. Image source (rulebook pages often show components)
2. Image tags (matching category or keywords)
3. Logical matching (cards → card images, dice → dice images, etc.)

Return a JSON object where keys are component IDs and values are arrays of image IDs that match.
If a component has no matching image, omit it or use an empty array.
Focus on high-confidence matches only.

Return ONLY the JSON object, no other text.`
        }
      ],
      max_completion_tokens: 1500
    });
    
    let content = response.choices[0]?.message?.content?.trim() || '{}';
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      content = jsonMatch[0];
    }
    
    const parsed = JSON.parse(content);
    
    // Validate the matches - ensure image IDs exist
    const validImageIds = new Set(images.map(img => img.id));
    for (const [compId, imgIds] of Object.entries(parsed)) {
      if (Array.isArray(imgIds)) {
        matches[compId] = imgIds.filter(id => validImageIds.has(id));
      }
    }
    
    console.log('AI matched', Object.keys(matches).length, 'components to images');
  } catch (err) {
    console.error('AI matching failed:', err.message);
    
    // Fallback: Simple category-based matching
    for (const component of components) {
      const matchingImages = images.filter(img => {
        const tags = (img.tags || []).map(t => t.toLowerCase());
        const compName = (component.name || '').toLowerCase();
        const compCat = (component.category || '').toLowerCase();
        
        return tags.some(tag => 
          tag.includes(compCat) || 
          compName.includes(tag) || 
          tag.includes(compName.split(' ')[0])
        );
      });
      
      if (matchingImages.length > 0) {
        matches[component.id] = matchingImages.map(img => img.id);
      }
    }
  }
  
  return matches;
}

export {
  createImageId,
  normalizeImageAsset,
  fetchBggImages,
  extractRulebookImages,
  ingestManualImage,
  runImageEnhancement,
  searchWebForComponentImages,
  matchComponentsToImages,
};

