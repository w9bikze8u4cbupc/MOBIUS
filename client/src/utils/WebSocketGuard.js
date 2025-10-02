/**
 * WebSocket Connection Guard with Exponential Backoff
 *
 * This utility provides a robust WebSocket connection handler with:
 * - Exponential backoff retry logic
 * - Jitter to prevent thundering herd
 * - Connection state management
 * - Error handling and recovery
 */

class WebSocketGuard {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      maxRetries: options.maxRetries || 5,
      initialDelay: options.initialDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      jitter: options.jitter || true,
      onOpen: options.onOpen || (() => {}),
      onClose: options.onClose || (() => {}),
      onError: options.onError || (() => {}),
      onMessage: options.onMessage || (() => {}),
      ...options,
    };

    this.ws = null;
    this.retryCount = 0;
    this.isConnected = false;
    this.shouldReconnect = true;
  }

  connect() {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);
      this.setupEventListeners();
    } catch (error) {
      this.options.onError(error);
      this.handleReconnect();
    }
  }

  setupEventListeners() {
    this.ws.onopen = event => {
      this.isConnected = true;
      this.retryCount = 0;
      this.options.onOpen(event);
    };

    this.ws.onclose = event => {
      this.isConnected = false;
      this.options.onClose(event);

      if (this.shouldReconnect && !event.wasClean) {
        this.handleReconnect();
      }
    };

    this.ws.onerror = error => {
      this.options.onError(error);
      // Error events are often followed by close events, so we let the close handler manage reconnection
    };

    this.ws.onmessage = event => {
      this.options.onMessage(event);
    };
  }

  handleReconnect() {
    if (this.retryCount >= this.options.maxRetries) {
      console.warn(
        `WebSocket: Max retries (${this.options.maxRetries}) exceeded`
      );
      return;
    }

    const delay = this.calculateDelay();
    this.retryCount++;

    console.log(
      `WebSocket: Reconnecting in ${delay}ms (attempt ${this.retryCount}/${this.options.maxRetries})`
    );

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }

  calculateDelay() {
    const exponentialDelay =
      this.options.initialDelay * Math.pow(2, this.retryCount);
    const cappedDelay = Math.min(exponentialDelay, this.options.maxDelay);

    if (this.options.jitter) {
      // Add jitter: 0 to 50% of the delay
      const jitter = Math.random() * 0.5 * cappedDelay;
      return cappedDelay + jitter;
    }

    return cappedDelay;
  }

  send(data) {
    if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.warn('WebSocket: Not connected, unable to send message');
    }
  }

  close() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
    }
  }

  // Reset retry count when connection is manually re-established
  resetRetryCount() {
    this.retryCount = 0;
  }
}

export default WebSocketGuard;
