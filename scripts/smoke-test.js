#!/usr/bin/env node

/**
 * Smoke Test Runner
 * Executes post-deployment smoke tests to validate system health
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { execSync, spawn } = require('child_process');

const CONFIG_FILE = 'quality-gates-config.json';

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    console.warn('⚠️ Quality gates config not found, using default smoke tests');
    return {
      smoke_tests: {
        staging: {
          enabled: true,
          endpoints: ['/health'],
          timeout_seconds: 30
        }
      }
    };
  }
  
  const content = fs.readFileSync(CONFIG_FILE, 'utf8');
  return JSON.parse(content);
}

function makeHttpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https://') ? https : http;
    const timeout = options.timeout || 30000;
    
    const req = protocol.get(url, { timeout }, (res) => {
      let data = '';
      
      res.on('data', chunk => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.setTimeout(timeout);
  });
}

async function testEndpoint(baseUrl, endpoint, timeout = 30000) {
  const url = `${baseUrl}${endpoint}`;
  const startTime = Date.now();
  
  try {
    console.log(`  🔍 Testing: ${url}`);
    
    const response = await makeHttpRequest(url, { timeout });
    const duration = Date.now() - startTime;
    
    const result = {
      endpoint,
      url,
      duration,
      status: 'PASS',
      statusCode: response.statusCode,
      statusMessage: response.statusMessage
    };
    
    if (response.statusCode >= 200 && response.statusCode < 300) {
      console.log(`    ✅ ${endpoint} - ${response.statusCode} ${response.statusMessage} (${duration}ms)`);
    } else if (response.statusCode >= 300 && response.statusCode < 400) {
      console.log(`    🔄 ${endpoint} - ${response.statusCode} ${response.statusMessage} (${duration}ms)`);
      result.status = 'REDIRECT';
    } else {
      console.log(`    ❌ ${endpoint} - ${response.statusCode} ${response.statusMessage} (${duration}ms)`);
      result.status = 'FAIL';
      result.error = `HTTP ${response.statusCode} ${response.statusMessage}`;
    }
    
    // Try to parse response body for additional health info
    try {
      const bodyData = JSON.parse(response.body);
      if (bodyData.status || bodyData.health || bodyData.version) {
        result.healthData = bodyData;
        console.log(`    📋 Health data: ${JSON.stringify(bodyData)}`);
      }
    } catch (e) {
      // Not JSON or no health data, that's fine
    }
    
    return result;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`    ❌ ${endpoint} - ERROR: ${error.message} (${duration}ms)`);
    
    return {
      endpoint,
      url,
      duration,
      status: 'ERROR',
      error: error.message
    };
  }
}

async function runBasicHealthChecks() {
  console.log('🏥 Running basic system health checks...');
  
  const results = [];
  
  // Check Node.js version
  try {
    const nodeVersion = process.version;
    console.log(`  ✅ Node.js version: ${nodeVersion}`);
    results.push({
      check: 'node_version',
      status: 'PASS',
      value: nodeVersion
    });
  } catch (error) {
    console.log(`  ❌ Node.js version check failed: ${error.message}`);
    results.push({
      check: 'node_version',
      status: 'FAIL', 
      error: error.message
    });
  }
  
  // Check NPM version
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`  ✅ NPM version: ${npmVersion}`);
    results.push({
      check: 'npm_version',
      status: 'PASS',
      value: npmVersion
    });
  } catch (error) {
    console.log(`  ❌ NPM version check failed: ${error.message}`);
    results.push({
      check: 'npm_version',
      status: 'FAIL',
      error: error.message
    });
  }
  
  // Check FFmpeg availability
  try {
    const ffmpegVersion = execSync('ffmpeg -version', { encoding: 'utf8' });
    const versionLine = ffmpegVersion.split('\n')[0];
    console.log(`  ✅ FFmpeg: ${versionLine}`);
    results.push({
      check: 'ffmpeg_availability',
      status: 'PASS',
      value: versionLine
    });
  } catch (error) {
    console.log(`  ❌ FFmpeg not available: ${error.message}`);
    results.push({
      check: 'ffmpeg_availability', 
      status: 'FAIL',
      error: error.message
    });
  }
  
  // Check disk space
  try {
    let diskInfo;
    if (process.platform === 'win32') {
      diskInfo = execSync('wmic logicaldisk get caption,size,freespace /format:csv', { encoding: 'utf8' });
    } else {
      diskInfo = execSync('df -h .', { encoding: 'utf8' });
    }
    console.log(`  ✅ Disk space check completed`);
    results.push({
      check: 'disk_space',
      status: 'PASS',
      value: 'Available'
    });
  } catch (error) {
    console.log(`  ⚠️ Disk space check failed: ${error.message}`);
    results.push({
      check: 'disk_space',
      status: 'WARN',
      error: error.message
    });
  }
  
  return results;
}

async function runFileSystemChecks() {
  console.log('📁 Running file system checks...');
  
  const results = [];
  const requiredDirectories = ['scripts', 'src', '.github'];
  const requiredFiles = ['package.json', 'quality-gates-config.json'];
  
  // Check required directories
  for (const dir of requiredDirectories) {
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      console.log(`  ✅ Directory exists: ${dir}`);
      results.push({
        check: `directory_${dir}`,
        status: 'PASS'
      });
    } else {
      console.log(`  ❌ Directory missing: ${dir}`);
      results.push({
        check: `directory_${dir}`,
        status: 'FAIL',
        error: 'Directory not found'
      });
    }
  }
  
  // Check required files
  for (const file of requiredFiles) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      console.log(`  ✅ File exists: ${file}`);
      results.push({
        check: `file_${file}`,
        status: 'PASS'
      });
    } else {
      console.log(`  ❌ File missing: ${file}`);
      results.push({
        check: `file_${file}`,
        status: 'FAIL',
        error: 'File not found'
      });
    }
  }
  
  return results;
}

async function runEndpointTests(environment = 'staging') {
  const config = loadConfig();
  const envConfig = config.smoke_tests?.[environment];
  
  if (!envConfig || !envConfig.enabled) {
    console.log(`⏭️ Smoke tests disabled for environment: ${environment}`);
    return [];
  }
  
  console.log(`🌐 Running endpoint tests for environment: ${environment}`);
  
  const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
  const endpoints = envConfig.endpoints || ['/health'];
  const timeout = (envConfig.timeout_seconds || 30) * 1000;
  
  console.log(`  🎯 Base URL: ${baseUrl}`);
  console.log(`  📋 Testing ${endpoints.length} endpoints with ${timeout}ms timeout`);
  
  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(baseUrl, endpoint, timeout);
    results.push(result);
  }
  
  return results;
}

function generateSummary(healthResults, fileSystemResults, endpointResults) {
  const allResults = [...healthResults, ...fileSystemResults, ...endpointResults];
  
  const passed = allResults.filter(r => r.status === 'PASS').length;
  const failed = allResults.filter(r => r.status === 'FAIL' || r.status === 'ERROR').length;
  const warnings = allResults.filter(r => r.status === 'WARN' || r.status === 'REDIRECT').length;
  
  console.log('\n📊 Smoke Test Summary:');
  console.log('=' .repeat(50));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⚠️ Warnings: ${warnings}`);
  console.log(`📋 Total: ${allResults.length}`);
  
  const successRate = ((passed / allResults.length) * 100).toFixed(1);
  console.log(`📈 Success Rate: ${successRate}%`);
  
  return {
    total: allResults.length,
    passed,
    failed,
    warnings,
    successRate: parseFloat(successRate),
    allPassed: failed === 0
  };
}

async function main() {
  console.log('🧪 Starting post-deployment smoke tests...');
  console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
  console.log(`🖥️ Platform: ${process.platform}`);
  console.log(`📁 Working Directory: ${process.cwd()}`);
  
  try {
    // Run all smoke test categories
    const healthResults = await runBasicHealthChecks();
    const fileSystemResults = await runFileSystemChecks();
    
    const environment = process.env.TARGET_ENV || process.env.NODE_ENV || 'staging';
    const endpointResults = await runEndpointTests(environment);
    
    // Generate summary
    const summary = generateSummary(healthResults, fileSystemResults, endpointResults);
    
    if (summary.allPassed) {
      console.log('\n🎉 All smoke tests passed! System is healthy.');
      process.exit(0);
    } else {
      console.log(`\n⚠️ ${summary.failed} smoke test(s) failed. Review the results above.`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`❌ Smoke test execution failed: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadConfig,
  testEndpoint,
  runBasicHealthChecks,
  runFileSystemChecks,
  runEndpointTests
};