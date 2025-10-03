import WebSocket from 'ws';

// Connect to the WebSocket server
const ws = new WebSocket('ws://localhost:5001');

ws.on('open', () => {
  console.log('Connected to WebSocket server');

  // Send a test message
  ws.send('Hello from client');
});

ws.on('message', (data) => {
  console.log('Received message:', data.toString());
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});
