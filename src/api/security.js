/**
 * Security hardening for PDF processing
 * Implements sandboxed execution and input validation
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { globalMetrics } = require('./metrics');

// Security configuration
const SECURITY_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_PROCESSING_TIME: 2 * 60 * 1000, // 2 minutes
  MAX_CONCURRENT: 5, // Maximum concurrent PDF processes
  ALLOWED_COMMANDS: ['pdfimages', 'pdftoppm'],
  TEMP_DIR: process.env.SECURE_TEMP_DIR || '/tmp',
  SANDBOX_USER: process.env.SANDBOX_USER || null // Optional restricted user
};

// PDF file signature validation
const PDF_SIGNATURES = [
  Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
];

class SecurePDFProcessor {
  constructor() {
    this.activeProcesses = new Set();
    this.processQueue = [];
  }

  /**
   * Validate PDF file before processing
   */
  async validatePDF(filePath) {
    try {
      // Check file size
      const stats = await fs.stat(filePath);
      if (stats.size > SECURITY_CONFIG.MAX_FILE_SIZE) {
        throw new Error(`File too large: ${stats.size} bytes (max ${SECURITY_CONFIG.MAX_FILE_SIZE})`);
      }

      // Validate PDF signature
      const fileHandle = await fs.open(filePath, 'r');
      const buffer = Buffer.alloc(8);
      await fileHandle.read(buffer, 0, 8, 0);
      await fileHandle.close();

      const hasValidSignature = PDF_SIGNATURES.some(signature => 
        buffer.subarray(0, signature.length).equals(signature)
      );

      if (!hasValidSignature) {
        throw new Error('Invalid PDF signature');
      }

      // Additional basic structural checks
      const content = await fs.readFile(filePath);
      const contentStr = content.toString('ascii', 0, Math.min(1024, content.length));
      
      if (!contentStr.includes('%PDF-') || !contentStr.includes('%%EOF')) {
        throw new Error('Malformed PDF structure');
      }

      return {
        valid: true,
        size: stats.size,
        signature: buffer.subarray(0, 4).toString('hex')
      };
    } catch (error) {
      globalMetrics.recordExtractionFailure(error, { stage: 'pdf_validation', filePath });
      throw error;
    }
  }

  /**
   * Sanitize and validate command arguments
   */
  sanitizeArgs(command, args) {
    // Whitelist allowed commands
    if (!SECURITY_CONFIG.ALLOWED_COMMANDS.includes(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    // Sanitize arguments
    const sanitizedArgs = args.map(arg => {
      // Remove shell metacharacters
      const sanitized = arg.replace(/[;&|`$(){}[\]<>*?~!]/g, '');
      
      // Validate file paths are within allowed directories
      if (arg.includes('/') || arg.includes('\\')) {
        const resolvedPath = path.resolve(sanitized);
        if (!resolvedPath.startsWith(SECURITY_CONFIG.TEMP_DIR) && 
            !resolvedPath.startsWith(process.cwd())) {
          throw new Error(`Path not allowed: ${arg}`);
        }
      }
      
      return sanitized;
    });

    return sanitizedArgs;
  }

  /**
   * Execute PDF tool in a sandboxed environment
   */
  async executeSandboxed(command, args, options = {}) {
    await this.waitForSlot();
    
    const processId = crypto.randomUUID();
    const startTime = Date.now();
    
    try {
      // Sanitize command and arguments
      const sanitizedArgs = this.sanitizeArgs(command, args);
      
      // Prepare execution options
      const execOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout || SECURITY_CONFIG.MAX_PROCESSING_TIME,
        ...options
      };

      // Add sandbox user if configured
      if (SECURITY_CONFIG.SANDBOX_USER && process.platform !== 'win32') {
        execOptions.uid = await this.getUserId(SECURITY_CONFIG.SANDBOX_USER);
      }

      // Track active process
      this.activeProcesses.add(processId);
      
      // Execute command
      const result = await this.spawnWithTimeout(command, sanitizedArgs, execOptions);
      
      const processingTime = Date.now() - startTime;
      globalMetrics.recordExtractionSuccess({ 
        command, 
        args: sanitizedArgs, 
        processingTime,
        processId 
      });
      
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      globalMetrics.recordExtractionFailure(error, { 
        command, 
        args, 
        processingTime,
        processId 
      });
      throw error;
    } finally {
      this.activeProcesses.delete(processId);
      this.processNext();
    }
  }

  /**
   * Wait for available process slot
   */
  async waitForSlot() {
    if (this.activeProcesses.size >= SECURITY_CONFIG.MAX_CONCURRENT) {
      return new Promise((resolve) => {
        this.processQueue.push(resolve);
      });
    }
  }

  /**
   * Process next queued request
   */
  processNext() {
    if (this.processQueue.length > 0 && 
        this.activeProcesses.size < SECURITY_CONFIG.MAX_CONCURRENT) {
      const nextResolve = this.processQueue.shift();
      nextResolve();
    }
  }

  /**
   * Spawn process with timeout enforcement
   */
  spawnWithTimeout(command, args, options) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, options);
      let stdout = '';
      let stderr = '';
      let isResolved = false;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          child.kill('SIGKILL');
          reject(new Error(`Process timeout after ${options.timeout}ms`));
        }
      }, options.timeout);

      child.stdout?.on('data', (data) => {
        stdout += data;
      });

      child.stderr?.on('data', (data) => {
        stderr += data;
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        
        if (!isResolved) {
          isResolved = true;
          
          if (signal) {
            reject(new Error(`Process killed with signal ${signal}`));
          } else if (code !== 0) {
            reject(new Error(`Process exited with code ${code}: ${stderr}`));
          } else {
            resolve({ stdout, stderr, code });
          }
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      });
    });
  }

  /**
   * Get user ID for sandbox user (Unix only)
   */
  async getUserId(username) {
    if (process.platform === 'win32') return null;
    
    try {
      const { stdout } = await this.spawnWithTimeout('id', ['-u', username], { timeout: 5000 });
      return parseInt(stdout.trim(), 10);
    } catch (error) {
      console.warn(`Could not get UID for user ${username}:`, error.message);
      return null;
    }
  }

  /**
   * Secure image extraction using pdfimages
   */
  async extractImagesSecure(pdfPath, outputDir) {
    // Validate PDF first
    await this.validatePDF(pdfPath);
    
    // Ensure output directory is safe
    const safeOutputDir = path.resolve(outputDir);
    await fs.mkdir(safeOutputDir, { recursive: true });
    
    // Prepare extraction arguments
    const baseOutputName = path.join(safeOutputDir, 'extracted');
    const args = ['-all', pdfPath, baseOutputName];
    
    try {
      const result = await this.executeSandboxed('pdfimages', args);
      globalMetrics.recordExtractionMethod('pdfimages_secure');
      
      // List extracted files
      const files = await fs.readdir(safeOutputDir);
      const imageFiles = files
        .filter(file => file.startsWith('extracted'))
        .map(file => path.join(safeOutputDir, file));
      
      return {
        method: 'pdfimages_secure',
        images: imageFiles,
        stdout: result.stdout,
        stderr: result.stderr
      };
      
    } catch (error) {
      // Fallback to pdftoppm if pdfimages fails
      return await this.fallbackToPdftoppm(pdfPath, outputDir);
    }
  }

  /**
   * Fallback to pdftoppm for image extraction
   */
  async fallbackToPdftoppm(pdfPath, outputDir) {
    await this.validatePDF(pdfPath);
    
    const safeOutputDir = path.resolve(outputDir);
    await fs.mkdir(safeOutputDir, { recursive: true });
    
    const baseOutputName = path.join(safeOutputDir, 'page');
    const args = ['-png', '-r', '150', pdfPath, baseOutputName];
    
    try {
      const result = await this.executeSandboxed('pdftoppm', args);
      globalMetrics.recordExtractionMethod('pdftoppm_secure');
      
      // List generated pages
      const files = await fs.readdir(safeOutputDir);
      const imageFiles = files
        .filter(file => file.startsWith('page') && file.endsWith('.png'))
        .map(file => path.join(safeOutputDir, file))
        .sort(); // Ensure proper page order
      
      return {
        method: 'pdftoppm_secure',
        images: imageFiles,
        stdout: result.stdout,
        stderr: result.stderr
      };
      
    } catch (error) {
      globalMetrics.recordExtractionMethod('extraction_failed');
      throw new Error(`Both pdfimages and pdftoppm failed: ${error.message}`);
    }
  }

  /**
   * Get current security status
   */
  getSecurityStatus() {
    return {
      active_processes: this.activeProcesses.size,
      queued_processes: this.processQueue.length,
      max_concurrent: SECURITY_CONFIG.MAX_CONCURRENT,
      max_file_size: SECURITY_CONFIG.MAX_FILE_SIZE,
      max_processing_time: SECURITY_CONFIG.MAX_PROCESSING_TIME,
      allowed_commands: SECURITY_CONFIG.ALLOWED_COMMANDS,
      sandbox_user: SECURITY_CONFIG.SANDBOX_USER,
      temp_dir: SECURITY_CONFIG.TEMP_DIR
    };
  }

  /**
   * Clean up temporary files
   */
  async cleanupTemp(directory) {
    try {
      const files = await fs.readdir(directory);
      const cleanupPromises = files.map(async (file) => {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        
        // Remove files older than 1 hour
        if (Date.now() - stats.mtime.getTime() > 60 * 60 * 1000) {
          await fs.unlink(filePath);
        }
      });
      
      await Promise.all(cleanupPromises);
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  }
}

// Export singleton instance
const securePDFProcessor = new SecurePDFProcessor();

module.exports = {
  SecurePDFProcessor,
  securePDFProcessor,
  SECURITY_CONFIG
};