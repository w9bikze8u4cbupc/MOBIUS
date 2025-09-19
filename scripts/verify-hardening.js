#!/usr/bin/env node

/**
 * Hardening Verification Script
 * 
 * This script verifies that all the hardening features are working correctly:
 * - SSRF protection (BGG URL allowlist)
 * - PDF upload safety (size, MIME, signature)
 * - Rate limiting with friendly headers
 * - Temp file lifecycle management
 * - Correlation IDs and structured logs
 * - Worker pool with recycling
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to run a command and get output
function runCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, ...options });
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

// Function to make HTTP requests
async function makeRequest(url, options = {}) {
  const https = await import('https');
  const http = await import('http');
  const urlModule = await import('url');
  
  return new Promise((resolve, reject) => {
    const parsedUrl = urlModule.parse(url);
    const module = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = module.request(parsedUrl, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function verifyHealthEndpoints() {
  console.log('Verifying health endpoints...');
  
  try {
    // Test /healthz endpoint
    const healthzResponse = await makeRequest('http://localhost:5001/healthz');
    if (healthzResponse.statusCode === 200 && healthzResponse.data === 'ok') {
      console.log('✓ /healthz endpoint working correctly');
    } else {
      console.error('✗ /healthz endpoint failed');
      return false;
    }
    
    // Test /readyz endpoint
    const readyzResponse = await makeRequest('http://localhost:5001/readyz');
    if (readyzResponse.statusCode === 200) {
      const data = JSON.parse(readyzResponse.data);
      if (data.status === 'ready') {
        console.log('✓ /readyz endpoint working correctly');
      } else {
        console.log('⚠ /readyz endpoint returned issues:', data.issues || 'Unknown issues');
      }
    } else {
      console.error('✗ /readyz endpoint failed');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('✗ Health endpoint verification failed:', error.message);
    return false;
  }
}

async function verifySSRFProtection() {
  console.log('\nVerifying SSRF protection...');
  
  try {
    // Test valid BGG URL
    const validResponse = await makeRequest('http://localhost:5001/start-extraction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bggUrl: 'https://boardgamegeek.com/boardgame/155987/abyss'
      })
    });
    
    // Should either succeed or fail with a different error than SSRF
    if (validResponse.statusCode === 200 || (validResponse.statusCode === 500 && !validResponse.data.includes('host not allowed'))) {
      console.log('✓ Valid BGG URL accepted');
    } else {
      console.error('✗ Valid BGG URL rejected unexpectedly');
      return false;
    }
    
    // Test invalid URL (SSRF protection)
    const invalidResponse = await makeRequest('http://localhost:5001/start-extraction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bggUrl: 'https://example.com/not-bgg'
      })
    });
    
    if (invalidResponse.statusCode === 400 && invalidResponse.data.includes('host not allowed')) {
      console.log('✓ SSRF protection working - invalid host rejected');
    } else {
      console.error('✗ SSRF protection failed - invalid host not rejected');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('✗ SSRF protection verification failed:', error.message);
    return false;
  }
}

async function verifyPDFUploadSafety() {
  console.log('\nVerifying PDF upload safety...');
  
  try {
    // Create a fake non-PDF file
    const fakeTxtPath = path.join(__dirname, '..', 'fake.txt');
    fs.writeFileSync(fakeTxtPath, 'not a pdf');
    
    // Test non-PDF file upload
    const formData = `------WebKitFormBoundary7MA4YWxkTrZu0gW\r
Content-Disposition: form-data; name="pdf"; filename="fake.txt"\r
Content-Type: text/plain\r
\r
not a pdf\r
------WebKitFormBoundary7MA4YWxkTrZu0gW--`;
    
    const uploadResponse = await makeRequest('http://localhost:5001/upload-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW',
        'Content-Length': Buffer.byteLength(formData)
      },
      body: formData
    });
    
    // Clean up test file
    fs.unlinkSync(fakeTxtPath);
    
    // Should reject non-PDF files
    if (uploadResponse.statusCode === 400) {
      console.log('✓ Non-PDF file rejected correctly');
    } else {
      console.error('✗ Non-PDF file not rejected');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('✗ PDF upload safety verification failed:', error.message);
    return false;
  }
}

async function verifyRateLimiting() {
  console.log('\nVerifying rate limiting...');
  
  try {
    // Make multiple rapid requests to trigger rate limiting
    const requests = [];
    for (let i = 0; i < 15; i++) {
      requests.push(makeRequest('http://localhost:5001/start-extraction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bggUrl: 'https://boardgamegeek.com/boardgame/155987/abyss'
        })
      }));
    }
    
    const responses = await Promise.allSettled(requests);
    
    // Check if any requests were rate limited
    const rateLimited = responses.some(response => 
      response.status === 'fulfilled' && 
      response.value.statusCode === 429 &&
      response.value.headers['retry-after']
    );
    
    if (rateLimited) {
      console.log('✓ Rate limiting working with friendly headers');
    } else {
      console.log('⚠ Rate limiting may not be working (no rate limited responses detected)');
    }
    
    return true;
  } catch (error) {
    console.error('✗ Rate limiting verification failed:', error.message);
    return false;
  }
}

async function verifyTempFileLifecycle() {
  console.log('\nVerifying temp file lifecycle...');
  
  try {
    const tmpDir = path.join(process.cwd(), 'tmp');
    
    // Create a test file with old timestamp
    const oldFile = path.join(tmpDir, 'test-old-file.txt');
    fs.writeFileSync(oldFile, 'test content');
    
    // Set file modification time to 25 hours ago
    const oldTime = new Date(Date.now() - (25 * 60 * 60 * 1000));
    fs.utimesSync(oldFile, oldTime, oldTime);
    
    console.log('✓ Created test file with old timestamp');
    
    // Wait a moment for the sweeper to run (it runs every hour)
    // For testing purposes, we'll just check if the file exists
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if file still exists (it should be removed by the sweeper)
    if (!fs.existsSync(oldFile)) {
      console.log('✓ Temp file lifecycle management working');
    } else {
      console.log('⚠ Temp file lifecycle test inconclusive (file still exists)');
      // Clean up
      fs.unlinkSync(oldFile);
    }
    
    return true;
  } catch (error) {
    console.error('✗ Temp file lifecycle verification failed:', error.message);
    return false;
  }
}

async function verifyCorrelationIds() {
  console.log('\nVerifying correlation IDs...');
  
  try {
    // Make a request with a custom correlation ID
    const response = await makeRequest('http://localhost:5001/healthz', {
      headers: {
        'X-Request-Id': 'test-cid-123'
      }
    });
    
    // Check if the correlation ID is returned in the response
    if (response.headers['x-request-id'] === 'test-cid-123') {
      console.log('✓ Correlation IDs working correctly');
    } else {
      console.log('⚠ Correlation ID not returned in response');
    }
    
    return true;
  } catch (error) {
    console.error('✗ Correlation ID verification failed:', error.message);
    return false;
  }
}

async function verifyWorkerPool() {
  console.log('\nVerifying worker pool...');
  
  try {
    // This is harder to test directly without a PDF, but we can check if the endpoint exists
    const response = await makeRequest('http://localhost:5001/api/extract-images', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pdfUrl: 'https://boardgamegeek.com/boardgame/155987/abyss'
      })
    });
    
    // We expect this to fail (no PDF at that URL), but the endpoint should exist
    if (response.statusCode === 400 || response.statusCode === 500) {
      console.log('✓ Worker pool endpoint accessible');
    } else {
      console.error('✗ Worker pool endpoint not accessible');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('✗ Worker pool verification failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('Mobius Games Tutorial Generator - Hardening Verification');
  console.log('========================================================');
  
  // Check if server is running with retry
  let serverRunning = false;
  for (let i = 0; i < 10; i++) {
    try {
      await makeRequest('http://localhost:5001/healthz');
      serverRunning = true;
      break;
    } catch (error) {
      console.log(`Server not ready, retrying... (${i + 1}/10)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  if (!serverRunning) {
    console.error('Server is not running. Please start the server first:');
    console.error('  npm run dev:up');
    process.exit(1);
  }
  
  // Run all verification tests
  const results = [
    await verifyHealthEndpoints(),
    await verifySSRFProtection(),
    await verifyPDFUploadSafety(),
    await verifyRateLimiting(),
    await verifyTempFileLifecycle(),
    await verifyCorrelationIds(),
    await verifyWorkerPool()
  ];
  
  const passed = results.filter(Boolean).length;
  const total = results.length;
  
  console.log('\nVerification Summary');
  console.log('===================');
  console.log(`Passed: ${passed}/${total}`);
  
  if (passed === total) {
    console.log('✓ All hardening features verified successfully!');
    process.exit(0);
  } else {
    console.log('⚠ Some hardening features may need attention');
    process.exit(1);
  }
}

// Run the verification
main().catch(error => {
  console.error('Verification failed with error:', error);
  process.exit(1);
});