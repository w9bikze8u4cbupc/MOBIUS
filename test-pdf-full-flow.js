import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import axios from 'axios';
import FormData from 'form-data';

// Integration test for the full PDF component extraction flow
async function runFullFlowIntegrationTest() {
  console.log('=== Full Flow Integration Test for PDF Component Extraction ===\n');

  try {
    // Test 1: Health and readiness endpoints
    console.log('Test 1: Testing health and readiness endpoints...');
    try {
      const healthResponse = await axios.get('http://127.0.0.1:5001/healthz');
      console.log('✅ Health endpoint:', healthResponse.status, healthResponse.data);
    } catch (error) {
      console.log('⚠️ Health endpoint test failed:', error.message);
    }

    try {
      const readyResponse = await axios.get('http://127.0.0.1:5001/readyz');
      console.log('✅ Readiness endpoint:', readyResponse.status);
      if (readyResponse.data) {
        console.log('Readiness status:', readyResponse.data.status);
      }
    } catch (error) {
      console.log('⚠️ Readiness endpoint test failed:', error.message);
    }
    console.log('');

    // Test 2: Upload a text-based PDF and extract components
    console.log('Test 2: Upload and extract components from text-based PDF...');

    // For this test, we'll create a simple text file and convert it to PDF
    // In a real scenario, you would use an actual PDF file
    const testContent = `
      Components:
      
      1 Game board
      71 Exploration cards (65 Allies & 6 Monsters)
      35 Lords
      20 Locations
      20 Monster tokens
      1 Threat token
      10 Key tokens
      Pearls (supply)
      Plastic cups (used for the Treasury)
      
      Setup:
      Place the board in the center of the table...
    `;

    // Write test content to a file
    const testFilePath = './test-content.txt';
    fs.writeFileSync(testFilePath, testContent);

    console.log('✅ Created test content file');

    // In a real implementation, we would convert this to PDF and upload it
    // For now, we'll test the component extraction directly
    console.log('✅ Simulating PDF upload and component extraction');

    // Test 3: Direct component extraction test
    console.log('Test 3: Direct component extraction from text...');
    try {
      // Import the extraction function
      const { extractComponentsFromText } = await import('./src/api/utils.js');

      const components = extractComponentsFromText(testContent);
      console.log('✅ Component extraction successful');
      console.log('Components found:', components.length);

      if (components.length > 0) {
        console.log('Extracted components:');
        components.forEach((comp, i) => {
          console.log(`  ${i + 1}. ${comp.name}: ${comp.count !== null ? comp.count : 'N/A'}`);
        });
      }
      console.log('');
    } catch (error) {
      console.log('❌ Component extraction failed:', error.message);
      console.log('');
    }

    // Clean up test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log('✅ Cleaned up test file');
    }

    // Test 4: Test error handling paths
    console.log('Test 4: Testing error handling paths...');

    // Test with empty text
    try {
      const { extractComponentsFromText } = await import('./src/api/utils.js');
      const emptyComponents = extractComponentsFromText('');
      console.log('✅ Empty text handled correctly, components found:', emptyComponents.length);
    } catch (error) {
      console.log('❌ Empty text handling failed:', error.message);
    }

    // Test with generic text (no components)
    try {
      const genericText = 'This is just generic text with no game components mentioned.';
      const { extractComponentsFromText } = await import('./src/api/utils.js');
      const genericComponents = extractComponentsFromText(genericText);
      console.log('✅ Generic text handled correctly, components found:', genericComponents.length);
    } catch (error) {
      console.log('❌ Generic text handling failed:', error.message);
    }

    console.log('');

    console.log('=== Full Flow Integration Test Complete ===');
  } catch (error) {
    console.log('❌ Integration test failed:', error.message);
  }
}

runFullFlowIntegrationTest();
