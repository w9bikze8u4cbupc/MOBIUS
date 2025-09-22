#!/usr/bin/env node

/**
 * Axios to fetchJson Codemod
 * 
 * This script automatically migrates simple axios.get/axios.post calls to fetchJson equivalents.
 * It handles basic patterns and should be reviewed after running.
 * 
 * Usage:
 * node axios-to-fetchjson-codemod.js <file-or-directory>
 */

const fs = require('fs');
const path = require('path');

// Simple pattern matching for axios calls
const axiosGetPattern = /axios\.get\(\s*(['"`])([^`"']*)['"`]\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;
const axiosPostPattern = /axios\.post\(\s*(['"`])([^`"']*)['"`]\s*(?:,\s*(\{[^}]*\}))?\s*(?:,\s*(\{[^}]*\}))?\s*\)/g;

function transformAxiosGet(match, quote, url, config) {
  const options = parseConfig(config);
  options.method = 'GET';
  options.expectedStatuses = '[200]';
  
  const optionsStr = buildOptionsString(options);
  return `fetchJson(${quote}${url}${quote}${optionsStr ? `, ${optionsStr}` : ''})`;
}

function transformAxiosPost(match, quote, url, data, config) {
  const options = parseConfig(config);
  options.method = 'POST';
  options.body = data;
  options.expectedStatuses = '[200, 201]';
  
  const optionsStr = buildOptionsString(options);
  return `fetchJson(${quote}${url}${quote}${optionsStr ? `, ${optionsStr}` : ''})`;
}

function parseConfig(configStr) {
  if (!configStr) return {};
  
  const options = {};
  
  // Extract headers
  const headersMatch = configStr.match(/headers:\s*(\{[^}]*\})/);
  if (headersMatch) {
    const headers = headersMatch[1];
    // Check for Authorization header
    const authMatch = headers.match(/Authorization:\s*['"`]Bearer\s*(\w+)['"`]/) || 
                     headers.match(/Authorization:\s*(\w+)/);
    if (authMatch) {
      options.authToken = authMatch[1];
    } else {
      options.headers = headers;
    }
  }
  
  // Extract other properties as needed
  return options;
}

function buildOptionsString(options) {
  const entries = [];
  
  if (options.method) {
    entries.push(`method: '${options.method}'`);
  }
  
  if (options.body) {
    entries.push(`body: ${options.body}`);
  }
  
  if (options.authToken) {
    entries.push(`authToken: ${options.authToken}`);
  } else if (options.headers) {
    entries.push(`headers: ${options.headers}`);
  }
  
  if (options.expectedStatuses) {
    entries.push(`expectedStatuses: ${options.expectedStatuses}`);
  }
  
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '';
}

function processFile(filePath) {
  if (!filePath.endsWith('.js') && !filePath.endsWith('.jsx')) {
    return;
  }
  
  console.log(`Processing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  // Transform axios.get calls
  content = content.replace(axiosGetPattern, transformAxiosGet);
  
  // Transform axios.post calls
  content = content.replace(axiosPostPattern, transformAxiosPost);
  
  // Add fetchJson import if axios was used and fetchJson isn't already imported
  if (originalContent.includes('axios') && !content.includes('fetchJson')) {
    const importMatch = content.match(/import\s+axios\s+from\s+['"]axios['"];/);
    if (importMatch) {
      content = content.replace(
        importMatch[0], 
        `${importMatch[0]}\nimport { fetchJson } from '../utils/fetchJson';`
      );
    }
  }
  
  // Remove axios import if no longer used
  if (!content.includes('axios.') && content.includes('import axios from \'axios\';')) {
    content = content.replace(/import\s+axios\s+from\s+['"]axios['"];\n?/, '');
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  } else {
    console.log(`No changes to ${filePath}`);
  }
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else {
      processFile(filePath);
    }
  });
}

function main() {
  const target = process.argv[2];
  
  if (!target) {
    console.error('Usage: node axios-to-fetchjson-codemod.js <file-or-directory>');
    process.exit(1);
  }
  
  const fullPath = path.resolve(target);
  
  if (fs.existsSync(fullPath)) {
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else {
      processFile(fullPath);
    }
  } else {
    console.error(`Path ${fullPath} does not exist`);
    process.exit(1);
  }
}

main();