// src/render/manifest.js
// Render manifest generation for publishable packaging
// PHASE PRO-V0: Inventory of outputs + settings + checksums

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Calculate SHA-256 checksum of a file
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} SHA-256 hex digest
 */
export async function calculateChecksum(filePath) {
  try {
    const fileBuffer = await fs.readFile(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  } catch (error) {
    console.warn(`⚠️  Could not calculate checksum for ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Get file size in bytes
 * @param {string} filePath - Path to file
 * @returns {Promise<number>} File size in bytes
 */
export async function getFileSize(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch (error) {
    console.warn(`⚠️  Could not get file size for ${filePath}: ${error.message}`);
    return 0;
  }
}

/**
 * Generate render manifest
 * @param {object} artifacts - Artifact paths
 * @param {string} artifacts.video - Path to video file
 * @param {string} artifacts.thumbnail - Path to thumbnail file
 * @param {string} artifacts.captions - Path to captions file (optional)
 * @param {string} artifacts.chapters - Path to chapters file (optional)
 * @param {string} artifacts.intro - Path to intro clip (optional)
 * @param {string} artifacts.outro - Path to outro clip (optional)
 * @param {object} settings - Render settings
 * @param {string} settings.profile - Render profile ('standard' or 'pro_v0')
 * @param {string} settings.language - Caption language
 * @param {object} settings.loudness - Loudness settings (optional)
 * @param {object} settings.ducking - Ducking settings (optional)
 * @param {object} settings.safetyFilters - Safety filter settings (optional)
 * @param {object} metadata - Additional metadata
 * @param {string} outputDir - Output directory
 * @returns {Promise<string>} Path to generated manifest file
 */
export async function generateManifest(artifacts, settings, metadata, outputDir) {
  const manifestData = {
    version: '1.0',
    profile: settings.profile || 'standard',
    generatedAt: new Date().toISOString(),
    settings: {
      language: settings.language || 'en',
      burnCaptions: settings.burnCaptions || false,
      exportSrt: settings.exportSrt || false,
      loudness: settings.loudness || null,
      ducking: settings.ducking || null,
      safetyFilters: settings.safetyFilters || null
    },
    metadata: {
      duration: metadata.duration || null,
      fps: metadata.fps || null,
      resolution: metadata.resolution || null,
      ...metadata
    },
    artifacts: {}
  };
  
  // Process each artifact
  const artifactList = [
    { key: 'video', path: artifacts.video, required: true },
    { key: 'thumbnail', path: artifacts.thumbnail, required: false },
    { key: 'captions', path: artifacts.captions, required: false },
    { key: 'chapters', path: artifacts.chapters, required: false },
    { key: 'intro', path: artifacts.intro, required: false },
    { key: 'outro', path: artifacts.outro, required: false }
  ];
  
  for (const artifact of artifactList) {
    if (!artifact.path) {
      if (artifact.required) {
        throw new Error(`Required artifact missing: ${artifact.key}`);
      }
      continue;
    }
    
    // Get file info
    const size = await getFileSize(artifact.path);
    const checksum = await calculateChecksum(artifact.path);
    const filename = path.basename(artifact.path);
    
    manifestData.artifacts[artifact.key] = {
      filename,
      path: artifact.path,
      size,
      checksum,
      exists: size > 0
    };
  }
  
  // Write manifest
  const manifestPath = path.join(outputDir, 'render_manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8');
  
  console.log(`✅ Generated render manifest: ${manifestPath}`);
  
  return manifestPath;
}

export default {
  calculateChecksum,
  getFileSize,
  generateManifest
};
