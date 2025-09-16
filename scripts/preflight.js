#!/usr/bin/env node

/**
 * Preflight script for Mobius Games Tutorial Generator
 * Checks binaries, env vars, writable dirs, network egress/whitelist, and gives remediation tips
 */

import { spawnSync, execSync } from 'child_process';
import { existsSync, accessSync, constants, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';

// Configuration
const REQUIRED_TOOLS = [
  'ffmpeg',
  'ffprobe',
  'pdftoppm'
];

const REQUIRED_ENV_VARS = [
  'NODE_ENV',
  'OUTPUT_DIR'
];

const OPTIONAL_ENV_VARS = [
  'ELEVENLABS_API_KEY',
  'URL_WHITELIST',
  'REQUEST_TIMEOUT_MS',
  'MAX_CONCURRENCY',
  'BODY_LIMIT_MB',
  'OCR_ENABLE'
];

const DEFAULT_FFMPEG_PATH = 'ffmpeg';
const DEFAULT_FFPROBE_PATH = 'ffprobe';
const DEFAULT_PDFTOPPM_PATH = 'pdftoppm';

// Helper functions
function checkTool(toolName, toolPath = toolName) {
  try {
    const result = spawnSync(toolPath, ['-version'], { 
      stdio: 'pipe',
      timeout: 5000
    });
    
    if (result.status === 0) {
      const versionLine = result.stdout.toString().split('\n')[0];
      console.log(`✅ ${toolName}: ${versionLine}`);
      return true;
    } else {
      console.log(`❌ ${toolName}: Not found or not working`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${toolName}: Error checking - ${error.message}`);
    return false;
  }
}

function checkEnvVar(varName, isRequired = true) {
  const value = process.env[varName];
  if (value) {
    console.log(`✅ ${varName}: ${value.substring(0, 3)}...${value.slice(-3)}`); // Mask sensitive values
    return true;
  } else if (isRequired) {
    console.log(`❌ ${varName}: Not set (required)`);
    return false;
  } else {
    console.log(`⚠️  ${varName}: Not set (optional)`);
    return true;
  }
}

function checkWritableDir(dirPath) {
  try {
    // Try to create directory if it doesn't exist
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
    
    // Try to write a test file
    const testFile = join(dirPath, '.preflight_test');
    writeFileSync(testFile, 'test');
    unlinkSync(testFile);
    
    console.log(`✅ ${dirPath}: Writable`);
    return true;
  } catch (error) {
    console.log(`❌ ${dirPath}: Not writable - ${error.message}`);
    return false;
  }
}

function checkNetworkAccess() {
  // This is a simplified check - in a real implementation, you might want to
  // test actual endpoints that the application needs to access
  try {
    // Check if we can resolve a common domain
    execSync('nslookup google.com', { stdio: 'ignore', timeout: 5000 });
    console.log('✅ Network access: Available');
    return true;
  } catch (error) {
    console.log('⚠️  Network access: Limited or unavailable');
    return false;
  }
}

function checkGit() {
  try {
    const result = spawnSync('git', ['rev-parse', '--git-dir'], { 
      stdio: 'pipe',
      timeout: 5000
    });
    
    if (result.status === 0) {
      console.log('✅ Git: Available');
      return true;
    } else {
      console.log('⚠️  Git: Not available or not in a git repository');
      return false;
    }
  } catch (error) {
    console.log('⚠️  Git: Not available');
    return false;
  }
}

function getSystemInfo() {
  console.log('\n=== System Information ===');
  console.log(`Platform: ${process.platform}`);
  console.log(`Architecture: ${process.arch}`);
  console.log(`Node.js version: ${process.version}`);
  
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8', timeout: 5000 }).trim();
    console.log(`npm version: ${npmVersion}`);
  } catch (error) {
    console.log('npm version: Unable to determine');
  }
}

function getRemediationTips(failedChecks) {
  console.log('\n=== Remediation Tips ===');
  
  if (failedChecks.tools) {
    console.log('\n🔧 Tool Installation:');
    console.log('  - ffmpeg/ffprobe: Download from https://ffmpeg.org/download.html');
    console.log('  - Poppler (for pdftoppm): Install via package manager or download from');
    console.log('    https://github.com/oschwartz10612/poppler-windows/releases/');
  }
  
  if (failedChecks.envVars) {
    console.log('\n⚙️  Environment Variables:');
    console.log('  - NODE_ENV: Set to "production" for production or "development" for dev');
    console.log('  - OUTPUT_DIR: Set to a writable directory path for output files');
    console.log('  - ELEVENLABS_API_KEY: (Optional) Set for TTS functionality');
  }
  
  if (failedChecks.writableDirs) {
    console.log('\n📂 Directory Permissions:');
    console.log('  - Ensure OUTPUT_DIR points to a writable directory');
    console.log('  - Check that the user has write permissions to the specified paths');
  }
  
  if (failedChecks.network) {
    console.log('\n🌐 Network Access:');
    console.log('  - Check firewall settings');
    console.log('  - Verify internet connectivity');
    console.log('  - Ensure required endpoints are accessible');
  }
}

// Main preflight check function
async function runPreflight() {
  console.log('🚀 Mobius Games Tutorial Generator - Preflight Check');
  console.log('=====================================================\n');
  
  // Get system information
  getSystemInfo();
  
  console.log('\n=== Tool Checks ===');
  const toolResults = {};
  let allToolsPassed = true;
  
  for (const tool of REQUIRED_TOOLS) {
    const toolPath = process.env[`${tool.toUpperCase()}_PATH`] || 
                    (tool === 'ffmpeg' ? DEFAULT_FFMPEG_PATH : 
                     tool === 'ffprobe' ? DEFAULT_FFPROBE_PATH : 
                     DEFAULT_PDFTOPPM_PATH);
    toolResults[tool] = checkTool(tool, toolPath);
    if (!toolResults[tool]) {
      allToolsPassed = false;
    }
  }
  
  console.log('\n=== Environment Variable Checks ===');
  const envVarResults = {};
  let allEnvVarsPassed = true;
  
  for (const envVar of REQUIRED_ENV_VARS) {
    envVarResults[envVar] = checkEnvVar(envVar, true);
    if (!envVarResults[envVar]) {
      allEnvVarsPassed = false;
    }
  }
  
  for (const envVar of OPTIONAL_ENV_VARS) {
    checkEnvVar(envVar, false);
  }
  
  console.log('\n=== Directory Write Checks ===');
  const writableDirResults = {};
  let allDirsWritable = true;
  
  const outputDir = process.env.OUTPUT_DIR || './output';
  writableDirResults.outputDir = checkWritableDir(outputDir);
  if (!writableDirResults.outputDir) {
    allDirsWritable = false;
  }
  
  // Check uploads directory
  const uploadsDir = './src/api/uploads';
  writableDirResults.uploadsDir = checkWritableDir(uploadsDir);
  if (!writableDirResults.uploadsDir) {
    allDirsWritable = false;
  }
  
  console.log('\n=== Network Access Check ===');
  const networkResult = checkNetworkAccess();
  
  console.log('\n=== Git Check ===');
  const gitResult = checkGit();
  
  // Summary
  console.log('\n=== Summary ===');
  const failedChecks = {
    tools: !allToolsPassed,
    envVars: !allEnvVarsPassed,
    writableDirs: !allDirsWritable,
    network: !networkResult
  };
  
  const totalChecks = 4;
  const passedChecks = [
    allToolsPassed,
    allEnvVarsPassed,
    allDirsWritable,
    networkResult
  ].filter(Boolean).length;
  
  console.log(`Checks passed: ${passedChecks}/${totalChecks}`);
  
  if (passedChecks === totalChecks) {
    console.log('🎉 All preflight checks passed! Ready to run the pipeline.');
    process.exit(0);
  } else {
    console.log('⚠️  Some preflight checks failed. See remediation tips below.');
    getRemediationTips(failedChecks);
    process.exit(1);
  }
}

// Run the preflight check
if (import.meta.url === `file://${process.argv[1]}`) {
  runPreflight().catch(error => {
    console.error('Preflight check failed with error:', error);
    process.exit(1);
  });
}

export { runPreflight };