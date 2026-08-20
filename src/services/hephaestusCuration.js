import crypto from 'crypto';
import fs from 'fs';

const LOW_INFORMATION_TERMS = [
  'blank', 'empty', 'fragment', 'decoration', 'decorative', 'glyph', 'arrow', 'line art', 'line-art',
  'border', 'ornament', 'separator', 'background', 'star', 'icon', 'logo', 'crop', 'unknown',
];

function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function hashFile(fileKey) {
  try {
    if (!fileKey || !fs.existsSync(fileKey)) return null;
    return crypto.createHash('sha256').update(fs.readFileSync(fileKey)).digest('hex');
  } catch {
    return null;
  }
}

function contentHash(asset) {
  return asset.contentHash
    || asset.hash
    || asset.metadata?.contentHash
    || hashFile(asset.fileKey || asset.file_path || asset.path);
}

function nativeObjectKey(asset) {
  const metadata = asset.metadata || {};
  const explicit = metadata.nativeObjectId || metadata.xref || asset.nativeObjectId || asset.xref;
  if (explicit !== undefined && explicit !== null) return `xref-${explicit}`;
  const identity = `${asset.id || ''} ${asset.file_name || ''} ${asset.file_path || ''}`;
  const match = identity.match(/(?:xref|object)[_-]?(\d+)/i);
  return match ? `xref-${match[1]}` : null;
}

function sourceKey(asset) {
  // PDFs frequently embed the same raster under multiple xrefs. Prefer the
  // content hash so review surfaces one canonical visual instead of repeated
  // copies; fall back to the native object identity only when hashing is absent.
  return contentHash(asset) || nativeObjectKey(asset) || asset.fileKey || asset.file_path || asset.id;
}

function classifyLowInformation(asset) {
  const metadata = asset.metadata || {};
  const label = `${asset.label || asset.name || asset.classification || asset.type || ''} ${metadata.label || ''} ${(asset.tags || []).join(' ')}`.toLowerCase();
  const width = number(asset.width || asset.dimensions?.width || asset.original_dimensions?.width || metadata.originalDimensions?.width);
  const height = number(asset.height || asset.dimensions?.height || asset.original_dimensions?.height || metadata.originalDimensions?.height);
  const area = width * height;
  const reasons = LOW_INFORMATION_TERMS.filter((term) => label.includes(term));
  const visualMetrics = asset.visual_metrics || asset.visualMetrics || metadata.visualMetrics || {};
  if (visualMetrics.nearBlank === true) reasons.push('near-blank raster');
  if (width > 0 && height > 0 && (width < 48 || height < 48 || area < 4096)) reasons.push('tiny native dimensions');
  if ((asset.type === 'other' || asset.classification === 'other') && !asset.is_component && metadata.classification !== 'component') reasons.push('unclassified native asset');
  return { lowInformation: reasons.length > 0, reasons };
}

function scoreAsset(asset, duplicateCount, lowInformation) {
  const metadata = asset.metadata || {};
  const width = number(asset.width || asset.dimensions?.width || asset.original_dimensions?.width || metadata.originalDimensions?.width);
  const height = number(asset.height || asset.dimensions?.height || asset.original_dimensions?.height || metadata.originalDimensions?.height);
  const areaScore = Math.min(1, Math.log10(Math.max(1, width * height)) / 7);
  const aspect = width && height ? Math.max(width / height, height / width) : 10;
  const aspectScore = aspect <= 3.5 ? 1 : Math.max(0, 1 - ((aspect - 3.5) / 8));
  const typeScore = ['card', 'token', 'board', 'tile', 'dice', 'marker', 'miniature', 'currency'].includes(asset.type) ? 1 : 0.25;
  const componentScore = asset.is_component || metadata.is_component ? 1 : 0.35;
  const repetitionScore = duplicateCount > 1 ? Math.min(1, 0.55 + duplicateCount * 0.05) : 0.7;
  let score = (areaScore * 0.25) + (aspectScore * 0.15) + (typeScore * 0.25) + (componentScore * 0.25) + (repetitionScore * 0.1);
  if (lowInformation) score -= 0.35;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function curateHephaestusAssets(assets = []) {
  const groups = new Map();
  const prepared = assets.map((asset) => {
    const hash = contentHash(asset);
    const groupId = `heph-group-${String(sourceKey({ ...asset, contentHash: hash })).slice(0, 80)}`;
    const entry = { ...asset, contentHash: hash, duplicateGroupId: groupId };
    if (!groups.has(groupId)) groups.set(groupId, []);
    groups.get(groupId).push(entry);
    return entry;
  });

  const curated = prepared.map((asset) => {
    const group = groups.get(asset.duplicateGroupId) || [asset];
    const canonical = group[0];
    const duplicate = canonical.id !== asset.id;
    const { lowInformation, reasons } = classifyLowInformation(asset);
    const score = scoreAsset(asset, group.length, lowInformation);
    const allReasons = [...reasons];
    if (duplicate) allReasons.push('exact native object/content duplicate');
    if (asset.type === 'other') allReasons.push('no component class');
    const candidate = !duplicate && !lowInformation && score >= 0.35;
    return {
      ...asset,
      curation: {
        score,
        candidate,
        priority: candidate && score >= 0.65 ? 'high' : 'low',
        isDuplicate: duplicate,
        canonicalAssetId: canonical.id,
        duplicateGroupId: asset.duplicateGroupId,
        lowInformation,
        reasons: allReasons,
      },
    };
  });

  const stats = {
    rawCount: curated.length,
    curatedCount: curated.filter((asset) => asset.curation.candidate).length,
    duplicateCount: curated.filter((asset) => asset.curation.isDuplicate).length,
    lowPriorityCount: curated.filter((asset) => !asset.curation.candidate).length,
  };

  return { assets: curated, stats };
}

export { curateHephaestusAssets, classifyLowInformation, scoreAsset };
