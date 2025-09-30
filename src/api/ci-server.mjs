#!/usr/bin/env node
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5001;
let ready = false;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', pid: process.pid, ts: new Date().toISOString() });
});

app.get('/ready', (req, res) => {
  if (ready) return res.json({ ready: true });
  return res.status(503).json({ ready: false });
});

app.get('/api/info', (req, res) => {
  res.json({ mode: 'ci-mock', version: process.env.npm_package_version || '0.0.0' });
});

app.post('/api/echo', (req, res) => {
  res.json({ echo: req.body || null });
});

app.get('/api/echo/:msg', (req, res) => {
  res.json({ echo: req.params.msg });
});

// A simple 404 endpoint test (explicit)
app.get('/not-found', (req, res) => {
  res.status(404).json({ error: 'not found' });
});

const server = app.listen(PORT, () => {
  ready = true;
  console.log(`CI mock API listening on ${PORT}`);
});

const graceful = () => {
  ready = false;
  server.close(() => {
    console.log('CI mock API shutting down');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
};
process.on('SIGINT', graceful);
process.on('SIGTERM', graceful);
