#!/usr/bin/env node

/**
 * Low-Confidence queue Management (LCM) Export Tool
 * Exports and analyzes low-confidence items from the processing queue
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const DEFAULT_OUTPUT_DIR = 'exports/lcm';
const DEFAULT_SAMPLE_SIZE = 100;
const CONFIDENCE_THRESHOLD = 0.7; // Items below this threshold are considered low-confidence

// Mock data structure - in production this would connect to actual queue/database
const MOCK_QUEUE_DATA = [
  {
    id: 'item_001',
    type: 'bgg_metadata_extraction',
    status: 'completed',
    confidence_score: 0.45,
    created_at: '2024-01-15T10:30:00Z',
    processed_at: '2024-01-15T10:32:15Z',
    data: {
      game_title: 'Uncertain Game Title?',
      publisher: 'Unknown Publisher Co.',
      player_count: '2-4 players (?)',
      issues: ['Ambiguous player count format', 'Publisher name confidence low']
    }
  },
  {
    id: 'item_002',
    type: 'component_extraction',
    status: 'completed',
    confidence_score: 0.38,
    created_at: '2024-01-15T11:15:00Z',
    processed_at: '2024-01-15T11:18:45Z',
    data: {
      components: ['45 cards', 'dice (unclear quantity)', 'tokens'],
      issues: ['Dice quantity not specified clearly', 'Token types ambiguous']
    }
  },
  {
    id: 'item_003',
    type: 'ai_summarization',
    status: 'completed',
    confidence_score: 0.61,
    created_at: '2024-01-15T12:00:00Z',
    processed_at: '2024-01-15T12:05:30Z',
    data: {
      summary_length: 1250,
      key_concepts_identified: 8,
      issues: ['Some rule ambiguities detected', 'Tutorial flow needs review']
    }
  },
  {
    id: 'item_004',
    type: 'dhash_transformation',
    status: 'failed',
    confidence_score: 0.0,
    created_at: '2024-01-15T13:20:00Z',
    processed_at: '2024-01-15T13:20:05Z',
    data: {
      error: 'Invalid JSON structure in source data',
      issues: ['Malformed input data', 'Checksum verification failed']
    }
  },
  {
    id: 'item_005',
    type: 'video_generation',
    status: 'completed',
    confidence_score: 0.55,
    created_at: '2024-01-15T14:10:00Z',
    processed_at: '2024-01-15T14:25:18Z',
    data: {
      video_duration: 892,
      scene_count: 23,
      audio_quality_score: 0.72,
      issues: ['Some scene transitions abrupt', 'Audio sync minor issues']
    }
  }
];

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    outputDir: DEFAULT_OUTPUT_DIR,
    sampleSize: DEFAULT_SAMPLE_SIZE,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    format: 'json',
    verbose: false,
    includeSuccessful: true,
    includeFailed: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-o':
      case '--output':
        options.outputDir = args[++i];
        break;
      case '-n':
      case '--sample-size':
        options.sampleSize = parseInt(args[++i], 10);
        break;
      case '-t':
      case '--threshold':
        options.confidenceThreshold = parseFloat(args[++i]);
        break;
      case '-f':
      case '--format':
        options.format = args[++i];
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '--failed-only':
        options.includeSuccessful = false;
        break;
      case '--successful-only':
        options.includeFailed = false;
        break;
      case '-h':
      case '--help':
        showUsage();
        process.exit(0);
    }
  }

  return options;
}

/**
 * Show usage information
 */
function showUsage() {
  console.log(`
Low-Confidence queue Management (LCM) Export Tool

Usage: node lcm_export.js [OPTIONS]

Options:
  -o, --output DIR         Output directory (default: ${DEFAULT_OUTPUT_DIR})
  -n, --sample-size NUM    Maximum number of items to export (default: ${DEFAULT_SAMPLE_SIZE})
  -t, --threshold NUM      Confidence threshold (default: ${CONFIDENCE_THRESHOLD})
  -f, --format FORMAT      Output format: json, csv, xml (default: json)
  -v, --verbose           Enable verbose output
  --failed-only           Export only failed items
  --successful-only       Export only successful items
  -h, --help              Show this help message

Examples:
  node lcm_export.js                          # Export with defaults
  node lcm_export.js -n 50 -t 0.5            # Export 50 items below 0.5 confidence
  node lcm_export.js --failed-only -f csv    # Export failed items as CSV
  node lcm_export.js -o ./analysis -v        # Verbose export to ./analysis
`);
}

