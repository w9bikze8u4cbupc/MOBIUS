// Simple smoke test to verify the Mobius Tutorial Generator frontend
const puppeteer = require('puppeteer');
const http = require('http');

async function smokeTest() {
  console.log('Starting Mobius Tutorial Generator smoke test...');
  
  // Check if backend is running
  try {
    await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:5001/healthz', (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Backend is running and responding');
          resolve();
        } else {
          reject(new Error(`Backend returned status ${res.statusCode}`));
        }
      });
      req.on('error', reject);
      req.end();
    });
  } catch (error) {
    console.log('❌ Backend is not running or not responding');
    console.log('   Please start the backend server on port 5001');
    return;
  }
  
  // Launch browser and test frontend
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Navigate to the app
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
    
    // Wait for the main content to load
    await page.waitForSelector('h1', { timeout: 5000 });
    
    // Check if the main title is present
    const title = await page.$eval('h1', el => el.textContent);
    if (title.includes('Mobius Tutorial Generator')) {
      console.log('✅ Frontend is running and displaying correctly');
    } else {
      console.log('❌ Frontend title not found or incorrect');
      console.log('   Actual title:', title);
    }
    
    // Check if the project form is present
    try {
      await page.waitForSelector('form', { timeout: 5000 });
      const formExists = await page.$('form');
      if (formExists) {
        console.log('✅ Project form is present');
      } else {
        console.log('❌ Project form not found');
      }
    } catch (error) {
      console.log('❌ Project form not found within timeout');
    }
    
    // Check if rulebook ingestion section is present
    try {
      await page.waitForSelector('h2', { timeout: 5000 });
      // Get all h2 elements and check if any contain "Rulebook Ingestion"
      const h2Texts = await page.evaluate(() => {
        const h2Elements = Array.from(document.querySelectorAll('h2'));
        return h2Elements.map(el => el.textContent);
      });
      
      const ingestionExists = h2Texts.some(text => text.includes('Rulebook Ingestion'));
      if (ingestionExists) {
        console.log('✅ Rulebook ingestion section is present');
      } else {
        console.log('❌ Rulebook ingestion section not found');
        console.log('   Available h2 elements:', h2Texts);
      }
    } catch (error) {
      console.log('❌ Rulebook ingestion section not found within timeout');
    }
    
    console.log('✅ Smoke test completed successfully');
  } catch (error) {
    console.log('❌ Smoke test failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run the smoke test
smokeTest().catch(console.error);