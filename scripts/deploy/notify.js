#!/usr/bin/env node

/**
 * notify.js - Multi-service deployment notification CLI
 * 
 * A single-file, dependency-free Node.js CLI for sending deployment notifications 
 * to Slack, Teams, and email. Supports template-based messaging with {{variable}} 
 * substitution, secure webhook configuration via environment variables, and 
 * flexible data input.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const DEFAULT_TEMPLATE_DIR = 'templates/notifications';
const OUTPUT_DIR = 'notifications_out';
const SUPPORTED_SERVICES = ['slack', 'teams', 'email'];

// Template file extensions by service
const extMap = {
  slack: '.json',
  teams: '.json',
  email: '.txt'
};

// Exit codes
const EXIT_SUCCESS = 0;
const EXIT_FATAL_ERROR = 1;
const EXIT_SEND_FAILED = 2;

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    service: null,
    template: null,
    data: null,
    dataFile: null,
    templateDir: DEFAULT_TEMPLATE_DIR,
    webhookUrl: null,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--service':
        opts.service = args[++i];
        break;
      case '--template':
        opts.template = args[++i];
        break;
      case '--data':
        opts.data = args[++i];
        break;
      case '--data-file':
        opts.dataFile = args[++i];
        break;
      case '--template-dir':
        opts.templateDir = args[++i];
        break;
      case '--webhook-url':
        opts.webhookUrl = args[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        process.exit(EXIT_FATAL_ERROR);
    }
  }

  return opts;
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
notify.js - Deployment Notification CLI

USAGE:
  node scripts/deploy/notify.js --service <services> --template <name> [options]

ARGUMENTS:
  --service <services>     Comma-separated list: slack,teams,email
  --template <name>        Template name (without extension)
  --data <json>            JSON data string for variable substitution
  --data-file <file>       JSON file for variable substitution
  
OPTIONS:
  --template-dir <dir>     Template directory (default: templates/notifications)
  --webhook-url <url>      Override webhook URL for testing
  --dry-run               Test mode - don't send real notifications
  --help, -h              Show this help

ENVIRONMENT VARIABLES:
  SLACK_WEBHOOK           Slack webhook URL
  TEAMS_WEBHOOK           Microsoft Teams webhook URL

EXAMPLES:
  # Dry-run Slack notification
  node scripts/deploy/notify.js --service slack --template slack_deploy_started \\
    --data '{"release":"v1.2.3","pr":123}' --dry-run

  # Multi-service with data file
  SLACK_WEBHOOK="https://hooks.slack.com/..." \\
  TEAMS_WEBHOOK="https://outlook.office.com/webhook/..." \\
  node scripts/deploy/notify.js --service slack,teams --template deploy_started \\
    --data-file ./deploy.json

  # Email output to file
  node scripts/deploy/notify.js --service email --template deploy_started \\
    --data-file ./deploy.json
`);
}

/**
 * Load and parse JSON data from file or string
 */
