import fs from 'fs';

import axios from 'axios';
import FormData from 'form-data';

// Test script for logging and tracing functionality
async function testLoggingTracing() {
  console.log('=== Testing Logging and Tracing Functionality ===\n');

  // Get a real PDF file path from the uploads directory
  const pdfFiles = [
    'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\src\\api\\uploads\\1752246529920_ABYSS.pdf',
    'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\src\\api\\uploads\\1751724161933_Jaipur.pdf',
  ];

  let testPdfPath = null;
  for (const path of pdfFiles) {
    if (fs.existsSync(path)) {
      testPdfPath = path;
      break;
    }
  }

  if (!testPdfPath) {
    console.log('❌ No test PDF files found');
    return;
  }

  console.log(`Using test PDF: ${testPdfPath}\n`);

  try {
    // Upload a PDF with a specific request ID
    const requestId = 'test-logging-' + Date.now();
    console.log(`Test 1: Uploading PDF with request ID: ${requestId}`);

    const formData = new FormData();
    formData.append('pdf', fs.createReadStream(testPdfPath));

    const uploadResponse = await axios.post('http://127.0.0.1:5001/upload-pdf', formData, {
      headers: {
        ...formData.getHeaders(),
        'X-Request-ID': requestId,
      },
    });

    console.log('✅ Upload successful');
    console.log('Returned Request ID:', uploadResponse.headers['x-request-id']);
    console.log('PDF Path:', uploadResponse.data.pdfPath);
    console.log('');

    // Extract components with the same request ID
    console.log(`Test 2: Extracting components with request ID: ${requestId}`);

    const extractResponse = await axios.post(
      'http://127.0.0.1:5001/api/extract-components',
      {
        pdfPath: uploadResponse.data.pdfPath,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestId,
        },
      },
    );

    console.log('✅ Component extraction response:');
    console.log('Status:', extractResponse.status);
    console.log('Success:', extractResponse.data.success);
    console.log('Components count:', extractResponse.data.components?.length || 0);
    console.log('Extraction method:', extractResponse.data.extractionMethod);

    // Check if we have the expected diagnostic information
    if (extractResponse.data.components && extractResponse.data.components.length > 0) {
      console.log('✅ Found components:', extractResponse.data.components.length);
      console.log('Sample components:');
      extractResponse.data.components.slice(0, 3).forEach((comp, i) => {
        console.log(`  ${i + 1}. ${comp.name}: ${comp.count !== null ? comp.count : 'N/A'}`);
      });
    }

    console.log('\n=== Logging and Tracing Test Complete ===');
    console.log('To verify logging, check the server logs for entries with Request ID:', requestId);
  } catch (error) {
    console.log('❌ Test failed:', error.response?.data || error.message);
  }
}

testLoggingTracing();
