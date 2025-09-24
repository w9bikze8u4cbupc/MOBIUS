#!/usr/bin/env node

/**
 * MOBIUS Low-Confidence Management (LCM) Export Script
 * Exports components with low migration confidence for manual review
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DEFAULT_INPUT = 'library.dhash.json';
const DEFAULT_OUTPUT = 'lcm-export';
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        input: DEFAULT_INPUT,
        output: DEFAULT_OUTPUT,
        format: 'json',
        includeImages: false,
        confidenceThreshold: DEFAULT_CONFIDENCE_THRESHOLD,
        verbose: false
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-i':
            case '--input':
                options.input = args[++i];
                break;
            case '-o':
            case '--output':
                options.output = args[++i];
                break;
            case '--format':
                options.format = args[++i];
                break;
            case '--include-images':
                options.includeImages = true;
                break;
            case '--confidence-threshold':
                options.confidenceThreshold = parseFloat(args[++i]);
                break;
            case '-v':
            case '--verbose':
                options.verbose = true;
                break;
            case '-h':
            case '--help':
                printUsage();
                process.exit(0);
                break;
            default:
                console.error(`Unknown option: ${args[i]}`);
                process.exit(1);
        }
    }
    
    return options;
}

function printUsage() {
    console.log(`
Usage: node lcm-export.js [OPTIONS]

Options:
    -i, --input FILE              Input dhash library file (default: ${DEFAULT_INPUT})
    -o, --output PREFIX           Output file prefix (default: ${DEFAULT_OUTPUT})
    --format FORMAT               Output format: json, csv, html (default: json)
    --include-images              Include image references in export
    --confidence-threshold NUM    Confidence threshold (default: ${DEFAULT_CONFIDENCE_THRESHOLD})
    -v, --verbose                 Enable verbose logging
    -h, --help                    Show this help message

Examples:
    node lcm-export.js -i library.dhash.json --include-images --format json
    node lcm-export.js --confidence-threshold 0.6 --format csv
    node lcm-export.js --format html -o manual-review
`);
}

// Logging utilities
function log(level, message, options = {}) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (level === 'verbose' && !options.verbose) {
        return;
    }
    
    console.log(`${prefix} ${message}`);
}

// Filter low-confidence components
function filterLowConfidenceComponents(library, threshold) {
    if (!library.components || !Array.isArray(library.components)) {
        throw new Error('Invalid library format: missing or invalid components array');
    }
    
    return library.components.filter(component => {
        const confidence = component.migration_confidence || 0;
        return confidence < threshold;
    });
}

// Generate export statistics
function generateStats(allComponents, lowConfidenceComponents, threshold) {
    const stats = {
        total_components: allComponents.length,
        low_confidence_components: lowConfidenceComponents.length,
        percentage_low_confidence: allComponents.length > 0 ? 
            (lowConfidenceComponents.length / allComponents.length * 100).toFixed(2) : '0.00',
        confidence_threshold: threshold,
        average_confidence_all: allComponents.length > 0 ?
            (allComponents.reduce((sum, c) => sum + (c.migration_confidence || 0), 0) / allComponents.length).toFixed(3) : '0.000',
        average_confidence_low: lowConfidenceComponents.length > 0 ?
            (lowConfidenceComponents.reduce((sum, c) => sum + (c.migration_confidence || 0), 0) / lowConfidenceComponents.length).toFixed(3) : '0.000'
    };
    
    return stats;
}

// Export as JSON
function exportAsJson(components, stats, outputPath, options) {
    const exportData = {
        export_metadata: {
            generated_at: new Date().toISOString(),
            confidence_threshold: options.confidenceThreshold,
            include_images: options.includeImages,
            total_components: stats.total_components,
            exported_components: components.length
        },
        statistics: stats,
        components: components.map(component => {
            const exported = {
                name: component.name,
                confidence: component.migration_confidence,
                dhash: component.dhash,
                quantity: component.quantity,
                description: component.description
            };
            
            if (options.includeImages) {
                exported.image = component.image;
                exported.legacy_image_metadata = component.legacy_image_metadata;
            }
            
            return exported;
        })
    };
    
    const filename = `${outputPath}.json`;
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2));
    return filename;
}

// Export as CSV
function exportAsCsv(components, stats, outputPath, options) {
    let csvContent = 'name,confidence,dhash,quantity,description';
    
    if (options.includeImages) {
        csvContent += ',image';
    }
    
    csvContent += '\n';
    
    for (const component of components) {
        const row = [
            `"${(component.name || '').replace(/"/g, '""')}"`,
            component.migration_confidence || '0',
            component.dhash || '',
            component.quantity || '',
            `"${(component.description || '').replace(/"/g, '""')}"`
        ];
        
        if (options.includeImages) {
            row.push(`"${(component.image || '').replace(/"/g, '""')}"`);
        }
        
        csvContent += row.join(',') + '\n';
    }
    
    const filename = `${outputPath}.csv`;
    fs.writeFileSync(filename, csvContent);
    return filename;
}

// Export as HTML
function exportAsHtml(components, stats, outputPath, options) {
    let html = `<!DOCTYPE html>
<html>
<head>
    <title>Low-Confidence Components Export</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px; }
        .stat-item { background-color: #e9ecef; padding: 10px; border-radius: 3px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .confidence { font-weight: bold; }
        .confidence.low { color: #dc3545; }
        .confidence.medium { color: #fd7e14; }
        .image-link { max-width: 200px; word-break: break-all; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Low-Confidence Components Export</h1>
        <p>Generated: ${new Date().toISOString()}</p>
        <p>Confidence Threshold: ${options.confidenceThreshold}</p>
    </div>
    
    <div class="stats">
        <div class="stat-item">
            <strong>Total Components:</strong> ${stats.total_components}
        </div>
        <div class="stat-item">
            <strong>Low-Confidence Components:</strong> ${stats.low_confidence_components}
        </div>
        <div class="stat-item">
            <strong>Percentage Low-Confidence:</strong> ${stats.percentage_low_confidence}%
        </div>
        <div class="stat-item">
            <strong>Average Confidence (All):</strong> ${stats.average_confidence_all}
        </div>
    </div>
    
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Confidence</th>
                <th>Dhash</th>
                <th>Quantity</th>
                <th>Description</th>
                ${options.includeImages ? '<th>Image</th>' : ''}
            </tr>
        </thead>
        <tbody>`;

    for (const component of components) {
        const confidence = component.migration_confidence || 0;
        const confidenceClass = confidence < 0.5 ? 'low' : 'medium';
        
        html += `
            <tr>
                <td><strong>${escapeHtml(component.name || '')}</strong></td>
                <td class="confidence ${confidenceClass}">${confidence.toFixed(3)}</td>
                <td><code>${component.dhash || ''}</code></td>
                <td>${component.quantity || ''}</td>
                <td>${escapeHtml(component.description || '')}</td>
                ${options.includeImages ? `<td class="image-link">${escapeHtml(component.image || '')}</td>` : ''}
            </tr>`;
    }

    html += `
        </tbody>
    </table>
</body>
</html>`;

    const filename = `${outputPath}.html`;
    fs.writeFileSync(filename, html);
    return filename;
}

// HTML escape utility
function escapeHtml(text) {
    const div = { innerHTML: text };
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Main export function
function exportLowConfidenceQueue(inputFile, outputPrefix, options) {
    log('info', `Starting LCM export: ${inputFile}`);
    
    // Read input file
    let library;
    try {
        const data = fs.readFileSync(inputFile, 'utf8');
        library = JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`Input file not found: ${inputFile}`);
        }
        throw new Error(`Failed to read input file: ${error.message}`);
    }
    
    // Validate input
    if (!library || typeof library !== 'object') {
        throw new Error('Invalid library format: expected object');
    }
    
    if (!library.components || !Array.isArray(library.components)) {
        throw new Error('Invalid library format: missing or invalid components array');
    }
    
    // Filter low-confidence components
    const lowConfidenceComponents = filterLowConfidenceComponents(library, options.confidenceThreshold);
    const stats = generateStats(library.components, lowConfidenceComponents, options.confidenceThreshold);
    
    log('info', `Found ${lowConfidenceComponents.length} low-confidence components (threshold: ${options.confidenceThreshold})`);
    
    if (lowConfidenceComponents.length === 0) {
        log('info', 'No low-confidence components found - export completed with empty result');
        return null;
    }
    
    // Export in the requested format
    let exportedFile;
    switch (options.format.toLowerCase()) {
        case 'json':
            exportedFile = exportAsJson(lowConfidenceComponents, stats, outputPrefix, options);
            break;
        case 'csv':
            exportedFile = exportAsCsv(lowConfidenceComponents, stats, outputPrefix, options);
            break;
        case 'html':
            exportedFile = exportAsHtml(lowConfidenceComponents, stats, outputPrefix, options);
            break;
        default:
            throw new Error(`Unsupported export format: ${options.format}`);
    }
    
    log('info', `Export completed: ${exportedFile}`);
    log('info', `  Format: ${options.format}`);
    log('info', `  Components exported: ${lowConfidenceComponents.length}`);
    log('info', `  Average confidence: ${stats.average_confidence_low}`);
    
    return exportedFile;
}

// Main execution
function main() {
    try {
        const options = parseArgs();
        
        if (options.verbose) {
            log('verbose', 'Export options:', options);
            log('verbose', JSON.stringify(options, null, 2), options);
        }
        
        const exportedFile = exportLowConfidenceQueue(options.input, options.output, options);
        
        if (exportedFile) {
            log('info', `LCM export process completed successfully: ${exportedFile}`);
        } else {
            log('info', 'LCM export process completed (no low-confidence components found)');
        }
        
        process.exit(0);
        
    } catch (error) {
        log('error', `LCM export failed: ${error.message}`);
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    log('error', `Uncaught exception: ${error.message}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log('error', `Unhandled rejection: ${reason}`);
    process.exit(1);
});

// Run main function
if (require.main === module) {
    main();
}

module.exports = { exportLowConfidenceQueue, filterLowConfidenceComponents, generateStats };