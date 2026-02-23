// src/utils/imageAsset.js
// Canonical ImageAsset DTO for MOBIUS
// Normalizes image metadata from various sources (manual, HEPHAESTUS, etc.)

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * ImageAsset status
 */
export const ImageAssetStatus = {
  CLAIM: 'claim',           // Extracted but not confirmed
  CONFIRMED: 'confirmed',   // Operator confirmed
  MATCHED: 'matched',       // Matched to component
  REJECTED: 'rejected'      // Operator rejected
};

/**
 * Image extraction source
 */
export const ExtractionSource = {
  MANUAL: 'manual',
  HEPHAESTUS: 'hephaestus',
  PDFIMAGES: 'pdfimages',
  EXTERNAL_API: 'external_api'
};

/**
 * Detected component type
 */
export const DetectedType = {
  CARD: 'card',
  TOKEN: 'token',
  BOARD: 'board',
  PIECE: 'piece',
  TILE: 'tile',
  DIE: 'die',
  MARKER: 'marker',
  UNKNOWN: 'unknown'
};

/**
 * Calculate SHA-256 hash of file
 * @param {string} filePath - Absolute path to file
 * @returns {Promise<string>} Hash string
 */
export async function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Normalize ImageAsset from various sources
 * @param {object} data - Raw image data
 * @param {string} source - Extraction source
 * @returns {object} Normalized ImageAsset
 */
export function normalizeImageAsset(data, source = ExtractionSource.MANUAL) {
  return {
    id: data.id || crypto.randomUUID(),
    filename: data.filename || path.basename(data.path || data.relativePath || 'unknown.png'),
    relativePath: data.relativePath || data.path || data.filename,
    absolutePath: data.absolutePath || null, // Resolved at runtime
    status: data.status || ImageAssetStatus.CLAIM,
    source,
    
    // Extraction metadata
    pageNumber: data.pageNumber || data.page || null,
    boundingBox: data.boundingBox || data.bbox || null,
    confidence: data.confidence || null,
    detectedType: data.detectedType || data.type || DetectedType.UNKNOWN,
    
    // File metadata
    hash: data.hash || null, // Computed lazily if needed
    fileSize: data.fileSize || data.size || null,
    dimensions: data.dimensions || { width: null, height: null },
    
    // Provenance
    extractedAt: data.extractedAt || data.timestamp || new Date().toISOString(),
    extractionMethod: data.extractionMethod || source,
    extractionModel: data.extractionModel || data.model || null,
    
    // Operator actions
    confirmedAt: data.confirmedAt || null,
    confirmedBy: data.confirmedBy || null,
    matchedComponentId: data.matchedComponentId || null,
    notes: data.notes || null,
    
    // Additional metadata
    metadata: {
      ...data.metadata,
      originalData: data.originalData || null // Preserve raw data for debugging
    }
  };
}

/**
 * Validate ImageAsset structure
 * @param {object} asset - ImageAsset to validate
 * @returns {object} { valid: boolean, errors: Array }
 */
