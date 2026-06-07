/**
 * Renderer-ready image asset normalization and validation utilities.
 *
 * This module is kept separate from imagePipeline.js to avoid importing
 * ESM-only dependencies (like pdf-to-img) which complicate Jest testing.
 */

import fs from 'fs';
import path from 'path';

export const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tiff'];

function createImageId(prefix = 'img') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Normalize any image asset record into the canonical renderer-ready shape.
 */
export function normalizeRendererImageAsset(asset = {}) {
  return {
    id: asset.id || createImageId(asset.source || 'img'),
    source: asset.source || 'manual',
    name: asset.name || null,
    originalUrl: asset.originalUrl || null,
    fileKey: asset.fileKey || null,
    renderPath: asset.renderPath || null,
    width: asset.width || null,
    height: asset.height || null,
    crops: Array.isArray(asset.crops) ? asset.crops : [],
    tags: Array.isArray(asset.tags) ? asset.tags : [],
    quality: asset.quality || { score: 0.5, notes: 'pending' },
    license: asset.license || null,
  };
}

/**
 * Resolve a local render-ready file path from an image asset.
 * Returns the resolved path if the file exists and is usable, or null.
 */
export function resolveRenderPath(asset, { baseDir } = {}) {
  const candidates = [
    asset.renderPath,
    asset.fileKey,
    asset.localPath,
    asset.path,
  ].filter(Boolean);

  const root = baseDir || process.cwd();

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
    if (fs.existsSync(resolved)) {
      const ext = path.extname(resolved).toLowerCase();
      if (SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
        return resolved;
      }
    }
  }
  return null;
}

/**
 * Validate an image asset for renderer consumption.
 * Returns { valid, renderPath, warnings, asset }.
 */
export function validateImageForRenderer(asset, options = {}) {
  const warnings = [];
  const normalized = normalizeRendererImageAsset(asset);
  const renderPath = resolveRenderPath(normalized, options);

  if (!renderPath) {
    warnings.push(`Image ${normalized.id}: no local renderable file found`);
    return { valid: false, renderPath: null, warnings, asset: normalized };
  }

  try {
    const stat = fs.statSync(renderPath);
    if (stat.size === 0) {
      warnings.push(`Image ${normalized.id}: file is empty (${renderPath})`);
      return { valid: false, renderPath, warnings, asset: normalized };
    }
  } catch {
    warnings.push(`Image ${normalized.id}: cannot stat file (${renderPath})`);
    return { valid: false, renderPath: null, warnings, asset: normalized };
  }

  normalized.renderPath = renderPath;
  return { valid: true, renderPath, warnings, asset: normalized };
}

/**
 * Normalize and validate a batch of image assets for renderer readiness.
 * Returns { ready, missing, warnings }.
 */
export function prepareImagesForRenderer(images = [], options = {}) {
  const ready = [];
  const missing = [];
  const warnings = [];

  for (const img of images) {
    const result = validateImageForRenderer(img, options);
    warnings.push(...result.warnings);
    if (result.valid) {
      ready.push(result.asset);
    } else {
      missing.push(result.asset);
    }
  }

  return { ready, missing, warnings };
}
