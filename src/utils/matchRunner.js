import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { extractImagesFromPDF } from './imageExtraction.js';
import { batchProcessImages } from './imageProcessing.js';
import { buildHashDatabase, autoAssignImages, findSimilarImages } from './perceptualHashing.js';

/**
 * Match Runner - Automated workflow for extracting, processing, and matching images
 * Handles the complete pipeline from PDF extraction to component assignment
 */

/**
 * Configuration for the match runner
 */
const MATCH_CONFIG = {
  extraction: {
    strategy: 'auto',
    minImageSize: 1024,
    outputDir: 'extracted'
  },
  processing: {
    outputDir: 'processed',
    concurrency: 3,
    skipExisting: true
  },
  matching: {
    threshold: 0.90,
    strictThreshold: 0.95,
    looseThreshold: 0.85,
    buildDatabase: true,
    databasePath: 'phash-database.json'
  },
  workflow: {
    cleanupTemp: true,
    saveReports: true,
    reportsDir: 'reports'
  }
};

/**
 * Complete workflow for processing game component PDFs
 */
export async function runCompleteWorkflow(config) {
  const workflow = {
    startTime: new Date(),
    steps: [],
    results: {},
    errors: []
  };
  
  try {
    console.log('=== Starting Complete Workflow ===');
    
    // Step 1: Extract images from PDFs
    if (config.pdfPath || config.pdfDirectory) {
      console.log('\n1. Extracting images from PDFs...');
      const extractionStep = await extractImagesStep(config, workflow);
      workflow.steps.push(extractionStep);
      workflow.results.extraction = extractionStep.results;
    }
    
    // Step 2: Process images (create derivatives)
    if (config.processImages !== false) {
      console.log('\n2. Processing images...');
      const processingStep = await processImagesStep(config, workflow);
      workflow.steps.push(processingStep);
      workflow.results.processing = processingStep.results;
    }
    
    // Step 3: Build perceptual hash database
    console.log('\n3. Building perceptual hash database...');
    const hashingStep = await buildHashDatabaseStep(config, workflow);
    workflow.steps.push(hashingStep);
    workflow.results.hashing = hashingStep.results;
    
    // Step 4: Match components (if component definitions provided)
    if (config.components && config.components.length > 0) {
      console.log('\n4. Matching components...');
      const matchingStep = await matchComponentsStep(config, workflow);
      workflow.steps.push(matchingStep);
      workflow.results.matching = matchingStep.results;
    }
    
    // Step 5: Generate reports
    console.log('\n5. Generating reports...');
    const reportingStep = await generateReportsStep(config, workflow);
    workflow.steps.push(reportingStep);
    workflow.results.reporting = reportingStep.results;
    
    workflow.endTime = new Date();
    workflow.duration = workflow.endTime - workflow.startTime;
    workflow.success = true;
    
    console.log('\n=== Workflow Complete ===');
    console.log(`Duration: ${Math.round(workflow.duration / 1000)}s`);
    console.log(`Steps completed: ${workflow.steps.length}`);
    
    return workflow;
    
  } catch (error) {
    workflow.error = error.message;
    workflow.success = false;
    workflow.endTime = new Date();
    workflow.duration = workflow.endTime - workflow.startTime;
    
    console.error('\n=== Workflow Failed ===');
    console.error('Error:', error.message);
    
    throw error;
  }
}

/**
 * Step 1: Extract images from PDFs
 */
async function extractImagesStep(config, workflow) {
  const step = {
    name: 'extraction',
    startTime: new Date(),
    success: false,
    results: null,
    errors: []
  };
  
  try {
    const outputDir = config.outputDir || MATCH_CONFIG.extraction.outputDir;
    await fsPromises.mkdir(outputDir, { recursive: true });
    
    let extractionResults;
    
    if (config.pdfPath) {
      // Single PDF
      extractionResults = await extractImagesFromPDF(
        config.pdfPath,
        path.join(outputDir, 'images'),
        config.extractionStrategy || MATCH_CONFIG.extraction.strategy
      );
      
      step.results = {
        type: 'single',
        pdf: config.pdfPath,
        strategy: extractionResults.strategy,
        imageCount: extractionResults.images.length,
        images: extractionResults.images
      };
      
    } else if (config.pdfDirectory) {
      // Batch extraction
      const { batchExtractImages } = await import('./imageExtraction.js');
      extractionResults = await batchExtractImages(config.pdfDirectory, outputDir);
      
      step.results = {
        type: 'batch',
        directory: config.pdfDirectory,
        pdfCount: extractionResults.length,
        totalImages: extractionResults.reduce((sum, r) => sum + (r.images?.length || 0), 0),
        results: extractionResults
      };
    }
    
    step.success = true;
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    
    console.log(`Extraction complete: ${step.results.imageCount || step.results.totalImages} images`);
    
  } catch (error) {
    step.error = error.message;
    step.errors.push(error.message);
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    console.error('Extraction failed:', error.message);
  }
  
  return step;
}

