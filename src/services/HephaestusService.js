// src/services/HephaestusService.js
// Service wrapper for HEPHAESTUS PDF image extraction
// Supports both embedded (stub) and external workspace modes
// Sandboxed, feature-flagged, and path-validated

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getDataDirs, guardLegacyWrite } from '../config/storage.mjs';
import { validateExtractorPath, sanitizeExtractorManifest } from '../utils/validation.js';
import { manifestToImageAssets } from '../utils/imageAsset.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * HEPHAESTUS Service
 * Provides sandboxed PDF image extraction with safety guarantees
 * Supports external workspace mode for production HEPHAESTUS integration
 */
export class HephaestusService {
  constructor(options = {}) {
    this.enabled = process.env.MOBIUS_ENABLE_HEPHAESTUS === 'true';
    this.mode = process.env.HEPHAESTUS_MODE || 'external'; // Default to external
    this.workspace = process.env.HEPHAESTUS_WORKSPACE || null;
    this.cli = process.env.HEPHAESTUS_CLI || null;
    this.pythonBin = process.env.HEPHAESTUS_PYTHON || 'python3';
    this.minConfidence = parseFloat(process.env.HEPHAESTUS_MIN_CONFIDENCE || '0.7');
    this.maxConcurrent = parseInt(process.env.HEPHAESTUS_MAX_CONCURRENT || '2', 10);
    this.timeout = parseInt(process.env.HEPHAESTUS_TIMEOUT_MS || '300000', 10); // 5 minutes
    
    this.activeExtractions = 0;
    this.options = options;
  }

  /**
   * Check if HEPHAESTUS is available
   * @returns {Promise<object>} { available: boolean, reason: string, mode: string }
   */
  async checkAvailability() {
    if (!this.enabled) {
      return {
        available: false,
        reason: 'HEPHAESTUS is disabled (set MOBIUS_ENABLE_HEPHAESTUS=true)',
        mode: null
      };
    }

    // External workspace mode (production)
    if (this.mode === 'external') {
      // Check if CLI is explicitly set
      if (this.cli) {
        try {
          await fs.access(this.cli);
          return {
            available: true,
            reason: 'HEPHAESTUS CLI found (explicit path)',
            mode: 'external',
            cli: this.cli
          };
        } catch (error) {
          return {
            available: false,
            reason: `HEPHAESTUS CLI not found at ${this.cli}`,
            mode: 'external'
          };
        }
      }

      // Check if workspace is set
      if (!this.workspace) {
        return {
          available: false,
          reason: 'HEPHAESTUS_WORKSPACE not set (required for external mode)',
          mode: 'external'
        };
      }

      // Verify workspace exists
      try {
        await fs.access(this.workspace);
      } catch (error) {
        return {
          available: false,
          reason: `HEPHAESTUS workspace not found at ${this.workspace}`,
          mode: 'external'
        };
      }

      // Check for Python module or entry script
      const possibleEntries = [
        path.join(this.workspace, '__main__.py'),
        path.join(this.workspace, 'cli.py'),
        path.join(this.workspace, 'extract.py'),
        path.join(this.workspace, 'hephaestus.py')
      ];

      for (const entry of possibleEntries) {
        try {
          await fs.access(entry);
          return {
            available: true,
            reason: 'HEPHAESTUS workspace found with entry point',
            mode: 'external',
            workspace: this.workspace,
            entry
          };
        } catch (error) {
          // Continue checking
        }
      }

      return {
        available: false,
        reason: `HEPHAESTUS workspace found but no entry point (checked: ${possibleEntries.map(p => path.basename(p)).join(', ')})`,
        mode: 'external'
      };
    }

    // Embedded mode (stub for testing)
    const hephaestusDir = path.join(dirname(dirname(__dirname)), 'tools', 'hephaestus');
    
    try {
      await fs.access(hephaestusDir);
    } catch (error) {
      return {
        available: false,
        reason: 'HEPHAESTUS tool directory not found at tools/hephaestus',
        mode: 'embedded'
      };
    }

    // Check for entry point
    const entryPoints = [
      path.join(hephaestusDir, 'extract.js'),
      path.join(hephaestusDir, 'extract.py'),
      path.join(hephaestusDir, 'index.js')
    ];

    let entryPointFound = false;
    for (const entryPoint of entryPoints) {
      try {
        await fs.access(entryPoint);
        entryPointFound = true;
        break;
      } catch (error) {
        // Continue checking
      }
    }

    if (!entryPointFound) {
      return {
        available: false,
        reason: 'HEPHAESTUS entry point not found (extract.js, extract.py, or index.js)',
        mode: 'embedded'
      };
    }

    return {
      available: true,
      reason: 'HEPHAESTUS is available (embedded mode)',
      mode: 'embedded'
    };
  }

