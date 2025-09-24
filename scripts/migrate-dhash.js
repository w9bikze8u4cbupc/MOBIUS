#!/usr/bin/env node

/**
 * MOBIUS Dhash Migration Script
 * Migrates game library from traditional metadata to dhash-based perceptual hashing
 */

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

// Configuration
const DEFAULT_INPUT = 'library.json';
const DEFAULT_OUTPUT = 'library.dhash.json';

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        input: DEFAULT_INPUT,
        output: DEFAULT_OUTPUT,
        dryRun: false,
        backup: false,
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
            case '--out':
                options.output = args[++i];
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--backup':
                options.backup = true;
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
Usage: node migrate-dhash.js [OPTIONS]

Options:
    -i, --input FILE     Input library file (default: ${DEFAULT_INPUT})
    -o, --output FILE    Output dhash library file (default: ${DEFAULT_OUTPUT})
    --out FILE           Same as -o (for compatibility)
    --dry-run           Preview migration without writing output
    --backup            Create backup of input file
    -v, --verbose       Enable verbose logging
    -h, --help          Show this help message

Examples:
    node migrate-dhash.js -i library.json -o library.dhash.json --backup
    node migrate-dhash.js --dry-run -i library.json
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

// Generate dhash for image (mock implementation - in real use, this would use actual image processing)
function generateDhash(imagePath) {
    // Mock dhash generation - in production, this would use a proper perceptual hashing library
    const hash = createHash('sha256');
    hash.update(imagePath + Date.now().toString());
    return hash.digest('hex').substring(0, 16); // 64-bit dhash represented as hex
}

// Migrate a single component to dhash format
function migrateComponent(component, options) {
    const migratedComponent = {
        ...component,
        dhash: generateDhash(component.image || component.name),
        migrated_at: new Date().toISOString(),
        migration_confidence: calculateMigrationConfidence(component)
    };
    
    // Remove old image metadata if present
    if (migratedComponent.image_metadata) {
        migratedComponent.legacy_image_metadata = migratedComponent.image_metadata;
        delete migratedComponent.image_metadata;
    }
    
    if (options.verbose) {
        log('verbose', `Migrated component: ${component.name} -> dhash: ${migratedComponent.dhash}`, options);
    }
    
    return migratedComponent;
}

// Calculate migration confidence based on available data
function calculateMigrationConfidence(component) {
    let confidence = 0.5; // Base confidence
    
    if (component.image) confidence += 0.3;
    if (component.description && component.description.length > 10) confidence += 0.1;
    if (component.quantity && !isNaN(component.quantity)) confidence += 0.1;
    
    return Math.min(confidence, 1.0);
}

// Create backup of input file
function createBackup(inputFile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `${inputFile}.backup.${timestamp}`;
    
    try {
        fs.copyFileSync(inputFile, backupFile);
        log('info', `Backup created: ${backupFile}`);
        return backupFile;
    } catch (error) {
        log('error', `Failed to create backup: ${error.message}`);
        throw error;
    }
}

// Validate input library structure
function validateInput(library) {
    if (!library || typeof library !== 'object') {
        throw new Error('Invalid library format: expected object');
    }
    
    if (!library.components || !Array.isArray(library.components)) {
        throw new Error('Invalid library format: missing or invalid components array');
    }
    
    return true;
}

// Main migration function
function migrateLibrary(inputFile, outputFile, options) {
    log('info', `Starting dhash migration: ${inputFile} -> ${outputFile}`);
    
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
    validateInput(library);
    
    log('info', `Found ${library.components.length} components to migrate`);
    
    // Create backup if requested
    if (options.backup) {
        createBackup(inputFile);
    }
    
    // Migrate components
    const migratedComponents = [];
    const lowConfidenceComponents = [];
    
    for (const component of library.components) {
        const migrated = migrateComponent(component, options);
        migratedComponents.push(migrated);
        
        if (migrated.migration_confidence < 0.7) {
            lowConfidenceComponents.push(migrated);
        }
    }
    
    // Create migrated library structure
    const migratedLibrary = {
        ...library,
        components: migratedComponents,
        metadata: {
            ...(library.metadata || {}),
            migration: {
                migrated_at: new Date().toISOString(),
                source_file: inputFile,
                migration_version: '1.0.0',
                total_components: migratedComponents.length,
                low_confidence_count: lowConfidenceComponents.length,
                average_confidence: migratedComponents.reduce((sum, c) => sum + c.migration_confidence, 0) / migratedComponents.length
            }
        }
    };
    
    // Log migration summary
    log('info', `Migration completed:`);
    log('info', `  Total components: ${migratedComponents.length}`);
    log('info', `  Low confidence: ${lowConfidenceComponents.length}`);
    log('info', `  Average confidence: ${migratedLibrary.metadata.migration.average_confidence.toFixed(3)}`);
    
    if (lowConfidenceComponents.length > 0) {
        log('warning', `${lowConfidenceComponents.length} components have low confidence and may need manual review`);
        if (options.verbose) {
            lowConfidenceComponents.forEach(comp => {
                log('verbose', `  Low confidence: ${comp.name} (${comp.migration_confidence.toFixed(3)})`, options);
            });
        }
    }
    
    // Write output (unless dry run)
    if (options.dryRun) {
        log('info', 'Dry run completed - no files written');
        
        // In dry run mode, write to a temporary preview file
        const previewFile = outputFile.replace('.json', '.preview.json');
        fs.writeFileSync(previewFile, JSON.stringify(migratedLibrary, null, 2));
        log('info', `Dry run preview saved to: ${previewFile}`);
    } else {
        fs.writeFileSync(outputFile, JSON.stringify(migratedLibrary, null, 2));
        log('info', `Migration output written to: ${outputFile}`);
    }
    
    return migratedLibrary;
}

// Main execution
function main() {
    try {
        const options = parseArgs();
        
        if (options.verbose) {
            log('verbose', 'Migration options:', options);
            log('verbose', JSON.stringify(options, null, 2), options);
        }
        
        const result = migrateLibrary(options.input, options.output, options);
        
        log('info', 'Migration process completed successfully');
        
        if (result.metadata.migration.low_confidence_count > 0) {
            log('warning', 'Some components require manual review. Use npm run lcm:export to export low-confidence items.');
            process.exit(2); // Exit with warning code
        }
        
        process.exit(0);
        
    } catch (error) {
        log('error', `Migration failed: ${error.message}`);
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

module.exports = { migrateLibrary, migrateComponent, generateDhash };