// Test URL parsing
const url = 'http://127.0.0.1:5001/uploads/1751722917481_Jaipur.pdf';
try {
  const h = new URL(url).hostname.toLowerCase();
  console.log('URL:', url);
  console.log('Hostname:', h);
  console.log('Is localhost:', h === 'localhost');
  console.log('Is 127.0.0.1:', h === '127.0.0.1');
} catch (e) {
  console.error('Error:', e);
}
