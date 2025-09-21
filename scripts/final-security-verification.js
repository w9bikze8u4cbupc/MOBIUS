#!/usr/bin/env node

// Final comprehensive security and operational hardening verification

import { spawn } from 'child_process';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

import axios from 'axios';

const exec = promisify(execCallback);

console.log('🔐 Final Security and Operational Hardening Verification');
console.log('='.repeat(60));

async function verifyAllFeatures() {
  let passed = 0;
  let total = 0;

  // Test 1: Security Headers
  total++;
  console.log('\n1. Testing Security Headers...');
  try {
    const response = await axios.get('http://localhost:3000/api/health', {
      validateStatus: () => true,
    });

    const headers = response.headers;
    const hasSecurityHeaders =
      headers['x-content-type-options'] === 'nosniff' &&
      headers['x-frame-options'] === 'SAMEORIGIN';

    if (hasSecurityHeaders) {
      console.log('   ✅ Security headers present');
      passed++;
    } else {
      console.log('   ❌ Security headers missing');
    }
  } catch (error) {
    console.log('   ❌ Error testing security headers:', error.message);
  }

  // Test 2: Rate Limiting
  total++;
  console.log('\n2. Testing Rate Limiting...');
  try {
    // This would require a running server and actual rate limiting tests
    console.log('   ⚠️  Rate limiting verification requires manual testing');
  } catch (error) {
    console.log('   ❌ Error testing rate limiting:', error.message);
  }

  // Test 3: CORS Configuration
  total++;
  console.log('\n3. Testing CORS Configuration...');
  try {
    const response = await axios.get('http://localhost:3000/api/health', {
      validateStatus: () => true,
      headers: {
        Origin: 'http://example.com',
      },
    });

    // Check if CORS headers are present when appropriate
    const corsHeader = response.headers['access-control-allow-origin'];
    console.log('   ⚠️  CORS verification requires specific origin testing');
  } catch (error) {
    console.log('   ❌ Error testing CORS:', error.message);
  }

  // Test 4: Metrics Endpoint Security
  total++;
  console.log('\n4. Testing Metrics Endpoint Security...');
  try {
    const response = await axios.get('http://localhost:3000/metrics', {
      validateStatus: () => true,
    });

    if (response.status === 403) {
      console.log('   ✅ Metrics endpoint properly secured');
      passed++;
    } else {
      console.log('   ❌ Metrics endpoint not properly secured');
    }
  } catch (error) {
    console.log('   ❌ Error testing metrics security:', error.message);
  }

  // Test 5: Liveness Endpoint
  total++;
  console.log('\n5. Testing Liveness Endpoint...');
  try {
    const response = await axios.get('http://localhost:3000/livez');

    if (response.status === 200 && response.data === 'OK') {
      console.log('   ✅ Liveness endpoint working');
      passed++;
    } else {
      console.log('   ❌ Liveness endpoint not working');
    }
  } catch (error) {
    console.log('   ❌ Error testing liveness endpoint:', error.message);
  }

  // Test 6: Readiness Endpoint
  total++;
  console.log('\n6. Testing Readiness Endpoint...');
  try {
    const response = await axios.get('http://localhost:3000/readyz', {
      validateStatus: () => true,
    });

    if (response.status === 200 || response.status === 503) {
      console.log('   ✅ Readiness endpoint working');
      passed++;
    } else {
      console.log('   ❌ Readiness endpoint not working');
    }
  } catch (error) {
    console.log('   ❌ Error testing readiness endpoint:', error.message);
  }

  // Test 7: Build Info Metric
  total++;
  console.log('\n7. Testing Build Info Metric...');
  try {
    const response = await axios.get('http://localhost:3000/metrics', {
      validateStatus: () => true,
      headers: {
        Authorization: 'Bearer test-token', // This should fail, but we can check for build_info in response
      },
    });

    // Even if auth fails, we can check if build_info would be present
    console.log('   ⚠️  Build info metric verification requires authenticated access');
  } catch (error) {
    console.log('   ❌ Error testing build info metric:', error.message);
  }

  // Test 8: Dependency Pinning
  total++;
  console.log('\n8. Testing Dependency Pinning...');
  try {
    const { stdout } = await exec('node --version');
    const nodeVersion = stdout.trim();
    console.log(`   ✅ Node.js version: ${nodeVersion}`);

    // Check package.json for engine specification
    const packageJson = await import('../package.json', { assert: { type: 'json' } });
    if (packageJson.default.engines && packageJson.default.engines.node) {
      console.log(`   ✅ Node version pinned: ${packageJson.default.engines.node}`);
      passed++;
    } else {
      console.log('   ❌ Node version not pinned');
    }
  } catch (error) {
    console.log('   ❌ Error testing dependency pinning:', error.message);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`Security Verification Results: ${passed}/${total} tests passed`);

  if (passed === total) {
    console.log('🎉 All security and operational hardening features are properly implemented!');
  } else {
    console.log('⚠️  Some features may need additional verification or implementation.');
  }

  return passed === total;
}

// Run verification
verifyAllFeatures().catch((error) => {
  console.error('Error during verification:', error);
  process.exit(1);
});
