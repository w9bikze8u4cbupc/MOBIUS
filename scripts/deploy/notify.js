#!/usr/bin/env node

/**
 * notify.js - Zero-dependency Node.js notification CLI
 * 
 * Sends deployment notifications to Slack, Teams, and Email with retry logic.
 * Supports template-driven notifications with variable substitution.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_USAGE_ERROR = 1;
const EXIT_SEND_FAILURE = 2;

// Default configuration
const DEFAULT_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  jitterFactor: 0.1,
  timeout: 10000, // 10 seconds
  templateDir: 'templates/notifications',
  outputDir: 'notifications_out'
};

class NotificationError extends Error {
  constructor(message, code = EXIT_SEND_FAILURE) {
    super(message);
    this.name = 'NotificationError';
    this.code = code;
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };
  const options = {
    services: ['slack', 'teams', 'email'],
    data: null,
    dataFile: null,
    webhookUrl: null,
    dryRun: false,
    help: false
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
        if (!next) throw new NotificationError('--services requires a value', EXIT_USAGE_ERROR);
        options.services = next.split(',').map(s => s.trim().toLowerCase());
        i++;
        break;
      case '--data':
        if (!next) throw new NotificationError('--data requires a JSON value', EXIT_USAGE_ERROR);
        try {
          options.data = JSON.parse(next);
        } catch (err) {
          throw new NotificationError('Invalid JSON in --data', EXIT_USAGE_ERROR);
        }
        i++;
        break;
      case '--data-file':
        if (!next) throw new NotificationError('--data-file requires a path', EXIT_USAGE_ERROR);
        options.dataFile = next;
        i++;
        break;
      case '--template-dir':
        if (!next) throw new NotificationError('--template-dir requires a path', EXIT_USAGE_ERROR);
        config.templateDir = next;
        i++;
        break;
      case '--webhook-url':
        if (!next) throw new NotificationError('--webhook-url requires a URL', EXIT_USAGE_ERROR);
        options.webhookUrl = next;
        i++;
        break;
      case '--output-dir':
        if (!next) throw new NotificationError('--output-dir requires a path', EXIT_USAGE_ERROR);
        config.outputDir = next;
        i++;
        break;
      case '--retries':
        if (!next) throw new NotificationError('--retries requires a number', EXIT_USAGE_ERROR);
        config.maxRetries = parseInt(next, 10);
        if (isNaN(config.maxRetries) || config.maxRetries < 0) {
          throw new NotificationError('--retries must be a non-negative number', EXIT_USAGE_ERROR);
        }
        i++;
        break;
      case '--timeout':
        if (!next) throw new NotificationError('--timeout requires a number in ms', EXIT_USAGE_ERROR);
        config.timeout = parseInt(next, 10);
        if (isNaN(config.timeout) || config.timeout < 0) {
          throw new NotificationError('--timeout must be a non-negative number', EXIT_USAGE_ERROR);
        }
        i++;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new NotificationError(`Unknown option: ${arg}`, EXIT_USAGE_ERROR);
        }
        // Assume it's a positional argument (phase)
        if (!options.phase) {
          options.phase = arg;
        }
    }
  }

  // Validate services
  const validServices = ['slack', 'teams', 'email'];
  for (const service of options.services) {
    if (!validServices.includes(service)) {
      throw new NotificationError(`Invalid service: ${service}. Valid services: ${validServices.join(', ')}`, EXIT_USAGE_ERROR);
    }
  }

  return { config, options };
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
notify.js - Zero-dependency deployment notification CLI

USAGE:
  node notify.js [phase] [options]

ARGUMENTS:
  phase                 Deployment phase (start|success|failure)

OPTIONS:
  --services LIST       Comma-separated services: slack,teams,email (default: all)
  --data JSON          JSON data for template substitution
  --data-file PATH     File containing JSON data for template substitution
  --template-dir PATH  Directory containing templates (default: templates/notifications)
  --webhook-url URL    Override webhook URL for all services
  --output-dir PATH    Directory for email output files (default: notifications_out)
  --retries N          Maximum retry attempts (default: 3)
  --timeout MS         Request timeout in milliseconds (default: 10000)
  --dry-run            Show what would be sent without making network calls
  --help, -h           Show this help

EXAMPLES:
  # Dry run with all services
  node notify.js start --dry-run --data '{"release":"v1.0.0","env":"prod"}'

  # Send to Slack only
  node notify.js success --services slack --data-file deploy.json

  # Email notification only
  node notify.js failure --services email --data '{"error":"Build failed"}'

EXIT CODES:
  0  Success
  1  Usage/template error  
  2  Send failure

TEMPLATES:
  Templates are loaded from the template directory with naming convention:
  - {service}_deploy_{phase}.json for Slack/Teams
  - {service}_deploy_{phase}.txt for Email
  
  Template variables use {{variable}} syntax for substitution.
`);
}

/**
 * Load JSON data from file or direct input
 */
