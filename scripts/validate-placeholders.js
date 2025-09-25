#!/usr/bin/env node

/**
 * Placeholder Validator
 * Validates that all required placeholders are properly set or documented
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'quality-gates-config.json';

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Configuration file ${CONFIG_FILE} not found`);
  }
  
  const content = fs.readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(content);
}

function findPlaceholdersInFile(filePath, placeholderPatterns) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  
  const content = fs.readFileSync(filePath, 'utf8');
  const found = [];
  
  for (const [placeholder, config] of Object.entries(placeholderPatterns)) {
    if (content.includes(placeholder)) {
      found.push({
        file: filePath,
        placeholder: placeholder,
        config: config
      });
    }
  }
  
  return found;
}

function scanDirectoryForPlaceholders(directory, placeholderPatterns, extensions = ['.md', '.yml', '.yaml', '.json', '.js', '.ts']) {
  const found = [];
  
  function scanDir(dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and .git directories
        if (item === 'node_modules' || item === '.git') {
          continue;
        }
        scanDir(fullPath);
      } else if (stat.isFile()) {
        const ext = path.extname(item);
        if (extensions.includes(ext)) {
          const filePlaceholders = findPlaceholdersInFile(fullPath, placeholderPatterns);
          found.push(...filePlaceholders);
        }
      }
    }
  }
  
  scanDir(directory);
  return found;
}

function validatePlaceholderFormat(placeholder, value, pattern) {
  if (!value) {
    return { valid: false, error: 'Placeholder is empty or undefined' };
  }
  
  try {
    const regex = new RegExp(pattern);
    if (!regex.test(value)) {
      return { valid: false, error: `Value "${value}" does not match required pattern: ${pattern}` };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Invalid regex pattern: ${error.message}` };
  }
}

function checkEnvironmentVariables(placeholders) {
  const results = [];
  
  for (const [placeholder, config] of Object.entries(placeholders)) {
    // Convert placeholder to environment variable name
    const envVarName = placeholder.replace('@', '').replace(/[^A-Z0-9_]/g, '_').toUpperCase();
    const envValue = process.env[envVarName];
    
    const result = {
      placeholder: placeholder,
      envVar: envVarName,
      value: envValue,
      required: config.required,
      pattern: config.pattern,
      description: config.description
    };
    
    if (config.required && !envValue) {
      result.status = 'MISSING';
      result.error = `Required environment variable ${envVarName} is not set`;
    } else if (envValue) {
      const validation = validatePlaceholderFormat(placeholder, envValue, config.pattern);
      if (validation.valid) {
        result.status = 'VALID';
      } else {
        result.status = 'INVALID';
        result.error = validation.error;
      }
    } else {
      result.status = 'OPTIONAL';
    }
    
    results.push(result);
  }
  
  return results;
}

function generatePlaceholderDocumentation(placeholders, foundUsages) {
  console.log('\n📋 Placeholder Documentation:');
  console.log('=' .repeat(60));
  
  for (const [placeholder, config] of Object.entries(placeholders)) {
    const envVarName = placeholder.replace('@', '').replace(/[^A-Z0-9_]/g, '_').toUpperCase();
    const usage = foundUsages.filter(u => u.placeholder === placeholder);
    
    console.log(`\n🏷️  ${placeholder}`);
    console.log(`   Description: ${config.description}`);
    console.log(`   Environment Variable: ${envVarName}`);
    console.log(`   Pattern: ${config.pattern}`);
    console.log(`   Required: ${config.required ? '✅ Yes' : '❌ No'}`);
    
    if (usage.length > 0) {
      console.log(`   Used in:`);
      usage.forEach(u => {
        const relativePath = path.relative(process.cwd(), u.file);
        console.log(`     • ${relativePath}`);
      });
    } else {
      console.log(`   Used in: (no usage found)`);
    }
  }
}

function main() {
  console.log('🔍 Validating placeholders...');
  
  try {
    const config = loadConfig();
    
    if (!config.placeholders) {
      console.error('❌ No placeholders configuration found');
      process.exit(1);
    }
    
    console.log(`✅ Found ${Object.keys(config.placeholders).length} placeholder definitions`);
    
    // Scan for placeholder usage in files
    console.log('🔍 Scanning files for placeholder usage...');
    const foundUsages = scanDirectoryForPlaceholders('.', config.placeholders);
    console.log(`✅ Found ${foundUsages.length} placeholder usages in files`);
    
    // Check environment variables
    console.log('🔍 Checking environment variables...');
    const envResults = checkEnvironmentVariables(config.placeholders);
    
    let hasErrors = false;
    let hasWarnings = false;
    
    console.log('\n📊 Placeholder Validation Results:');
    console.log('=' .repeat(60));
    
    for (const result of envResults) {
      const statusIcon = {
        'VALID': '✅',
        'MISSING': '❌',
        'INVALID': '⚠️',
        'OPTIONAL': '🔵'
      }[result.status];
      
      console.log(`${statusIcon} ${result.placeholder} (${result.envVar}): ${result.status}`);
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
        if (result.status === 'MISSING') {
          hasErrors = true;
        } else if (result.status === 'INVALID') {
          hasWarnings = true;
        }
      } else if (result.value) {
        console.log(`   Value: ${result.value}`);
      }
    }
    
    // Generate documentation if requested
    if (process.argv.includes('--docs')) {
      generatePlaceholderDocumentation(config.placeholders, foundUsages);
    }
    
    // Summary
    console.log('\n📝 Summary:');
    const validCount = envResults.filter(r => r.status === 'VALID').length;
    const missingCount = envResults.filter(r => r.status === 'MISSING').length;
    const invalidCount = envResults.filter(r => r.status === 'INVALID').length;
    const optionalCount = envResults.filter(r => r.status === 'OPTIONAL').length;
    
    console.log(`  ✅ Valid: ${validCount}`);
    console.log(`  ❌ Missing: ${missingCount}`);
    console.log(`  ⚠️  Invalid: ${invalidCount}`);
    console.log(`  🔵 Optional: ${optionalCount}`);
    console.log(`  📁 File usages: ${foundUsages.length}`);
    
    if (hasErrors) {
      console.error('\n❌ Validation failed: Required placeholders are missing');
      console.error('Set the missing environment variables or update the configuration');
      process.exit(1);
    } else if (hasWarnings) {
      console.warn('\n⚠️ Validation completed with warnings: Some placeholders have invalid values');
      console.warn('Fix the invalid values or update patterns in quality-gates-config.json');
      process.exit(0); // Don't fail build for warnings
    } else {
      console.log('\n✅ All placeholder validation passed');
    }
    
  } catch (error) {
    console.error(`❌ Validation failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadConfig,
  findPlaceholdersInFile,
  scanDirectoryForPlaceholders,
  validatePlaceholderFormat,
  checkEnvironmentVariables
};