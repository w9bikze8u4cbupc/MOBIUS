import winston from 'winston';

// Create logger instance with appropriate formatting
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'mobius-games' },
  transports: [
    // Write all logs with importance level of 'error' or higher to error.log
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    // Write all logs with importance level of 'info' or higher to combined.log
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// In non-production environments, also log to console with simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

export default logger;