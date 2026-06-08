/**
 * Deterministic image-to-scene visual matcher.
 *
 * Assigns validated image assets to storyboard scenes based on:
 * 1. Explicit existing imageId/imageRef (preserved, never overwritten)
 * 2. Component ID exact match
 * 3. Component name / alias match (normalized)
 * 4. Image tags matching scene type
 * 5. Scene type heuristic (intro→box-art, setup→board/overview, etc.)
 *
 * Produces confidence scores and reasons for each assignment.
 * Missing matches get explicit warnings and safe fallback.
 */

/**
 * Normalize a string for fuzzy matching (lowercase, strip special chars, collapse whitespace).
 */
function normalizeForMatch(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Scene type to preferred image tag mapping.
 */
const SCENE_TYPE_TAG_PREFERENCES = {
  intro: ['box-art', 'cover', 'box', 'title'],
  setup_step: ['board', 'overview', 'setup', 'components'],
  component: ['component', 'card', 'token', 'piece', 'tile'],
  scoring: ['scoring', 'points', 'track'],
  end_card: ['box-art', 'cover', 'logo'],
  gameplay: ['gameplay', 'action', 'turn'],
};

/**
 * Try to match a scene to an image asset.
 * Returns { imageId, confidence, reason } or null.
 */
function findBestMatch(scene, imageAssets) {
  if (!imageAssets || imageAssets.length === 0) return null;

  const sceneId = normalizeForMatch(scene.id || '');
  const sceneSegment = normalizeForMatch(scene.segmentId || '');
  const sceneType = (scene.type || '').toLowerCase();

  // Strategy 1: Match by component ID in scene segmentId or id
  for (const img of imageAssets) {
    const imgId = normalizeForMatch(img.id || '');
    const imgName = normalizeForMatch(img.name || '');

    if (imgId && (sceneId.includes(imgId) || sceneSegment.includes(imgId))) {
      return { imageId: img.id, confidence: 0.9, reason: 'component-id-match' };
    }
    if (imgName && sceneSegment && sceneSegment.includes(imgName)) {
      return { imageId: img.id, confidence: 0.85, reason: 'component-name-match' };
    }
  }

  // Strategy 2: Match by image tags aligned with scene type
  const preferredTags = SCENE_TYPE_TAG_PREFERENCES[sceneType] || [];
  if (preferredTags.length > 0) {
    for (const img of imageAssets) {
      const imgTags = (img.tags || []).map((t) => t.toLowerCase());
      const matchedTag = preferredTags.find((tag) => imgTags.includes(tag));
      if (matchedTag) {
        return { imageId: img.id, confidence: 0.7, reason: `tag-match:${matchedTag}` };
      }
    }
  }

  // Strategy 3: Scene type heuristic — intro/end_card prefers first box-art, setup prefers overview
  if (sceneType === 'intro' || sceneType === 'end_card') {
    const boxArt = imageAssets.find((img) =>
      (img.tags || []).some((t) => ['box-art', 'cover', 'box'].includes(t.toLowerCase()))
    );
    if (boxArt) {
      return { imageId: boxArt.id, confidence: 0.6, reason: 'heuristic-intro-box-art' };
    }
  }

  if (sceneType === 'setup_step') {
    const overview = imageAssets.find((img) =>
      (img.tags || []).some((t) => ['board', 'overview', 'setup'].includes(t.toLowerCase()))
    );
    if (overview) {
      return { imageId: overview.id, confidence: 0.6, reason: 'heuristic-setup-overview' };
    }
  }

  return null;
}

/**
 * Match all storyboard scenes to available image assets.
 *
 * @param {Array} scenes - Storyboard scenes (from storyboardManifest.scenes)
 * @param {Array} imageAssets - Validated renderer-ready image assets (with renderPath)
 * @returns {{ matchedScenes, warnings }}
 */
export function matchScenesToImages(scenes = [], imageAssets = []) {
  const warnings = [];
  const usedImageIds = new Set();

  const matchedScenes = scenes.map((scene) => {
    // Preserve explicit existing assignments
    if (scene.imageId || scene.imageRef) {
      return {
        ...scene,
        visualMatchConfidence: 1.0,
        visualMatchReason: 'explicit-assignment',
        visualWarnings: [],
      };
    }

    const match = findBestMatch(scene, imageAssets);

    if (match) {
      usedImageIds.add(match.imageId);
      return {
        ...scene,
        imageId: match.imageId,
        visualMatchConfidence: match.confidence,
        visualMatchReason: match.reason,
        visualWarnings: [],
      };
    }

    // No match found
    const warning = `Scene '${scene.id}' (type: ${scene.type || 'unknown'}): no suitable image found`;
    warnings.push(warning);

    return {
      ...scene,
      imageId: null,
      visualMatchConfidence: 0,
      visualMatchReason: 'no-match',
      visualWarnings: [warning],
    };
  });

  // Summary warnings for unused images
  const unusedImages = imageAssets.filter((img) => !usedImageIds.has(img.id));
  if (unusedImages.length > 0 && scenes.length > 0) {
    warnings.push(`${unusedImages.length} image(s) not matched to any scene: ${unusedImages.map((i) => i.id).join(', ')}`);
  }

  return { matchedScenes, warnings };
}

export { normalizeForMatch, findBestMatch, SCENE_TYPE_TAG_PREFERENCES };
