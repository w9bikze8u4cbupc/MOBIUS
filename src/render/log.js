/**
 * Structured logging for the video rendering pipeline
 * Emits NDJSON logs with correlation IDs and rich context
 */

/**
 * Logger class for structured logging
 */
export class Logger {
  /**
   * Create a new logger instance
   * @param {Object} context Default context to include in all log entries
   */
  constructor(context = {}) {
    this.context = context;
  }
  
  /**
   * Create a new logger with additional context
   * @param {Object} additionalContext Context to add to the logger
   * @returns {Logger} New logger instance with merged context
   */
  withContext(additionalContext) {
    return new Logger({ ...this.context, ...additionalContext });
  }
  
  /**
   * Log a message at the specified level
   * @param {string} level Log level (debug, info, warn, error)
   * @param {string} message Log message
   * @param {Object} fields Additional fields to include in the log entry
   */
  log(level, message, fields = {}) {
    const logEntry = {
      ts: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...fields
    };
    
    console.log(JSON.stringify(logEntry));
  }
  
  /**
   * Log a debug message
   * @param {string} message Debug message
   * @param {Object} fields Additional fields to include
   */
  debug(message, fields = {}) {
    this.log('debug', message, fields);
  }
  
  /**
   * Log an info message
   * @param {string} message Info message
   * @param {Object} fields Additional fields to include
   */
  info(message, fields = {}) {
    this.log('info', message, fields);
  }
  
  /**
   * Log a warning message
   * @param {string} message Warning message
   * @param {Object} fields Additional fields to include
   */
  warn(message, fields = {}) {
    this.log('warn', message, fields);
  }
  
  /**
   * Log an error message
   * @param {string} message Error message
   * @param {Object} fields Additional fields to include
   */
  error(message, fields = {}) {
    this.log('error', message, fields);
  }
  
  /**
   * Log a progress update
   * @param {Object} progress Progress information
   * @param {number} progress.percent Completion percentage (0-100)
   * @param {string} progress.eta Estimated time of arrival
   * @param {number} progress.speed Processing speed ratio
   * @param {number} progress.fps Frames per second
   * @param {string} stage Current rendering stage
   */
  progress(progress, stage) {
    this.log('info', 'Render progress update', {
      stage,
      progress: progress.percent,
      eta: progress.eta,
      speed: progress.speed,
      fps: progress.fps
    });
  }
}

// Create a default logger instance
export const logger = new Logger();