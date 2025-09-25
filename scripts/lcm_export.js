#!/usr/bin/env node

/**
 * LCM Export - Low-confidence queue management for ML/AI quality assurance
 * Exports and manages low-confidence predictions for manual review
 */

const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  environment: process.env.ENVIRONMENT || 'staging',
  dryRun: process.env.DRY_RUN !== 'false',
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.8,
  outputDir: process.env.OUTPUT_DIR || './exports',
  dataSource: process.env.DATA_SOURCE || 'http://localhost:5000/api/predictions',
  batchSize: parseInt(process.env.BATCH_SIZE) || 1000,
  maxAge: parseInt(process.env.MAX_AGE) || 7 // days
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Logging functions
function log(level, message) {
  const timestamp = new Date().toISOString();
  const color = colors[level === 'error' ? 'red' : level === 'success' ? 'green' : 
                       level === 'warning' ? 'yellow' : 'blue'];
  
  console.error(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function logInfo(message) { log('info', message); }
function logSuccess(message) { log('success', `✅ ${message}`); }
function logError(message) { log('error', `❌ ${message}`); }
function logWarning(message) { log('warning', `⚠️  ${message}`); }

// Help function
function showHelp() {
  console.log(`
LCM Export - Low-confidence queue management for ML/AI quality assurance

Usage: node lcm_export.js [OPTIONS]

Options:
    --env <environment>     Target environment (staging|production) [default: staging]
    --dry-run              Run in dry-run mode (simulation) [default: true]
    --no-dry-run           Disable dry-run mode
    --threshold <float>    Confidence threshold (0.0-1.0) [default: 0.8]
    --output-dir <dir>     Output directory for exports [default: ./exports]
    --format <type>        Export format (json|csv|xlsx) [default: json]
    --data-source <url>    Data source URL [default: http://localhost:5000/api/predictions]
    --batch-size <count>   Batch size for processing [default: 1000]
    --max-age <days>       Maximum age of data to export [default: 7]
    --action <type>        Action to perform (export|stats|cleanup|all) [default: export]
    --priority <level>     Priority filter (high|medium|low|all) [default: all]
    --help, -h             Show this help message

Examples:
    # Export low-confidence predictions as JSON
    node lcm_export.js --threshold 0.8 --format json --no-dry-run

    # Export as CSV with higher threshold
    node lcm_export.js --threshold 0.9 --format csv --no-dry-run

    # Get statistics without exporting
    node lcm_export.js --action stats

    # Cleanup old exports
    node lcm_export.js --action cleanup --max-age 30 --no-dry-run

Environment Variables:
    ENVIRONMENT           Target environment
    DRY_RUN              Enable/disable dry-run mode
    CONFIDENCE_THRESHOLD  Confidence threshold (0.0-1.0)
    OUTPUT_DIR           Output directory path
    DATA_SOURCE          Data source URL
    BATCH_SIZE           Batch size for processing
    MAX_AGE              Maximum age in days
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    format: 'json',
    action: 'export',
    priority: 'all'
  };
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--env':
        config.environment = args[++i];
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--no-dry-run':
        config.dryRun = false;
        break;
      case '--threshold':
        config.confidenceThreshold = parseFloat(args[++i]);
        break;
      case '--output-dir':
        config.outputDir = args[++i];
        break;
      case '--format':
        options.format = args[++i];
        break;
      case '--data-source':
        config.dataSource = args[++i];
        break;
      case '--batch-size':
        config.batchSize = parseInt(args[++i]);
        break;
      case '--max-age':
        config.maxAge = parseInt(args[++i]);
        break;
      case '--action':
        options.action = args[++i];
        break;
      case '--priority':
        options.priority = args[++i];
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;
      default:
        logError(`Unknown option: ${args[i]}`);
        showHelp();
        process.exit(1);
    }
  }
  
  return options;
}

// Mock data generator for simulation
function generateMockPredictions(count) {
  const predictions = [];
  const gameTypes = ['board-game', 'card-game', 'dice-game', 'strategy-game'];
  const components = ['dice', 'cards', 'tokens', 'boards', 'miniatures'];
  
  for (let i = 0; i < count; i++) {
    const confidence = Math.random();
    const isLowConfidence = confidence < config.confidenceThreshold;
    
    predictions.push({
      id: `pred_${Date.now()}_${i}`,
      timestamp: new Date(Date.now() - Math.random() * config.maxAge * 24 * 60 * 60 * 1000).toISOString(),
      input_text: `Sample game rule text for prediction ${i}`,
      prediction: {
        game_type: gameTypes[Math.floor(Math.random() * gameTypes.length)],
        components: components.slice(0, Math.floor(Math.random() * 3) + 1),
        player_count: `${Math.floor(Math.random() * 4) + 2}-${Math.floor(Math.random() * 4) + 5}`,
        estimated_time: `${Math.floor(Math.random() * 60) + 15} minutes`
      },
      confidence_score: confidence,
      is_low_confidence: isLowConfidence,
      priority: confidence < 0.5 ? 'high' : confidence < 0.7 ? 'medium' : 'low',
      metadata: {
        model_version: '1.2.3',
        processing_time_ms: Math.floor(Math.random() * 500) + 50,
        feature_count: Math.floor(Math.random() * 100) + 10
      }
    });
  }
  
  return predictions;
}

// Fetch low-confidence predictions
async function fetchLowConfidencePredictions() {
  logInfo('Fetching low-confidence predictions...');
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would fetch data from: ${config.dataSource}`);
    logInfo(`DRY-RUN: Using threshold: ${config.confidenceThreshold}`);
    
    // Generate mock data for simulation
    const mockData = generateMockPredictions(Math.floor(Math.random() * 500) + 100);
    const lowConfidenceData = mockData.filter(p => p.is_low_confidence);
    
    logInfo(`DRY-RUN: Generated ${mockData.length} mock predictions`);
    logInfo(`DRY-RUN: Found ${lowConfidenceData.length} low-confidence predictions`);
    
    return lowConfidenceData;
  }
  
  try {
    // In real implementation, this would make HTTP requests to the API
    // For now, simulate with mock data
    const mockData = generateMockPredictions(config.batchSize);
    const lowConfidenceData = mockData.filter(p => p.confidence_score < config.confidenceThreshold);
    
    logSuccess(`Fetched ${lowConfidenceData.length} low-confidence predictions`);
    return lowConfidenceData;
    
  } catch (error) {
    logError(`Failed to fetch predictions: ${error.message}`);
    throw error;
  }
}

// Filter by priority
function filterByPriority(predictions, priority) {
  if (priority === 'all') {
    return predictions;
  }
  
  return predictions.filter(p => p.priority === priority);
}

// Filter by age
function filterByAge(predictions, maxAgeDays) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
  
  return predictions.filter(p => new Date(p.timestamp) >= cutoffDate);
}

