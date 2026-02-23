/**
 * Artifact Authority and Manifest Management
 * 
 * Implements semantic coherence for rendered outputs by tracking:
 * - Artifact provenance (inputs, derivation chain)
 * - Authority status (authoritative vs draft/preview)
 * - Stage gates (explicit operator confirmation required)
 * 
 * No artifact is implicitly canonical - authority must be explicitly granted.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Artifact manifest schema
 * @typedef {Object} ArtifactManifest
 * @property {string} projectId - Project identifier
 * @property {string} stage - Artifact stage (preview, draft, final, etc.)
 * @property {string} createdAt - ISO timestamp
 * @property {Object} inputs - Input file references with hashes/sizes
 * @property {string[]} derivedFrom - Prior artifact IDs this was derived from
 * @property {boolean} authoritative - Whether this is the canonical version
 * @property {string} [notes] - Optional notes or warnings
 * @property {Object} [metadata] - Additional metadata
 */

const MANIFEST_FILENAME = 'artifact_manifest.json';

/**
 * Create a new artifact manifest
 * @param {string} projectId - Project identifier
 * @param {string} stage - Artifact stage
 * @param {Object} options - Additional options
 * @param {Object} options.inputs - Input file references
 * @param {string[]} options.derivedFrom - Prior artifact IDs
 * @param {boolean} options.authoritative - Authority flag (requires explicit true)
 * @param {string} options.notes - Optional notes
 * @param {Object} options.metadata - Additional metadata
 * @returns {ArtifactManifest} Created manifest
 */
export function createManifest(projectId, stage, options = {}) {
  if (!projectId) {
    throw new Error('projectId is required');
  }
  
  if (!stage) {
    throw new Error('stage is required');
  }
  
  // Authority must be explicitly granted, never implicit
  const authoritative = options.authoritative === true ? true : false;
  
  const manifest = {
    projectId,
    stage,
    createdAt: new Date().toISOString(),
    inputs: options.inputs || {},
    derivedFrom: options.derivedFrom || [],
    authoritative,
    notes: options.notes || '',
    metadata: options.metadata || {},
    // Manifest version for future schema evolution
    manifestVersion: '1.0.0'
  };
  
  return manifest;
}

/**
 * Write manifest to disk
 * @param {string} outputDir - Directory to write manifest
 * @param {ArtifactManifest} manifest - Manifest to write
 * @throws {Error} If write fails
 */
export function writeManifest(outputDir, manifest) {
  if (!fs.existsSync(outputDir)) {
    throw new Error(`Output directory does not exist: ${outputDir}`);
  }
  
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  
  // Add write timestamp
  const manifestWithTimestamp = {
    ...manifest,
    lastModified: new Date().toISOString()
  };
  
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifestWithTimestamp, null, 2),
    'utf8'
  );
  
  return manifestPath;
}

/**
 * Read manifest from disk
 * @param {string} outputDir - Directory containing manifest
 * @returns {ArtifactManifest|null} Manifest or null if not found
 */
export function readManifest(outputDir) {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read manifest at ${manifestPath}: ${error.message}`);
  }
}

/**
 * Update existing manifest
 * @param {string} outputDir - Directory containing manifest
 * @param {Object} updates - Fields to update
 * @returns {ArtifactManifest} Updated manifest
 * @throws {Error} If manifest doesn't exist or update fails
 */
export function updateManifest(outputDir, updates) {
  const existing = readManifest(outputDir);
  
  if (!existing) {
    throw new Error(`No manifest found in ${outputDir}`);
  }
  
  // Prevent implicit authority escalation
  if (updates.authoritative === true && existing.authoritative !== true) {
    throw new Error(
      'Cannot grant authority via update. Use grantAuthority() with explicit confirmation.'
    );
  }
  
  const updated = {
    ...existing,
    ...updates,
    lastModified: new Date().toISOString()
  };
  
  writeManifest(outputDir, updated);
  return updated;
}

/**
 * Grant authority to an artifact (requires explicit confirmation)
 * @param {string} outputDir - Directory containing manifest
 * @param {Object} options - Confirmation options
 * @param {boolean} options.confirmed - Must be explicitly true
 * @param {string} options.grantedBy - Operator identifier
 * @param {string} options.reason - Reason for granting authority
 * @returns {ArtifactManifest} Updated manifest
 * @throws {Error} If not confirmed or manifest doesn't exist
 */
export function grantAuthority(outputDir, options = {}) {
  if (options.confirmed !== true) {
    throw new Error(
      'Authority grant requires explicit confirmation. Set options.confirmed = true'
    );
  }
  
  if (!options.grantedBy) {
    throw new Error('Authority grant requires grantedBy identifier');
  }
  
  const existing = readManifest(outputDir);
  
  if (!existing) {
    throw new Error(`No manifest found in ${outputDir}`);
  }
  
  if (existing.authoritative === true) {
    throw new Error('Artifact is already authoritative');
  }
  
  const updated = {
    ...existing,
    authoritative: true,
    authorityGranted: {
      at: new Date().toISOString(),
      by: options.grantedBy,
      reason: options.reason || 'Manual authority grant'
    },
    lastModified: new Date().toISOString()
  };
  
  writeManifest(outputDir, updated);
  return updated;
}

/**
 * Compute hash of a file for input tracking
 * @param {string} filePath - Path to file
 * @returns {Object} Hash and size information
 */
export function computeFileHash(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  const stats = fs.statSync(filePath);
  
  return {
    hash,
    size: stats.size,
    path: filePath,
    computedAt: new Date().toISOString()
  };
}

/**
 * Check if manifest exists in directory
 * @param {string} outputDir - Directory to check
 * @returns {boolean} True if manifest exists
 */
export function hasManifest(outputDir) {
  const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
  return fs.existsSync(manifestPath);
}

/**
 * List all artifacts in a directory (by finding manifests)
 * @param {string} baseDir - Base directory to search
 * @returns {Array<{dir: string, manifest: ArtifactManifest}>} Found artifacts
 */
export function listArtifacts(baseDir) {
  if (!fs.existsSync(baseDir)) {
    return [];
  }
  
  const artifacts = [];
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const dirPath = path.join(baseDir, entry.name);
      const manifest = readManifest(dirPath);
      
      if (manifest) {
        artifacts.push({
          dir: dirPath,
          manifest
        });
      }
    }
  }
  
  return artifacts;
}

/**
 * Validate manifest structure
 * @param {ArtifactManifest} manifest - Manifest to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
export function validateManifest(manifest) {
  const errors = [];
  
  if (!manifest) {
    errors.push('Manifest is null or undefined');
    return { valid: false, errors };
  }
  
  // Required fields
  if (!manifest.projectId) errors.push('Missing required field: projectId');
  if (!manifest.stage) errors.push('Missing required field: stage');
  if (!manifest.createdAt) errors.push('Missing required field: createdAt');
  if (manifest.inputs === undefined) errors.push('Missing required field: inputs');
  if (!Array.isArray(manifest.derivedFrom)) errors.push('derivedFrom must be an array');
  if (typeof manifest.authoritative !== 'boolean') {
    errors.push('authoritative must be a boolean');
  }
  
  // Validate ISO timestamp
  if (manifest.createdAt && isNaN(Date.parse(manifest.createdAt))) {
    errors.push('createdAt must be a valid ISO timestamp');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default {
  createManifest,
  writeManifest,
  readManifest,
  updateManifest,
  grantAuthority,
  computeFileHash,
  hasManifest,
  listArtifacts,
  validateManifest,
  MANIFEST_FILENAME
};
