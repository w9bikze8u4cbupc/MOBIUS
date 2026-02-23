/**
 * Canonical storage path configuration for MOBIUS
 * 
 * This module establishes the single source of truth for all data paths.
 * All file operations MUST use these paths to prevent state divergence.
 * 
 * Implements two layers of canonicalization:
 * 1. Mechanical: Single data root + path resolution
 * 2. Semantic: Artifact authority + coherence validation
 * 
 * Directory structure:
 *   data/
 *   ├── db/           - SQLite database files
 *   ├── uploads/      - User-uploaded files (PDFs, assets)
 *   ├── outputs/      - Rendered videos and artifacts
 *   └── tmp/          - Temporary files (auto-cleaned)
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cutover marker filename
const CUTOVER_MARKER = '.mobius_cutover.json';

/**
 * Legacy paths that must not be written to after cutover
 */
const LEGACY_PATHS = [
  'src/api/projects.db',
  'src/api/projects.sqlite',
  'src/api/uploads',
  'projects.db',
  'projects.sqlite',
  'uploads',
  'output',
  'out',
  'data/projects.db', // Legacy location within data/
];

/**
 * Get the canonical data root directory
 * Can be overridden via MOBIUS_DATA_ROOT environment variable
 * @returns {string} Absolute path to data root
 */
export function getDataRoot() {
  const dataRoot = process.env.MOBIUS_DATA_ROOT || 
                   process.env.DATA_DIR || 
                   path.join(dirname(dirname(__dirname)), 'data');
  
  return path.resolve(dataRoot);
}

/**
 * Get project root directory
 * @returns {string} Absolute path to project root
 */
export function getProjectRoot() {
  return dirname(dirname(__dirname));
}

/**
 * Get list of legacy paths (relative to project root)
 * @returns {string[]} Array of legacy path patterns
 */
export function getLegacyPaths() {
  return [...LEGACY_PATHS];
}

/**
 * Get all canonical data directories
 * @returns {Object} Object with all data directory paths
 */
export function getDataDirs() {
  const root = getDataRoot();
  
  return {
    root,
    db: path.join(root, 'db'),
    uploads: path.join(root, 'uploads'),
    outputs: path.join(root, 'outputs'),
    tmp: path.join(root, 'tmp'),
    // Legacy compatibility aliases (deprecated)
    output: path.join(root, 'outputs'),
    pdfImages: path.join(root, 'uploads', 'pdf_images'),
    fixtures: path.join(root, 'fixtures'),
  };
}

/**
 * Get the canonical database file path
 * @returns {string} Absolute path to SQLite database
 */
export function getDbPath() {
  const dirs = getDataDirs();
  return path.join(dirs.db, 'projects.sqlite');
}

/**
 * Ensure all canonical directories exist
 * Creates directories if they don't exist
 */