export function validateImageAsset(asset) {
  const errors = [];
  
  if (!asset || typeof asset !== 'object') {
    return { valid: false, errors: ['Asset must be an object'] };
  }
  
  // Required fields
  if (!asset.id) {
    errors.push('Missing required field: id');
  }
  
  if (!asset.filename) {
    errors.push('Missing required field: filename');
  }
  
  if (!asset.relativePath) {
    errors.push('Missing required field: relativePath');
  }
  
  // Validate status
  if (asset.status && !Object.values(ImageAssetStatus).includes(asset.status)) {
    errors.push(`Invalid status: ${asset.status}`);
  }
  
  // Validate source
  if (asset.source && !Object.values(ExtractionSource).includes(asset.source)) {
    errors.push(`Invalid source: ${asset.source}`);
  }
  
  // Validate confidence (if present)
  if (asset.confidence !== null && asset.confidence !== undefined) {
    if (typeof asset.confidence !== 'number' || asset.confidence < 0 || asset.confidence > 1) {
      errors.push('Confidence must be a number between 0 and 1');
    }
  }
  
  // Validate bounding box (if present)
  if (asset.boundingBox) {
    const bbox = asset.boundingBox;
    if (typeof bbox.x !== 'number' || typeof bbox.y !== 'number' ||
        typeof bbox.width !== 'number' || typeof bbox.height !== 'number') {
      errors.push('Bounding box must have numeric x, y, width, height');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Deduplicate ImageAssets by hash
 * @param {Array<object>} assets - Array of ImageAssets
 * @returns {Array<object>} Deduplicated assets
 */
export function deduplicateImageAssets(assets) {
  const seen = new Map();
  const deduplicated = [];
  
  for (const asset of assets) {
    if (!asset.hash) {
      // No hash, keep it
      deduplicated.push(asset);
      continue;
    }
    
    if (seen.has(asset.hash)) {
      // Duplicate found, merge metadata
      const existing = seen.get(asset.hash);
      existing.metadata.duplicates = existing.metadata.duplicates || [];
      existing.metadata.duplicates.push({
        id: asset.id,
        filename: asset.filename,
        source: asset.source
      });
    } else {
      // First occurrence
      seen.set(asset.hash, asset);
      deduplicated.push(asset);
    }
  }
  
  return deduplicated;
}

/**
 * Filter ImageAssets by criteria
 * @param {Array<object>} assets - Array of ImageAssets
 * @param {object} criteria - Filter criteria
 * @returns {Array<object>} Filtered assets
 */
export function filterImageAssets(assets, criteria = {}) {
  return assets.filter(asset => {
    // Filter by status
    if (criteria.status && asset.status !== criteria.status) {
      return false;
    }
    
    // Filter by source
    if (criteria.source && asset.source !== criteria.source) {
      return false;
    }
    
    // Filter by minimum confidence
    if (criteria.minConfidence && 
        (asset.confidence === null || asset.confidence < criteria.minConfidence)) {
      return false;
    }
    
    // Filter by detected type
    if (criteria.detectedType && asset.detectedType !== criteria.detectedType) {
      return false;
    }
    
    // Filter by page number
    if (criteria.pageNumber && asset.pageNumber !== criteria.pageNumber) {
      return false;
    }
    
    return true;
  });
}

/**
 * Sort ImageAssets by criteria
 * @param {Array<object>} assets - Array of ImageAssets
 * @param {string} sortBy - Sort field
 * @param {string} order - 'asc' or 'desc'
 * @returns {Array<object>} Sorted assets
 */
export function sortImageAssets(assets, sortBy = 'confidence', order = 'desc') {
  const sorted = [...assets];
  
  sorted.sort((a, b) => {
    let aVal = a[sortBy];
    let bVal = b[sortBy];
    
    // Handle null values
    if (aVal === null || aVal === undefined) aVal = order === 'asc' ? Infinity : -Infinity;
    if (bVal === null || bVal === undefined) bVal = order === 'asc' ? Infinity : -Infinity;
    
    if (order === 'asc') {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    } else {
      return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
    }
  });
  
  return sorted;
}

/**
 * Convert HEPHAESTUS manifest to ImageAssets
 * @param {object} manifest - HEPHAESTUS manifest
 * @param {string} projectDir - Absolute project directory path
 * @returns {Array<object>} Array of ImageAssets
 */
export function manifestToImageAssets(manifest, projectDir) {
  if (!manifest || !manifest.images) {
    return [];
  }
  
  return manifest.images.map(img => {
    const asset = normalizeImageAsset({
      id: img.id,
      filename: img.filename,
      relativePath: img.relativePath,
      absolutePath: path.join(projectDir, img.relativePath),
      pageNumber: img.pageNumber,
      boundingBox: img.boundingBox,
      confidence: img.confidence,
      detectedType: img.detectedType,
      hash: img.hash,
      extractedAt: manifest.extractedAt,
      extractionMethod: 'hephaestus',
      extractionModel: manifest.model || img.metadata?.model,
      metadata: {
        ...img.metadata,
        manifestVersion: manifest.version,
        pdfHash: manifest.pdfHash
      }
    }, ExtractionSource.HEPHAESTUS);
    
    return asset;
  });
}

/**
 * Create extraction result summary
 * @param {Array<object>} assets - Array of ImageAssets
 * @returns {object} Summary statistics
 */
export function createExtractionSummary(assets) {
  const summary = {
    total: assets.length,
    byStatus: {},
    bySource: {},
    byType: {},
    averageConfidence: 0,
    withBoundingBox: 0,
    withHash: 0
  };
  
  let confidenceSum = 0;
  let confidenceCount = 0;
  
  for (const asset of assets) {
    // Count by status
    summary.byStatus[asset.status] = (summary.byStatus[asset.status] || 0) + 1;
    
    // Count by source
    summary.bySource[asset.source] = (summary.bySource[asset.source] || 0) + 1;
    
    // Count by type
    summary.byType[asset.detectedType] = (summary.byType[asset.detectedType] || 0) + 1;
    
    // Average confidence
    if (asset.confidence !== null && asset.confidence !== undefined) {
      confidenceSum += asset.confidence;
      confidenceCount++;
    }
    
    // Count features
    if (asset.boundingBox) summary.withBoundingBox++;
    if (asset.hash) summary.withHash++;
  }
  
  summary.averageConfidence = confidenceCount > 0 
    ? confidenceSum / confidenceCount 
    : null;
  
  return summary;
}

export default {
  ImageAssetStatus,
  ExtractionSource,
  DetectedType,
  hashFile,
  normalizeImageAsset,
  validateImageAsset,
  deduplicateImageAssets,
  filterImageAssets,
  sortImageAssets,
  manifestToImageAssets,
  createExtractionSummary
};