/**
 * Step 2: Process images to create derivatives
 */
async function processImagesStep(config, workflow) {
  const step = {
    name: 'processing',
    startTime: new Date(),
    success: false,
    results: null,
    errors: []
  };
  
  try {
    const inputDir = config.imageDirectory || path.join(config.outputDir || MATCH_CONFIG.extraction.outputDir, 'images');
    const outputDir = config.processingOutputDir || MATCH_CONFIG.processing.outputDir;
    
    // Find all extracted images
    const imagePaths = [];
    
    async function findImages(dir) {
      if (!fs.existsSync(dir)) return;
      
      const entries = await fsPromises.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await findImages(fullPath);
        } else if (/\.(jpg|jpeg|png|tiff|bmp|webp)$/i.test(entry.name)) {
          imagePaths.push(fullPath);
        }
      }
    }
    
    await findImages(inputDir);
    
    if (imagePaths.length === 0) {
      throw new Error(`No images found in ${inputDir}`);
    }
    
    // Process images
    const results = await batchProcessImages(imagePaths, outputDir, {
      concurrency: config.concurrency || MATCH_CONFIG.processing.concurrency,
      skipExisting: config.skipExisting !== false
    });
    
    const { getProcessingStats } = await import('./imageProcessing.js');
    const stats = getProcessingStats(results);
    
    step.results = {
      inputImages: imagePaths.length,
      ...stats,
      outputDirectory: outputDir
    };
    
    step.success = true;
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    
    console.log(`Processing complete: ${stats.successful}/${stats.total} images processed`);
    
  } catch (error) {
    step.error = error.message;
    step.errors.push(error.message);
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    console.error('Processing failed:', error.message);
  }
  
  return step;
}

/**
 * Step 3: Build perceptual hash database
 */
async function buildHashDatabaseStep(config, workflow) {
  const step = {
    name: 'hashing',
    startTime: new Date(),
    success: false,
    results: null,
    errors: []
  };
  
  try {
    const imageDir = config.processingOutputDir || MATCH_CONFIG.processing.outputDir;
    const databasePath = config.databasePath || MATCH_CONFIG.matching.databasePath;
    
    // Find all processed images (prefer web derivatives for hashing)
    const imagePaths = [];
    const webDir = path.join(imageDir, 'web');
    
    if (fs.existsSync(webDir)) {
      const webImages = await fsPromises.readdir(webDir);
      imagePaths.push(...webImages
        .filter(file => /\.(jpg|jpeg)$/i.test(file))
        .map(file => path.join(webDir, file))
      );
    }
    
    // If no web derivatives, use masters or originals
    if (imagePaths.length === 0) {
      async function findImages(dir) {
        if (!fs.existsSync(dir)) return;
        
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            await findImages(fullPath);
          } else if (/\.(jpg|jpeg|png)$/i.test(entry.name)) {
            imagePaths.push(fullPath);
          }
        }
      }
      
      await findImages(imageDir);
    }
    
    if (imagePaths.length === 0) {
      throw new Error(`No images found for hashing in ${imageDir}`);
    }
    
    // Build database
    const database = await buildHashDatabase(imagePaths, databasePath);
    
    step.results = {
      databasePath,
      totalImages: database.totalImages,
      successCount: database.successCount,
      errorCount: database.errorCount,
      database
    };
    
    step.success = true;
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    
    console.log(`Hashing complete: ${database.successCount}/${database.totalImages} images hashed`);
    
  } catch (error) {
    step.error = error.message;
    step.errors.push(error.message);
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    console.error('Hashing failed:', error.message);
  }
  
  return step;
}

/**
 * Step 4: Match components to images
 */
async function matchComponentsStep(config, workflow) {
  const step = {
    name: 'matching',
    startTime: new Date(),
    success: false,
    results: null,
    errors: []
  };
  
  try {
    const components = config.components;
    const threshold = config.threshold || MATCH_CONFIG.matching.threshold;
    
    // Get available images from the processing step or find them
    let availableImages = [];
    
    if (workflow.results.processing) {
      // Use processed images
      const webDir = path.join(workflow.results.processing.outputDirectory, 'web');
      if (fs.existsSync(webDir)) {
        const webImages = await fsPromises.readdir(webDir);
        availableImages.push(...webImages
          .filter(file => /\.(jpg|jpeg)$/i.test(file))
          .map(file => path.join(webDir, file))
        );
      }
    }
    
    // Auto-assign images to components
    const assignments = await autoAssignImages(components, availableImages, threshold);
    
    step.results = assignments;
    step.success = true;
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    
    console.log(`Matching complete: ${assignments.successfulAssignments}/${assignments.totalComponents} components matched`);
    
  } catch (error) {
    step.error = error.message;
    step.errors.push(error.message);
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    console.error('Matching failed:', error.message);
  }
  
  return step;
}

/**
 * Step 5: Generate reports
 */