export function ensureDataDirs() {
  const dirs = getDataDirs();
  
  // Create all directories
  Object.entries(dirs).forEach(([key, dirPath]) => {
    if (key !== 'root' && key !== 'pdfImages') { // Skip aliases
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
  });
  
  // Create pdfImages subdirectory
  if (!fs.existsSync(dirs.pdfImages)) {
    fs.mkdirSync(dirs.pdfImages, { recursive: true });
  }
}

/**
 * Validate that no legacy paths exist with data
 * Throws error if legacy paths are detected with files
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - If true, fail on any legacy path (even empty)
 * @throws {Error} If legacy paths contain data
 */
export function validateNoLegacyPaths(options = {}) {
  const projectRoot = getProjectRoot();
  const foundLegacyPaths = [];
  
  for (const legacyPattern of LEGACY_PATHS) {
    const legacyPath = path.join(projectRoot, legacyPattern);
    
    if (fs.existsSync(legacyPath)) {
      const stats = fs.statSync(legacyPath);
      
      if (stats.isFile()) {
        // Always report files
        foundLegacyPaths.push({
          path: legacyPath,
          type: 'file',
          size: stats.size
        });
      } else if (stats.isDirectory()) {
        const contents = fs.readdirSync(legacyPath);
        
        // Report directories with contents, or all directories in strict mode
        if (contents.length > 0 || options.strict) {
          foundLegacyPaths.push({
            path: legacyPath,
            type: 'directory',
            fileCount: contents.length
          });
        }
      }
    }
  }
  
  if (foundLegacyPaths.length > 0) {
    const cutoverComplete = isCutoverComplete();
    const severity = cutoverComplete ? '❌ CRITICAL' : '⚠️  WARNING';
    
    const errorMessage = [
      `${severity}: LEGACY DATA PATHS DETECTED`,
      '',
      cutoverComplete 
        ? 'Cutover is complete but legacy paths still exist:'
        : 'The following legacy paths contain data and must be migrated:',
      '',
      ...foundLegacyPaths.map(item => {
        if (item.type === 'file') {
          return `  📄 ${item.path} (${item.size} bytes)`;
        } else {
          return `  📁 ${item.path} (${item.fileCount} files)`;
        }
      }),
      '',
      'REMEDIATION:',
      cutoverComplete
        ? '  1. Manually remove legacy paths (data already migrated)'
        : '  1. Run: npm run storage:migrate',
      '  2. Verify migration completed successfully',
      cutoverComplete
        ? '  3. Verify application still works'
        : '  3. Run: npm run storage:cutover',
      '  4. Restart the application',
      '',
      'To bypass this check (NOT RECOMMENDED):',
      '  Set environment variable: SKIP_LEGACY_CHECK=true'
    ].join('\n');
    
    throw new Error(errorMessage);
  }
}

/**
 * Resolve a path within the data directory
 * @param {...string} segments Path segments to join
 * @returns {string} Absolute path within data directory
 */
export function resolveDataPath(...segments) {
  const root = getDataRoot();
  return path.join(root, ...segments);
}

/**
 * Get upload path for a file
 * Validates against legacy paths after cutover
 * @param {string} filename Filename
 * @returns {string} Absolute path in uploads directory
 */
export function getUploadPath(filename) {
  const dirs = getDataDirs();
  const uploadPath = path.join(dirs.uploads, filename);
  guardLegacyWrite(uploadPath);
  return uploadPath;
}

/**
 * Get output path for a project
 * Validates against legacy paths after cutover
 * @param {string} projectId Project identifier
 * @param {string} filename Optional filename
 * @returns {string} Absolute path in outputs directory
 */
export function getOutputPath(projectId, filename = '') {
  const dirs = getDataDirs();
  const projectDir = path.join(dirs.outputs, projectId);
  
  guardLegacyWrite(projectDir);
  
  // Ensure project output directory exists
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  
  return filename ? path.join(projectDir, filename) : projectDir;
}

/**
 * Get temporary file path
 * @param {string} filename Filename
 * @returns {string} Absolute path in tmp directory
 */
export function getTmpPath(filename) {
  const dirs = getDataDirs();
  return path.join(dirs.tmp, filename);
}

/**
 * Check if cutover has been performed
 * @returns {boolean} True if cutover marker exists
 */
export function isCutoverComplete() {
  const dataRoot = getDataRoot();
  const cutoverPath = path.join(dataRoot, CUTOVER_MARKER);
  return fs.existsSync(cutoverPath);
}

/**
 * Read cutover marker
 * @returns {Object|null} Cutover data or null if not found
 */
export function readCutoverMarker() {
  const dataRoot = getDataRoot();
  const cutoverPath = path.join(dataRoot, CUTOVER_MARKER);
  
  if (!fs.existsSync(cutoverPath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(cutoverPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read cutover marker: ${error.message}`);
  }
}

/**
 * Write cutover marker
 * @param {Object} data - Cutover data
 * @throws {Error} If write fails
 */
export function writeCutoverMarker(data) {
  const dataRoot = getDataRoot();
  ensureDataDirs();
  
  const cutoverPath = path.join(dataRoot, CUTOVER_MARKER);
  
  const cutoverData = {
    ...data,
    timestamp: new Date().toISOString(),
    dataRoot,
    version: '1.0.0'
  };
  
  fs.writeFileSync(
    cutoverPath,
    JSON.stringify(cutoverData, null, 2),
    'utf8'
  );
  
  return cutoverPath;
}

/**
 * Check if a path is a legacy path
 * @param {string} targetPath - Path to check (absolute or relative)
 * @returns {boolean} True if path is a legacy path
 */
export function isLegacyPath(targetPath) {
  const projectRoot = getProjectRoot();
  const absPath = path.isAbsolute(targetPath) 
    ? targetPath 
    : path.join(projectRoot, targetPath);
  
  const normalizedPath = path.normalize(absPath);
  
  for (const legacyPattern of LEGACY_PATHS) {
    const legacyPath = path.normalize(path.join(projectRoot, legacyPattern));
    
    // Check if path starts with legacy path (for directories)
    if (normalizedPath.startsWith(legacyPath)) {
      return true;
    }
    
    // Check exact match (for files)
    if (normalizedPath === legacyPath) {
      return true;
    }
  }
  
  return false;
}

/**
 * Guard against writes to legacy paths after cutover
 * @param {string} targetPath - Path to validate
 * @throws {Error} If path is legacy and cutover is complete
 */
export function guardLegacyWrite(targetPath) {
  // Skip check if explicitly disabled (for migration/testing)
  if (process.env.SKIP_LEGACY_WRITE_GUARD === 'true') {
    return;
  }
  
  if (!isCutoverComplete()) {
    // Before cutover, only warn
    if (isLegacyPath(targetPath)) {
      console.warn(
        `⚠️  WARNING: Writing to legacy path: ${targetPath}\n` +
        `   This will be blocked after cutover. Use canonical paths from storage.mjs`
      );
    }
    return;
  }
  
  // After cutover, hard fail
  if (isLegacyPath(targetPath)) {
    throw new Error(
      `❌ LEGACY PATH WRITE BLOCKED\n\n` +
      `Attempted write to legacy path: ${targetPath}\n\n` +
      `After cutover, all writes must use canonical paths:\n` +
      `  - Database: getDbPath()\n` +
      `  - Uploads: getUploadPath(filename)\n` +
      `  - Outputs: getOutputPath(projectId, filename)\n` +
      `  - Temp: getTmpPath(filename)\n\n` +
      `Import from: src/config/storage.mjs\n\n` +
      `To temporarily disable (NOT RECOMMENDED):\n` +
      `  Set environment variable: SKIP_LEGACY_WRITE_GUARD=true`
    );
  }
}

export default {
  getDataRoot,
  getProjectRoot,
  getDataDirs,
  getDbPath,
  getLegacyPaths,
  ensureDataDirs,
  isCutoverComplete,
  readCutoverMarker,
  writeCutoverMarker,
  isLegacyPath,
  guardLegacyWrite,
  validateNoLegacyPaths,
  resolveDataPath,
  getUploadPath,
  getOutputPath,
  getTmpPath,
};
