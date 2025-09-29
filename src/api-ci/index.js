const http = require('http');
const url = require('url');

const pkg = {
  name: 'mobius-api-ci',
  version: '0.1.0'
};

const PORT = process.env.PORT ? Number(process.env.PORT) : 5001;
const useMocks = process.env.USE_MOCKS === 'true' || process.env.NODE_ENV === 'container';

// Expose some globals so tests can assert mode
const runtime = {
  mode: useMocks ? 'mock' : 'prod',
  version: pkg.version || '0.0.0',
};

function parseBody(req, callback) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  req.on('end', () => {
    try {
      callback(null, body ? JSON.parse(body) : {});
    } catch (e) {
      callback(e);
    }
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;
  const pathname = parsedUrl.pathname;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (method === 'GET' && pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: runtime.version,
      mode: runtime.mode,
    }));
    return;
  }

  if (method === 'GET' && pathname === '/ready') {
    try {
      const mem = process.memoryUsage();
      res.writeHead(200);
      res.end(JSON.stringify({
        ready: true,
        uptime: process.uptime(),
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
        },
        cpuPercent: 0, // simplified
        mode: runtime.mode,
      }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ ready: false, error: String(err) }));
    }
    return;
  }

  if (method === 'GET' && pathname === '/api/info') {
    res.writeHead(200);
    res.end(JSON.stringify({
      name: pkg.name,
      version: runtime.version,
      endpoints: ['/health', '/ready', '/api/info', '/api/echo'],
      mode: runtime.mode,
    }));
    return;
  }

  if (method === 'POST' && pathname === '/api/echo') {
    parseBody(req, (err, body) => {
      if (err) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'invalid_json' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify({
        echo: body,
        mode: runtime.mode,
      }));
    });
    return;
  }

  // 404 handler
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(PORT, () => {
  console.log(`${pkg.name} listening on ${PORT} (mode=${runtime.mode})`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});