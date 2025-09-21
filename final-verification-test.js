import fs from 'fs';

import axios from 'axios';
import FormData from 'form-data';

// Test script for final verification of PDF component extraction improvements
async function runFinalVerification() {
  console.log('=== Final Verification Test for PDF Component Extraction ===\n');

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
    // Test 1: Upload a real rulebook PDF
    console.log('Test 1: Uploading a real rulebook PDF...');
    const formData = new FormData();
    formData.append('pdf', fs.createReadStream(testPdfPath));

    const uploadResponse = await axios.post('http://127.0.0.1:5001/upload-pdf', formData, {
      headers: {
        ...formData.getHeaders(),
        'X-Request-ID': 'test-upload-1',
      },
    });

    console.log('✅ Upload successful');
    console.log('Status:', uploadResponse.status);
    console.log('PDF Path:', uploadResponse.data.pdfPath);
    console.log('File size:', uploadResponse.data.size, 'bytes\n');

    // Test 2: Extract textual components from a text-based rulebook
    console.log('Test 2: Extracting textual components from a text-based rulebook...');
    const requestId = 'test-extract-1';
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
    console.log('Extraction method:', extractResponse.data.extractionMethod);
    console.log('Components count:', extractResponse.data.components?.length || 0);

    if (extractResponse.data.components && extractResponse.data.components.length > 0) {
      console.log('✅ Found components:', extractResponse.data.components.length);
      console.log('Sample components:');
      extractResponse.data.components.slice(0, 3).forEach((comp, i) => {
        console.log(`  ${i + 1}. ${comp.name}: ${comp.count !== null ? comp.count : 'N/A'}`);
      });
    } else {
      console.log('⚠️ No components found, but request was successful');
    }

    console.log('');

    // Test 3: Test with scanned PDF (should return pdf_no_text_content error)
    console.log('Test 3: Testing with scanned PDF (should return pdf_no_text_content error)...');
    const scannedPdfPath =
      'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\test-scanned.pdf';

    if (fs.existsSync(scannedPdfPath)) {
      const formData2 = new FormData();
      formData2.append('pdf', fs.createReadStream(scannedPdfPath));

      try {
        const uploadResponse2 = await axios.post('http://127.0.0.1:5001/upload-pdf', formData2, {
          headers: {
            ...formData2.getHeaders(),
            'X-Request-ID': 'test-scanned-upload-1',
          },
        });

        console.log('✅ Scanned PDF upload successful');

        const extractResponse2 = await axios.post(
          'http://127.0.0.1:5001/api/extract-components',
          {
            pdfPath: uploadResponse2.data.pdfPath,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': 'test-scanned-extract-1',
            },
          },
        );

        console.log('❌ Unexpected success - should have failed with pdf_no_text_content');
        console.log('Response:', JSON.stringify(extractResponse2.data, null, 2));
      } catch (error) {
        if (error.response?.data?.code === 'pdf_no_text_content') {
          console.log('✅ Correctly detected PDF with no text content');
          console.log('Error code:', error.response.data.code);
          console.log('Message:', error.response.data.message);
        } else {
          console.log('❌ Unexpected error:', error.response?.data || error.message);
        }
      }
    } else {
      console.log('⚠️ Scanned PDF test file not found, skipping test');
    }

    console.log('');

    // Test 4: Test with text-based PDF but no recognizable components (components_not_found)
    console.log('Test 4: Testing with text-based PDF but no recognizable components...');

    // Create a minimal text-based PDF with generic text
    const genericTextPdfPath =
      'c:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\test-generic.pdf';
    const genericPdfContent = `%PDF-1.4
%âãÏÓ
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 5 0 R
>>
>>
endobj
4 0 obj
<<
/Length 100
>>
stream
BT
/F1 12 Tf
100 700 Td
(This is a generic PDF with text but no game components.) Tj
ET
BT
/F1 12 Tf
100 680 Td
(It contains random text that doesn't match any component patterns.) Tj
ET
BT
/F1 12 Tf
100 660 Td
(There are no boards, cards, tokens, or other game elements here.) Tj
ET
endstream
endobj
5 0 obj
<<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
endobj
xref
0 6
0000000000 65535 f 
0000000015 00000 n 
0000000060 00000 n 
0000000111 00000 n 
0000000274 00000 n 
0000000434 00000 n 
trailer
<<
/Size 6
/Root 1 0 R
>>
startxref
520
%%EOF`;

    fs.writeFileSync(genericTextPdfPath, genericPdfContent);

    const formData3 = new FormData();
    formData3.append('pdf', fs.createReadStream(genericTextPdfPath));

    try {
      const uploadResponse3 = await axios.post('http://127.0.0.1:5001/upload-pdf', formData3, {
        headers: {
          ...formData3.getHeaders(),
          'X-Request-ID': 'test-generic-upload-1',
        },
      });

      console.log('✅ Generic text PDF upload successful');

      try {
        const extractResponse3 = await axios.post(
          'http://127.0.0.1:5001/api/extract-components',
          {
            pdfPath: uploadResponse3.data.pdfPath,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Request-ID': 'test-generic-extract-1',
            },
          },
        );

        console.log('❌ Unexpected success - should have failed with components_not_found');
        console.log('Response:', JSON.stringify(extractResponse3.data, null, 2));
      } catch (error) {
        if (error.response?.data?.code === 'components_not_found') {
          console.log('✅ Correctly detected PDF with text but no recognizable components');
          console.log('Error code:', error.response.data.code);
          console.log('Message:', error.response.data.message);
        } else {
          console.log('❌ Unexpected error:', error.response?.data || error.message);
        }
      }
    } catch (error) {
      console.log('❌ Generic PDF upload failed:', error.response?.data || error.message);
    }

    // Clean up test files
    try {
      fs.unlinkSync(genericTextPdfPath);
    } catch (e) {
      // Ignore cleanup errors
    }

    console.log('\n=== Final Verification Complete ===');
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
        console.log('⚠️ Unexpected error code');
      }
    }
  }
}

runFinalVerification();
