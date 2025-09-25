/**
 * Structured logging configuration using winston
 * Provides file rotation and JSON formatting for production observability
 */
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configure winston logger with file rotation
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'mobius-games',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // File transport with rotation
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      handleExceptions: true,
      handleRejections: true
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 100 * 1024 * 1024, // 100MB
      maxFiles: 5,
      handleExceptions: true,
      handleRejections: true
    })
  ]
});

// In development, also log to console with readable format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
} else {
  // In production, suppress console.log by proxying to winston
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.log = (...args) => {
    logger.info(args.join(' '));
    // Still allow some console output for immediate feedback
    if (process.env.ALLOW_CONSOLE === 'true') {
      originalLog(...args);
    }
  };
  
  console.warn = (...args) => {
    logger.warn(args.join(' '));
    if (process.env.ALLOW_CONSOLE === 'true') {
      originalWarn(...args);
    }
  };
  
  console.error = (...args) => {
    logger.error(args.join(' '));
    if (process.env.ALLOW_CONSOLE === 'true') {
      originalError(...args);
    }
  };
}

module.exports = logger;