/**
 * Structured logger utility with request ID tracking
 */

// Simple logger that outputs structured JSON
export class Logger {
  constructor(component = 'default') {
    this.component = component;
  }

  // Generate a simple request ID
  static generateRequestId() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  // Log with structured JSON output
  log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component: this.component,
      message,
      ...meta
    };
    
    // Output as JSON
    console.log(JSON.stringify(logEntry));
  }

  // Convenience methods for different log levels
  info(message, meta = {}) {
    this.log('info', message, meta);
  }

  warn(message, meta = {}) {
    this.log('warn', message, meta);
  }

  error(message, meta = {}) {
    this.log('error', message, meta);
  }

  debug(message, meta = {}) {
    this.log('debug', message, meta);
  }
}

// Default logger instance
export const logger = new Logger();

export default Logger;