function loadData(options) {
  if (options.dataFile) {
    if (!fs.existsSync(options.dataFile)) {
      throw new NotificationError(`Data file not found: ${options.dataFile}`, EXIT_USAGE_ERROR);
    }
    try {
      const content = fs.readFileSync(options.dataFile, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      throw new NotificationError(`Invalid JSON in data file: ${err.message}`, EXIT_USAGE_ERROR);
    }
  }
  return options.data || {};
}

/**
 * Load and process template
 */
function loadTemplate(config, service, phase, data) {
  const extension = (service === 'email') ? 'txt' : 'json';
  const templatePath = path.join(config.templateDir, `${service}_deploy_${phase}.${extension}`);
  
  if (!fs.existsSync(templatePath)) {
    throw new NotificationError(`Template not found: ${templatePath}`, EXIT_USAGE_ERROR);
  }

  let template = fs.readFileSync(templatePath, 'utf8');
  
  // Perform variable substitution
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    template = template.replace(regex, String(value));
  }

  // Parse JSON for Slack/Teams
  if (extension === 'json') {
    try {
      return JSON.parse(template);
    } catch (err) {
      throw new NotificationError(`Invalid JSON in template after substitution: ${templatePath}`, EXIT_USAGE_ERROR);
    }
  }

  return template;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt, config) {
  const exponentialDelay = config.baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * config.jitterFactor * exponentialDelay;
  return Math.min(exponentialDelay + jitter, config.maxDelay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send HTTP request with retry logic
 */
async function sendWebhookRequest(url, payload, config, attempt = 0) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const postData = JSON.stringify(payload);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': 'notify.js/1.0'
      },
      timeout: config.timeout
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data, headers: res.headers });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Send notification with retry logic
 */
async function sendNotificationWithRetry(service, url, payload, config) {
  let lastError;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const result = await sendWebhookRequest(url, payload, config, attempt);
      return result;
    } catch (error) {
      lastError = error;
      
      if (attempt < config.maxRetries - 1) {
        const delay = calculateDelay(attempt, config);
        console.warn(`[${service}] Attempt ${attempt + 1} failed: ${error.message}. Retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new NotificationError(`[${service}] All ${config.maxRetries} attempts failed. Last error: ${lastError.message}`);
}

/**
 * Send email notification (write to file)
 */
async function sendEmailNotification(content, phase, config, data) {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `email_deploy_${phase}_${timestamp}.txt`;
  const filepath = path.join(config.outputDir, filename);

  // Add metadata header
  const metadata = [
    `Deployment Notification - ${phase.toUpperCase()}`,
    `Generated: ${new Date().toISOString()}`,
    `Phase: ${phase}`,
    `Data: ${JSON.stringify(data)}`,
    ''.padEnd(50, '='),
    ''
  ].join('\n');

  const fullContent = metadata + content;
  fs.writeFileSync(filepath, fullContent, 'utf8');
  
  console.log(`[email] Notification written to: ${filepath}`);
  return { status: 'written', file: filepath };
}

/**
 * Get webhook URL for service
 */
function getWebhookUrl(service, options) {
  if (options.webhookUrl) {
    return options.webhookUrl;
  }

  const envVar = service === 'slack' ? 'SLACK_WEBHOOK' : 'TEAMS_WEBHOOK';
  const url = process.env[envVar];
  
  if (!url) {
    throw new NotificationError(`No webhook URL found. Set ${envVar} environment variable or use --webhook-url`, EXIT_USAGE_ERROR);
  }

  return url;
}

/**
 * Main notification function
 */
async function sendNotifications(config, options) {
  const data = loadData(options);
  const results = [];

  for (const service of options.services) {
    try {
      const content = loadTemplate(config, service, options.phase, data);

      if (options.dryRun) {
        console.log(`[${service}] DRY RUN - Would send:`);
        if (typeof content === 'object') {
          console.log(JSON.stringify(content, null, 2));
        } else {
          console.log(content);
        }
        console.log(''); // Empty line for readability
        results.push({ service, status: 'dry-run', content });
        continue;
      }

      if (service === 'email') {
        const result = await sendEmailNotification(content, options.phase, config, data);
        results.push({ service, ...result });
      } else {
        const url = getWebhookUrl(service, options);
        const result = await sendNotificationWithRetry(service, url, content, config);
        console.log(`[${service}] Notification sent successfully (HTTP ${result.status})`);
        results.push({ service, status: 'sent', httpStatus: result.status });
      }
    } catch (error) {
      console.error(`[${service}] Failed: ${error.message}`);
      results.push({ service, status: 'failed', error: error.message });
      
      if (error instanceof NotificationError && error.code === EXIT_USAGE_ERROR) {
        throw error; // Re-throw usage errors immediately
      }
    }
  }

  return results;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const { config, options } = parseArgs();

    if (options.help) {
      showHelp();
      process.exit(EXIT_SUCCESS);
    }

    if (!options.phase) {
      throw new NotificationError('Phase is required (start|success|failure)', EXIT_USAGE_ERROR);
    }

    const validPhases = ['start', 'success', 'failure'];
    if (!validPhases.includes(options.phase)) {
      throw new NotificationError(`Invalid phase: ${options.phase}. Valid phases: ${validPhases.join(', ')}`, EXIT_USAGE_ERROR);
    }

    console.log(`Sending ${options.phase} notifications to: ${options.services.join(', ')}`);
    
    const results = await sendNotifications(config, options);
    
    // Check for failures
    const failures = results.filter(r => r.status === 'failed');
    if (failures.length > 0) {
      console.error(`\n${failures.length} notification(s) failed:`);
      failures.forEach(f => console.error(`  - ${f.service}: ${f.error}`));
      process.exit(EXIT_SEND_FAILURE);
    }

    console.log(`\n✅ All notifications completed successfully`);
    process.exit(EXIT_SUCCESS);

  } catch (error) {
    if (error instanceof NotificationError) {
      console.error(`Error: ${error.message}`);
      process.exit(error.code);
    } else {
      console.error(`Unexpected error: ${error.message}`);
      console.error(error.stack);
      process.exit(EXIT_SEND_FAILURE);
    }
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(EXIT_SEND_FAILURE);
  });
}

module.exports = {
  main,
  sendNotifications,
  loadTemplate,
  parseArgs,
  NotificationError,
  EXIT_SUCCESS,
  EXIT_USAGE_ERROR,
  EXIT_SEND_FAILURE
};