  /**
   * Extract images from PDF
   * @param {object} params - Extraction parameters
   * @param {string} params.pdfPath - Absolute path to PDF
   * @param {string} params.projectId - Project ID for scoping
   * @param {object} params.options - Extraction options
   * @returns {Promise<object>} Extraction result
   */
  async extractImages({ pdfPath, projectId, options = {} }) {
    // Check availability
    const availability = await this.checkAvailability();
    if (!availability.available) {
      throw new Error(`HEPHAESTUS not available: ${availability.reason}`);
    }

    // Check concurrency limit
    if (this.activeExtractions >= this.maxConcurrent) {
      throw new Error(`Maximum concurrent extractions reached (${this.maxConcurrent})`);
    }

    // Validate PDF path
    if (!pdfPath || typeof pdfPath !== 'string') {
      throw new Error('PDF path is required');
    }

    // Check PDF exists
    try {
      await fs.access(pdfPath);
    } catch (error) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    // Check PDF size (max 50MB)
    const stats = await fs.stat(pdfPath);
    if (stats.size > 50 * 1024 * 1024) {
      throw new Error('PDF file too large (max 50MB)');
    }

    // Create canonical output directory
    const dataDirs = getDataDirs();
    const projectDir = path.join(dataDirs.uploads, `project_${projectId}`, 'extracted_images');
    const timestamp = Date.now();
    const outputDir = path.join(projectDir, `extraction_${timestamp}`);

    // Guard against legacy paths
    guardLegacyWrite(outputDir);

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Manifest path
    const manifestPath = path.join(outputDir, 'manifest.json');

    // Increment active extractions
    this.activeExtractions++;

    try {
      // Run extraction
      const result = await this._runExtraction({
        pdfPath,
        outputDir,
        manifestPath,
        options: {
          minConfidence: options.minConfidence || this.minConfidence,
          cropPadding: options.cropPadding || 10,
          ...options
        }
      });

      // Read and validate manifest
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      // Sanitize manifest
      const sanitized = sanitizeExtractorManifest(manifest, projectId);
      
      if (!sanitized.valid) {
        throw new Error(`Invalid manifest: ${sanitized.errors.join(', ')}`);
      }

      // Convert to ImageAssets
      const imageAssets = manifestToImageAssets(sanitized.sanitized, outputDir);

      return {
        success: true,
        outputDir,
        manifestPath,
        manifest: sanitized.sanitized,
        imageAssets,
        stats: {
          imagesExtracted: imageAssets.length,
          averageConfidence: sanitized.sanitized.stats?.averageConfidence || null,
          extractionTime: result.extractionTime
        }
      };

    } finally {
      // Decrement active extractions
      this.activeExtractions--;
    }
  }

