import fs from 'fs';

import axios from 'axios';
import FormData from 'form-data';

async function testPDFExtractionImprovements() {
  console.log('=== PDF Extraction Improvements Test ===\n');

  // Test 1: Upload a real rulebook PDF (if available)
  try {
    console.log('Test 1: Uploading a PDF with embedded text...');

    // Check if we have a real PDF to test with
    const testPdfPath = './test-game-components.pdf';
    if (fs.existsSync(testPdfPath)) {
      const formData = new FormData();
      formData.append('pdf', fs.createReadStream(testPdfPath));

      const uploadResponse = await axios.post('http://127.0.0.1:5001/upload-pdf', formData, {
        headers: formData.getHeaders(),
      });

      console.log('✅ Upload successful');
      console.log('PDF Path:', uploadResponse.data.pdfPath);

      // Test 2: Extract components with request ID tracing
      console.log('\nTest 2: Extracting components with tracing...');

      const extractResponse = await axios.post(
        'http://127.0.0.1:5001/api/extract-components',
        {
          pdfPath: uploadResponse.data.pdfPath,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': 'test-pdf-extraction-1',
          },
        },
      );

      console.log('✅ Component extraction response:');
      console.log('Status:', extractResponse.status);
      console.log('Data:', JSON.stringify(extractResponse.data, null, 2));

      if (extractResponse.data.components && extractResponse.data.components.length > 0) {
        console.log('✅ Found components:', extractResponse.data.components.length);
      } else {
        console.log('⚠️  No components found, but request was successful');
      }
    } else {
      console.log('⚠️  No test PDF found, skipping upload test');
    }
  } catch (error) {
    console.log('❌ Test failed:', error.response?.data || error.message);

    // Check if it's one of our new error codes
    if (error.response?.data?.code) {
      const errorCode = error.response.data.code;
      console.log('Error code:', errorCode);

      switch (errorCode) {
      case 'pdf_no_text_content':
        console.log('✅ Correctly detected PDF with no text content');
        break;
      case 'components_not_found':
        console.log('✅ Correctly detected PDF with text but no recognizable components');
        break;
      default:
        console.log('⚠️  Unexpected error code');
      }
    }
  }

  // Test 3: Test error handling with a broken PDF
  console.log('\nTest 3: Testing error handling...');

  // Create a minimal broken PDF for testing
  const brokenPdfPath = './broken-test.pdf';
  if (!fs.existsSync(brokenPdfPath)) {
    // Create a simple broken PDF content
    const brokenPdfContent =
      '%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n';
    fs.writeFileSync(brokenPdfPath, brokenPdfContent);
  }

  try {
    const formData = new FormData();
    formData.append('pdf', fs.createReadStream(brokenPdfPath));

    const uploadResponse = await axios.post('http://127.0.0.1:5001/upload-pdf', formData, {
      headers: formData.getHeaders(),
    });

    console.log('✅ Broken PDF upload successful');

    // Try to extract components
    const extractResponse = await axios.post(
      'http://127.0.0.1:5001/api/extract-components',
      {
        pdfPath: uploadResponse.data.pdfPath,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'test-broken-pdf-1',
        },
      },
    );

    console.log('Extract response:', extractResponse.data);
  } catch (error) {
    console.log('Expected error for broken PDF:', error.response?.data?.code || error.message);
  }

  console.log('\n=== Test Complete ===');
}

testPDFExtractionImprovements();
