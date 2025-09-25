#!/usr/bin/env node
// scripts/lcm_export.js - Low-confidence queue management and export
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
  exportDir: process.env.EXPORT_DIR || path.join(__dirname, '..', 'exports'),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  confidenceThreshold: 0.7,
  maxExportSize: 10000, // Maximum number of records per export
  format: 'json', // 'json' or 'csv'
  verbose: false,
  logFile: null
};

// Logging function
function log(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [${level}] ${args.join(' ')}`;
  console.log(message);
  
  if (config.logFile) {
    fs.appendFileSync(config.logFile, message + '\n');
  }
}

// Help text
function showHelp() {
  console.log(`
Usage: node scripts/lcm_export.js [options]

Export and manage low-confidence queue entries for manual review.

Options:
  --threshold NUM     Confidence threshold (0.0-1.0, default: 0.7)
  --max-size NUM      Maximum records per export (default: 10000)
  --format FORMAT     Output format: json|csv (default: json)
  --export-dir DIR    Export directory (default: exports/)
  --data-dir DIR      Data directory (default: data/)
  --purge-exported    Remove exported entries from queue
  --verbose          Enable verbose logging
  --log-file PATH    Write logs to specified file
  --help             Show this help

Examples:
  node scripts/lcm_export.js
  node scripts/lcm_export.js --threshold 0.8 --format csv
  node scripts/lcm_export.js --purge-exported --verbose

Environment variables:
  EXPORT_DIR         Export directory (default: exports/)
  DATA_DIR           Data directory (default: data/)
  CONFIDENCE_THRESHOLD Confidence threshold (default: 0.7)
`);
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let purgeExported = false;
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--threshold':
        config.confidenceThreshold = parseFloat(args[++i]);
        if (isNaN(config.confidenceThreshold) || 
            config.confidenceThreshold < 0 || 
            config.confidenceThreshold > 1) {
          log('ERROR', 'Threshold must be a number between 0.0 and 1.0');
          process.exit(1);
        }
        break;
      case '--max-size':
        config.maxExportSize = parseInt(args[++i], 10);
        if (isNaN(config.maxExportSize) || config.maxExportSize < 1) {
          log('ERROR', 'Max size must be a positive number');
          process.exit(1);
        }
        break;
      case '--format':
        config.format = args[++i];
        if (!['json', 'csv'].includes(config.format)) {
          log('ERROR', 'Format must be "json" or "csv"');
          process.exit(1);
        }
        break;
      case '--export-dir':
        config.exportDir = path.resolve(args[++i]);
        break;
      case '--data-dir':
        config.dataDir = path.resolve(args[++i]);
        break;
      case '--purge-exported':
        purgeExported = true;
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--log-file':
        config.logFile = args[++i];
        break;
      case '--help':
        showHelp();
        process.exit(0);
        break;
      default:
        log('ERROR', `Unknown option: ${args[i]}`);
        showHelp();
        process.exit(1);
    }
  }
  
  return { purgeExported };
}

// Mock data generator for demonstration
function generateMockData(count = 100) {
  const categories = ['component', 'rule', 'setup', 'gameplay', 'scoring'];
  const sources = ['manual_extraction', 'ocr_processing', 'nlp_analysis'];
  const mockData = [];
  
  for (let i = 0; i < count; i++) {
    const confidence = Math.random();
    const isLowConfidence = confidence < config.confidenceThreshold;
    
    if (isLowConfidence || Math.random() < 0.3) { // Include some for testing
      mockData.push({
        id: `entry_${i}_${Date.now()}`,
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        content: `Sample extracted content for entry ${i}`,
        category: categories[Math.floor(Math.random() * categories.length)],
        source: sources[Math.floor(Math.random() * sources.length)],
        confidence: Math.round(confidence * 1000) / 1000,
        metadata: {
          page_number: Math.floor(Math.random() * 50) + 1,
          extraction_method: 'automated',
          review_required: isLowConfidence,
          flags: isLowConfidence ? ['low_confidence'] : []
        }
      });
    }
  }
  
  return mockData;
}

// Load low-confidence queue data
function loadQueueData() {
  const queueFile = path.join(config.dataDir, 'low_confidence_queue.json');
  
  try {
    if (fs.existsSync(queueFile)) {
      const data = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
      log('INFO', `Loaded ${data.length} entries from queue file`);
      return data;
    } else {
      log('WARN', `Queue file not found: ${queueFile}`);
      log('INFO', 'Generating mock data for demonstration');
      
      // Create directory and generate mock data
      fs.mkdirSync(config.dataDir, { recursive: true });
      const mockData = generateMockData(150);
      
      fs.writeFileSync(queueFile, JSON.stringify(mockData, null, 2));
      log('INFO', `Generated ${mockData.length} mock entries`);
      
      return mockData;
    }
  } catch (error) {
    log('ERROR', `Failed to load queue data: ${error.message}`);
    throw error;
  }
}

// Filter low-confidence entries
function filterLowConfidenceEntries(data) {
  const lowConfidenceEntries = data.filter(entry => 
    entry.confidence < config.confidenceThreshold
  );
  
  log('INFO', `Found ${lowConfidenceEntries.length} low-confidence entries (threshold: ${config.confidenceThreshold})`);
  
  if (config.verbose) {
    const confidenceStats = {
      min: Math.min(...lowConfidenceEntries.map(e => e.confidence)),
      max: Math.max(...lowConfidenceEntries.map(e => e.confidence)),
      avg: lowConfidenceEntries.reduce((sum, e) => sum + e.confidence, 0) / lowConfidenceEntries.length
    };
    
    log('DEBUG', `Confidence stats: min=${confidenceStats.min.toFixed(3)}, max=${confidenceStats.max.toFixed(3)}, avg=${confidenceStats.avg.toFixed(3)}`);
  }
  
  return lowConfidenceEntries;
}

// Export to JSON format
function exportToJSON(entries, exportPath) {
  const exportData = {
    export_metadata: {
      timestamp: new Date().toISOString(),
      total_entries: entries.length,
      confidence_threshold: config.confidenceThreshold,
      export_format: 'json',
      version: '1.0'
    },
    entries: entries.slice(0, config.maxExportSize)
  };
  
  fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
  log('INFO', `Exported ${exportData.entries.length} entries to JSON: ${exportPath}`);
  
  return exportData.entries.length;
}

// Export to CSV format
function exportToCSV(entries, exportPath) {
  const csvHeaders = [
    'id',
    'timestamp',
    'content',
    'category', 
    'source',
    'confidence',
    'page_number',
    'extraction_method',
    'review_required',
    'flags'
  ];
  
  let csvContent = csvHeaders.join(',') + '\n';
  
  const entriesToExport = entries.slice(0, config.maxExportSize);
  
  entriesToExport.forEach(entry => {
    const row = [
      `"${entry.id}"`,
      `"${entry.timestamp}"`,
      `"${entry.content.replace(/"/g, '""')}"`, // Escape quotes in CSV
      `"${entry.category}"`,
      `"${entry.source}"`,
      entry.confidence,
      entry.metadata?.page_number || '',
      `"${entry.metadata?.extraction_method || ''}"`,
      entry.metadata?.review_required || false,
      `"${(entry.metadata?.flags || []).join(';')}"`
    ];
    
    csvContent += row.join(',') + '\n';
  });
  
  fs.writeFileSync(exportPath, csvContent);
  log('INFO', `Exported ${entriesToExport.length} entries to CSV: ${exportPath}`);
  
  return entriesToExport.length;
}

