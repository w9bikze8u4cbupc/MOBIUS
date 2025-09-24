#!/usr/bin/env node

/**
 * MOBIUS Dhash Migration Rollback Script
 * Rolls back from dhash-based library to previous version
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration
const DEFAULT_INPUT = 'library.json';
const BACKUP_PATTERN = 'library.json.backup.*';

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        input: DEFAULT_INPUT,
        force: false,
        verbose: false,
        backupFile: null
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-i':
            case '--input':
                options.input = args[++i];
                break;
            case '--backup':
                options.backupFile = args[++i];
                break;
            case '--force':
                options.force = true;
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
Usage: node migrate-rollback.js [OPTIONS]

Options:
    -i, --input FILE      Input library file to rollback (default: ${DEFAULT_INPUT})
    --backup FILE         Specific backup file to restore from
    --force               Force rollback without confirmation
    -v, --verbose         Enable verbose logging
    -h, --help            Show this help message

Examples:
    node migrate-rollback.js -i library.json
    node migrate-rollback.js --backup library.json.backup.2024-01-15T10-30-00-000Z
    node migrate-rollback.js --force -i library.json
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

// Find available backup files
function findBackupFiles(inputFile) {
    const basePattern = `${inputFile}.backup.*`;
    try {
        const matches = glob.sync(basePattern);
        return matches.sort().reverse(); // Most recent first
    } catch (error) {
        log('error', `Error searching for backup files: ${error.message}`);
        return [];
    }
}

// Validate backup file
function validateBackupFile(backupFile) {
    if (!fs.existsSync(backupFile)) {
        throw new Error(`Backup file not found: ${backupFile}`);
    }
    
    try {
        const data = fs.readFileSync(backupFile, 'utf8');
        const library = JSON.parse(data);
        
        if (!library || typeof library !== 'object') {
            throw new Error('Invalid backup file format: expected object');
        }
        
        if (!library.components || !Array.isArray(library.components)) {
            throw new Error('Invalid backup file format: missing or invalid components array');
        }
        
        return library;
    } catch (error) {
        if (error instanceof SyntaxError) {
            throw new Error(`Backup file contains invalid JSON: ${error.message}`);
        }
        throw error;
    }
}

// Prompt for user confirmation
function promptConfirmation(message) {
    return new Promise((resolve) => {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        
        rl.question(`${message} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

// Compare library versions to detect changes
function compareLibraries(current, backup) {
    const comparison = {
        componentCountChange: current.components.length - backup.components.length,
        hasMigrationMetadata: !!(current.metadata && current.metadata.migration),
        hasdhashFields: current.components.some(comp => comp.dhash),
        changes: []
    };
    
    if (comparison.hasMigrationMetadata) {
        comparison.changes.push('Contains migration metadata');
    }
    
    if (comparison.hasdhashFields) {
        comparison.changes.push('Contains dhash fields');
    }
    
    if (comparison.componentCountChange !== 0) {
        comparison.changes.push(`Component count changed by ${comparison.componentCountChange}`);
    }
    
    return comparison;
}

// Create rollback checkpoint
function createRollbackCheckpoint(inputFile) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const checkpointFile = `${inputFile}.rollback-checkpoint.${timestamp}`;
    
    try {
        fs.copyFileSync(inputFile, checkpointFile);
        log('info', `Rollback checkpoint created: ${checkpointFile}`);
        return checkpointFile;
    } catch (error) {
        log('warning', `Failed to create rollback checkpoint: ${error.message}`);
        return null;
    }
}

// Perform the rollback
async function performRollback(inputFile, backupFile, options) {
    log('info', `Starting rollback process: ${inputFile} <- ${backupFile}`);
    
    // Validate backup file
    const backupLibrary = validateBackupFile(backupFile);
    log('info', `Validated backup file with ${backupLibrary.components.length} components`);
    
    // Read current file for comparison
    let currentLibrary = null;
    if (fs.existsSync(inputFile)) {
        try {
            const data = fs.readFileSync(inputFile, 'utf8');
            currentLibrary = JSON.parse(data);
            
            // Compare versions
            const comparison = compareLibraries(currentLibrary, backupLibrary);
            
            log('info', 'Rollback analysis:');
            log('info', `  Current components: ${currentLibrary.components.length}`);
            log('info', `  Backup components: ${backupLibrary.components.length}`);
            log('info', `  Changes detected: ${comparison.changes.length > 0 ? comparison.changes.join(', ') : 'None'}`);
            
            if (comparison.changes.length === 0 && !options.force) {
                log('warning', 'No significant changes detected between current and backup versions');
                
                if (!await promptConfirmation('Continue with rollback anyway?')) {
                    log('info', 'Rollback cancelled by user');
                    return;
                }
            }
            
        } catch (error) {
            log('warning', `Could not read current file for comparison: ${error.message}`);
        }
    }
    
    // Confirm rollback
    if (!options.force) {
        const confirmed = await promptConfirmation(
            `This will replace ${inputFile} with ${backupFile}. Continue?`
        );
        
        if (!confirmed) {
            log('info', 'Rollback cancelled by user');
            return;
        }
    }
    
    // Create checkpoint of current state
    if (currentLibrary) {
        createRollbackCheckpoint(inputFile);
    }
    
    // Perform the rollback
    try {
        fs.copyFileSync(backupFile, inputFile);
        log('info', `Rollback completed successfully: ${inputFile} restored from ${backupFile}`);
        
        // Log summary
        log('info', `Restored library with ${backupLibrary.components.length} components`);
        
        if (backupLibrary.metadata && backupLibrary.metadata.created_at) {
            log('info', `Restored to library version from: ${backupLibrary.metadata.created_at}`);
        }
        
    } catch (error) {
        throw new Error(`Rollback failed: ${error.message}`);
    }
}

// Main execution
async function main() {
    try {
        const options = parseArgs();
        
        if (options.verbose) {
            log('verbose', 'Rollback options:', options);
            log('verbose', JSON.stringify(options, null, 2), options);
        }
        
        let backupFile = options.backupFile;
        
        // If no specific backup file specified, find the most recent one
        if (!backupFile) {
            const availableBackups = findBackupFiles(options.input);
            
            if (availableBackups.length === 0) {
                throw new Error(`No backup files found for ${options.input}`);
            }
            
            backupFile = availableBackups[0]; // Most recent
            log('info', `Using most recent backup: ${backupFile}`);
            
            if (availableBackups.length > 1) {
                log('info', `Other available backups: ${availableBackups.slice(1).join(', ')}`);
            }
        }
        
        await performRollback(options.input, backupFile, options);
        
        log('info', 'Rollback process completed successfully');
        process.exit(0);
        
    } catch (error) {
        log('error', `Rollback failed: ${error.message}`);
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

module.exports = { performRollback, findBackupFiles, validateBackupFile };