#!/usr/bin/env node

/**
 * deploy-notify.js - CI-friendly deployment notification wrapper
 * 
 * Automatically generates deployment data and calls notify.js with cleanup.
 * Supports start, success, and failure phases with automatic payload generation.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Import notify.js components
const notifyModule = require('./notify.js');

// Default configuration
const DEFAULT_CONFIG = {
  tempFile: null, // Will be generated
  templateDir: 'templates/notifications',
  outputDir: 'notifications_out'
};

class DeployNotifyError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.name = 'DeployNotifyError';
    this.code = code;
  }
}

/**
 * Parse command line arguments for deploy-notify
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  const options = {
    phase: null,
    services: null, // Will use notify.js default
    data: {},
    webhookUrl: null,
    dryRun: false,
    help: false,
    duration: null,
    environment: null,
    release: null,
    pullRequest: null,
    lead: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--services':
        if (!next) throw new DeployNotifyError('--services requires a value');
        options.services = next;
        i++;
        break;
      case '--template-dir':
        if (!next) throw new DeployNotifyError('--template-dir requires a path');
        config.templateDir = next;
        i++;
        break;
      case '--output-dir':
        if (!next) throw new DeployNotifyError('--output-dir requires a path');
        config.outputDir = next;
        i++;
        break;
      case '--webhook-url':
        if (!next) throw new DeployNotifyError('--webhook-url requires a URL');
        options.webhookUrl = next;
        i++;
        break;
      case '--data-file':
        if (!next) throw new DeployNotifyError('--data-file requires a path');
        options.dataFile = next;
        i++;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--duration':
        if (!next) throw new DeployNotifyError('--duration requires a value');
        options.duration = next;
        i++;
        break;
      case '--environment':
      case '--env':
        if (!next) throw new DeployNotifyError('--environment requires a value');
        options.environment = next;
        i++;
        break;
      case '--release':
        if (!next) throw new DeployNotifyError('--release requires a value');
        options.release = next;
        i++;
        break;
      case '--pull-request':
      case '--pr':
        if (!next) throw new DeployNotifyError('--pull-request requires a value');
        options.pullRequest = next;
        i++;
        break;
      case '--lead':
        if (!next) throw new DeployNotifyError('--lead requires a value');
        options.lead = next;
        i++;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new DeployNotifyError(`Unknown option: ${arg}`);
        }
        // Assume it's the phase
        if (!options.phase) {
          options.phase = arg;
        } else {
          throw new DeployNotifyError(`Unexpected argument: ${arg}`);
        }
    }
  }

  return { config, options };
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
deploy-notify.js - CI-friendly deployment notification wrapper

USAGE:
  node deploy-notify.js <phase> [options]

PHASES:
  start     - Deployment started
  success   - Deployment completed successfully  
  failure   - Deployment failed

OPTIONS:
  --services LIST       Comma-separated services: slack,teams,email
  --template-dir PATH   Directory containing templates
  --output-dir PATH     Directory for email output files
  --webhook-url URL     Override webhook URL for all services
  --data-file PATH      Additional JSON data file to merge
  --dry-run             Show what would be sent without making calls
  --duration TIME       Deployment duration (e.g., "5m 30s", "2h 15m")
  --environment ENV     Target environment (e.g., "production", "staging")
  --release VERSION     Release version (e.g., "v1.0.0", "1.2.3-rc1")
  --pull-request ID     Pull request number or URL
  --lead NAME           Deployment lead/person responsible
  --help, -h            Show this help

EXAMPLES:
  # Start notification with auto-generated data
  node deploy-notify.js start --environment production --release v1.2.0

  # Success notification with duration
  node deploy-notify.js success --duration "3m 45s" --lead "John Doe"

  # Failure notification (dry run)
  node deploy-notify.js failure --dry-run

  # Use custom data file
  node deploy-notify.js start --data-file custom-deploy.json

AUTOMATIC DATA GENERATION:
  The wrapper automatically generates common deployment data:
  - timestamp: Current ISO timestamp
  - environment: From --environment or CI environment variables
  - release: From --release or git/CI environment variables  
  - pullRequest: From --pull-request or CI environment variables
  - lead: From --lead or git/CI environment variables
  - duration: From --duration (for success/failure phases)
  - repository: From git remote or CI environment variables

EXIT CODES:
  0  Success
  1  Usage/configuration error
  2  Notification send failure
`);
}

/**
 * Generate automatic deployment data
 */
