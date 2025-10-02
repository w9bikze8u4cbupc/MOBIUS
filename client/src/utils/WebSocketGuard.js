// WebSocketGuard.js - reduces reconnect spam
let wsReconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30s max

export function getWsReconnectDelay() {
  const delay = Math.min(
    1000 * Math.pow(1.5, wsReconnectAttempts),
    MAX_RECONNECT_DELAY
  );
  wsReconnectAttempts++;
  return delay;
}

export function resetWsReconnectAttempts() {
  wsReconnectAttempts = 0;
}
