/**
 * Unit tests for the logging module
 */

import { jest } from '@jest/globals';
import { Logger, logger } from '../render/log.js';

describe('Logging Module', () => {
  let originalConsoleLog;
  let consoleOutput;

  beforeEach(() => {
    // Mock console.log to capture output
    originalConsoleLog = console.log;
    consoleOutput = [];
    console.log = jest.fn((...args) => {
      consoleOutput.push(...args);
    });
  });

  afterEach(() => {
    // Restore original console.log
    console.log = originalConsoleLog;
  });

  describe('Logger Class', () => {
    test('should create a logger instance with default context', () => {
      const log = new Logger();
      expect(log).toBeInstanceOf(Logger);
      expect(log.context).toEqual({});
    });

    test('should create a logger instance with provided context', () => {
      const context = { sessionId: 'test-session', jobId: 'test-job' };
      const log = new Logger(context);
      expect(log.context).toEqual(context);
    });

    test('should create a new logger with additional context', () => {
      const originalContext = { sessionId: 'test-session' };
      const log = new Logger(originalContext);
      const additionalContext = { jobId: 'test-job' };
      const newLog = log.withContext(additionalContext);
      
      expect(newLog).toBeInstanceOf(Logger);
      expect(newLog.context).toEqual({ ...originalContext, ...additionalContext });
      // Original logger should be unchanged
      expect(log.context).toEqual(originalContext);
    });

    test('should log debug messages with correct format', () => {
      const log = new Logger({ sessionId: 'test-session' });
      log.debug('Test debug message', { extra: 'field' });
      
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleOutput[0]);
      
      expect(logged).toMatchObject({
        ts: expect.any(String),
        level: 'debug',
        message: 'Test debug message',
        sessionId: 'test-session',
        extra: 'field'
      });
      
      // Check that timestamp is a valid ISO string
      expect(new Date(logged.ts)).toBeInstanceOf(Date);
    });

    test('should log info messages with correct format', () => {
      const log = new Logger({ jobId: 'test-job' });
      log.info('Test info message');
      
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleOutput[0]);
      
      expect(logged).toMatchObject({
        ts: expect.any(String),
        level: 'info',
        message: 'Test info message',
        jobId: 'test-job'
      });
    });

    test('should log warning messages with correct format', () => {
      const log = new Logger({ component: 'test-component' });
      log.warn('Test warning message', { warningCode: 123 });
      
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleOutput[0]);
      
      expect(logged).toMatchObject({
        ts: expect.any(String),
        level: 'warn',
        message: 'Test warning message',
        component: 'test-component',
        warningCode: 123
      });
    });

    test('should log error messages with correct format', () => {
      const log = new Logger({ sessionId: 'test-session' });
      log.error('Test error message', { errorCode: 500 });
      
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleOutput[0]);
      
      expect(logged).toMatchObject({
        ts: expect.any(String),
        level: 'error',
        message: 'Test error message',
        sessionId: 'test-session',
        errorCode: 500
      });
    });

    test('should log progress updates with correct format', () => {
      const log = new Logger({ sessionId: 'test-session', jobId: 'test-job' });
      const progress = {
        percent: 75.5,
        eta: '00:00:15',
        speed: 1.2,
        fps: 30
      };
      
      log.progress(progress, 'rendering');
      
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleOutput[0]);
      
      expect(logged).toMatchObject({
        ts: expect.any(String),
        level: 'info',
        message: 'Render progress update',
        sessionId: 'test-session',
        jobId: 'test-job',
        stage: 'rendering',
        progress: 75.5,
        eta: '00:00:15',
        speed: 1.2,
        fps: 30
      });
    });
  });

  describe('Default Logger Instance', () => {
    test('should export a default logger instance', () => {
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.context).toEqual({});
    });

    test('should log messages using default logger', () => {
      logger.info('Test message from default logger');
      
      expect(console.log).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(consoleOutput[0]);
      
      expect(logged).toMatchObject({
        ts: expect.any(String),
        level: 'info',
        message: 'Test message from default logger'
      });
    });
  });
});