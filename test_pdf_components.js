import axios from 'axios';
import fs from 'fs';

async function testPDFComponents() {
  try {
    // First, let's upload the PDF to get a URL
    const pdfUrl = 'http://127.0.0.1:5001/uploads/1751722917481_Jaipur.pdf';
    
    console.log('Extracting components from PDF...');
    const response = await axios.get(`http://127.0.0.1:5001/api/extract-components?pdfUrl=${encodeURIComponent(pdfUrl)}`);
    
    console.log('Components Response:', response.data);
    
    // Save to file
    const workDir = './work';
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    
    fs.writeFileSync('./work/components.json', JSON.stringify(response.data, null, 2));
    console.log('Components saved to ./work/components.json');
  } catch (error) {
    console.error('Error extracting components:', error.response?.data || error.message);
  }
}

testPDFComponents();