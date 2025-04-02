/**
 * Error handling system for Sequential Thinking MCP Server
 * 
 * This module provides a standardized way to create, handle, and log errors
 * throughout the application.
 */

// @ts-ignore - Suppress persistent TS2307 error for SDK import
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk';
import { get } from './config.js';

// Custom error types
export enum ErrorType {
  // Server errors
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  
  // API errors
  API_REQUEST_ERROR = 'API_REQUEST_ERROR',
  API_RESPONSE_ERROR = 'API_RESPONSE_ERROR',
  API_TIMEOUT_ERROR = 'API_TIMEOUT_ERROR',
  API_RATE_LIMIT_ERROR = 'API_RATE_LIMIT_ERROR',
  API_AUTHENTICATION_ERROR = 'API_AUTHENTICATION_ERROR',
  
  // Processing errors
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  STAGE_TIMEOUT_ERROR = 'STAGE_TIMEOUT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Memory errors
  MEMORY_ERROR = 'MEMORY_ERROR',
  COMPRESSION_ERROR = 'COMPRESSION_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  
  // Session errors
  SESSION_ERROR = 'SESSION_ERROR',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  
  // Template errors
  TEMPLATE_ERROR = 'TEMPLATE_ERROR',
  TEMPLATE_NOT_FOUND = 'TEMPLATE_NOT_FOUND',
  
  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Error severity levels
export enum ErrorSeverity {
  DEBUG = 'debug',
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// Interface for structured error data
export interface ErrorData {
  type: ErrorType;
  message: string;
  severity: ErrorSeverity;
  code?: string;
  details?: Record<string, any>;
  cause?: Error | unknown;
  timestamp: number;
  requestId?: string;
}

/**
 * Base class for all custom errors in the application
 */
export class AppError extends Error {
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly code?: string;
  public readonly details?: Record<string, any>;
  public readonly cause?: Error | unknown;
  public readonly timestamp: number;
  public readonly requestId?: string;

  constructor(data: ErrorData) {
    super(data.message);
    this.name = this.constructor.name;
    this.type = data.type;
    this.severity = data.severity;
    this.code = data.code;
    this.details = data.details;
    this.cause = data.cause;
    this.timestamp = data.timestamp || Date.now();
    this.requestId = data.requestId;
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert to a plain object for logging
   */
  public toJSON(): Record<string, any> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      severity: this.severity,
      code: this.code,
      details: this.details,
      cause: this.cause instanceof Error ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack
      } : this.cause,
      timestamp: this.timestamp,
      requestId: this.requestId,
      stack: this.stack
    };
  }

  /**
   * Convert to an MCP error for client response
   */
  public toMcpError(): McpError {
    // Map severity to appropriate MCP error code
    let errorCode: ErrorCode;
    
    switch (this.severity) {
      case ErrorSeverity.DEBUG:
      case ErrorSeverity.INFO:
      case ErrorSeverity.WARNING:
        errorCode = ErrorCode.InvalidParams;
        break;
      case ErrorSeverity.ERROR:
        errorCode = ErrorCode.InternalError;
        break;
      case ErrorSeverity.CRITICAL:
        errorCode = ErrorCode.ServerError;
        break;
      default:
        errorCode = ErrorCode.InternalError;
    }
    
    // Use custom code if provided
    if (this.code) {
      errorCode = this.code as ErrorCode;
    }
    
    return new McpError(
      errorCode,
      this.message,
      this.details
    );
  }
}

/**
 * API-related errors
 */
export class ApiError extends AppError {
  constructor(
    message: string,
    subtype: ErrorType = ErrorType.API_REQUEST_ERROR,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    details?: Record<string, any>,
    cause?: Error | unknown
  ) {
    super({
      type: subtype,
      message,
      severity,
      details,
      cause,
      timestamp: Date.now()
    });
  }
}

/**
 * Processing-related errors
 */
