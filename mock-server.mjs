// mock-server.mjs
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { randomUUID } from "crypto";
import cors from "cors";

const PORT = process.env.PORT || 5002;
const app = express();
app.use(cors());
app.use(express.json());

// Health endpoint
app.get("/healthz", (req, res) => res.send("OK"));

// Simple /api/generate — immediate mock response with an id.
// Adjust shape to match your real backend's response if needed.
app.post("/api/generate", (req, res) => {
  const id = randomUUID();
  // Example: return an immediate success. You can also return queued status.
  res.json({
    id,
    status: "done",
    result: {
      title: "Mock tutorial",
      content: "This is generated mock content.",
      input: req.body || {}
    }
  });
});

// start HTTP server (needed for WS attach)
const server = http.createServer(app);

// Attach WebSocket server at /ws
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws, req) => {
  console.log("WS connected:", req.socket.remoteAddress);
  // Inform client it's connected
  ws.send(JSON.stringify({ type: "connected", time: Date.now() }));

  // Periodic progress messages (example)
  const interval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: "progress",
        timestamp: Date.now(),
        percent: Math.floor(Math.random() * 100)
      }));
    }
  }, 5000);

  ws.on("message", (msg) => {
    try {
      const obj = JSON.parse(msg.toString());
      if (obj.type === "ping") {
        ws.send(JSON.stringify({ type: "pong", time: Date.now() }));
      }
    } catch (e) {
      // echo for non-json
      ws.send(JSON.stringify({ type: "echo", data: msg.toString() }));
    }
  });

  ws.on("close", () => {
    clearInterval(interval);
    console.log("WS closed");
  });

  ws.on("error", (err) => {
    console.error("WS error", err);
  });
});

// graceful shutdown
const shutdown = () => {
  console.log("shutting down mock server...");
  wss.close();
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, () => {
  console.log(`Mock server listening on http://localhost:${PORT}`);
  console.log(`WS endpoint: ws://localhost:${PORT}/ws`);
});