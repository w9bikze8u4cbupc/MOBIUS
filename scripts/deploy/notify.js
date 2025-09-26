#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

/**
 * notify.js - Deployment notification script
 * 
 * Sends notifications to Slack, Teams, and generates email content for deployments.
 * 
 * Usage:
 *   node notify.js --service slack,teams,email --template deploy_started --data-file ./deploy.json
 *   node notify.js --service slack --template deploy_completed --data-file ./deploy.json
 *   node notify.js --service teams --template deploy_failed --data-file ./deploy.json
 */

class NotificationService {
  constructor() {
    this.templatesDir = path.resolve(__dirname, '../../templates/notifications');
    this.outputDir = path.resolve(__dirname, '../../notifications_out');
    
    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async sendNotifications(services, templateName, dataFile) {
    try {
      // Load data from file
      const data = this.loadData(dataFile);
      
      // Process each service
      const results = [];
      for (const service of services) {
        const result = await this.sendNotification(service, templateName, data);
        results.push({ service, success: result.success, message: result.message });
      }

      // Log results
      results.forEach(({ service, success, message }) => {
        if (success) {
          console.log(`✅ ${service.toUpperCase()}: ${message}`);
        } else {
          console.error(`❌ ${service.toUpperCase()}: ${message}`);
        }
      });

      // Exit with error if any failed
      const failed = results.filter(r => !r.success);
      if (failed.length > 0) {
        console.error(`Failed to send ${failed.length} notification(s)`);
        process.exit(1);
      }

    } catch (error) {
      console.error('Notification error:', error.message);
      process.exit(1);
    }
  }

  loadData(dataFile) {
    if (!fs.existsSync(dataFile)) {
      throw new Error(`Data file not found: ${dataFile}`);
    }
    
    try {
      const content = fs.readFileSync(dataFile, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON in data file: ${error.message}`);
    }
  }

  loadTemplate(templateName, format = 'json') {
    const templateFile = path.join(this.templatesDir, `${templateName}.${format}`);
    
    if (!fs.existsSync(templateFile)) {
      throw new Error(`Template not found: ${templateFile}`);
    }
    
    try {
      const content = fs.readFileSync(templateFile, 'utf8');
      return format === 'json' ? JSON.parse(content) : content;
    } catch (error) {
      throw new Error(`Invalid template file: ${error.message}`);
    }
  }

  interpolateTemplate(template, data) {
    if (typeof template === 'string') {
      return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
        const value = this.getNestedValue(data, key.trim());
        return value !== undefined ? value : match;
      });
    }
    
    if (typeof template === 'object' && template !== null) {
      if (Array.isArray(template)) {
        return template.map(item => this.interpolateTemplate(item, data));
      }
      
      const result = {};
      for (const [key, value] of Object.entries(template)) {
        result[key] = this.interpolateTemplate(value, data);
      }
      return result;
    }
    
    return template;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  async sendNotification(service, templateName, data) {
    switch (service.toLowerCase()) {
      case 'slack':
        return this.sendSlackNotification(templateName, data);
      case 'teams':
        return this.sendTeamsNotification(templateName, data);
      case 'email':
        return this.generateEmailNotification(templateName, data);
      default:
        return { success: false, message: `Unknown service: ${service}` };
    }
  }

  async sendSlackNotification(templateName, data) {
    const webhookUrl = process.env.SLACK_WEBHOOK;
    if (!webhookUrl) {
      return { success: false, message: 'SLACK_WEBHOOK environment variable not set' };
    }

    try {
      const template = this.loadTemplate(templateName, 'json');
      const payload = this.interpolateTemplate(template, data);
      
      const response = await this.sendWebhook(webhookUrl, payload);
      return { success: true, message: 'Slack notification sent successfully' };
    } catch (error) {
      return { success: false, message: `Slack notification failed: ${error.message}` };
    }
  }

  async sendTeamsNotification(templateName, data) {
    const webhookUrl = process.env.TEAMS_WEBHOOK;
    if (!webhookUrl) {
      return { success: false, message: 'TEAMS_WEBHOOK environment variable not set' };
    }

    try {
      const template = this.loadTemplate(templateName, 'json');
      const payload = this.interpolateTemplate(template, data);
      
      const response = await this.sendWebhook(webhookUrl, payload);
      return { success: true, message: 'Teams notification sent successfully' };
    } catch (error) {
      return { success: false, message: `Teams notification failed: ${error.message}` };
    }
  }

  generateEmailNotification(templateName, data) {
    try {
      const template = this.loadTemplate(templateName, 'txt');
      const content = this.interpolateTemplate(template, data);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `${templateName}_${timestamp}.txt`;
      const filePath = path.join(this.outputDir, filename);
      
      fs.writeFileSync(filePath, content, 'utf8');
      
      return { 
        success: true, 
        message: `Email content generated: ${filePath}` 
      };
    } catch (error) {
      return { 
        success: false, 
        message: `Email generation failed: ${error.message}` 
      };
    }
  }

  async sendWebhook(url, payload) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(options, (res) => {
        let responseData = '';
        res.on('data', chunk => responseData += chunk);
        
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: responseData });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

// Command line interface
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = value;
      if (value !== true) i++;
    }
  }
  
  return parsed;
}

function showHelp() {
  console.log(`
notify.js - Deployment notification script

Usage:
  node notify.js --service <services> --template <template> --data-file <file>

Options:
  --service     Comma-separated list of services: slack,teams,email
  --template    Template name (without extension)
  --data-file   Path to JSON file containing notification data
  --help        Show this help message

Examples:
  node notify.js --service slack,teams --template deploy_started --data-file ./deploy.json
  node notify.js --service email --template deploy_completed --data-file ./deploy.json

Environment Variables:
  SLACK_WEBHOOK   Slack webhook URL for notifications
  TEAMS_WEBHOOK   Microsoft Teams webhook URL for notifications
`);
}

// Main execution
async function main() {
  const args = parseArgs();
  
  if (args.help || !args.service || !args.template || !args['data-file']) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }
  
  const services = args.service.split(',').map(s => s.trim());
  const templateName = args.template;
  const dataFile = args['data-file'];
  
  const notifier = new NotificationService();
  await notifier.sendNotifications(services, templateName, dataFile);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = NotificationService;