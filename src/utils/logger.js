const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Ensure logs directory exists
const fs = require('fs');
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom format for structured JSON logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      service: service || 'mobius-api',
      message,
      ...meta
    });
  })
);

// Daily rotate file transport
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'mobius-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '7d',
  format: logFormat,
  zippedArchive: true,
  createSymlink: true,
  symlinkName: 'mobius-current.log'
});

// Error log rotation
const errorRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'mobius-error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '50m',
  maxFiles: '7d',
  level: 'error',
  format: logFormat,
  zippedArchive: true,
  createSymlink: true,
  symlinkName: 'mobius-error-current.log'
});

// Console transport for development
const consoleTransport = new winston.transports.Console({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple(),
    winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
      return `${timestamp} [${service || 'mobius-api'}] ${level}: ${message} ${metaStr}`;
    })
  )
});

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    fileRotateTransport,
    errorRotateTransport,
    ...(process.env.NODE_ENV !== 'production' ? [consoleTransport] : [])
  ],
  exitOnError: false,
  rejectionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'rejections.log') })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: path.join(logsDir, 'exceptions.log') })
  ]
});

// Helper functions for structured logging
logger.logRequest = (req, res, responseTime) => {
  const headers = req.headers || {};
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get ? req.get('User-Agent') : headers['user-agent'],
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    requestId: headers['x-request-id']
  });
};

logger.logHashOperation = (operation, duration, success = true, metadata = {}) => {
  logger.info('Hash Operation', {
    operation,
    duration: `${duration}ms`,
    success,
    ...metadata
  });
};

logger.logMetrics = (metrics) => {
  logger.info('System Metrics', metrics);
};

module.exports = logger;