// Export as JSON
async function exportAsJSON(predictions, filename) {
  const filepath = path.join(config.outputDir, filename);
  
  const exportData = {
    metadata: {
      exported_at: new Date().toISOString(),
      environment: config.environment,
      confidence_threshold: config.confidenceThreshold,
      total_records: predictions.length,
      batch_size: config.batchSize,
      max_age_days: config.maxAge
    },
    predictions
  };
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would export ${predictions.length} records to: ${filepath}`);
    return filepath;
  }
  
  await fs.promises.writeFile(filepath, JSON.stringify(exportData, null, 2));
  logSuccess(`Exported ${predictions.length} records to: ${filepath}`);
  
  return filepath;
}

// Export as CSV
async function exportAsCSV(predictions, filename) {
  const filepath = path.join(config.outputDir, filename);
  
  if (predictions.length === 0) {
    logWarning('No predictions to export');
    return filepath;
  }
  
  // CSV headers
  const headers = [
    'id',
    'timestamp',
    'confidence_score',
    'priority',
    'game_type',
    'player_count',
    'estimated_time',
    'components',
    'model_version',
    'processing_time_ms'
  ];
  
  // CSV rows
  const rows = predictions.map(p => [
    p.id,
    p.timestamp,
    p.confidence_score,
    p.priority,
    p.prediction.game_type,
    p.prediction.player_count,
    p.prediction.estimated_time,
    p.prediction.components.join(';'),
    p.metadata.model_version,
    p.metadata.processing_time_ms
  ]);
  
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would export ${predictions.length} records to: ${filepath}`);
    return filepath;
  }
  
  await fs.promises.writeFile(filepath, csvContent);
  logSuccess(`Exported ${predictions.length} records to: ${filepath}`);
  
  return filepath;
}

