#!/usr/bin/env node
/**
 * notify.js
 *
 * Core notification handler for deployment notifications.
 * Supports Slack, Teams, and email notifications using templates.
 */

import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
function parseArgs(args) {
  const opts = {
    service: 'slack',
    template: '',
    dataFile: '',
    templateDir: path.join(process.cwd(), 'templates', 'notifications'),
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--service') opts.service = args[++i];
    else if (arg === '--template') opts.template = args[++i];
    else if (arg === '--data-file') opts.dataFile = args[++i];
    else if (arg === '--template-dir') opts.templateDir = args[++i];
    else if (arg === '--dry-run') opts.dryRun = true;
  }

  return opts;
}

// Load and parse template
async function loadTemplate(templateDir, templateName, service) {
  const templatePath = path.join(templateDir, `${templateName}_${service}.json`);
  try {
    const content = await readFile(templatePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load template ${templatePath}:`, error.message);
    throw error;
  }
}

// Load data file
async function loadData(dataFile) {
  try {
    const content = await readFile(dataFile, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to load data file ${dataFile}:`, error.message);
    throw error;
  }
}

// Replace template variables
function replaceVariables(template, data) {
  const result = JSON.parse(JSON.stringify(template)); // Deep clone
  
  function replace(obj) {
    if (typeof obj === 'string') {
      return obj.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
      });
    } else if (Array.isArray(obj)) {
      return obj.map(replace);
    } else if (typeof obj === 'object' && obj !== null) {
      const newObj = {};
      for (const [key, value] of Object.entries(obj)) {
        newObj[key] = replace(value);
      }
      return newObj;
    }
    return obj;
  }
  
  return replace(result);
}

// Send Slack notification
async function sendSlackNotification(payload, dryRun) {
  const webhookUrl = process.env.SLACK_WEBHOOK;
  if (!webhookUrl) {
    throw new Error('SLACK_WEBHOOK environment variable not set');
  }

  if (dryRun) {
    console.log('[DRY RUN] Would send Slack notification:');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
    }

    console.log('✅ Slack notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send Slack notification:', error.message);
    throw error;
  }
}

// Send Teams notification
async function sendTeamsNotification(payload, dryRun) {
  const webhookUrl = process.env.TEAMS_WEBHOOK;
  if (!webhookUrl) {
    throw new Error('TEAMS_WEBHOOK environment variable not set');
  }

  if (dryRun) {
    console.log('[DRY RUN] Would send Teams notification:');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Teams API error: ${response.status} ${response.statusText}`);
    }

    console.log('✅ Teams notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send Teams notification:', error.message);
    throw error;
  }
}

// Send email notification (placeholder)
async function sendEmailNotification(payload, dryRun) {
  if (dryRun) {
    console.log('[DRY RUN] Would send email notification:');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  // Placeholder for email sending logic
  console.log('📧 Email notifications not implemented yet');
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const opts = parseArgs(args);

  if (!opts.template || !opts.dataFile) {
    console.error('Usage: notify.js --template <name> --data-file <path> [--service <service>] [--template-dir <dir>] [--dry-run]');
    process.exit(1);
  }

  try {
    // Load data
    const data = await loadData(opts.dataFile);
    console.log('📁 Loaded data:', JSON.stringify(data, null, 2));

    // Process each service
    const services = opts.service.split(',').map(s => s.trim());
    
    for (const service of services) {
      console.log(`\n🔔 Processing ${service} notification...`);
      
      try {
        // Load template
        const template = await loadTemplate(opts.templateDir, opts.template, service);
        
        // Replace variables
        const payload = replaceVariables(template, data);
        
        // Send notification
        switch (service.toLowerCase()) {
          case 'slack':
            await sendSlackNotification(payload, opts.dryRun);
            break;
          case 'teams':
            await sendTeamsNotification(payload, opts.dryRun);
            break;
          case 'email':
            await sendEmailNotification(payload, opts.dryRun);
            break;
          default:
            console.warn(`⚠️  Unknown service: ${service}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process ${service} notification:`, error.message);
        // Continue with other services instead of failing completely
      }
    }

    console.log('\n✅ Notification processing complete');
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}