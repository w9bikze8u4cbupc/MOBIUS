import fs from 'fs';
import path from 'path';

const CATEGORY_TO_CLASSIFICATION = {
  'cards': ['card', 'deck'],
  'tokens': ['token', 'counter', 'marker'],
  'tiles': ['tile', 'board'],
  'dice': ['die', 'dice'],
  'boards': ['board', 'mat'],
  'meeples': ['meeple', 'figure', 'token'],
  'markers': ['marker', 'counter', 'token'],
  'pawns': ['pawn', 'figure', 'meeple'],
  'miniatures': ['miniature', 'figure'],
  'standees': ['standee', 'figure'],
  'cubes': ['cube', 'token'],
  'discs': ['disc', 'token', 'counter'],
  'player boards': ['board', 'mat', 'playerboard'],
  'score tracks': ['track', 'board'],
  'resources': ['resource', 'token', 'cube'],
  'money': ['coin', 'token', 'currency'],
  'coins': ['coin', 'token'],
};

function normalizeCategory(cat) {
  if (!cat) return '';
  return cat.toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeClassification(cls) {
  if (!cls) return '';
  return cls.toLowerCase().replace(/[^a-z]/g, '');
}

function ruleBasedMatch(components, images) {
  const matches = {};
  const unmatchedComponents = [];
  const usedImages = new Set();

  for (const component of components) {
    const compCategory = normalizeCategory(component.category);
    const compName = (component.name || '').toLowerCase();
    
    const allowedClassifications = [];
    for (const [cat, classes] of Object.entries(CATEGORY_TO_CLASSIFICATION)) {
      if (compCategory.includes(normalizeCategory(cat)) || normalizeCategory(cat).includes(compCategory)) {
        allowedClassifications.push(...classes);
      }
    }
    
    if (allowedClassifications.length === 0) {
      allowedClassifications.push(compCategory);
    }

    const candidateImages = images.filter(img => {
      if (usedImages.has(img.id)) return false;
      
      const imgClassification = normalizeClassification(img.metadata?.classification);
      const imgLabel = (img.metadata?.label || '').toLowerCase();
      const imgTags = (img.tags || []).map(t => t.toLowerCase());
      
      const classMatch = allowedClassifications.some(cls => 
        imgClassification.includes(cls) || imgTags.some(t => t.includes(cls))
      );
      
      const labelMatch = imgLabel && (
        compName.includes(imgLabel) || 
        imgLabel.includes(compName.split(' ')[0])
      );
      
      return classMatch || labelMatch;
    });

    if (candidateImages.length > 0) {
      const sorted = candidateImages.sort((a, b) => {
        const confA = a.metadata?.confidence || 0;
        const confB = b.metadata?.confidence || 0;
        return confB - confA;
      });
      
      matches[component.id] = sorted.slice(0, 3).map(img => img.id);
      sorted.slice(0, 1).forEach(img => usedImages.add(img.id));
    } else {
      unmatchedComponents.push(component);
    }
  }

  return { matches, unmatchedComponents, usedImages };
}

async function visionMatch(components, images, gameName, openai) {
  if (!openai || components.length === 0 || images.length === 0) {
    return {};
  }

  const matches = {};
  const BATCH_SIZE = 5;

  for (let i = 0; i < components.length; i += BATCH_SIZE) {
    const batch = components.slice(i, i + BATCH_SIZE);
    
    for (const component of batch) {
      try {
        const compCategory = normalizeCategory(component.category);
        
        // Get candidate classifications for this component type
        const allowedClassifications = [];
        for (const [cat, classes] of Object.entries(CATEGORY_TO_CLASSIFICATION)) {
          if (compCategory.includes(normalizeCategory(cat)) || normalizeCategory(cat).includes(compCategory)) {
            allowedClassifications.push(...classes);
          }
        }
        if (allowedClassifications.length === 0) {
          allowedClassifications.push(compCategory);
        }
        
        // Filter and sort images by relevance to this component
        const candidateImages = images
          .filter(img => img.fileKey && fs.existsSync(img.fileKey))
          .map(img => {
            const imgClass = normalizeClassification(img.metadata?.classification);
            const classMatch = allowedClassifications.some(cls => imgClass.includes(cls));
            const confidence = img.metadata?.confidence || 0;
            return { ...img, score: (classMatch ? 10 : 0) + confidence };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 15);  // Top 15 most relevant images

        if (candidateImages.length === 0) continue;

        const imageContents = [];
        for (const img of candidateImages.slice(0, 8)) {
          try {
            const imageBuffer = fs.readFileSync(img.fileKey);
            const base64 = imageBuffer.toString('base64');
            const ext = path.extname(img.fileKey).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
            
            imageContents.push({
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'low'
              }
            });
          } catch (err) {
            console.log(`Could not load image ${img.id}:`, err.message);
          }
        }

        if (imageContents.length === 0) continue;

        const imageLabels = candidateImages.slice(0, 8).map((img, idx) => 
          `Image ${idx + 1} (${img.id}): ${img.metadata?.classification || 'unknown'}, ${img.metadata?.label || 'no label'}`
        ).join('\n');

        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Game: "${gameName}"
Component to find: "${component.name}" (${component.category}, qty: ${component.quantity})
${component.details ? `Details: ${component.details}` : ''}

Look at these ${imageContents.length} images and identify which ones show this component.

Image IDs:
${imageLabels}

Return ONLY a JSON array of matching image IDs, e.g. ["heph_123", "heph_456"]
If none match, return []`
                },
                ...imageContents
              ]
            }
          ],
          max_completion_tokens: 200
        });

        let content = response.choices[0]?.message?.content?.trim() || '[]';
        content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          const parsed = JSON.parse(arrayMatch[0]);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validIds = new Set(candidateImages.map(img => img.id));
            matches[component.id] = parsed.filter(id => validIds.has(id));
          }
        }
      } catch (err) {
        console.error(`Vision match failed for ${component.name}:`, err.message);
      }
    }
  }

  return matches;
}

async function hybridMatch(components, images, gameName, openai) {
  console.log(`[HybridMatcher] Starting with ${components.length} components and ${images.length} images`);
  
  const hephaestusImages = images.filter(img => img.source === 'hephaestus');
  console.log(`[HybridMatcher] Using ${hephaestusImages.length} HEPHAESTUS images for matching`);

  console.log('[HybridMatcher] Stage 1: Rule-based matching');
  const { matches: ruleMatches, unmatchedComponents } = ruleBasedMatch(components, hephaestusImages);
  
  const ruleMatchedCount = Object.keys(ruleMatches).filter(k => ruleMatches[k]?.length > 0).length;
  console.log(`[HybridMatcher] Rule-based matched ${ruleMatchedCount}/${components.length} components`);

  let visionMatches = {};
  if (unmatchedComponents.length > 0 && openai) {
    console.log(`[HybridMatcher] Stage 2: Vision matching ${unmatchedComponents.length} remaining components`);
    visionMatches = await visionMatch(unmatchedComponents, hephaestusImages, gameName, openai);
    console.log(`[HybridMatcher] Vision matched ${Object.keys(visionMatches).length} additional components`);
  }

  const allMatches = { ...ruleMatches };
  for (const [compId, imgIds] of Object.entries(visionMatches)) {
    if (!allMatches[compId] || allMatches[compId].length === 0) {
      allMatches[compId] = imgIds;
    }
  }

  const totalMatched = Object.keys(allMatches).filter(k => allMatches[k]?.length > 0).length;
  console.log(`[HybridMatcher] Complete: ${totalMatched}/${components.length} components matched`);

  return {
    matches: allMatches,
    stats: {
      total: components.length,
      ruleMatched: ruleMatchedCount,
      visionMatched: Object.keys(visionMatches).length,
      totalMatched,
      unmatched: components.length - totalMatched
    }
  };
}

export {
  ruleBasedMatch,
  visionMatch,
  hybridMatch,
};
