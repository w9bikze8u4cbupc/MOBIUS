import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';

async function uploadAndExtract() {
  try {
    // Upload the PDF
    console.log('Uploading PDF...');
    const formData = new FormData();
    formData.append('pdf', fs.createReadStream('uploads/1751722917481_Jaipur.pdf'));
    
    const uploadResponse = await axios.post('http://127.0.0.1:5001/upload-pdf', formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    
    console.log('Upload Response:', uploadResponse.data);
    
    // Extract components using the pdfPath from the upload response
    const pdfPath = uploadResponse.data.pdfPath;
    console.log('Extracting components from PDF path:', pdfPath);
    
    const extractResponse = await axios.post('http://127.0.0.1:5001/api/extract-components', {
      pdfPath: pdfPath
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Components Response:', extractResponse.data);
    
    // Save to file
    const workDir = './work';
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }
    
    fs.writeFileSync('./work/components.json', JSON.stringify(extractResponse.data, null, 2));
    console.log('Components saved to ./work/components.json');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

uploadAndExtract();