/**
 * Retry mechanism for the Sequential Thinking MCP Server
 * 
 * This module provides configurable retry capabilities with exponential backoff
 * that integrates with the existing error handling and circuit breaker patterns.
 */

import { AppError, ErrorType, ErrorData, createCircuitBreaker } from './errors.js';

// Type definitions for circuit breaker functionality
export type CircuitBreakerWrapped<T> = () => Promise<T>;
export type CircuitBreakerOptions = {
  maxFailures: number;
  resetTimeout: number;
};
export type CircuitBreakerFunction = typeof createCircuitBreaker;

/**
 * Configuration options for the retry mechanism
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  
  /** Initial delay before first retry (ms) */
  initialDelayMs: number;
  
  /** Multiplier for exponential backoff */
  backoffFactor: number;
  
  /** Maximum delay cap (ms) */
  maxDelayMs: number;
  
  /** Strategy for adding randomness to delays */
  jitter: 'full' | 'equal' | 'none';
  
  /** Error types/codes eligible for retry */
  retryableErrors: Array<string | number | ErrorType>;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  backoffFactor: 2,
  maxDelayMs: 5000,
  jitter: 'full',
  retryableErrors: [
    ErrorType.API_TIMEOUT_ERROR,
    ErrorType.API_RATE_LIMIT_ERROR,
    ErrorType.API_REQUEST_ERROR,
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    502,
    503,
    504,
    429
  ]
};

/**
 * Error class for operations that support retrying
 */
export class RetryableError extends AppError {
  public readonly retryAttempt: number;

  constructor(data: ErrorData & { retryAttempt?: number }) {
    super(data);
    this.retryAttempt = data.retryAttempt || 0;
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      retryAttempt: this.retryAttempt
    };
  }
}

/**
 * Calculate delay duration with exponential backoff and optional jitter
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt - 1);
  const maxDelay = Math.min(baseDelay, config.maxDelayMs);
  
  switch (config.jitter) {
    case 'full':
      return Math.random() * maxDelay;
    case 'equal':
      return maxDelay / 2 + (Math.random() * maxDelay) / 2;
    default:
      return maxDelay;
  }
}

/**
 * Check if an error should be retried based on configuration
 */
export function isRetryableError(error: unknown, retryableErrors: Array<string | number | ErrorType>): boolean {
  if (error instanceof RetryableError) {
    return true;
  }
  
  if (error instanceof AppError) {
    return retryableErrors.includes(error.type);
  }
  
  // Handle Axios/HTTP errors
  if (error && typeof error === 'object' && 'status' in error) {
    return retryableErrors.includes((error as { status: number }).status);
  }
  
  // Handle Node.js system errors
  if (error instanceof Error && 'code' in error) {
    return retryableErrors.includes(error.code as string);
  }
  
  return false;
}

/**
 * Execute an operation with retry capability
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  circuitBreaker?: typeof createCircuitBreaker
): Promise<T> {
  // Merge with default config
  const retryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    ...config
  };
  
  let attempt = 0;
  let lastError: Error | undefined;
  
  while (true) {
    try {
      // If circuit breaker is provided, use it to wrap the operation
      if (circuitBreaker) {
        const wrappedOp = circuitBreaker(operation, {
          maxFailures: 5,
          resetTimeout: 30000
        });
        return await wrappedOp();
      }
      
      return await operation();
    } catch (error) {
      attempt++;
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry
      if (
        attempt > retryConfig.maxRetries ||
        !isRetryableError(error, retryConfig.retryableErrors)
      ) {
        throw lastError;
      }
      
      // Calculate and wait for backoff delay
      const delay = calculateBackoffDelay(attempt, retryConfig);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // If the error was an AppError, wrap it in a RetryableError
      if (error instanceof AppError) {
        const errorData = error.toJSON();
        throw new RetryableError({
          type: errorData.type,
          message: errorData.message,
          severity: errorData.severity,
          code: errorData.code,
          details: errorData.details,
          cause: errorData.cause,
          timestamp: errorData.timestamp,
          requestId: errorData.requestId,
          retryAttempt: attempt
        });
      }
    }
  }
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  config?: Partial<RetryConfig>,
  circuitBreaker?: typeof createCircuitBreaker
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return withRetry(
      () => fn(...args),
      config,
      circuitBreaker
    );
  }) as T;
}
