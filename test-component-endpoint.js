import axios from 'axios';

async function testComponentEndpoint() {
  try {
    console.log('Testing component extraction endpoint...');

    // Use a test PDF path
    const testPdfPath =
      'C:\\Users\\danie\\Documents\\mobius-games-tutorial-generator\\src\\api\\uploads\\1758368018492_test_game_components.pdf';

    const response = await axios.post(
      'http://127.0.0.1:5001/api/extract-components',
      {
        pdfPath: testPdfPath,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': 'test-comp-1',
        },
      },
    );

    console.log('✅ Success!');
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);
  }
}

testComponentEndpoint();
