#!/usr/bin/env node

// Script to verify security and operational hardening features

import axios from 'axios';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

async function testMetricsEndpoint() {
  console.log('Testing metrics endpoint security...');
  
  try {
    // Test unauthorized access to metrics endpoint
    const response = await axios.get('http://localhost:5001/metrics');
    console.log('❌ Metrics endpoint is accessible without authentication');
    return false;
  } catch (error) {
    if (error.response && error.response.status === 403) {
      console.log('✅ Metrics endpoint correctly rejects unauthorized access');
      return true;
    } else {
      console.log('❌ Unexpected error when accessing metrics endpoint:', error.message);
      return false;
    }
  }
}

async function testLivenessEndpoint() {
  console.log('Testing liveness endpoint...');
  
  try {
    const response = await axios.get('http://localhost:5001/livez');
    if (response.status === 200 && response.data === 'OK') {
      console.log('✅ Liveness endpoint is working correctly');
      return true;
    } else {
      console.log('❌ Liveness endpoint is not working correctly');
      return false;
    }
  } catch (error) {
    console.log('❌ Error accessing liveness endpoint:', error.message);
    return false;
  }
}

async function testReadinessEndpoint() {
  console.log('Testing readiness endpoint...');
  
  try {
    const response = await axios.get('http://localhost:5001/readyz');
    if (response.status === 200 || response.status === 503) {
      console.log('✅ Readiness endpoint is working correctly');
      return true;
    } else {
      console.log('❌ Readiness endpoint is not working correctly');
      return false;
    }
  } catch (error) {
    console.log('❌ Error accessing readiness endpoint:', error.message);
    return false;
  }
}

async function testSecurityHeaders() {
  console.log('Testing security headers...');
  
  try {
    const response = await axios.get('http://localhost:5001/api/health', {
      validateStatus: () => true // Accept any status code
    });
    
    // Check for security headers
    const headers = response.headers;
    const hasSecurityHeaders = headers['x-content-type-options'] === 'nosniff' &&
                              headers['x-frame-options'] === 'SAMEORIGIN';
    
    if (hasSecurityHeaders) {
      console.log('✅ Security headers are present');
      return true;
    } else {
      console.log('❌ Security headers are missing');
      return false;
    }
  } catch (error) {
    console.log('❌ Error testing security headers:', error.message);
    return false;
  }
}

async function main() {
  console.log('Verifying security and operational hardening features...\n');
  
  let allTestsPassed = true;
  
  // Run all tests
  allTestsPassed &= await testMetricsEndpoint();
  allTestsPassed &= await testLivenessEndpoint();
  allTestsPassed &= await testReadinessEndpoint();
  allTestsPassed &= await testSecurityHeaders();
  
  console.log('\n' + '='.repeat(50));
  if (allTestsPassed) {
    console.log('🎉 All security and operational hardening features are working correctly!');
  } else {
    console.log('❌ Some security features are not working correctly.');
    process.exit(1);
  }
}

// Run the verification
main().catch(error => {
  console.error('Error during verification:', error);
  process.exit(1);
});