function generateDeploymentData(options) {
  const data = {
    timestamp: new Date().toISOString(),
    phase: options.phase
  };

  // Environment detection
  data.environment = options.environment || 
    process.env.DEPLOY_ENV ||
    process.env.NODE_ENV ||
    process.env.ENVIRONMENT ||
    process.env.CI_ENVIRONMENT_NAME ||
    process.env.GITHUB_REF_NAME ||
    'unknown';

  // Release/version detection
  data.release = options.release ||
    process.env.RELEASE_VERSION ||
    process.env.CI_COMMIT_TAG ||
    process.env.GITHUB_REF_NAME ||
    process.env.CI_COMMIT_SHA?.substring(0, 8) ||
    'unknown';

  // Pull request detection
  data.pullRequest = options.pullRequest ||
    process.env.CI_MERGE_REQUEST_IID ||
    process.env.GITHUB_PR_NUMBER ||
    process.env.PULL_REQUEST_ID ||
    null;

  // Lead/author detection
  data.lead = options.lead ||
    process.env.DEPLOY_LEAD ||
    process.env.CI_COMMIT_AUTHOR ||
    process.env.GITHUB_ACTOR ||
    process.env.USER ||
    process.env.USERNAME ||
    'Unknown';

  // Duration (for success/failure)
  if (options.duration) {
    data.duration = options.duration;
  }

  // Repository information
  try {
    const { execSync } = require('child_process');
    
    // Get repository name
    try {
      const remote = execSync('git remote get-url origin', { encoding: 'utf8', timeout: 5000 }).trim();
      const match = remote.match(/([^\/]+)\.git$/) || remote.match(/([^\/]+)$/);
      data.repository = match ? match[1] : 'unknown';
    } catch {
      data.repository = process.env.CI_PROJECT_NAME || 
        process.env.GITHUB_REPOSITORY?.split('/')[1] ||
        'unknown';
    }

    // Get current branch
    try {
      data.branch = execSync('git branch --show-current', { encoding: 'utf8', timeout: 5000 }).trim() ||
        process.env.CI_COMMIT_REF_NAME ||
        process.env.GITHUB_REF_NAME ||
        'unknown';
    } catch {
      data.branch = process.env.CI_COMMIT_REF_NAME ||
        process.env.GITHUB_REF_NAME ||
        'unknown';
    }

    // Get commit hash
    try {
      data.commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8', timeout: 5000 }).trim().substring(0, 8);
    } catch {
      data.commitHash = process.env.CI_COMMIT_SHA?.substring(0, 8) ||
        process.env.GITHUB_SHA?.substring(0, 8) ||
        'unknown';
    }

  } catch (error) {
    // Fallback to environment variables if git commands fail
    data.repository = process.env.CI_PROJECT_NAME || 
      process.env.GITHUB_REPOSITORY?.split('/')[1] ||
      'unknown';
    data.branch = process.env.CI_COMMIT_REF_NAME ||
      process.env.GITHUB_REF_NAME ||
      'unknown';
    data.commitHash = process.env.CI_COMMIT_SHA?.substring(0, 8) ||
      process.env.GITHUB_SHA?.substring(0, 8) ||
      'unknown';
  }

  // Format timestamp for display
  data.timestampFormatted = new Date(data.timestamp).toLocaleString();

  return data;
}

/**
 * Merge additional data from file if provided
 */
