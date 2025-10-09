// src/api/health.js
import { Router } from 'express';
import os from 'os';
import { Metrics } from '../metrics/metrics.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    requestId: req.requestId,
    hostname: os.hostname(),
    pid: process.pid,
  });
});

router.get('/metrics', (req, res) => {
  res.json({
    counters: Metrics.snapshot(),
    time: new Date().toISOString(),
  });
});

export default router;