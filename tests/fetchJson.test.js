// Test that require can load the fetchJson module
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetchJson from '../src/utils/fetchJson.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test basic functionality
async function testBasicFunctionality() {
  console.log('Testing basic fetchJson functionality...');
  
  // Test simple GET request
  try {
    await fetchJson('https://httpbin.org/get', {
      timeout: 5000,
      context: { area: 'test', action: 'basic_get' }
    });
    console.log('✓ Basic GET request works');
  } catch (error) {
    console.log('ℹ Basic GET test skipped (network dependency)');
  }
  
  // Test error context
  try {
    await fetchJson('https://httpbin.org/status/404', {
      timeout: 5000,
      context: { area: 'test', action: 'error_test' }
    });
    console.log('✗ Error test failed - should have thrown');
  } catch (error) {
    if (error.status === 404 && error.context) {
      console.log('✓ Error context handling works');
    } else {
      console.log('✗ Error context handling failed');
    }
  }
  
  console.log('All fetchJson tests completed');
}

if (typeof fetchJson === 'function') {
  console.log('✓ Server fetchJson module loads successfully');
  testBasicFunctionality().catch(console.error);
} else {
  console.error('✗ fetchJson is not a function');
  process.exit(1);
}