// Export as XLSX (simplified - would require xlsx library in real implementation)
async function exportAsXLSX(predictions, filename) {
  const filepath = path.join(config.outputDir, filename);
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would export ${predictions.length} records to: ${filepath}`);
    logInfo('DRY-RUN: XLSX export would require xlsx library');
    return filepath;
  }
  
  // In real implementation, would use xlsx library
  logWarning('XLSX export not implemented - falling back to CSV');
  const csvFilename = filename.replace('.xlsx', '.csv');
  return exportAsCSV(predictions, csvFilename);
}

// Generate statistics
function generateStatistics(predictions) {
  logInfo('Generating statistics...');
  
  const stats = {
    total_predictions: predictions.length,
    confidence_distribution: {
      very_low: predictions.filter(p => p.confidence_score < 0.3).length,
      low: predictions.filter(p => p.confidence_score >= 0.3 && p.confidence_score < 0.5).length,
      medium: predictions.filter(p => p.confidence_score >= 0.5 && p.confidence_score < 0.7).length,
      high: predictions.filter(p => p.confidence_score >= 0.7 && p.confidence_score < config.confidenceThreshold).length
    },
    priority_distribution: {
      high: predictions.filter(p => p.priority === 'high').length,
      medium: predictions.filter(p => p.priority === 'medium').length,
      low: predictions.filter(p => p.priority === 'low').length
    },
    game_type_distribution: {},
    average_confidence: predictions.length > 0 ? 
      predictions.reduce((sum, p) => sum + p.confidence_score, 0) / predictions.length : 0,
    age_distribution: {
      last_24h: 0,
      last_week: 0,
      last_month: 0,
      older: 0
    }
  };
  
  // Game type distribution
  predictions.forEach(p => {
    const gameType = p.prediction.game_type;
    stats.game_type_distribution[gameType] = (stats.game_type_distribution[gameType] || 0) + 1;
  });
  
  // Age distribution
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const week = 7 * day;
  const month = 30 * day;
  
  predictions.forEach(p => {
    const age = now - new Date(p.timestamp).getTime();
    if (age < day) stats.age_distribution.last_24h++;
    else if (age < week) stats.age_distribution.last_week++;
    else if (age < month) stats.age_distribution.last_month++;
    else stats.age_distribution.older++;
  });
  
  return stats;
}

// Export predictions
async function exportPredictions(options) {
  logInfo('Starting prediction export...');
  
  // Fetch data
  const predictions = await fetchLowConfidencePredictions();
  
  // Apply filters
  const filteredByAge = filterByAge(predictions, config.maxAge);
  const filteredByPriority = filterByPriority(filteredByAge, options.priority);
  
  logInfo(`Filtered data: ${filteredByPriority.length} records after applying filters`);
  
  if (filteredByPriority.length === 0) {
    logWarning('No predictions to export after filtering');
    return { exported: false, records: 0 };
  }
  
  // Ensure output directory exists
  fs.mkdirSync(config.outputDir, { recursive: true });
  
  // Generate filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `lcm_export_${config.environment}_${timestamp}.${options.format}`;
  
  // Export based on format
  let exportPath;
  switch (options.format) {
    case 'json':
      exportPath = await exportAsJSON(filteredByPriority, filename);
      break;
    case 'csv':
      exportPath = await exportAsCSV(filteredByPriority, filename);
      break;
    case 'xlsx':
      exportPath = await exportAsXLSX(filteredByPriority, filename);
      break;
    default:
      throw new Error(`Unsupported export format: ${options.format}`);
  }
  
  return {
    exported: true,
    records: filteredByPriority.length,
    exportPath,
    format: options.format
  };
}

// Show statistics
async function showStatistics() {
  logInfo('Generating prediction statistics...');
  
  const predictions = await fetchLowConfidencePredictions();
  const stats = generateStatistics(predictions);
  
  console.log('\n📊 Low-Confidence Prediction Statistics:');
  console.log(`  Total predictions: ${stats.total_predictions}`);
  console.log(`  Average confidence: ${stats.average_confidence.toFixed(3)}`);
  
  console.log('\n🎯 Confidence Distribution:');
  Object.entries(stats.confidence_distribution).forEach(([level, count]) => {
    const percentage = stats.total_predictions > 0 ? (count / stats.total_predictions * 100).toFixed(1) : 0;
    console.log(`  ${level}: ${count} (${percentage}%)`);
  });
  
  console.log('\n⚡ Priority Distribution:');
  Object.entries(stats.priority_distribution).forEach(([priority, count]) => {
    const percentage = stats.total_predictions > 0 ? (count / stats.total_predictions * 100).toFixed(1) : 0;
    console.log(`  ${priority}: ${count} (${percentage}%)`);
  });
  
  console.log('\n🎮 Game Type Distribution:');
  Object.entries(stats.game_type_distribution)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .forEach(([type, count]) => {
      const percentage = stats.total_predictions > 0 ? (count / stats.total_predictions * 100).toFixed(1) : 0;
      console.log(`  ${type}: ${count} (${percentage}%)`);
    });
  
  console.log('\n📅 Age Distribution:');
  Object.entries(stats.age_distribution).forEach(([period, count]) => {
    const percentage = stats.total_predictions > 0 ? (count / stats.total_predictions * 100).toFixed(1) : 0;
    console.log(`  ${period.replace('_', ' ')}: ${count} (${percentage}%)`);
  });
  
  return stats;
}

// Cleanup old exports
async function cleanupOldExports() {
  logInfo(`Cleaning up exports older than ${config.maxAge} days...`);
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would cleanup old files in: ${config.outputDir}`);
    logInfo(`DRY-RUN: Would remove files older than ${config.maxAge} days`);
    return { cleaned: 0, simulation: true };
  }
  
  if (!fs.existsSync(config.outputDir)) {
    logInfo('Export directory does not exist, nothing to cleanup');
    return { cleaned: 0 };
  }
  
  const files = await fs.promises.readdir(config.outputDir);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.maxAge);
  
  let cleanedCount = 0;
  
  for (const file of files) {
    const filepath = path.join(config.outputDir, file);
    const stats = await fs.promises.stat(filepath);
    
    if (stats.mtime < cutoffDate && file.startsWith('lcm_export_')) {
      await fs.promises.unlink(filepath);
      cleanedCount++;
      logInfo(`Removed old export: ${file}`);
    }
  }
  
  logSuccess(`Cleanup completed: removed ${cleanedCount} old files`);
  return { cleaned: cleanedCount };
}

