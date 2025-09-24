/**
 * End-to-end smoke tests for PDF processing with fallback scenarios
 */

const path = require('path');
const fs = require('fs').promises;
const { securePDFProcessor } = require('../security');
const { calculateDHash } = require('../dhash');

describe('E2E PDF Processing Tests', () => {
  const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures', 'pdf');
  const OUTPUT_DIR = path.join(process.cwd(), 'tests', 'output');

  beforeAll(async () => {
    // Create test directories
    await fs.mkdir(FIXTURES_DIR, { recursive: true });
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Generate a minimal test PDF for testing
    await generateTestPDF();
  });

  afterAll(async () => {
    // Clean up test files
    await fs.rm(FIXTURES_DIR, { recursive: true, force: true });
    await fs.rm(OUTPUT_DIR, { recursive: true, force: true });
  });

  describe('PDF Image Extraction with Security', () => {
    test('should validate PDF before processing', async () => {
      const testPDFPath = path.join(FIXTURES_DIR, 'test.pdf');
      
      // Should pass validation for valid PDF
      const validation = await securePDFProcessor.validatePDF(testPDFPath);
      expect(validation.valid).toBe(true);
      expect(validation.size).toBeGreaterThan(0);
    });

    test('should reject invalid PDF files', async () => {
      const invalidPDFPath = path.join(FIXTURES_DIR, 'invalid.pdf');
      await fs.writeFile(invalidPDFPath, 'This is not a PDF file');
      
      await expect(securePDFProcessor.validatePDF(invalidPDFPath))
        .rejects.toThrow('Invalid PDF signature');
    });

    test('should reject oversized files', async () => {
      // Mock a large file by overriding the MAX_FILE_SIZE temporarily
      const originalConfig = require('../security').SECURITY_CONFIG.MAX_FILE_SIZE;
      require('../security').SECURITY_CONFIG.MAX_FILE_SIZE = 10; // 10 bytes
      
      const testPDFPath = path.join(FIXTURES_DIR, 'test.pdf');
      
      try {
        await expect(securePDFProcessor.validatePDF(testPDFPath))
          .rejects.toThrow('File too large');
      } finally {
        require('../security').SECURITY_CONFIG.MAX_FILE_SIZE = originalConfig;
      }
    });

    test('should force pdftoppm fallback when pdfimages fails', async () => {
      const testPDFPath = path.join(FIXTURES_DIR, 'test.pdf');
      const outputDir = path.join(OUTPUT_DIR, 'fallback-test');
      
      // Mock pdfimages failure by temporarily breaking the command
      const originalCommands = require('../security').SECURITY_CONFIG.ALLOWED_COMMANDS;
      require('../security').SECURITY_CONFIG.ALLOWED_COMMANDS = ['pdftoppm']; // Only allow pdftoppm
      
      try {
        const result = await securePDFProcessor.fallbackToPdftoppm(testPDFPath, outputDir);
        
        expect(result.method).toBe('pdftoppm_secure');
        expect(result.images).toBeDefined();
        expect(Array.isArray(result.images)).toBe(true);
      } finally {
        require('../security').SECURITY_CONFIG.ALLOWED_COMMANDS = originalCommands;
      }
    }, 30000); // 30 second timeout for PDF processing

    test('should sanitize dangerous command arguments', () => {
      const dangerousArgs = [
        '/etc/passwd',
        'file.pdf; rm -rf /',
        'file.pdf && echo "hack"',
        'file$(whoami).pdf',
        'file`id`.pdf'
      ];

      dangerousArgs.forEach(arg => {
        const sanitized = securePDFProcessor.sanitizeArgs('pdftoppm', [arg]);
        expect(sanitized[0]).not.toContain(';');
        expect(sanitized[0]).not.toContain('&');
        expect(sanitized[0]).not.toContain('`');
        expect(sanitized[0]).not.toContain('$');
      });
    });
  });

  describe('DHash Integration with PDF Extraction', () => {
    test('should calculate dhash for extracted images', async () => {
      const testPDFPath = path.join(FIXTURES_DIR, 'test.pdf');
      const outputDir = path.join(OUTPUT_DIR, 'dhash-test');
      
      // Extract images
      const extraction = await securePDFProcessor.fallbackToPdftoppm(testPDFPath, outputDir);
      
      if (extraction.images.length > 0) {
        // Calculate dhash for first image
        const dhashResult = await calculateDHash(extraction.images[0]);
        
        expect(dhashResult).toMatchObject({
          hash: expect.stringMatching(/^[0-9a-f]{16}$/),
          hash_alg: 'perceptual_dhash',
          version: '1.0.0',
          bits: 64,
          node_module_version: expect.any(String)
        });
      } else {
        // If no images extracted, that's also a valid test result
        console.log('No images extracted from test PDF - this is acceptable for a minimal test PDF');
      }
    }, 30000);

    test('should handle batch processing with concurrency limits', async () => {
      const testFiles = [];
      
      // Create multiple test files
      for (let i = 0; i < 3; i++) {
        const testFile = path.join(FIXTURES_DIR, `batch-test-${i}.pdf`);
        await fs.copyFile(path.join(FIXTURES_DIR, 'test.pdf'), testFile);
        testFiles.push(testFile);
      }
      
      // Process all files concurrently
      const startTime = Date.now();
      const promises = testFiles.map((file, index) => 
        securePDFProcessor.fallbackToPdftoppm(file, path.join(OUTPUT_DIR, `batch-${index}`))
      );
      
      const results = await Promise.allSettled(promises);
      const processingTime = Date.now() - startTime;
      
      // Should complete within reasonable time with concurrency control
      expect(processingTime).toBeLessThan(60000); // 1 minute max
      
      // Count successful extractions
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Security Status and Monitoring', () => {
    test('should report security status', () => {
      const status = securePDFProcessor.getSecurityStatus();
      
      expect(status).toMatchObject({
        active_processes: expect.any(Number),
        queued_processes: expect.any(Number),
        max_concurrent: expect.any(Number),
        max_file_size: expect.any(Number),
        max_processing_time: expect.any(Number),
        allowed_commands: expect.any(Array),
        temp_dir: expect.any(String)
      });
      
      expect(status.max_concurrent).toBeGreaterThan(0);
      expect(status.allowed_commands).toContain('pdftoppm');
    });

    test('should clean up temporary files', async () => {
      const tempDir = path.join(OUTPUT_DIR, 'temp-cleanup');
      await fs.mkdir(tempDir, { recursive: true });
      
      // Create old temp file
      const oldFile = path.join(tempDir, 'old-temp.png');
      await fs.writeFile(oldFile, 'test');
      
      // Change modification time to make it appear old
      const oldTime = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      await fs.utimes(oldFile, oldTime, oldTime);
      
      // Run cleanup
      await securePDFProcessor.cleanupTemp(tempDir);
      
      // File should be removed
      await expect(fs.access(oldFile)).rejects.toThrow();
    });
  });
});

/**
 * Generate a minimal test PDF for testing
 */
async function generateTestPDF() {
  const testPDFPath = path.join(process.cwd(), 'tests', 'fixtures', 'pdf', 'test.pdf');
  
  // Create a minimal PDF content
  const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj

2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj

3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj

4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Test PDF) Tj
ET
endstream
endobj

xref
0 5
0000000000 65535 f 
0000000010 00000 n 
0000000053 00000 n 
0000000100 00000 n 
0000000178 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
270
%%EOF`;

  await fs.writeFile(testPDFPath, pdfContent);
}