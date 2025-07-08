import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'blue',
  silly: 'grey'
};

// Add colors to winston
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    ({ timestamp, level, message, ...metadata }) => {
      let msg = `${timestamp} [${level}]: ${message}`;
      if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
      }
      return msg;
    }
  )
);

// Define transports
const transports: winston.transport[] = [];

// Console transport (always enabled in development)
if (process.env.NODE_ENV !== 'production' || process.env.LOG_TO_CONSOLE === 'true') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      handleExceptions: true
    })
  );
}

// File transports
const logDir = process.env.LOG_DIR || path.join(__dirname, '../../../logs');

// Error log file
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    level: 'error',
    format
  })
);

// Combined log file
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d',
    format
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exitOnError: false
});

// Stream for Morgan HTTP logging
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  }
};

// Helper functions for structured logging
export const logError = (error: Error, context?: any) => {
  logger.error({
    message: error.message,
    stack: error.stack,
    ...context
  });
};

export const logRequest = (req: any, responseTime?: number) => {
  logger.http({
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    responseTime,
    userId: req.user?.id
  });
};

export const logAudit = (action: string, userId: string, details: any) => {
  logger.info({
    type: 'AUDIT',
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...details
  });
};

export const logSecurity = (event: string, details: any) => {
  logger.warn({
    type: 'SECURITY',
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

export const logPerformance = (operation: string, duration: number, details?: any) => {
  logger.info({
    type: 'PERFORMANCE',
    operation,
    duration,
    timestamp: new Date().toISOString(),
    ...details
  });
};

export const logIntegration = (service: string, action: string, success: boolean, details?: any) => {
  const level = success ? 'info' : 'error';
  logger.log(level, {
    type: 'INTEGRATION',
    service,
    action,
    success,
    timestamp: new Date().toISOString(),
    ...details
  });
};

// Export logger instance
export { logger };