function mergeAdditionalData(baseData, options) {
  if (!options.dataFile) {
    return baseData;
  }

  if (!fs.existsSync(options.dataFile)) {
    console.warn(`Warning: Data file not found: ${options.dataFile}`);
    return baseData;
  }

  try {
    const additionalData = JSON.parse(fs.readFileSync(options.dataFile, 'utf8'));
    return { ...baseData, ...additionalData };
  } catch (error) {
    console.warn(`Warning: Could not parse data file ${options.dataFile}: ${error.message}`);
    return baseData;
  }
}

/**
 * Create temporary data file
 */
function createTempDataFile(data) {
  const tempDir = process.env.TMPDIR || process.env.TEMP || '/tmp';
  const tempFile = path.join(tempDir, `deploy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`);
  
  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf8');
  return tempFile;
}

/**
 * Call notify.js with generated data
 */
async function callNotify(config, options, dataFile) {
  const args = [
    path.join(__dirname, 'notify.js'),
    options.phase,
    '--data-file', dataFile
  ];

  // Add optional arguments
  if (options.services) {
    args.push('--services', options.services);
  }
  if (options.webhookUrl) {
    args.push('--webhook-url', options.webhookUrl);
  }
  if (config.templateDir !== DEFAULT_CONFIG.templateDir) {
    args.push('--template-dir', config.templateDir);
  }
  if (config.outputDir !== DEFAULT_CONFIG.outputDir) {
    args.push('--output-dir', config.outputDir);
  }
  if (options.dryRun) {
    args.push('--dry-run');
  }

  return new Promise((resolve, reject) => {
    const child = spawn('node', args, {
      stdio: 'inherit',
      env: process.env
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(new DeployNotifyError(`notify.js exited with code ${code}`, code));
      }
    });

    child.on('error', (error) => {
      reject(new DeployNotifyError(`Failed to start notify.js: ${error.message}`, 1));
    });
  });
}

/**
 * Clean up temporary file
 */
function cleanup(tempFile) {
  if (tempFile && fs.existsSync(tempFile)) {
    try {
      fs.unlinkSync(tempFile);
    } catch (error) {
      console.warn(`Warning: Could not remove temp file ${tempFile}: ${error.message}`);
    }
  }
}

/**
 * Main entry point
 */
async function main() {
  let tempFile = null;

  try {
    const { config, options } = parseArgs();

    if (options.help) {
      showHelp();
      process.exit(0);
    }

    if (!options.phase) {
      throw new DeployNotifyError('Phase is required (start|success|failure)');
    }

    const validPhases = ['start', 'success', 'failure'];
    if (!validPhases.includes(options.phase)) {
      throw new DeployNotifyError(`Invalid phase: ${options.phase}. Valid phases: ${validPhases.join(', ')}`);
    }

    // Generate deployment data
    console.log(`🚀 Preparing ${options.phase} deployment notification...`);
    const baseData = generateDeploymentData(options);
    const finalData = mergeAdditionalData(baseData, options);

    // Create temporary data file
    tempFile = createTempDataFile(finalData);
    config.tempFile = tempFile;

    console.log(`📋 Generated deployment data:`);
    console.log(`   Environment: ${finalData.environment}`);
    console.log(`   Release: ${finalData.release}`);
    console.log(`   Repository: ${finalData.repository}`);
    console.log(`   Branch: ${finalData.branch}`);
    console.log(`   Commit: ${finalData.commitHash}`);
    console.log(`   Lead: ${finalData.lead}`);
    if (finalData.duration) {
      console.log(`   Duration: ${finalData.duration}`);
    }
    console.log(`   Timestamp: ${finalData.timestampFormatted}`);

    // Call notify.js
    await callNotify(config, options, tempFile);

    console.log(`✅ Deployment notification completed successfully`);

  } catch (error) {
    if (error instanceof DeployNotifyError) {
      console.error(`Error: ${error.message}`);
      process.exit(error.code);
    } else {
      console.error(`Unexpected error: ${error.message}`);
      console.error(error.stack);
      process.exit(1);
    }
  } finally {
    // Always clean up temp file
    cleanup(tempFile);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  main,
  generateDeploymentData,
  parseArgs,
  DeployNotifyError
};