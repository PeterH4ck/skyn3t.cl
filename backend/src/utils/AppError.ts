import { ERROR_CODES, HTTP_MESSAGES } from '../config/constants';

export interface ErrorDetails {
  code?: string;
  field?: string;
  value?: any;
  constraints?: Record<string, string>;
  [key: string]: any;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly status: string;
  public readonly isOperational: boolean;
  public readonly code?: string;
  public readonly details?: ErrorDetails;

  constructor(
    message: string,
    statusCode: number = 500,
    code?: string,
    details?: ErrorDetails
  ) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      status: this.status,
      error: {
        statusCode: this.statusCode,
        message: this.message,
        code: this.code,
        details: this.details
      }
    };
  }
}

// Predefined error classes
export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 422, ERROR_CODES.VALIDATION_ERROR, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', code?: string) {
    super(message, 401, code || ERROR_CODES.UNAUTHORIZED);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', code?: string) {
    super(message, 403, code || ERROR_CODES.PERMISSION_DENIED);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, ERROR_CODES.RESOURCE_NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 409, ERROR_CODES.RESOURCE_ALREADY_EXISTS, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, ERROR_CODES.RATE_LIMIT_EXCEEDED);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, 400, ERROR_CODES.INVALID_INPUT, details);
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, ERROR_CODES.INTERNAL_ERROR);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string = 'Database operation failed') {
    super(message, 500, ERROR_CODES.DATABASE_ERROR);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message?: string) {
    super(
      message || `External service ${service} is unavailable`,
      503,
      ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      { service }
    );
  }
}

// Helper function to create appropriate error based on status code
export function createError(statusCode: number, message?: string, code?: string, details?: ErrorDetails): AppError {
  const errorMessage = message || HTTP_MESSAGES[statusCode] || 'An error occurred';

  switch (statusCode) {
    case 400:
      return new BadRequestError(errorMessage, details);
    case 401:
      return new AuthenticationError(errorMessage, code);
    case 403:
      return new AuthorizationError(errorMessage, code);
    case 404:
      return new NotFoundError(errorMessage);
    case 409:
      return new ConflictError(errorMessage, details);
    case 422:
      return new ValidationError(errorMessage, details);
    case 429:
      return new RateLimitError(errorMessage);
    case 500:
      return new InternalError(errorMessage);
    case 503:
      return new ExternalServiceError('Unknown', errorMessage);
    default:
      return new AppError(errorMessage, statusCode, code, details);
  }
}

// Async error handler wrapper
export const catchAsync = (fn: Function) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};