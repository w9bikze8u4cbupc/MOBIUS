import http from 'http';

const data = JSON.stringify({
  projectId: 'demo',
  chapterId: 'intro',
  chapter: {
    title: 'Intro',
    steps: [
      {
        id: 's1',
        title: 'Welcome',
        body: 'Let us begin!'
      }
    ]
  }
});

const options = {
  hostname: 'localhost',
  port: 5001,
  path: '/api/preview?dryRun=true',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-version': 'v1',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`Status: ${res.statusCode}`);
  
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error('Error:', error);
});

req.write(data);
req.end();