// ws-client.mjs
import WebSocket from "ws";

const URL = process.env.WS_URL || "ws://localhost:5002/ws";
const ws = new WebSocket(URL);

ws.on("open", () => {
  console.log("connected to", URL);
  ws.send(JSON.stringify({ type: "ping" }));
});

ws.on("message", (data) => {
  try {
    console.log("message:", JSON.parse(data.toString()));
  } catch {
    console.log("message (raw):", data.toString());
  }
});

ws.on("close", () => console.log("closed"));
ws.on("error", (err) => console.error("error", err));