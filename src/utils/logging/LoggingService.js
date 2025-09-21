class LoggingService {
  static logLevels = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG',
  };

  static log(level, service, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service,
      message,
      data,
    };

    console.log(`[${timestamp}] ${level} - ${service}: ${message}`);
    if (data) {
      console.log('Data:', JSON.stringify(data, null, 2));
    }

    return logEntry;
  }

  static error(service, message, error = null) {
    return this.log(this.logLevels.ERROR, service, message, error);
  }

  static warn(service, message, data = null) {
    return this.log(this.logLevels.WARN, service, message, data);
  }

  static info(service, message, data = null) {
    return this.log(this.logLevels.INFO, service, message, data);
  }

  static debug(service, message, data = null) {
    if (process.env.NODE_ENV === 'development') {
      return this.log(this.logLevels.DEBUG, service, message, data);
    }
    return null;
  }
}

export default LoggingService;