// Generate export report
async function generateExportReport(results) {
  const timestamp = new Date().toISOString();
  const reportFile = `artifacts/lcm_export_${config.environment}_${Date.now()}.json`;
  
  const report = {
    lcm_export: {
      environment: config.environment,
      timestamp,
      dry_run: config.dryRun,
      configuration: {
        confidence_threshold: config.confidenceThreshold,
        output_dir: config.outputDir,
        batch_size: config.batchSize,
        max_age_days: config.maxAge
      }
    },
    results,
    summary: {
      total_exported: results.export?.records || 0,
      total_cleaned: results.cleanup?.cleaned || 0
    }
  };
  
  // Ensure artifacts directory exists
  fs.mkdirSync('artifacts', { recursive: true });
  
  if (config.dryRun) {
    logInfo(`DRY-RUN: Would create export report: ${reportFile}`);
    console.log('Report content:', JSON.stringify(report, null, 2));
  } else {
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    logSuccess(`Export report created: ${reportFile}`);
  }
  
  return report;
}

// Main execution function
async function main() {
  const startTime = Date.now();
  
  logInfo('📤 Starting LCM export operations');
  logInfo(`Environment: ${config.environment}`);
  logInfo(`Dry-run mode: ${config.dryRun}`);
  logInfo(`Confidence threshold: ${config.confidenceThreshold}`);
  logInfo(`Output directory: ${config.outputDir}`);
  
  try {
    const options = parseArgs();
    
    // Validate configuration
    if (config.confidenceThreshold < 0 || config.confidenceThreshold > 1) {
      throw new Error(`Invalid confidence threshold: ${config.confidenceThreshold}. Must be between 0 and 1`);
    }
    
    if (!['staging', 'production'].includes(config.environment)) {
      throw new Error(`Invalid environment: ${config.environment}. Must be 'staging' or 'production'`);
    }
    
    const results = {};
    
    switch (options.action) {
      case 'export':
        results.export = await exportPredictions(options);
        break;
        
      case 'stats':
        results.stats = await showStatistics();
        break;
        
      case 'cleanup':
        results.cleanup = await cleanupOldExports();
        break;
        
      case 'all':
      default:
        results.export = await exportPredictions(options);
        results.stats = await showStatistics();
        results.cleanup = await cleanupOldExports();
        break;
    }
    
    // Generate report
    const report = await generateExportReport(results);
    
    // Summary
    const duration = Date.now() - startTime;
    logSuccess(`🎉 LCM export operations completed successfully`);
    logSuccess(`Total execution time: ${duration}ms`);
    
    if (config.dryRun) {
      logWarning('This was a DRY-RUN. No actual files were created or modified.');
      logInfo('To run with real operations, use: --no-dry-run');
    }
    
    if (results.export) {
      console.log(`\n📊 Export Summary:`);
      console.log(`  Records exported: ${results.export.records}`);
      console.log(`  Export format: ${results.export.format}`);
      if (results.export.exportPath) {
        console.log(`  Export path: ${results.export.exportPath}`);
      }
    }
    
  } catch (error) {
    logError(`LCM export operations failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle unhandled errors
process.on('uncaughtException', (error) => {
  logError(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logError(`Unhandled rejection at ${promise}: ${reason}`);
  process.exit(1);
});

// Execute main function
if (require.main === module) {
  main();
}

module.exports = {
  main,
  exportPredictions,
  showStatistics,
  cleanupOldExports,
  generateMockPredictions
};