export class ProcessingError extends AppError {
  constructor(
    message: string,
    subtype: ErrorType = ErrorType.PROCESSING_ERROR,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    details?: Record<string, any>,
    cause?: Error | unknown
  ) {
    super({
      type: subtype,
      message,
      severity,
      details,
      cause,
      timestamp: Date.now()
    });
  }
}

/**
 * Memory-related errors
 */
export class MemoryError extends AppError {
  constructor(
    message: string,
    subtype: ErrorType = ErrorType.MEMORY_ERROR,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    details?: Record<string, any>,
    cause?: Error | unknown
  ) {
    super({
      type: subtype,
      message,
      severity,
      details,
      cause,
      timestamp: Date.now()
    });
  }
}

/**
 * Session-related errors
 */
export class SessionError extends AppError {
  constructor(
    message: string,
    subtype: ErrorType = ErrorType.SESSION_ERROR,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    details?: Record<string, any>,
    cause?: Error | unknown
  ) {
    super({
      type: subtype,
      message,
      severity,
      details,
      cause,
      timestamp: Date.now()
    });
  }
}

/**
 * Template-related errors
 */
export class TemplateError extends AppError {
  constructor(
    message: string,
    subtype: ErrorType = ErrorType.TEMPLATE_ERROR,
    severity: ErrorSeverity = ErrorSeverity.ERROR,
    details?: Record<string, any>,
    cause?: Error | unknown
  ) {
    super({
      type: subtype,
      message,
      severity,
      details,
      cause,
      timestamp: Date.now()
    });
  }
}

/**
 * Error handler class for centralized error handling
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  
  private constructor() {
    // Private constructor for singleton pattern
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }
  
  /**
   * Handle an error by logging it and optionally performing additional actions
   * @param error The error to handle
   * @param requestId Optional request ID for tracking
   */
  public handleError(error: Error | AppError | unknown, requestId?: string): AppError {
    // Convert to AppError if it's not already
    const appError = this.ensureAppError(error, requestId);
    
    // Log the error
    this.logError(appError);
    
    // Perform additional actions based on error type and severity
    this.performErrorActions(appError);
    
    return appError;
  }
  
  /**
   * Ensure that an error is an AppError
   * @param error The error to convert
   * @param requestId Optional request ID for tracking
   */
  private ensureAppError(error: Error | AppError | unknown, requestId?: string): AppError {
    if (error instanceof AppError) {
      // Already an AppError, just add requestId if not present
      if (requestId && !error.requestId) {
        // Create a new AppError instance preserving all original properties
        const originalData = error.toJSON();
        return new AppError({
          type: originalData.type,
          message: originalData.message,
          severity: originalData.severity,
          code: originalData.code,
          details: originalData.details,
          cause: originalData.cause,
          timestamp: originalData.timestamp,
          requestId // Add the new requestId
        });
      }
      return error;
    }
    
    // Convert Error to AppError
    if (error instanceof Error) {
      return new AppError({
        type: ErrorType.INTERNAL_ERROR,
        message: error.message || 'An unknown error occurred',
        severity: ErrorSeverity.ERROR,
        cause: error,
        timestamp: Date.now(),
        requestId,
        details: {
          name: error.name,
          stack: error.stack
        }
      });
    }
    
    // Convert unknown to AppError
    return new AppError({
      type: ErrorType.UNKNOWN_ERROR,
      message: error instanceof Object ? JSON.stringify(error) : String(error),
      severity: ErrorSeverity.ERROR,
      cause: error,
      timestamp: Date.now(),
      requestId
    });
  }
  
  /**
   * Log an error with appropriate severity
   * @param error The error to log
   */
  private logError(error: AppError): void {
    const logLevel = get<string>('server.logLevel', 'info');
    const errorJson = error.toJSON();
    
    // Log based on severity and configured log level
    switch (error.severity) {
      case ErrorSeverity.DEBUG:
        if (logLevel === 'debug') {
          console.debug(JSON.stringify(errorJson));
        }
        break;
      case ErrorSeverity.INFO:
        if (['debug', 'info'].includes(logLevel)) {
          console.info(JSON.stringify(errorJson));
        }
        break;
      case ErrorSeverity.WARNING:
        if (['debug', 'info', 'warn'].includes(logLevel)) {
          console.warn(JSON.stringify(errorJson));
        }
        break;
      case ErrorSeverity.ERROR:
      case ErrorSeverity.CRITICAL:
        console.error(JSON.stringify(errorJson));
        break;
    }
  }
  
  /**
   * Perform additional actions based on error type and severity
   * @param error The error to handle
   */
  private performErrorActions(error: AppError): void {
    // Handle critical errors
    if (error.severity === ErrorSeverity.CRITICAL) {
      // Log to a separate critical error log
      console.error(`CRITICAL ERROR: ${error.message}`);
      
      // Could implement additional actions like:
      // - Sending alerts
      // - Triggering recovery procedures
      // - etc.
    }
    
    // Handle specific error types
    switch (error.type) {
      case ErrorType.API_RATE_LIMIT_ERROR:
        // Could implement rate limiting backoff
        break;
      case ErrorType.STORAGE_ERROR:
        // Could implement storage recovery
        break;
      // Add more specific handlers as needed
    }
  }
}

