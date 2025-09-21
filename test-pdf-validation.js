// Test script for PDF validation
console.log('=== PDF Validation Test ===\n');

async function testPDFValidation() {
  try {
    // Test 1: Valid PDF
    console.log('Test 1: Valid PDF');
    const formData1 = new FormData();
    formData1.append(
      'pdf',
      new Blob([await readFile('tests/fixtures/valid-small.pdf')]),
      'valid-small.pdf',
    );

    const response1 = await fetch('http://localhost:5001/upload-pdf', {
      method: 'POST',
      body: formData1,
    });

    const data1 = await response1.json();
    console.log(`Status: ${response1.status}`);
    console.log(`Success: ${data1.success}`);
    console.log('Expected: 200, true');
    console.log(
      `Result: ${response1.status === 200 && data1.success === true ? '✅ PASS' : '❌ FAIL'}\n`,
    );

    // Test 2: Oversized PDF
    console.log('Test 2: Oversized PDF');
    const formData2 = new FormData();
    formData2.append('pdf', new Blob([await readFile('tests/fixtures/big.pdf')]), 'big.pdf');

    const response2 = await fetch('http://localhost:5001/upload-pdf', {
      method: 'POST',
      body: formData2,
    });

    const data2 = await response2.json();
    console.log(`Status: ${response2.status}`);
    console.log(`Code: ${data2.code}`);
    console.log('Expected: 400, pdf_oversize');
    console.log(
      `Result: ${response2.status === 400 && data2.code === 'pdf_oversize' ? '✅ PASS' : '❌ FAIL'}\n`,
    );

    // Test 3: Wrong MIME type
    console.log('Test 3: Wrong MIME type');
    const formData3 = new FormData();
    formData3.append(
      'pdf',
      new Blob([await readFile('tests/fixtures/not-a-pdf.bin')]),
      'not-a-pdf.pdf',
    );

    const response3 = await fetch('http://localhost:5001/upload-pdf', {
      method: 'POST',
      body: formData3,
    });

    const data3 = await response3.json();
    console.log(`Status: ${response3.status}`);
    console.log(`Code: ${data3.code}`);
    console.log('Expected: 400, pdf_bad_signature');
    console.log(
      `Result: ${response3.status === 400 && data3.code === 'pdf_bad_signature' ? '✅ PASS' : '❌ FAIL'}\n`,
    );
  } catch (error) {
    console.log(`❌ Test failed with error: ${error.message}`);
  }

  console.log('=== PDF Validation Test Complete ===');
}

// Helper function to read file as ArrayBuffer
function readFile(filePath) {
  return new Promise((resolve, reject) => {
    const fs = require('fs');
    fs.readFile(filePath, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// Run the test
testPDFValidation();