/**
 * Log message if verbose mode is enabled
 */
function log(message, options) {
  if (options.verbose) {
    console.log(`[LCM] ${message}`);
  }
}

/**
 * Filter items based on criteria
 */
function filterItems(items, options) {
  return items.filter(item => {
    // Filter by confidence threshold
    if (item.confidence_score > options.confidenceThreshold) {
      return false;
    }

    // Filter by status
    if (!options.includeSuccessful && item.status === 'completed') {
      return false;
    }
    
    if (!options.includeFailed && item.status === 'failed') {
      return false;
    }

    return true;
  });
}

/**
 * Generate analysis report
 */
function generateAnalysis(items) {
  const analysis = {
    summary: {
      total_items: items.length,
      avg_confidence: items.length > 0 ? 
        Math.round((items.reduce((sum, item) => sum + item.confidence_score, 0) / items.length) * 100) / 100 : 0,
      status_distribution: {},
      type_distribution: {},
      common_issues: {}
    },
    recommendations: [],
    timestamp: new Date().toISOString()
  };

  // Calculate distributions
  items.forEach(item => {
    // Status distribution
    analysis.summary.status_distribution[item.status] = 
      (analysis.summary.status_distribution[item.status] || 0) + 1;

    // Type distribution  
    analysis.summary.type_distribution[item.type] = 
      (analysis.summary.type_distribution[item.type] || 0) + 1;

    // Common issues
    if (item.data.issues) {
      item.data.issues.forEach(issue => {
        analysis.summary.common_issues[issue] = 
          (analysis.summary.common_issues[issue] || 0) + 1;
      });
    }
  });

  // Generate recommendations
  const failedCount = analysis.summary.status_distribution.failed || 0;
  const lowConfidenceCount = items.filter(i => i.confidence_score < 0.5).length;
  
  if (failedCount > 0) {
    analysis.recommendations.push({
      priority: 'high',
      category: 'reliability',
      message: `${failedCount} failed items require immediate attention`,
      action: 'Review error logs and fix underlying issues'
    });
  }

  if (lowConfidenceCount > items.length * 0.3) {
    analysis.recommendations.push({
      priority: 'medium',
      category: 'quality',
      message: `${lowConfidenceCount} items have very low confidence (<0.5)`,
      action: 'Consider tuning AI models or improving input data quality'
    });
  }

  // Issue-specific recommendations
  const issueFreq = analysis.summary.common_issues;
  Object.entries(issueFreq).forEach(([issue, count]) => {
    if (count > 1) {
      analysis.recommendations.push({
        priority: 'low',
        category: 'process_improvement',
        message: `"${issue}" appears ${count} times`,
        action: 'Consider implementing specific validation for this issue type'
      });
    }
  });

  return analysis;
}

/**
 * Export to JSON format
 */
