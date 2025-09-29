const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const pkg = (() => {
  try {
    return require('./package.json');
  } catch {
    return { name: 'mobius-api-ci', version: '0.0.0' };
  }
})();

const PORT = process.env.PORT || 5001;
const useMocks = process.env.USE_MOCKS === 'true' || process.env.NODE_ENV === 'container';

// Optionally require mocks so the app starts in CI without external deps.
if (useMocks) {
  global.db = require('./mock/db');
  global.aiUtils = require('./mock/aiUtils');
  global.pdfUtils = require('./mock/pdfUtils');
  global.utils = require('./mock/utils');
} else {
  // attempt to require real modules if present; otherwise fall back to mocks
  try {
    global.db = require('./db');
  } catch {
    global.db = require('./mock/db');
  }
  try {
    global.aiUtils = require('./aiUtils');
  } catch {
    global.aiUtils = require('./mock/aiUtils');
  }
  try {
    global.pdfUtils = require('./pdfUtils');
  } catch {
    global.pdfUtils = require('./mock/pdfUtils');
  }
  try {
    global.utils = require('./utils');
  } catch {
    global.utils = require('./mock/utils');
  }
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  const mode = useMocks ? 'mock' : 'prod';
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: pkg.version || '0.0.0',
    mode,
  });
});

// Basic root for quick sanity
app.get('/', (req, res) => {
  res.send(`${pkg.name} - ok`);
});

const server = app.listen(PORT, () => {
  console.log(`${pkg.name} listening on ${PORT} (mode=${useMocks ? 'mock' : 'prod'})`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});