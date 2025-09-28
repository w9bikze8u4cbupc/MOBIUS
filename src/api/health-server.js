import express from 'express';
import cors from 'cors';

const app = express();
const port = process.env.PORT || 5001;

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Health Check Endpoints
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'MOBIUS API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  // Check for ALLOWED_TOKEN in Authorization header for authenticated health check
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  const allowedToken = process.env.ALLOWED_TOKEN;
  
  if (allowedToken && token !== allowedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.json({ 
    status: 'healthy',
    service: 'MOBIUS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    authenticated: !!allowedToken
  });
});

app.listen(port, () => {
  console.log(`🚀 MOBIUS API Server running on port ${port}`);
  console.log(`📱 Health check: http://localhost:${port}/`);
});