function exportAsJson(items, analysis, outputPath) {
  const exportData = {
    metadata: {
      export_timestamp: new Date().toISOString(),
      format: 'json',
      version: '1.0',
      item_count: items.length
    },
    analysis,
    items
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
}

/**
 * Export to CSV format
 */
function exportAsCsv(items, analysis, outputPath) {
  const headers = [
    'id', 'type', 'status', 'confidence_score', 
    'created_at', 'processed_at', 'issues_count', 'primary_issue'
  ];

  const rows = items.map(item => [
    item.id,
    item.type,
    item.status,
    item.confidence_score,
    item.created_at,
    item.processed_at || '',
    item.data.issues ? item.data.issues.length : 0,
    item.data.issues ? item.data.issues[0] || '' : ''
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(field => `"${field}"`).join(','))
  ].join('\n');

  fs.writeFileSync(outputPath, csv);

  // Also write analysis as separate JSON file
  const analysisPath = outputPath.replace('.csv', '_analysis.json');
  fs.writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
}

/**
 * Export to XML format
 */
function exportAsXml(items, analysis, outputPath) {
  const escapeXml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<lcm_export>\n';
  xml += '  <metadata>\n';
  xml += `    <export_timestamp>${new Date().toISOString()}</export_timestamp>\n`;
  xml += `    <format>xml</format>\n`;
  xml += `    <version>1.0</version>\n`;
  xml += `    <item_count>${items.length}</item_count>\n`;
  xml += '  </metadata>\n';

  xml += '  <analysis>\n';
  xml += `    <avg_confidence>${analysis.summary.avg_confidence}</avg_confidence>\n`;
  xml += '    <recommendations>\n';
  analysis.recommendations.forEach(rec => {
    xml += `      <recommendation priority="${rec.priority}" category="${rec.category}">\n`;
    xml += `        <message>${escapeXml(rec.message)}</message>\n`;
    xml += `        <action>${escapeXml(rec.action)}</action>\n`;
    xml += '      </recommendation>\n';
  });
  xml += '    </recommendations>\n';
  xml += '  </analysis>\n';

  xml += '  <items>\n';
  items.forEach(item => {
    xml += `    <item id="${item.id}" type="${item.type}" status="${item.status}">\n`;
    xml += `      <confidence_score>${item.confidence_score}</confidence_score>\n`;
    xml += `      <created_at>${item.created_at}</created_at>\n`;
    if (item.processed_at) {
      xml += `      <processed_at>${item.processed_at}</processed_at>\n`;
    }
    if (item.data.issues && item.data.issues.length > 0) {
      xml += '      <issues>\n';
      item.data.issues.forEach(issue => {
        xml += `        <issue>${escapeXml(issue)}</issue>\n`;
      });
      xml += '      </issues>\n';
    }
    xml += '    </item>\n';
  });
  xml += '  </items>\n';
  xml += '</lcm_export>\n';

  fs.writeFileSync(outputPath, xml);
}

/**
 * Main export function
 */
function main() {
  const options = parseArgs();
  
  log(`Starting LCM export with threshold: ${options.confidenceThreshold}`, options);
  
  // In production, this would fetch from actual data source
  // For now, using mock data
  const allItems = MOCK_QUEUE_DATA;
  
  log(`Found ${allItems.length} total items`, options);
  
  // Filter items based on criteria
  let filteredItems = filterItems(allItems, options);
  
  log(`Filtered to ${filteredItems.length} low-confidence items`, options);
  
  // Limit to sample size
  if (filteredItems.length > options.sampleSize) {
    filteredItems = filteredItems
      .sort((a, b) => a.confidence_score - b.confidence_score) // Lowest confidence first
      .slice(0, options.sampleSize);
    
    log(`Limited to ${options.sampleSize} items (lowest confidence first)`, options);
  }

  if (filteredItems.length === 0) {
    console.log('No items match the specified criteria.');
    console.log(`Consider adjusting the confidence threshold (currently ${options.confidenceThreshold})`);
    return;
  }

  // Generate analysis
  const analysis = generateAnalysis(filteredItems);
  log('Generated analysis report', options);

  // Ensure output directory exists
  if (!fs.existsSync(options.outputDir)) {
    fs.mkdirSync(options.outputDir, { recursive: true });
    log(`Created output directory: ${options.outputDir}`, options);
  }

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseFilename = `lcm_export_${timestamp}`;
  
  // Export in requested format
  let outputPath;
  switch (options.format.toLowerCase()) {
    case 'csv':
      outputPath = path.join(options.outputDir, `${baseFilename}.csv`);
      exportAsCsv(filteredItems, analysis, outputPath);
      break;
    case 'xml':
      outputPath = path.join(options.outputDir, `${baseFilename}.xml`);
      exportAsXml(filteredItems, analysis, outputPath);
      break;
    case 'json':
    default:
      outputPath = path.join(options.outputDir, `${baseFilename}.json`);
      exportAsJson(filteredItems, analysis, outputPath);
      break;
  }

  // Generate checksum
  const fileContent = fs.readFileSync(outputPath);
  const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');
  const checksumPath = `${outputPath}.sha256`;
  fs.writeFileSync(checksumPath, `${checksum}  ${path.basename(outputPath)}\n`);

  // Output summary
  console.log('\n=== LCM Export Summary ===');
  console.log(`Items exported: ${filteredItems.length}`);
  console.log(`Average confidence: ${analysis.summary.avg_confidence}`);
  console.log(`Output file: ${outputPath}`);
  console.log(`Checksum: ${checksumPath}`);
  console.log(`File size: ${Math.round(fileContent.length / 1024)} KB`);

  if (analysis.recommendations.length > 0) {
    console.log('\n=== Recommendations ===');
    analysis.recommendations
      .sort((a, b) => {
        const priorities = { high: 3, medium: 2, low: 1 };
        return priorities[b.priority] - priorities[a.priority];
      })
      .forEach(rec => {
        const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🔵';
        console.log(`${icon} [${rec.priority.toUpperCase()}] ${rec.message}`);
        console.log(`   → ${rec.action}`);
      });
  }

  log('Export completed successfully', options);
}

// Run if called directly
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error('Export failed:', error.message);
    process.exit(1);
  }
}