async function generateReportsStep(config, workflow) {
  const step = {
    name: 'reporting',
    startTime: new Date(),
    success: false,
    results: null,
    errors: []
  };
  
  try {
    const reportsDir = config.reportsDir || MATCH_CONFIG.workflow.reportsDir;
    await fsPromises.mkdir(reportsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Generate comprehensive workflow report
    const workflowReport = {
      ...workflow,
      generatedAt: new Date().toISOString(),
      configuration: config
    };
    
    const workflowReportPath = path.join(reportsDir, `workflow-report-${timestamp}.json`);
    await fsPromises.writeFile(workflowReportPath, JSON.stringify(workflowReport, null, 2));
    
    // Generate summary report
    const summaryReport = generateSummaryReport(workflow);
    const summaryReportPath = path.join(reportsDir, `summary-report-${timestamp}.json`);
    await fsPromises.writeFile(summaryReportPath, JSON.stringify(summaryReport, null, 2));
    
    // Generate human-readable report
    const readableReport = generateReadableReport(workflow);
    const readableReportPath = path.join(reportsDir, `report-${timestamp}.txt`);
    await fsPromises.writeFile(readableReportPath, readableReport);
    
    step.results = {
      reportsGenerated: 3,
      workflowReport: workflowReportPath,
      summaryReport: summaryReportPath,
      readableReport: readableReportPath
    };
    
    step.success = true;
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    
    console.log(`Reports generated in: ${reportsDir}`);
    
  } catch (error) {
    step.error = error.message;
    step.errors.push(error.message);
    step.endTime = new Date();
    step.duration = step.endTime - step.startTime;
    console.error('Reporting failed:', error.message);
  }
  
  return step;
}

/**
 * Generate summary report
 */
function generateSummaryReport(workflow) {
  return {
    workflow: {
      success: workflow.success,
      duration: Math.round(workflow.duration / 1000),
      stepsCompleted: workflow.steps.length,
      startTime: workflow.startTime,
      endTime: workflow.endTime
    },
    extraction: workflow.results.extraction ? {
      strategy: workflow.results.extraction.strategy,
      imageCount: workflow.results.extraction.imageCount || workflow.results.extraction.totalImages
    } : null,
    processing: workflow.results.processing ? {
      inputImages: workflow.results.processing.inputImages,
      successful: workflow.results.processing.successful,
      failed: workflow.results.processing.failed,
      outputs: workflow.results.processing.totalOutputs
    } : null,
    hashing: workflow.results.hashing ? {
      totalImages: workflow.results.hashing.totalImages,
      successCount: workflow.results.hashing.successCount,
      errorCount: workflow.results.hashing.errorCount
    } : null,
    matching: workflow.results.matching ? {
      totalComponents: workflow.results.matching.totalComponents,
      successfulAssignments: workflow.results.matching.successfulAssignments
    } : null
  };
}

/**
 * Generate human-readable report
 */
function generateReadableReport(workflow) {
  let report = '';
  
  report += '='.repeat(60) + '\n';
  report += 'IMAGE PROCESSING WORKFLOW REPORT\n';
  report += '='.repeat(60) + '\n\n';
  
  report += `Workflow Status: ${workflow.success ? 'SUCCESS' : 'FAILED'}\n`;
  report += `Duration: ${Math.round(workflow.duration / 1000)}s\n`;
  report += `Started: ${workflow.startTime.toISOString()}\n`;
  report += `Completed: ${workflow.endTime.toISOString()}\n\n`;
  
  // Step details
  workflow.steps.forEach((step, index) => {
    report += `${index + 1}. ${step.name.toUpperCase()}\n`;
    report += `-`.repeat(30) + '\n';
    report += `Status: ${step.success ? 'SUCCESS' : 'FAILED'}\n`;
    report += `Duration: ${Math.round(step.duration / 1000)}s\n`;
    
    if (step.error) {
      report += `Error: ${step.error}\n`;
    }
    
    if (step.results) {
      report += 'Results:\n';
      Object.entries(step.results).forEach(([key, value]) => {
        if (typeof value !== 'object') {
          report += `  ${key}: ${value}\n`;
        }
      });
    }
    
    report += '\n';
  });
  
  report += '='.repeat(60) + '\n';
  
  return report;
}

/**
 * Simplified workflow for basic extraction and matching
 */
export async function runBasicWorkflow(pdfPath, outputDir = './output') {
  const config = {
    pdfPath,
    outputDir,
    processImages: true,
    threshold: 0.90,
    reportsDir: path.join(outputDir, 'reports')
  };
  
  return await runCompleteWorkflow(config);
}

/**
 * Batch workflow for processing multiple PDFs
 */
export async function runBatchWorkflow(pdfDirectory, outputDir = './batch-output') {
  const config = {
    pdfDirectory,
    outputDir,
    processImages: true,
    threshold: 0.90,
    concurrency: 2, // Lower concurrency for batch processing
    reportsDir: path.join(outputDir, 'reports')
  };
  
  return await runCompleteWorkflow(config);
}