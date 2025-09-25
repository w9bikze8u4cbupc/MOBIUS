#!/usr/bin/env node

/**
 * Quality Gates Configuration Validator
 * Validates quality-gates-config.json against target environment requirements
 */

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = 'quality-gates-config.json';

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Configuration file ${CONFIG_FILE} not found`);
  }
  
  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to parse ${CONFIG_FILE}: ${error.message}`);
  }
}

function validateEnvironments(config) {
  const errors = [];
  
  if (!config.environments) {
    errors.push('Missing "environments" section');
    return errors;
  }
  
  const requiredEnvs = ['staging', 'production'];
  for (const env of requiredEnvs) {
    if (!config.environments[env]) {
      errors.push(`Missing environment configuration for "${env}"`);
      continue;
    }
    
    const envConfig = config.environments[env];
    if (!envConfig.checks) {
      errors.push(`Missing "checks" section for environment "${env}"`);
      continue;
    }
    
    // Validate required checks
    const requiredChecks = ['build', 'tests', 'linting', 'security_scan'];
    for (const check of requiredChecks) {
      if (!envConfig.checks[check]) {
        errors.push(`Missing required check "${check}" for environment "${env}"`);
      } else {
        const checkConfig = envConfig.checks[check];
        if (typeof checkConfig.enabled !== 'boolean') {
          errors.push(`Invalid "enabled" value for check "${check}" in environment "${env}"`);
        }
        if (typeof checkConfig.required !== 'boolean') {
          errors.push(`Invalid "required" value for check "${check}" in environment "${env}"`);
        }
        if (typeof checkConfig.timeout_seconds !== 'number' || checkConfig.timeout_seconds <= 0) {
          errors.push(`Invalid "timeout_seconds" value for check "${check}" in environment "${env}"`);
        }
      }
    }
  }
  
  return errors;
}

function validatePlaceholders(config) {
  const errors = [];
  
  if (!config.placeholders) {
    errors.push('Missing "placeholders" section');
    return errors;
  }
  
  const requiredPlaceholders = ['RELEASE_TAG', '@DEPLOY_LEAD', '@ops'];
  for (const placeholder of requiredPlaceholders) {
    if (!config.placeholders[placeholder]) {
      errors.push(`Missing required placeholder "${placeholder}"`);
      continue;
    }
    
    const placeholderConfig = config.placeholders[placeholder];
    if (!placeholderConfig.pattern) {
      errors.push(`Missing "pattern" for placeholder "${placeholder}"`);
    } else {
      try {
        new RegExp(placeholderConfig.pattern);
      } catch (error) {
        errors.push(`Invalid regex pattern for placeholder "${placeholder}": ${error.message}`);
      }
    }
    
    if (!placeholderConfig.description) {
      errors.push(`Missing "description" for placeholder "${placeholder}"`);
    }
    
    if (typeof placeholderConfig.required !== 'boolean') {
      errors.push(`Invalid "required" value for placeholder "${placeholder}"`);
    }
  }
  
  return errors;
}

function validateBranchProtection(config) {
  const errors = [];
  
  if (!config.branch_protection) {
    errors.push('Missing "branch_protection" section');
    return errors;
  }
  
  if (!config.branch_protection.main) {
    errors.push('Missing branch protection configuration for "main" branch');
    return errors;
  }
  
  const branchConfig = config.branch_protection.main;
  
  if (!branchConfig.required_status_checks) {
    errors.push('Missing "required_status_checks" for main branch');
  } else {
    const statusChecks = branchConfig.required_status_checks;
    if (typeof statusChecks.strict !== 'boolean') {
      errors.push('Invalid "strict" value in required_status_checks');
    }
    
    if (!Array.isArray(statusChecks.contexts)) {
      errors.push('Invalid "contexts" value in required_status_checks - must be array');
    } else {
      const requiredContexts = ['CI / build-and-qa', 'premerge-validation', 'premerge-artifacts-upload'];
      for (const context of requiredContexts) {
        if (!statusChecks.contexts.includes(context)) {
          errors.push(`Missing required status check context "${context}"`);
        }
      }
    }
  }
  
  if (!branchConfig.required_pull_request_reviews) {
    errors.push('Missing "required_pull_request_reviews" for main branch');
  } else {
    const prReviews = branchConfig.required_pull_request_reviews;
    if (typeof prReviews.required_approving_review_count !== 'number' || prReviews.required_approving_review_count < 2) {
      errors.push('Invalid "required_approving_review_count" - must be number >= 2');
    }
  }
  
  return errors;
}

function validateTargetEnvironment() {
  const targetEnv = process.env.TARGET_ENV || process.env.NODE_ENV || 'staging';
  console.log(`Validating for target environment: ${targetEnv}`);
  
  const config = loadConfig();
  
  if (!config.environments[targetEnv]) {
    throw new Error(`Target environment "${targetEnv}" not found in configuration`);
  }
  
  console.log(`✅ Target environment "${targetEnv}" configuration found`);
  return targetEnv;
}

function main() {
  console.log('🔍 Validating quality gates configuration...');
  
  try {
    const config = loadConfig();
    console.log('✅ Configuration file loaded successfully');
    
    // Validate all sections
    const environmentErrors = validateEnvironments(config);
    const placeholderErrors = validatePlaceholders(config);
    const branchProtectionErrors = validateBranchProtection(config);
    
    const allErrors = [...environmentErrors, ...placeholderErrors, ...branchProtectionErrors];
    
    if (allErrors.length > 0) {
      console.error('❌ Configuration validation failed:');
      allErrors.forEach(error => console.error(`  • ${error}`));
      process.exit(1);
    }
    
    // Validate target environment
    const targetEnv = validateTargetEnvironment();
    
    console.log('✅ Quality gates configuration is valid');
    console.log(`✅ Target environment "${targetEnv}" requirements met`);
    
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
  validateEnvironments,
  validatePlaceholders,
  validateBranchProtection,
  validateTargetEnvironment
};