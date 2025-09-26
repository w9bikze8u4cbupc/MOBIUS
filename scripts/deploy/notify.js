#!/usr/bin/env node

/**
 * notify.js - Multi-service notification CLI for Slack/Teams/email
 * 
 * Zero-dependency Node.js CLI for sending deployment notifications to Slack, Teams, and email.
 * Supports template-based messaging with {{variable}} substitution, secure webhook configuration
 * via environment variables, and flexible data input.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

class NotificationCLI {
  constructor() {
    this.supportedServices = ['slack', 'teams', 'email'];
    this.templateCache = new Map();
  }

  /**
   * Parse command line arguments
   */
  parseArgs() {
    const args = process.argv.slice(2);
    const options = {
      service: null,
      template: null,
      data: null,
      dataFile: null,
      webhookUrl: null,
      dryRun: false,
      help: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const nextArg = args[i + 1];

      switch (arg) {
        case '--service':
        case '-s':
          options.service = nextArg;
          i++;
          break;
        case '--template':
        case '-t':
          options.template = nextArg;
          i++;
          break;
        case '--data':
        case '-d':
          options.data = nextArg;
          i++;
          break;
        case '--data-file':
        case '-f':
          options.dataFile = nextArg;
          i++;
          break;
        case '--webhook-url':
        case '-w':
          options.webhookUrl = nextArg;
          i++;
          break;
        case '--dry-run':
        case '--dry':
          options.dryRun = true;
          break;
        case '--help':
        case '-h':
          options.help = true;
          break;
        default:
          if (arg.startsWith('--service=')) {
            options.service = arg.split('=')[1];
          } else if (arg.startsWith('--template=')) {
            options.template = arg.split('=')[1];
          } else if (arg.startsWith('--data=')) {
            options.data = arg.split('=')[1];
          } else if (arg.startsWith('--data-file=')) {
            options.dataFile = arg.split('=')[1];
          } else if (arg.startsWith('--webhook-url=')) {
            options.webhookUrl = arg.split('=')[1];
          }
          break;
      }
    }

    return options;
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(`
notify.js - Multi-service notification CLI for Slack/Teams/email

Usage: node notify.js [options]

Options:
  -s, --service <service>      Service(s) to send to: slack, teams, email (comma-separated)
  -t, --template <template>    Template name (without extension)
  -d, --data <json>           JSON data for template substitution
  -f, --data-file <file>      File containing JSON data for template substitution
  -w, --webhook-url <url>     Override webhook URL (for testing)
      --dry-run               Test mode - don't send actual notifications
  -h, --help                  Show this help

Environment Variables:
  SLACK_WEBHOOK               Slack webhook URL
  TEAMS_WEBHOOK               Microsoft Teams webhook URL

Examples:
  # Dry-run Slack notification
  node notify.js --service slack --template slack_deploy_started --data '{"release":"v1.2.3","pr":123}' --dry-run

  # Multi-service with data file
  SLACK_WEBHOOK="https://hooks.slack.com/..." \\
  TEAMS_WEBHOOK="https://outlook.office.com/webhook/..." \\
  node notify.js --service slack,teams --template deploy_started --data-file ./deploy.json

  # Email output to file
  node notify.js --service email --template deploy_started --data-file ./deploy.json

Templates should be placed in templates/notifications/ with extensions:
  - .json for Slack and Teams
  - .txt for email
`);
  }

  /**
   * Load template file
   */
  loadTemplate(templateName, service) {
    const cacheKey = `${templateName}_${service}`;
    
    if (this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey);
    }

    let extension;
    switch (service) {
      case 'slack':
      case 'teams':
        extension = '.json';
        break;
      case 'email':
        extension = '.txt';
        break;
      default:
        throw new Error(`Unsupported service: ${service}`);
    }

    const templatePath = path.join(
      process.cwd(),
      'templates',
      'notifications',
      `${templateName}${extension}`
    );

    if (!fs.existsSync(templatePath)) {
      // Try service-specific template
      const serviceSpecificPath = path.join(
        process.cwd(),
        'templates',
        'notifications',
        `${service}_${templateName}${extension}`
      );
      
      if (!fs.existsSync(serviceSpecificPath)) {
        throw new Error(`Template not found: ${templatePath} or ${serviceSpecificPath}`);
      }
      
      const content = fs.readFileSync(serviceSpecificPath, 'utf8');
      this.templateCache.set(cacheKey, content);
      return content;
    }

    const content = fs.readFileSync(templatePath, 'utf8');
    this.templateCache.set(cacheKey, content);
    return content;
  }

  /**
   * Load and parse data
   */
  loadData(options) {
    let data = {};

    if (options.dataFile) {
      if (!fs.existsSync(options.dataFile)) {
        throw new Error(`Data file not found: ${options.dataFile}`);
      }
      const fileContent = fs.readFileSync(options.dataFile, 'utf8');
      data = JSON.parse(fileContent);
    }

    if (options.data) {
      const jsonData = JSON.parse(options.data);
      data = { ...data, ...jsonData };
    }

    // Add timestamp if not provided
    if (!data.timestamp) {
      data.timestamp = new Date().toISOString();
    }

    return data;
  }

  /**
   * Substitute variables in template
   */
  substituteVariables(template, data) {
    let result = template;
    
    // Replace {{variable}} with data values
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(regex, data[key]);
    });

    // Check for remaining unsubstituted variables
    const unsubstituted = result.match(/\{\{[^}]+\}\}/g);
    if (unsubstituted) {
      console.warn(`Warning: Unsubstituted variables found: ${unsubstituted.join(', ')}`);
    }

    return result;
  }

  /**
   * Get webhook URL for service
   */
  getWebhookUrl(service, options) {
    if (options.webhookUrl) {
      return options.webhookUrl;
    }

    switch (service) {
      case 'slack':
        return process.env.SLACK_WEBHOOK;
      case 'teams':
        return process.env.TEAMS_WEBHOOK;
      default:
        return null;
    }
  }

  /**
   * Send HTTP request
   */
  sendRequest(url, payload) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Send notification to Slack
   */
  async sendSlack(template, data, options) {
    const webhookUrl = this.getWebhookUrl('slack', options);
    
    if (!webhookUrl && !options.dryRun) {
      throw new Error('Slack webhook URL not provided. Set SLACK_WEBHOOK environment variable or use --webhook-url');
    }

    const templateContent = this.loadTemplate(template, 'slack');
    const message = this.substituteVariables(templateContent, data);
    
    console.log('📤 Slack notification:');
    console.log(JSON.stringify(JSON.parse(message), null, 2));

    if (options.dryRun) {
      console.log('🧪 Dry run - not sending to Slack');
      return { success: true, dryRun: true };
    }

    try {
      const result = await this.sendRequest(webhookUrl, message);
      console.log('✅ Slack notification sent successfully');
      return { success: true, response: result };
    } catch (error) {
      console.error('❌ Failed to send Slack notification:', error.message);
      throw error;
    }
  }

  /**
   * Send notification to Teams
   */
  async sendTeams(template, data, options) {
    const webhookUrl = this.getWebhookUrl('teams', options);
    
    if (!webhookUrl && !options.dryRun) {
      throw new Error('Teams webhook URL not provided. Set TEAMS_WEBHOOK environment variable or use --webhook-url');
    }

    const templateContent = this.loadTemplate(template, 'teams');
    const message = this.substituteVariables(templateContent, data);
    
    console.log('📤 Teams notification:');
    console.log(JSON.stringify(JSON.parse(message), null, 2));

    if (options.dryRun) {
      console.log('🧪 Dry run - not sending to Teams');
      return { success: true, dryRun: true };
    }

    try {
      const result = await this.sendRequest(webhookUrl, message);
      console.log('✅ Teams notification sent successfully');
      return { success: true, response: result };
    } catch (error) {
      console.error('❌ Failed to send Teams notification:', error.message);
      throw error;
    }
  }

  /**
   * Send email notification (output to file)
   */
  async sendEmail(template, data, options) {
    const templateContent = this.loadTemplate(template, 'email');
    const message = this.substituteVariables(templateContent, data);
    
    console.log('📧 Email notification content:');
    console.log(message);

    if (!options.dryRun) {
      // Ensure output directory exists
      const outputDir = path.join(process.cwd(), 'notifications_out');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputFile = path.join(outputDir, `email_${timestamp}.txt`);
      
      fs.writeFileSync(outputFile, message);
      console.log(`✅ Email content saved to: ${outputFile}`);
      
      return { success: true, outputFile };
    } else {
      console.log('🧪 Dry run - not saving email to file');
      return { success: true, dryRun: true };
    }
  }

  /**
   * Main execution function
   */
  async run() {
    try {
      const options = this.parseArgs();

      if (options.help) {
        this.showHelp();
        return;
      }

      // Validate required arguments
      if (!options.service) {
        throw new Error('Service is required. Use --service flag or see --help');
      }

      if (!options.template) {
        throw new Error('Template is required. Use --template flag or see --help');
      }

      if (!options.data && !options.dataFile) {
        throw new Error('Data is required. Use --data or --data-file flag or see --help');
      }

      // Parse services
      const services = options.service.split(',').map(s => s.trim().toLowerCase());
      
      // Validate services
      for (const service of services) {
        if (!this.supportedServices.includes(service)) {
          throw new Error(`Unsupported service: ${service}. Supported: ${this.supportedServices.join(', ')}`);
        }
      }

      // Load data
      const data = this.loadData(options);

      console.log(`🚀 Sending notifications to: ${services.join(', ')}`);
      console.log(`📋 Template: ${options.template}`);
      console.log(`📊 Data keys: ${Object.keys(data).join(', ')}`);
      
      if (options.dryRun) {
        console.log('🧪 DRY RUN MODE - No actual notifications will be sent');
      }

      console.log('');

      // Send notifications
      const results = [];
      for (const service of services) {
        try {
          let result;
          switch (service) {
            case 'slack':
              result = await this.sendSlack(options.template, data, options);
              break;
            case 'teams':
              result = await this.sendTeams(options.template, data, options);
              break;
            case 'email':
              result = await this.sendEmail(options.template, data, options);
              break;
          }
          results.push({ service, success: true, result });
        } catch (error) {
          console.error(`Failed to send ${service} notification:`, error.message);
          results.push({ service, success: false, error: error.message });
        }
        console.log(''); // Add spacing between services
      }

      // Summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log('📋 Summary:');
      console.log(`✅ Successful: ${successful}`);
      console.log(`❌ Failed: ${failed}`);

      if (failed > 0) {
        process.exit(1);
      }

    } catch (error) {
      console.error('❌ Error:', error.message);
      console.log('\nUse --help for usage information');
      process.exit(1);
    }
  }
}

// Run the CLI if this script is executed directly
if (require.main === module) {
  const cli = new NotificationCLI();
  cli.run();
}

module.exports = NotificationCLI;