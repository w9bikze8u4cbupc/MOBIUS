// Simple test script to verify basic functionality of the Mobius Tutorial Generator
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const BACKEND_URL = 'http://localhost:5001';
const FRONTEND_URL = 'http://localhost:3000';

async function testEndpoint(url, expectedStatus = 200) {
    try {
        const response = await fetch(url);
        const status = response.status;
        const success = status === expectedStatus;
        
        console.log(`${success ? '✅' : '❌'} ${url} - Status: ${status} (Expected: ${expectedStatus})`);
        
        return success;
    } catch (error) {
        console.log(`❌ ${url} - Error: ${error.message}`);
        return false;
    }
}

async function testPostEndpoint(url, body = {}) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        const status = response.status;
        const success = status === 200 || status === 400; // 400 is expected when no file is provided
        
        console.log(`${success ? '✅' : '❌'} ${url} - Status: ${status}`);
        
        return success;
    } catch (error) {
        console.log(`❌ ${url} - Error: ${error.message}`);
        return false;
    }
}

async function testBasicFunctionality() {
    console.log('Mobius Tutorial Generator - Basic Functionality Test');
    console.log('====================================================');
    
    let passedTests = 0;
    let totalTests = 0;
    
    // Test health endpoints
    console.log('\nTesting Health Endpoints:');
    totalTests++;
    if (await testEndpoint(`${BACKEND_URL}/health`)) passedTests++;
    
    totalTests++;
    if (await testEndpoint(`${BACKEND_URL}/health/metrics`)) passedTests++;
    
    // Test API endpoints
    console.log('\nTesting API Endpoints:');
    totalTests++;
    // Test /api/ingest endpoint (expected to fail with 500 when no file provided)
    try {
        const response = await fetch(`${BACKEND_URL}/api/ingest`, { method: 'POST' });
        const status = response.status;
        const success = status === 500; // Expected when no file is provided
        console.log(`${success ? '✅' : '❌'} ${BACKEND_URL}/api/ingest - Status: ${status} (Expected: 500 when no file provided)`);
        if (success) passedTests++;
    } catch (error) {
        console.log(`❌ ${BACKEND_URL}/api/ingest - Error: ${error.message}`);
    }
    
    totalTests++;
    if (await testPostEndpoint(`${BACKEND_URL}/api/preview`)) passedTests++;
    
    totalTests++;
    if (await testPostEndpoint(`${BACKEND_URL}/api/export`)) passedTests++;
    
    // Test frontend accessibility
    console.log('\nTesting Frontend Accessibility:');
    totalTests++;
    if (await testEndpoint(`${FRONTEND_URL}/`)) passedTests++;
    
    // Summary
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passedTests}/${totalTests}`);
    console.log(`Success Rate: ${Math.round((passedTests/totalTests)*100)}%`);
    
    if (passedTests === totalTests) {
        console.log('✅ All basic functionality tests passed!');
        console.log('The environment is ready for comprehensive validation.');
    } else {
        console.log('⚠️  Some tests failed. Please check the issues above.');
    }
}

// Run the test
testBasicFunctionality().catch(console.error);