// Export singleton instance
export const errorHandler = ErrorHandler.getInstance();

/**
 * Utility function to wrap async functions with error handling
 * @param fn The async function to wrap
 * @param requestId Optional request ID for tracking
 */
export function withErrorHandling<T, Args extends any[]>(
  fn: (...args: Args) => T | Promise<T>, // Allow sync or async functions
  requestId?: string
): (...args: Args) => Promise<T> { // Always return a Promise for consistency
  return async (...args: Args): Promise<T> => {
    try {
      const result = fn(...args);
      // Check if the result is a Promise and await it
      if (result instanceof Promise) {
        return await result;
      }
      // Otherwise, return the synchronous result
      return result;
    } catch (error) {
      const appError = errorHandler.handleError(error, requestId);
      throw appError;
    }
  };
}

/**
 * Create a circuit breaker for a function
 * @param fn The function to wrap with a circuit breaker
 * @param options Circuit breaker options
 */
export function createCircuitBreaker<T, Args extends any[]>(
  fn: (...args: Args) => Promise<T>,
  options: {
    maxFailures: number;
    resetTimeout: number;
    fallback?: (...args: Args) => Promise<T>;
  }
): (...args: Args) => Promise<T> {
  let failures = 0;
  let lastFailureTime = 0;
  let circuitOpen = false;
  
  return async (...args: Args): Promise<T> => {
    // Check if circuit is open
    if (circuitOpen) {
      const now = Date.now();
      if (now - lastFailureTime > options.resetTimeout) {
        // Reset circuit after timeout
        circuitOpen = false;
        failures = 0;
      } else if (options.fallback) {
        // Use fallback if available
        return options.fallback(...args);
      } else {
        throw new AppError({
          type: ErrorType.API_REQUEST_ERROR,
          message: 'Circuit breaker is open',
          severity: ErrorSeverity.ERROR,
          timestamp: Date.now(),
          details: {
            resetIn: options.resetTimeout - (now - lastFailureTime)
          }
        });
      }
    }
    
    try {
      // Attempt to call the function
      const result = await fn(...args);
      // Reset failures on success
      failures = 0;
      return result;
    } catch (error) {
      // Increment failure count
      failures++;
      lastFailureTime = Date.now();
      
      // Open circuit if max failures reached
      if (failures >= options.maxFailures) {
        circuitOpen = true;
      }
      
      // Handle error
      const appError = errorHandler.handleError(error);
      
      // Use fallback if available
      if (options.fallback) {
        return options.fallback(...args);
      }
      
      throw appError;
    }
  };
}
