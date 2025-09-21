import axios from 'axios';

async function testTextNoComponents() {
  try {
    console.log('Testing component extraction with text but no components...');

    // Use our test PDF that has text but no recognizable components
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
          'X-Request-ID': 'test-text-no-comp',
        },
      },
    );

    console.log('✅ Success!');
    console.log('Status:', response.status);
    console.log('Components found:', response.data.components?.length || 0);
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Error:', error.response?.data || error.message);

    // Check if it's our expected error
    if (error.response?.data?.code === 'components_not_found') {
      console.log('✅ Correctly detected PDF with text but no recognizable components');
    }
  }
}

testTextNoComponents();