function loadData(opts) {
  let data = {};

  if (opts.dataFile) {
    if (!fs.existsSync(opts.dataFile)) {
      throw new Error(`Data file not found: ${opts.dataFile}`);
    }
    try {
      const content = fs.readFileSync(opts.dataFile, 'utf8');
      data = JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to parse data file ${opts.dataFile}: ${error.message}`);
    }
  } else if (opts.data) {
    try {
      data = JSON.parse(opts.data);
    } catch (error) {
      throw new Error(`Failed to parse data JSON: ${error.message}`);
    }
  }

  // Add auto-generated timestamp if not provided
  if (!data.timestamp) {
    data.timestamp = new Date().toISOString();
  }

  return data;
}

/**
 * Load template file for a given service and template name
 */
function loadTemplate(templateDir, templateName, service) {
  const ext = extMap[service];
  if (!ext) {
    throw new Error(`Unsupported service: ${service}`);
  }

  const templatePath = path.join(templateDir, `${templateName}${ext}`);
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  return fs.readFileSync(templatePath, 'utf8');
}

/**
 * Substitute {{variable}} placeholders in template with data values
 */
function substituteVariables(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (data.hasOwnProperty(key)) {
      return String(data[key]);
    }
    return match; // Leave unchanged if variable not found
  });
}

/**
 * Validate JSON template structure for Slack/Teams
 */
function validateJsonTemplate(content, service) {
  try {
    const parsed = JSON.parse(content);
    
    // Basic validation - ensure it's an object
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(`${service} template must be a JSON object`);
    }
    
    return parsed;
  } catch (error) {
    throw new Error(`Invalid JSON in ${service} template: ${error.message}`);
  }
}

/**
 * Send HTTP request to webhook
 */
function sendWebhookRequest(url, payload) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const postData = JSON.stringify(payload);
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = httpModule.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Handle notification for a specific service
 */
async function handleService(service, templateContent, data, opts) {
  const processedContent = substituteVariables(templateContent, data);
  
  if (opts.dryRun) {
    console.log(`\n--- DRY RUN: ${service.toUpperCase()} ---`);
    console.log(processedContent);
    console.log(`--- END ${service.toUpperCase()} ---\n`);
    return;
  }

  switch (service) {
    case 'slack': {
      const webhookUrl = opts.webhookUrl || process.env.SLACK_WEBHOOK;
      if (!webhookUrl) {
        throw new Error('Slack webhook URL not configured. Set SLACK_WEBHOOK environment variable or use --webhook-url');
      }
      
      const payload = validateJsonTemplate(processedContent, 'slack');
      await sendWebhookRequest(webhookUrl, payload);
      console.log('✓ Slack notification sent');
      break;
    }
    
    case 'teams': {
      const webhookUrl = opts.webhookUrl || process.env.TEAMS_WEBHOOK;
      if (!webhookUrl) {
        throw new Error('Teams webhook URL not configured. Set TEAMS_WEBHOOK environment variable or use --webhook-url');
      }
      
      const payload = validateJsonTemplate(processedContent, 'teams');
      await sendWebhookRequest(webhookUrl, payload);
      console.log('✓ Teams notification sent');
      break;
    }
    
    case 'email': {
      ensureOutputDir(OUTPUT_DIR);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `email_${timestamp}.txt`;
      const filepath = path.join(OUTPUT_DIR, filename);
      
      fs.writeFileSync(filepath, processedContent, 'utf8');
      console.log(`✓ Email content saved to: ${filepath}`);
      break;
    }
    
    default:
      throw new Error(`Unsupported service: ${service}`);
  }
}

/**
 * Main function
 */
async function main() {
  const opts = parseArgs();
  
  if (opts.help) {
    showHelp();
    process.exit(EXIT_SUCCESS);
  }

  // Validate required arguments
  if (!opts.service) {
    console.error('Error: --service is required');
    showHelp();
    process.exit(EXIT_FATAL_ERROR);
  }
  
  if (!opts.template) {
    console.error('Error: --template is required');
    showHelp();
    process.exit(EXIT_FATAL_ERROR);
  }

  try {
    // Parse services
    const services = opts.service.split(',').map(s => s.trim());
    
    // Validate services
    for (const service of services) {
      if (!SUPPORTED_SERVICES.includes(service)) {
        throw new Error(`Unsupported service: ${service}. Supported: ${SUPPORTED_SERVICES.join(', ')}`);
      }
    }

    // Load data
    const data = loadData(opts);
    
    // Process each service
    const results = [];
    for (const service of services) {
      try {
        const templateContent = loadTemplate(opts.templateDir, opts.template, service);
        await handleService(service, templateContent, data, opts);
        results.push({ service, success: true });
      } catch (error) {
        console.error(`✗ ${service} failed: ${error.message}`);
        results.push({ service, success: false, error: error.message });
      }
    }
    
    // Check if any services failed
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      console.error(`\n${failed.length} service(s) failed to send notifications`);
      process.exit(EXIT_SEND_FAILED);
    } else {
      console.log(`\n✓ All ${results.length} notification(s) completed successfully`);
      process.exit(EXIT_SUCCESS);
    }
    
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(EXIT_FATAL_ERROR);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(`Unexpected error: ${error.message}`);
    process.exit(EXIT_FATAL_ERROR);
  });
}

module.exports = { main, loadData, substituteVariables, validateJsonTemplate };