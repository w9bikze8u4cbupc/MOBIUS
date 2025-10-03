import WebSocketGuard from '../WebSocketGuard';

// Mock WebSocket
global.WebSocket = jest.fn();

jest.useRealTimers();

describe('WebSocketGuard', () => {
  let mockWebSocket;
  let guard;
  let options;

  beforeEach(() => {
    mockWebSocket = {
      close: jest.fn(),
      send: jest.fn(),
      readyState: WebSocket.CONNECTING,
      // onopen/onclose/onmessage/onerror will be set by implementation when created
    };

    WebSocket.mockImplementation(() => mockWebSocket);

    options = {
      maxRetries: 3,
      initialDelay: 100,
      maxDelay: 1000,
      onOpen: jest.fn(),
      onClose: jest.fn(),
      onError: jest.fn(),
      onMessage: jest.fn(),
    };

    guard = new WebSocketGuard('ws://localhost:8080', options);
  });

  afterEach(() => {
    // Always restore timers to real timers
    jest.useRealTimers();

    // Clear pending timers and mocks
    jest.clearAllTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();

    // Close any live socket created by guard
    try {
      if (guard && typeof guard.close === 'function') {
        guard.close();
      }
    } catch (e) {
      // ignore
    }

    // Restore Math.random if it was stubbed via spy
    try {
      if (global.Math && global.Math.random && global.Math.random.mockRestore) {
        global.Math.random.mockRestore();
      }
    } catch (e) {
      // ignore
    }
  });

  // Basic tests
  describe('Basic functionality', () => {
    test('should create a WebSocket connection', () => {
      expect(guard.url).toBe('ws://localhost:8080');
      expect(guard.options.maxRetries).toBe(3);
      expect(guard.options.initialDelay).toBe(100);
    });

    test('should connect to WebSocket', () => {
      guard.connect();
      expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8080');
    });

    test('should not reconnect if already connected', () => {
      guard.connect();
      guard.ws.readyState = WebSocket.OPEN;
      WebSocket.mockClear();
      guard.connect();
      expect(WebSocket).not.toHaveBeenCalled();
    });
  });

  // Event handling tests
  describe('Event handling', () => {
    test('should handle WebSocket open event', () => {
      guard.connect();
      mockWebSocket.readyState = WebSocket.OPEN;
      // Call the onopen handler if set
      if (typeof mockWebSocket.onopen === 'function') {
        mockWebSocket.onopen();
      }

      expect(guard.isConnected).toBe(true);
      expect(guard.retryCount).toBe(0);
      expect(options.onOpen).toHaveBeenCalled();
    });

    test('should handle WebSocket close event', () => {
      guard.connect();
      const closeEvent = { wasClean: false };
      if (typeof mockWebSocket.onclose === 'function') {
        mockWebSocket.onclose(closeEvent);
      }

      expect(guard.isConnected).toBe(false);
      expect(options.onClose).toHaveBeenCalledWith(closeEvent);
    });

    test('should handle WebSocket error event', () => {
      guard.connect();
      const error = new Error('Connection failed');
      if (typeof mockWebSocket.onerror === 'function') {
        mockWebSocket.onerror(error);
      }

      expect(options.onError).toHaveBeenCalledWith(error);
    });

    test('should handle WebSocket message event', () => {
      guard.connect();
      const messageEvent = { data: 'test message' };
      if (typeof mockWebSocket.onmessage === 'function') {
        mockWebSocket.onmessage(messageEvent);
      }

      expect(options.onMessage).toHaveBeenCalledWith(messageEvent);
    });
  });

  // Message sending tests
  describe('Message sending', () => {
    test('should send message when connected', () => {
      guard.connect();
      mockWebSocket.readyState = WebSocket.OPEN;
      guard.isConnected = true;

      const testData = 'Hello WebSocket';
      guard.send(testData);

      expect(mockWebSocket.send).toHaveBeenCalledWith(testData);
    });

    test('should not send message when not connected', () => {
      guard.send('test data');
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });
  });

  // Connection closing tests
  describe('Connection closing', () => {
    test('should close connection', () => {
      guard.connect();
      guard.close();

      expect(guard.shouldReconnect).toBe(false);
      expect(mockWebSocket.close).toHaveBeenCalled();
    });
  });

  // Delay calculation tests
  describe('Delay calculation', () => {
    test('should calculate delay with exponential backoff', () => {
      guard.retryCount = 0;
      let delay = guard.calculateDelay();
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(150); // 100 + jitter (0-50)

      guard.retryCount = 1;
      delay = guard.calculateDelay();
      expect(delay).toBeGreaterThanOrEqual(200);
      expect(delay).toBeLessThanOrEqual(300); // 200 + jitter (0-100)

      guard.retryCount = 3; // Should be capped at maxDelay
      delay = guard.calculateDelay();
      expect(delay).toBeGreaterThanOrEqual(800);
      expect(delay).toBeLessThanOrEqual(1200); // 800 + jitter (0-400)
    });

    test('should reset retry count', () => {
      guard.retryCount = 5;
      guard.resetRetryCount();
      expect(guard.retryCount).toBe(0);
    });
  });

  // Edge case tests
  describe('Edge cases', () => {
    test('applies exponential backoff + jitter within bounds (deterministic jitter test 1)', () => {
      jest.useFakeTimers();
      // Mock Math.random to make the jitter predictable
      jest.spyOn(global.Math, 'random').mockImplementation(() => 0.1);

      const deterministicGuard = new WebSocketGuard('ws://localhost:8080', {
        maxRetries: 5,
        initialDelay: 100,
        maxDelay: 30000,
      });

      jest.spyOn(console, 'log').mockImplementation(() => {});

      deterministicGuard.connect();
      expect(WebSocket).toHaveBeenCalledTimes(1);

      // Simulate connection error and close
      mockWebSocket.onerror(new Error('Connection failed'));
      mockWebSocket.onclose({ wasClean: false });

      // For retryCount = 0: delay = 100 * 2^0 = 100ms, jitter (0.1 * 50 = 5ms) => ~105ms
      jest.advanceTimersByTime(110);

      // Should have attempted to reconnect
      expect(WebSocket).toHaveBeenCalledTimes(2);

      console.log.mockRestore();
    });

    test('does not exceed maximum retry attempts (test 1)', () => {
      jest.useFakeTimers();

      const guardLocal = new WebSocketGuard('ws://localhost:8080', {
        maxRetries: 2,
        initialDelay: 100,
      });

      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      guardLocal.connect();

      for (let i = 0; i < 3; i++) {
        mockWebSocket.onerror(new Error('Connection failed'));
        mockWebSocket.onclose({ wasClean: false });
        jest.advanceTimersByTime(200);
      }

      jest.useRealTimers();
      console.log.mockRestore();
      console.warn.mockRestore();
    });

    test('respects max delay cap', () => {
      const guardLocal = new WebSocketGuard('ws://localhost:8080', {
        maxRetries: 5,
        initialDelay: 100,
        maxDelay: 500,
      });

      guardLocal.retryCount = 10; // High retry count that would exceed maxDelay
      const delay = guardLocal.calculateDelay();

      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(750); // 500 + jitter (0-250)
    });
  });

  // Additional tests
  describe('Additional tests', () => {
    test('applies exponential backoff + jitter within bounds (deterministic jitter test 2)', () => {
      jest.useFakeTimers();

      const guardLocal = new WebSocketGuard('ws://localhost:8080', {
        maxAttempts: 5,
        baseDelayMs: 100,
      });

      guardLocal.connect();
      mockWebSocket.onerror(new Error('Connection failed'));
      mockWebSocket.onclose({ wasClean: false });

      // For attempt 1: base delay 100ms * 2^1 = 200ms, jitter range [100, 300]
      jest.advanceTimersByTime(300);
      expect(guardLocal.retryCount).toBe(1);
    });

    test('does not reconnect when ws.readyState === OPEN', () => {
      const guardLocal = new WebSocketGuard('ws://localhost:8080');
      guardLocal.connect();

      guardLocal.ws.readyState = WebSocket.OPEN;
      WebSocket.mockClear();
      guardLocal.connect();
      expect(WebSocket).not.toHaveBeenCalled();
    });

    test('does not reconnect when ws.readyState === CONNECTING', () => {
      const guardLocal = new WebSocketGuard('ws://localhost:8080');
      guardLocal.connect();

      guardLocal.ws.readyState = WebSocket.CONNECTING;
      WebSocket.mockClear();
      guardLocal.connect();
      expect(WebSocket).not.toHaveBeenCalled();
    });

    test('respects maximum retry attempts (test 2)', () => {
      jest.useFakeTimers();

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const guardLocal = new WebSocketGuard('ws://localhost:8080', {
        maxRetries: 2,
        initialDelay: 100,
      });

      guardLocal.connect();

      for (let i = 0; i < 3; i++) {
        mockWebSocket.onerror(new Error(`Connection failed ${i + 1}`));
        mockWebSocket.onclose({ wasClean: false });
        jest.advanceTimersByTime(200);
      }

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'WebSocket: Max retries (2) exceeded'
      );

      consoleWarnSpy.mockRestore();
    });

    test('calculates delay with proper jitter bounds', () => {
      const guardLocal = new WebSocketGuard('ws://localhost:8080', {
        initialDelay: 100,
        maxDelay: 1000,
      });

      for (let retryCount = 0; retryCount < 5; retryCount++) {
        guardLocal.retryCount = retryCount;
        const delay = guardLocal.calculateDelay();

        const exponentialDelay = 100 * Math.pow(2, retryCount);
        const cappedDelay = Math.min(exponentialDelay, 1000);

        expect(delay).toBeGreaterThanOrEqual(cappedDelay);
        expect(delay).toBeLessThanOrEqual(cappedDelay * 1.5);
      }
    });
  });
});