import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runCompleteWorkflow, runBasicWorkflow } from '../utils/matchRunner.js';
import { createTestImageDirectory, createTestPDF, cleanupTestFiles, createTestComponents } from './testUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('End-to-End Integration Tests', () => {
  let testDir;
  let cleanup = [];

  beforeAll(async () => {
    testDir = path.join(__dirname, 'temp', 'e2e-tests');
    cleanup.push(testDir);
    await fs.promises.mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await cleanupTestFiles(cleanup);
  });

  describe('Complete Workflow', () => {
    test('should run complete workflow with synthetic PDF', async () => {
      const workflowDir = path.join(testDir, 'complete-workflow');
      const pdfPath = path.join(workflowDir, 'test-game.pdf');
      const outputDir = path.join(workflowDir, 'output');
      
      cleanup.push(workflowDir);
      
      // Create synthetic test PDF
      const testPDF = await createTestPDF(pdfPath, 3);
      expect(fs.existsSync(pdfPath)).toBe(true);
      
      // Create test components for matching
      const components = createTestComponents(testPDF.expectedImages);
      
      // Run complete workflow
      const config = {
        pdfPath,
        outputDir,
        components,
        threshold: 0.85,
        concurrency: 2,
        reportsDir: path.join(outputDir, 'reports')
      };
      
      const workflow = await runCompleteWorkflow(config);
      
      // Verify workflow success
      expect(workflow.success).toBe(true);
      expect(workflow.steps.length).toBeGreaterThan(0);
      expect(workflow.duration).toBeGreaterThan(0);
      
      // Verify extraction step
      const extractionStep = workflow.steps.find(step => step.name === 'extraction');
      expect(extractionStep).toBeDefined();
      expect(extractionStep.success).toBe(true);
      expect(extractionStep.results.imageCount).toBe(3);
      
      // Verify processing step
      const processingStep = workflow.steps.find(step => step.name === 'processing');
      expect(processingStep).toBeDefined();
      expect(processingStep.success).toBe(true);
      expect(processingStep.results.successful).toBeGreaterThan(0);
      
      // Verify hashing step
      const hashingStep = workflow.steps.find(step => step.name === 'hashing');
      expect(hashingStep).toBeDefined();
      expect(hashingStep.success).toBe(true);
      expect(hashingStep.results.successCount).toBeGreaterThan(0);
      
      // Verify matching step
      const matchingStep = workflow.steps.find(step => step.name === 'matching');
      expect(matchingStep).toBeDefined();
      expect(matchingStep.success).toBe(true);
      
      // Verify reporting step
      const reportingStep = workflow.steps.find(step => step.name === 'reporting');
      expect(reportingStep).toBeDefined();
      expect(reportingStep.success).toBe(true);
      expect(reportingStep.results.reportsGenerated).toBe(3);
      
      // Verify output structure
      expect(fs.existsSync(path.join(outputDir, 'masters'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'web'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'thumbnails'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'reports'))).toBe(true);
      
      // Verify database file exists
      expect(fs.existsSync(path.join(outputDir, '../phash-database.json'))).toBe(true);
      
      // Verify report files
      const reportsDir = path.join(outputDir, 'reports');
      const reportFiles = fs.readdirSync(reportsDir);
      expect(reportFiles.some(file => file.includes('workflow-report'))).toBe(true);
      expect(reportFiles.some(file => file.includes('summary-report'))).toBe(true);
      expect(reportFiles.some(file => file.includes('report') && file.endsWith('.txt'))).toBe(true);
      
    }, 30000); // Extended timeout for full workflow

    test('should handle workflow with missing PDF gracefully', async () => {
      const workflowDir = path.join(testDir, 'missing-pdf-workflow');
      const nonExistentPDF = path.join(workflowDir, 'does-not-exist.pdf');
      const outputDir = path.join(workflowDir, 'output');
      
      cleanup.push(workflowDir);
      
      const config = {
        pdfPath: nonExistentPDF,
        outputDir,
        threshold: 0.85
      };
      
      // Should throw an error
      await expect(runCompleteWorkflow(config)).rejects.toThrow();
    });

    test('should run basic workflow successfully', async () => {
      const workflowDir = path.join(testDir, 'basic-workflow');
      const pdfPath = path.join(workflowDir, 'basic-test.pdf');
      const outputDir = path.join(workflowDir, 'output');
      
      cleanup.push(workflowDir);
      
      // Create synthetic test PDF
      await createTestPDF(pdfPath, 2);
      
      const workflow = await runBasicWorkflow(pdfPath, outputDir);
      
      expect(workflow.success).toBe(true);
      expect(workflow.steps.length).toBeGreaterThan(3); // extraction, processing, hashing, reporting
      
      // Verify basic output structure
      expect(fs.existsSync(outputDir)).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'reports'))).toBe(true);
      
    }, 20000);
  });

  describe('Component Matching Integration', () => {
    test('should match components to extracted images', async () => {
      const matchingDir = path.join(testDir, 'component-matching');
      
      cleanup.push(matchingDir);
      
      // Create test image directory
      const imageStructure = await createTestImageDirectory(path.join(matchingDir, 'images'));
      
      // Create components with reference images
      const components = [
        {
          name: 'Test Component 1',
          referenceImage: imageStructure.allImages[0]
        },
        {
          name: 'Test Component 2', 
          referenceImage: imageStructure.allImages[1]
        }
      ];
      
      // Run matching workflow
      const config = {
        imageDirectory: path.join(matchingDir, 'images'),
        outputDir: path.join(matchingDir, 'output'),
        components,
        processImages: true,
        threshold: 0.8
      };
      
      const workflow = await runCompleteWorkflow(config);
      
      expect(workflow.success).toBe(true);
      
      const matchingStep = workflow.steps.find(step => step.name === 'matching');
      expect(matchingStep.success).toBe(true);
      expect(matchingStep.results.totalComponents).toBe(2);
      
    }, 25000);
  });

  describe('Batch Processing Integration', () => {
    test('should process multiple images and build hash database', async () => {
      const batchDir = path.join(testDir, 'batch-processing');
      
      cleanup.push(batchDir);
      
      // Create multiple test images
      const imageStructure = await createTestImageDirectory(path.join(batchDir, 'source'));
      
      const config = {
        imageDirectory: path.join(batchDir, 'source'),
        outputDir: path.join(batchDir, 'output'),
        concurrency: 2,
        databasePath: path.join(batchDir, 'batch-database.json')
      };
      
      const workflow = await runCompleteWorkflow(config);
      
      expect(workflow.success).toBe(true);
      
      // Verify processing results
      const processingStep = workflow.steps.find(step => step.name === 'processing');
      expect(processingStep.success).toBe(true);
      expect(processingStep.results.inputImages).toBe(imageStructure.allImages.length);
      
      // Verify hash database
      const hashingStep = workflow.steps.find(step => step.name === 'hashing');
      expect(hashingStep.success).toBe(true);
      expect(fs.existsSync(path.join(batchDir, 'batch-database.json'))).toBe(true);
      
      // Load and verify database content
      const databaseContent = JSON.parse(
        fs.readFileSync(path.join(batchDir, 'batch-database.json'), 'utf8')
      );
      
      expect(databaseContent.totalImages).toBeGreaterThan(0);
      expect(databaseContent.successCount).toBeGreaterThan(0);
      expect(databaseContent.images.length).toBeGreaterThan(0);
      
    }, 30000);
  });

  describe('Error Recovery', () => {
    test('should continue workflow despite individual step failures', async () => {
      const errorTestDir = path.join(testDir, 'error-recovery');
      
      cleanup.push(errorTestDir);
      
      // Create a scenario with some invalid data
      const invalidImagePath = path.join(errorTestDir, 'invalid.jpg');
      fs.writeFileSync(invalidImagePath, 'This is not an image');
      
      const config = {
        imageDirectory: errorTestDir,
        outputDir: path.join(errorTestDir, 'output'),
        threshold: 0.9
      };
      
      // Workflow should handle errors gracefully
      const workflow = await runCompleteWorkflow(config);
      
      // Some steps may fail, but the workflow should attempt all steps
      expect(workflow.steps.length).toBeGreaterThan(0);
      
      // Reports should still be generated
      const reportingStep = workflow.steps.find(step => step.name === 'reporting');
      expect(reportingStep).toBeDefined();
      
    }, 15000);
  });

  describe('Performance Validation', () => {
    test('should complete workflow within reasonable time limits', async () => {
      const perfDir = path.join(testDir, 'performance');
      const pdfPath = path.join(perfDir, 'perf-test.pdf');
      
      cleanup.push(perfDir);
      
      // Create test PDF with moderate number of images
      await createTestPDF(pdfPath, 5);
      
      const startTime = Date.now();
      
      const workflow = await runBasicWorkflow(pdfPath, path.join(perfDir, 'output'));
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      expect(workflow.success).toBe(true);
      
      // Should complete within 45 seconds (generous for CI environments)
      expect(duration).toBeLessThan(45000);
      
      console.log(`Performance test completed in ${duration}ms`);
      
    }, 50000); // Extended timeout for performance test
  });

  describe('Output Validation', () => {
    test('should produce valid output files with correct formats', async () => {
      const outputTestDir = path.join(testDir, 'output-validation');
      const pdfPath = path.join(outputTestDir, 'output-test.pdf');
      
      cleanup.push(outputTestDir);
      
      await createTestPDF(pdfPath, 2);
      
      const workflow = await runBasicWorkflow(pdfPath, path.join(outputTestDir, 'output'));
      
      expect(workflow.success).toBe(true);
      
      const outputDir = path.join(outputTestDir, 'output');
      
      // Check master files (PNG)
      const mastersDir = path.join(outputDir, 'masters');
      if (fs.existsSync(mastersDir)) {
        const masterFiles = fs.readdirSync(mastersDir);
        masterFiles.forEach(file => {
          expect(file.endsWith('.png')).toBe(true);
          expect(file.includes('_master')).toBe(true);
        });
      }
      
      // Check web derivatives (JPEG)
      const webDir = path.join(outputDir, 'web');
      if (fs.existsSync(webDir)) {
        const webFiles = fs.readdirSync(webDir);
        webFiles.forEach(file => {
          expect(file.endsWith('.jpg')).toBe(true);
          expect(file.includes('_web')).toBe(true);
        });
      }
      
      // Check thumbnails (JPEG, 300x300)
      const thumbsDir = path.join(outputDir, 'thumbnails');
      if (fs.existsSync(thumbsDir)) {
        const thumbFiles = fs.readdirSync(thumbsDir);
        
        for (const file of thumbFiles) {
          expect(file.endsWith('.jpg')).toBe(true);
          expect(file.includes('_thumb')).toBe(true);
          
          // Verify thumbnail dimensions
          const thumbPath = path.join(thumbsDir, file);
          const sharp = (await import('sharp')).default;
          const metadata = await sharp(thumbPath).metadata();
          expect(metadata.width).toBe(300);
          expect(metadata.height).toBe(300);
        }
      }
      
    }, 25000);
  });

  describe('Configuration Validation', () => {
    test('should respect custom thresholds and settings', async () => {
      const configDir = path.join(testDir, 'config-test');
      const imageStructure = await createTestImageDirectory(path.join(configDir, 'images'));
      
      cleanup.push(configDir);
      
      const config = {
        imageDirectory: path.join(configDir, 'images'),
        outputDir: path.join(configDir, 'output'),
        threshold: 0.95, // Very strict threshold
        concurrency: 1,  // Single-threaded processing
        skipExisting: false
      };
      
      const workflow = await runCompleteWorkflow(config);
      
      expect(workflow.success).toBe(true);
      
      // Verify configuration was applied
      expect(workflow.results.matching?.threshold).toBe(0.95);
      
    }, 20000);
  });
});