  /**
   * Run extraction process (internal)
   * @param {object} params - Extraction parameters
   * @returns {Promise<object>} Extraction result
   * @private
   */
  async _runExtraction({ pdfPath, outputDir, manifestPath, options }) {
    const startTime = Date.now();

    let command, args, cwd;

    if (this.mode === 'external') {
      // External workspace mode - invoke HEPHAESTUS CLI
      if (this.cli) {
        // Explicit CLI path
        command = this.cli;
        args = [
          'extract',
          '--mode', 'mobius',
          pdfPath,
          '--out', outputDir,
          '--min-confidence', String(options.minConfidence)
        ];
        cwd = path.dirname(this.cli);
      } else if (this.workspace) {
        // Python module mode
        command = this.pythonBin;
        args = [
          '-m', 'hephaestus',
          'extract',
          '--mode', 'mobius',
          pdfPath,
          '--out', outputDir,
          '--min-confidence', String(options.minConfidence)
        ];
        cwd = this.workspace;
      } else {
        throw new Error('External mode requires HEPHAESTUS_CLI or HEPHAESTUS_WORKSPACE');
      }
    } else {
      // Embedded mode - use stub
      const hephaestusDir = path.join(dirname(dirname(__dirname)), 'tools', 'hephaestus');
      
      // Try Node.js entry point first
      const nodeEntry = path.join(hephaestusDir, 'extract.js');
      try {
        await fs.access(nodeEntry);
        command = 'node';
        args = [
          nodeEntry,
          '--input', pdfPath,
          '--output', outputDir,
          '--manifest', manifestPath,
          '--min-confidence', String(options.minConfidence),
          '--crop-padding', String(options.cropPadding)
        ];
        cwd = hephaestusDir;
      } catch (error) {
        // Try Python entry point
        const pythonEntry = path.join(hephaestusDir, 'extract.py');
        try {
          await fs.access(pythonEntry);
          command = this.pythonBin;
          args = [
            pythonEntry,
            '--input', pdfPath,
            '--output', outputDir,
            '--manifest', manifestPath,
            '--min-confidence', String(options.minConfidence),
            '--crop-padding', String(options.cropPadding)
          ];
          cwd = hephaestusDir;
        } catch (error) {
          throw new Error('No HEPHAESTUS entry point found (extract.js or extract.py)');
        }
      }
    }

    console.log(`🎨 Running HEPHAESTUS extraction:`);
    console.log(`   Command: ${command}`);
    console.log(`   Args: ${args.join(' ')}`);
    console.log(`   CWD: ${cwd}`);

    // Run extraction process
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        cwd,
        env: {
          ...process.env,
          MOBIUS_PROJECT_DIR: outputDir,
          MOBIUS_MODE: 'true'
        },
        shell: process.platform === 'win32' // Use shell on Windows for proper quoting
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        console.log(`[HEPHAESTUS] ${text.trim()}`);
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        console.error(`[HEPHAESTUS] ${text.trim()}`);
      });

      // Timeout handling
      const timeoutId = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`Extraction timeout after ${this.timeout}ms`));
      }, this.timeout);

      proc.on('close', async (code) => {
        clearTimeout(timeoutId);
        
        const extractionTime = Date.now() - startTime;

        if (code !== 0) {
          reject(new Error(`Extraction failed with code ${code}: ${stderr || stdout}`));
          return;
        }

        // External mode: validate MOBIUS_READY marker
        if (this.mode === 'external') {
          const readyMarker = path.join(outputDir, 'MOBIUS_READY', 'manifest.json');
          try {
            await fs.access(readyMarker);
            console.log(`✅ MOBIUS_READY marker found: ${readyMarker}`);
            
            // Copy manifest to expected location for compatibility
            const targetManifest = path.join(outputDir, 'manifest.json');
            await fs.copyFile(readyMarker, targetManifest);
          } catch (error) {
            reject(new Error(`MOBIUS_READY marker not found at ${readyMarker}. HEPHAESTUS must create MOBIUS_READY/manifest.json`));
            return;
          }
        }

        resolve({
          success: true,
          extractionTime,
          stdout,
          stderr
        });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`Failed to spawn extraction process: ${error.message}`));
      });
    });
  }

  /**
   * Get extraction status
   * @param {string} projectId - Project ID
   * @param {string} extractionId - Extraction ID (timestamp)
   * @returns {Promise<object>} Status object
   */
  async getExtractionStatus(projectId, extractionId) {
    const dataDirs = getDataDirs();
    const extractionDir = path.join(
      dataDirs.uploads,
      `project_${projectId}`,
      'extracted_images',
      `extraction_${extractionId}`
    );

    try {
      await fs.access(extractionDir);
    } catch (error) {
      return {
        exists: false,
        status: 'not_found'
      };
    }

    const manifestPath = path.join(extractionDir, 'manifest.json');

    try {
      await fs.access(manifestPath);
      const manifestContent = await fs.readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(manifestContent);

      return {
        exists: true,
        status: 'complete',
        manifest,
        extractionDir
      };
    } catch (error) {
      return {
        exists: true,
        status: 'in_progress',
        extractionDir
      };
    }
  }

  /**
   * List all extractions for a project
   * @param {string} projectId - Project ID
   * @returns {Promise<Array>} Array of extraction metadata
   */
  async listExtractions(projectId) {
    const dataDirs = getDataDirs();
    const extractionsDir = path.join(
      dataDirs.uploads,
      `project_${projectId}`,
      'extracted_images'
    );

    try {
      const entries = await fs.readdir(extractionsDir, { withFileTypes: true });
      const extractions = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('extraction_')) {
          const extractionId = entry.name.replace('extraction_', '');
          const status = await this.getExtractionStatus(projectId, extractionId);
          
          extractions.push({
            extractionId,
            timestamp: parseInt(extractionId, 10),
            ...status
          });
        }
      }

      // Sort by timestamp descending
      extractions.sort((a, b) => b.timestamp - a.timestamp);

      return extractions;
    } catch (error) {
      // Directory doesn't exist yet
      return [];
    }
  }
}

export default HephaestusService;
