#!/usr/bin/env node

// Script to test frontend-backend connection

import axios from 'axios';

async function testConnection() {
  console.log('Testing frontend-backend connection...\n');
  
  try {
    // Test the health endpoint through the proxy (assuming frontend is running on port 3000)
    console.log('1. Testing health endpoint through proxy...');
    const healthResponse = await axios.get('http://localhost:3000/api/health');
    console.log('   ✅ Health endpoint accessible');
    console.log('   📊 Service:', healthResponse.data.service);
    console.log('   🕐 Time:', healthResponse.data.time);
    
    // Test the detailed health endpoint
    console.log('\n2. Testing detailed health endpoint...');
    const detailedHealthResponse = await axios.get('http://localhost:3000/api/health/details');
    console.log('   ✅ Detailed health endpoint accessible');
    console.log('   📦 Version:', detailedHealthResponse.data.version);
    console.log('   🧠 Node:', detailedHealthResponse.data.node);
    console.log('   💾 Memory usage:', detailedHealthResponse.data.rssMB, 'MB');
    
    // Test liveness endpoint
    console.log('\n3. Testing liveness endpoint...');
    const livezResponse = await axios.get('http://localhost:3000/livez');
    console.log('   ✅ Liveness endpoint accessible');
    console.log('   🟢 Status:', livezResponse.data);
    
    // Test readiness endpoint
    console.log('\n4. Testing readiness endpoint...');
    const readyzResponse = await axios.get('http://localhost:3000/readyz');
    console.log('   ✅ Readiness endpoint accessible');
    console.log('   🟢 Status:', readyzResponse.data.status);
    console.log('   💾 Memory:', readyzResponse.data.rssMB, 'MB');
    console.log('   ⏱️  Event loop delay:', readyzResponse.data.loopMs, 'ms');
    
    // Test metrics endpoint (should be secured)
    console.log('\n5. Testing metrics endpoint security...');
    try {
      const metricsResponse = await axios.get('http://localhost:3000/metrics');
      console.log('   ⚠️  Metrics endpoint accessible (may be OK for localhost)');
      if (metricsResponse.data.includes('build_info')) {
        console.log('   📊 Build info found in metrics');
      }
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.log('   ✅ Metrics endpoint properly secured');
      } else {
        console.log('   ❓ Metrics endpoint behavior:', error.response?.status || error.message);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('🎉 All connection tests passed!');
    console.log('The frontend can successfully communicate with the backend.');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
testConnection().catch(error => {
  console.error('Error during connection test:', error);
  process.exit(1);
});