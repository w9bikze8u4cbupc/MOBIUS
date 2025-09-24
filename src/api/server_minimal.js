import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Health endpoint for DHash deployment monitoring
app.get('/health', (req, res) => {
  const healthCheck = {
    uptime: process.uptime(),
    message: 'OK',
    timestamp: Date.now(),
    status: 'healthy',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  };
  
  try {
    res.status(200).json(healthCheck);
  } catch (error) {
    healthCheck.message = error;
    res.status(503).json(healthCheck);
  }
});

// DHash-specific metrics endpoint
app.get('/metrics/dhash', (req, res) => {
  const startTime = Date.now();
  
  try {
    // Simulate hash processing metrics
    const metrics = {
      avg_hash_time: Math.floor(Math.random() * 150) + 50, // 50-200ms
      p95_hash_time: Math.floor(Math.random() * 400) + 200, // 200-600ms
      extraction_failures_rate: (Math.random() * 3).toFixed(2), // 0-3%
      low_confidence_queue_length: Math.floor(Math.random() * 10), // 0-10 items
      total_processed: Math.floor(Math.random() * 1000) + 500,
      timestamp: Date.now(),
      response_time: Date.now() - startTime
    };
    
    res.status(200).json(metrics);
  } catch (error) {
    res.status(503).json({
      error: 'Failed to retrieve DHash metrics',
      timestamp: Date.now(),
      response_time: Date.now() - startTime
    });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📱 Frontend should connect to: http://localhost:${PORT}`);
    console.log(`🔍 Health endpoint available at: http://localhost:${PORT}/health`);
    console.log(`📊 Metrics endpoint available at: http://localhost:${PORT}/metrics/dhash`);
});