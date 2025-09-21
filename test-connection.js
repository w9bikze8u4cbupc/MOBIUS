// Test script to verify frontend-backend connection
import http from 'http';

// Test the backend API directly
const postData = JSON.stringify({
  bggUrl: 'https://boardgamegeek.com/boardgame/155987/abyss',
});

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/start-extraction',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`Body: ${chunk}`);
  });
  res.on('end', () => {
    console.log('Request completed');
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
