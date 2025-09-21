async function testCheerio() {
  try {
    console.log('Testing cheerio import...');
    try {
      const cheerio = await import('cheerio');
      console.log('Cheerio imported successfully:', typeof cheerio);

      // Test loading HTML
      const html = '<html><head><title>Test</title></head><body><h1>Hello World</h1></body></html>';
      const $ = cheerio.load ? cheerio.load(html) : require('cheerio').load(html);
      console.log('HTML loaded successfully');
      console.log('Title:', $('title').text());
      console.log('H1:', $('h1').text());
    } catch (importError) {
      console.log('ESM import failed, trying CommonJS...');
      const cheerio = require('cheerio');
      console.log('Cheerio imported successfully:', typeof cheerio);

      // Test loading HTML
      const html = '<html><head><title>Test</title></head><body><h1>Hello World</h1></body></html>';
      const $ = cheerio.load(html);
      console.log('HTML loaded successfully');
      console.log('Title:', $('title').text());
      console.log('H1:', $('h1').text());
    }
  } catch (error) {
    console.error('Error testing cheerio:', error);
  }
}

testCheerio();
