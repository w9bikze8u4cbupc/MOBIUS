const express = require('express');
const cors = require('cors');
const os = require('os');
const pidusage = require('pidusage');

const pkg = (() => {
  try {
    return require('./package.json');
  } catch {
    return { name: 'mobius-api-ci', version: '0.0.0' };
  }
})();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 5001;
const useMocks = process.env.USE_MOCKS === 'true' || process.env.NODE_ENV === 'container';

// Mock modules (minimal, synchronous and fast)
const mockDb = {
  async connect() { return true; },
  async close() { return true; },
  async query() { return []; },
};

const mockAi = {
  async analyze() { return { summary: 'mock', tokens: 0 }; },
};

const mockPdf = {
  async generatePdf() { return { path: '/tmp/mock.pdf', size: 0 }; },
};

const utils = {
  nowIso() { return new Date().toISOString(); },
};

// Expose some globals so tests can assert mode
const runtime = {
  mode: useMocks ? 'mock' : 'prod',
  version: pkg.version || '0.0.0',
};

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: runtime.version,
    mode: runtime.mode,
  });
});

app.get('/ready', async (req, res) => {
  try {
    const mem = process.memoryUsage();
    const cpu = await pidusage(process.pid);
    res.json({
      ready: true,
      uptime: process.uptime(),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
      },
      cpuPercent: cpu.cpu,
      mode: runtime.mode,
    });
  } catch (err) {
    res.status(500).json({ ready: false, error: String(err) });
  }
});

app.get('/api/info', (req, res) => {
  res.json({
    name: pkg.name,
    version: runtime.version,
    endpoints: ['/health', '/ready', '/api/info', '/api/echo'],
    mode: runtime.mode,
  });
});

app.post('/api/echo', (req, res) => {
  res.json({
    echo: req.body,
    mode: runtime.mode,
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'not_found' });
});

const server = app.listen(PORT, () => {
  console.log(`${pkg.name} listening on ${PORT} (mode=${runtime.mode})`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});