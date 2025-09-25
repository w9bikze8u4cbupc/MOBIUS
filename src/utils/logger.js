const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// PII redaction patterns
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // email
  /\b\d{3}-\d{2}-\d{4}\b/g, // SSN pattern
  /\b\d{16}\b/g, // credit card pattern
  /\bip[:\s]*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/gi, // IP addresses
];

// Custom format for PII redaction
const piiRedactionFormat = winston.format((info) => {
  let message = typeof info.message === 'string' ? info.message : JSON.stringify(info.message);
  
  // Redact PII patterns
  PII_PATTERNS.forEach(pattern => {
    message = message.replace(pattern, '[REDACTED]');
  });
  
  info.message = message;
  return info;
});

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
fs.mkdirSync(logsDir, { recursive: true });

// Configure winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    piiRedactionFormat(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'mobius-dhash',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // Daily rotate file for application logs
    new DailyRotateFile({
      filename: path.join(logsDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '100m',
      zippedArchive: true
    }),
    
    // Daily rotate file for error logs
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '100m',
      zippedArchive: true
    }),
    
    // Daily rotate file for dhash metrics
    new DailyRotateFile({
      filename: path.join(logsDir, 'dhash-metrics-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '100m',
      zippedArchive: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Add request tracking
logger.requestId = () => {
  return crypto.randomBytes(16).toString('hex');
};

// Dhash-specific logging methods
logger.dhash = {
  extraction_start: (metadata) => {
    logger.info('Dhash extraction started', {
      category: 'dhash',
      event: 'extraction_start',
      metadata: metadata
    });
  },
  
  extraction_success: (hash, duration, confidence) => {
    logger.info('Dhash extraction completed', {
      category: 'dhash',
      event: 'extraction_success',
      hash: hash,
      duration_ms: duration,
      confidence: confidence,
      metrics: {
        extraction_failures_rate: 0,
        avg_hash_time: duration,
        p95_hash_time: duration
      }
    });
  },
  
  extraction_failure: (error, duration) => {
    logger.error('Dhash extraction failed', {
      category: 'dhash',
      event: 'extraction_failure',
      error: error.message,
      duration_ms: duration,
      metrics: {
        extraction_failures_rate: 1
      }
    });
  },
  
  low_confidence: (hash, confidence, threshold = 0.8) => {
    logger.warn('Dhash extraction low confidence', {
      category: 'dhash',
      event: 'low_confidence',
      hash: hash,
      confidence: confidence,
      threshold: threshold
    });
  }
};

module.exports = logger;