// Generate export report
function generateExportReport(originalCount, exportedCount, exportPath) {
  const report = {
    export_summary: {
      timestamp: new Date().toISOString(),
      original_queue_size: originalCount,
      exported_entries: exportedCount,
      remaining_entries: originalCount - exportedCount,
      export_file: path.basename(exportPath),
      confidence_threshold: config.confidenceThreshold,
      format: config.format
    },
    statistics: {
      export_percentage: Math.round((exportedCount / originalCount) * 100),
      truncated: exportedCount < originalCount,
      max_export_size: config.maxExportSize
    },
    recommendations: []
  };
  
  // Add recommendations based on results
  if (report.statistics.export_percentage > 20) {
    report.recommendations.push('High percentage of low-confidence entries detected - review extraction processes');
  }
  
  if (report.statistics.truncated) {
    report.recommendations.push('Export was truncated - consider processing in multiple batches');
  }
  
  if (exportedCount === 0) {
    report.recommendations.push('No low-confidence entries found - system performing well');
  }
  
  const reportPath = path.join(config.exportDir, `export_report_${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  log('INFO', `Export report saved to: ${reportPath}`);
  return report;
}

// Purge exported entries from queue
function purgeExportedEntries(allData, exportedEntries) {
  const exportedIds = new Set(exportedEntries.map(entry => entry.id));
  const remainingData = allData.filter(entry => !exportedIds.has(entry.id));
  
  const queueFile = path.join(config.dataDir, 'low_confidence_queue.json');
  fs.writeFileSync(queueFile, JSON.stringify(remainingData, null, 2));
  
  log('INFO', `Purged ${exportedEntries.length} entries from queue`);
  log('INFO', `${remainingData.length} entries remain in queue`);
  
  return remainingData.length;
}

// Main export function
async function exportLowConfidenceQueue() {
  try {
    const { purgeExported } = parseArgs();
    
    log('INFO', 'Starting low-confidence queue export');
    log('INFO', `Confidence threshold: ${config.confidenceThreshold}`);
    log('INFO', `Export format: ${config.format}`);
    log('INFO', `Max export size: ${config.maxExportSize}`);
    log('INFO', `Export directory: ${config.exportDir}`);
    
    if (config.logFile) {
      log('INFO', `Logging to: ${config.logFile}`);
    }
    
    // Ensure export directory exists
    fs.mkdirSync(config.exportDir, { recursive: true });
    
    // Load queue data
    const allData = loadQueueData();
    
    if (allData.length === 0) {
      log('INFO', 'No data in queue - nothing to export');
      return;
    }
    
    // Filter low-confidence entries
    const lowConfidenceEntries = filterLowConfidenceEntries(allData);
    
    if (lowConfidenceEntries.length === 0) {
      log('INFO', 'No low-confidence entries found - system performing well');
      
      // Still generate a report
      const report = {
        export_summary: {
          timestamp: new Date().toISOString(),
          original_queue_size: allData.length,
          exported_entries: 0,
          remaining_entries: allData.length,
          confidence_threshold: config.confidenceThreshold,
          format: config.format
        },
        message: 'No entries below confidence threshold'
      };
      
      const reportPath = path.join(config.exportDir, `export_report_${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      log('INFO', `Report saved to: ${reportPath}`);
      
      return;
    }
    
    // Generate export filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = config.format === 'csv' ? 'csv' : 'json';
    const exportPath = path.join(config.exportDir, `low_confidence_export_${timestamp}.${fileExtension}`);
    
    // Export data
    let exportedCount;
    if (config.format === 'csv') {
      exportedCount = exportToCSV(lowConfidenceEntries, exportPath);
    } else {
      exportedCount = exportToJSON(lowConfidenceEntries, exportPath);
    }
    
    // Generate report
    const report = generateExportReport(lowConfidenceEntries.length, exportedCount, exportPath);
    
    // Purge exported entries if requested
    if (purgeExported) {
      const exportedEntries = lowConfidenceEntries.slice(0, config.maxExportSize);
      purgeExportedEntries(allData, exportedEntries);
      log('INFO', 'Exported entries purged from queue');
    }
    
    // Summary
    log('INFO', '=== EXPORT SUMMARY ===');
    log('INFO', `Total queue entries: ${allData.length}`);
    log('INFO', `Low-confidence entries: ${lowConfidenceEntries.length}`);
    log('INFO', `Exported entries: ${exportedCount}`);
    log('INFO', `Export file: ${exportPath}`);
    log('INFO', `Export percentage: ${report.statistics.export_percentage}%`);
    
    if (report.recommendations.length > 0) {
      log('INFO', 'Recommendations:');
      report.recommendations.forEach(rec => log('INFO', `  • ${rec}`));
    }
    
    log('INFO', 'Low-confidence queue export completed successfully');
    
  } catch (error) {
    log('ERROR', 'Export failed:', error.message);
    if (config.verbose) {
      log('DEBUG', error.stack);
    }
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  exportLowConfidenceQueue();
}

module.exports = { exportLowConfidenceQueue, generateMockData };