import fs from 'fs';
import path from 'path';
import { isEligibleComponentForMatching } from './componentInventory.js';

import { getAiModel } from '../config/aiConfig.js';

const AUTO_LINK_THRESHOLD = 0.9;

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
  'currency': ['coin', 'coins', 'currency', 'money'],
};

function normalizeCategory(cat) {
  if (!cat) return '';
  return cat.toLowerCase().replace(/[^a-z]/g, '');
}

function normalizeClassification(cls) {
  if (!cls) return '';
  return cls.toLowerCase().replace(/[^a-z]/g, '');
}

function tokenize(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((token) => token.length > 2);
}

function hasDistinctiveNameEvidence(component, label) {
  const genericTokens = new Set(['game', 'player', 'board', 'card', 'cards', 'token', 'tokens', 'tile', 'tiles', 'marker', 'markers', 'track', 'tracks', 'plastic', 'cup', 'cups']);
  const distinctiveTokens = tokenize(component.name).filter((token) => !genericTokens.has(token));
  return distinctiveTokens.some((token) => label.includes(token));
}

function rankCandidate(component, image) {
  const componentName = normalizeCategory(component.name);
  const componentTokens = tokenize(component.name);
  const metadata = image.metadata || {};
  const label = normalizeCategory(`${image.label || ''} ${image.name || ''} ${metadata.label || ''} ${(image.tags || []).join(' ')}`);
  const classification = normalizeClassification(metadata.classification || image.type);
  const allowedClassifications = Object.entries(CATEGORY_TO_CLASSIFICATION)
    .filter(([cat]) => normalizeCategory(cat) === normalizeCategory(component.category) || normalizeCategory(cat).includes(normalizeCategory(component.category)))
    .flatMap(([, values]) => values);

  const reasons = [];
  let score = 0;
  const categoryCompatible = allowedClassifications.some((value) => classification.includes(normalizeClassification(value)) || label.includes(normalizeClassification(value)));
  if (categoryCompatible) {
    score += 0.35;
    reasons.push('category/type match');
  }
  const nameTokenMatches = componentTokens.filter((token) => label.includes(token));
  const hasExactNameMatch = componentName && label.includes(componentName);
  if (hasExactNameMatch) {
    score += 0.4;
    reasons.push('exact name/label match');
  } else if (nameTokenMatches.length > 0) {
    score += Math.min(0.3, nameTokenMatches.length * 0.1);
    reasons.push(`name/OCR proximity (${nameTokenMatches.join(', ')})`);
  }
  if (Number.isInteger(component.sourcePage) && Number.isInteger(metadata.page) && component.sourcePage === metadata.page) {
    score += 0.08;
    reasons.push('same source page');
  }
  const curationScore = Number(image.curation?.score ?? metadata.curation?.score ?? 0);
  if (curationScore > 0) {
    score += Math.min(0.12, curationScore * 0.12);
    reasons.push(`curation score ${curationScore.toFixed(2)}`);
  }
  const confidence = Number(metadata.confidence || 0);
  if (confidence > 0) score += Math.min(0.1, confidence * 0.1);
  const lowInformation = image.curation?.lowInformation || metadata.curation?.lowInformation;
  const duplicate = image.curation?.isDuplicate || metadata.curation?.isDuplicate;
  if (duplicate) {
    score -= 0.2;
    reasons.push('duplicate deprioritized');
  }
  if (lowInformation) reasons.push('low-information asset; operator review required');
  const distinctiveNameEvidence = hasDistinctiveNameEvidence(component, label);
  const autoLink = score >= AUTO_LINK_THRESHOLD
    && categoryCompatible
    && distinctiveNameEvidence
    && !duplicate
    && !lowInformation;
  return {
    imageId: image.id,
    score: Number(Math.max(0, Math.min(1, score)).toFixed(3)),
    autoLink,
    reasons: reasons.length ? reasons : ['weak visual/category evidence; operator review required'],
  };
}

function isCuratedCandidate(image) {
  const curation = image.curation || image.metadata?.curation;
  return curation?.candidate !== false && curation?.isDuplicate !== true;
}

function rankInventoryCandidates(components, images) {
  const rankedCandidates = {};
  for (const component of components.filter(isEligibleComponentForMatching)) {
    const ranked = images
      .filter(isCuratedCandidate)
      .map((image) => rankCandidate(component, image))
      .sort((a, b) => b.score - a.score);
    rankedCandidates[component.id] = ranked;
  }
  return rankedCandidates;
}

function ruleBasedMatch(components, images) {
  const eligibleComponents = components.filter(isEligibleComponentForMatching);
  const rankedCandidates = rankInventoryCandidates(eligibleComponents, images);
  const matches = {};
  const unmatchedComponents = [];
  const usedImages = new Set();

  for (const component of eligibleComponents) {
    const ranked = rankedCandidates[component.id] || [];
    const highConfidence = ranked.filter((candidate) => candidate.autoLink && !usedImages.has(candidate.imageId));
    if (highConfidence.length > 0) {
      matches[component.id] = [highConfidence[0].imageId];
      usedImages.add(highConfidence[0].imageId);
    } else {
      unmatchedComponents.push(component);
    }
  }

  return { matches, rankedCandidates, unmatchedComponents, usedImages };
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
          .filter(isCuratedCandidate)
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
          model: getAiModel(),
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
  const { matches: ruleMatches, rankedCandidates, unmatchedComponents } = ruleBasedMatch(components, hephaestusImages);
  const ruleMatchedCount = Object.keys(ruleMatches).filter(k => ruleMatches[k]?.length > 0).length;
  console.log(`[HybridMatcher] Rule-based matched ${ruleMatchedCount}/${components.length} components`);

  let visionMatches = {};
  if (unmatchedComponents.length > 0 && openai) {
    console.log(`[HybridMatcher] Stage 2: Vision matching ${unmatchedComponents.length} remaining components`);
    visionMatches = await visionMatch(unmatchedComponents, hephaestusImages, gameName, openai);
    for (const [componentId, imageIds] of Object.entries(visionMatches)) {
      const existing = rankedCandidates[componentId] || [];
      const known = new Set(existing.map((candidate) => candidate.imageId));
      imageIds.forEach((imageId) => {
        if (!known.has(imageId)) {
          existing.push({ imageId, score: 0.68, autoLink: false, reasons: ['vision suggestion; operator review required'] });
        }
      });
      rankedCandidates[componentId] = existing.sort((a, b) => b.score - a.score);
    }
  }

  const totalMatched = Object.keys(ruleMatches).filter(k => ruleMatches[k]?.length > 0).length;
  console.log(`[HybridMatcher] Complete: ${totalMatched}/${components.length} components auto-linked`);

  return {
    matches: ruleMatches,
    candidates: rankedCandidates,
    rankedCandidates,
    stats: {
      total: components.length,
      ruleMatched: ruleMatchedCount,
      visionMatched: Object.keys(visionMatches).length,
      totalMatched,
      unmatched: components.length - totalMatched,
      candidateCount: Object.values(rankedCandidates).reduce((sum, list) => sum + list.length, 0),
    }
  };
}

export {
  ruleBasedMatch,
  rankInventoryCandidates,
  visionMatch,
  hybridMatch,
};
