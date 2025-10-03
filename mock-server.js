import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import bodyParser from 'body-parser';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(bodyParser.json());

// Health endpoint
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Generation endpoint
app.post('/api/generate', (req, res) => {
  // Simulate some processing delay
  setTimeout(() => {
    res.status(200).json({
      id: 'mock-generation-id',
      status: 'done',
      result: {
        title: 'Sample Tutorial',
        content:
          '# Sample Tutorial\n\nThis is a mock generated tutorial content.\n\n## Section 1\n\nLorem ipsum dolor sit amet.',
        metadata: {
          createdAt: new Date().toISOString(),
          duration: '5 minutes',
        },
      },
    });
  }, 1000);
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established');

  // Send a welcome message
  ws.send(
    JSON.stringify({
      type: 'welcome',
      message: 'Connected to mock WebSocket server',
    }),
  );

  // Handle incoming messages
  ws.on('message', (message) => {
    console.log('Received message:', message.toString());

    // Echo the message back
    ws.send(
      JSON.stringify({
        type: 'echo',
        message: `Echo: ${message.toString()}`,
        timestamp: new Date().toISOString(),
      }),
    );
  });

  // Send periodic updates
  const interval = setInterval(() => {
    ws.send(
      JSON.stringify({
        type: 'status',
        message: 'Server is running',
        timestamp: new Date().toISOString(),
      }),
    );
  }, 5000);

  // Handle connection close
  ws.on('close', () => {
    console.log('WebSocket connection closed');
    clearInterval(interval);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Mock server running on port ${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/healthz`);
  console.log(`Generate endpoint: http://localhost:${PORT}/api/generate`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}`);
});
