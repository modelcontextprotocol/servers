import { z } from 'zod';

// Enhanced error schemas with Zod validation
export const ErrorDataSchema = z.object({
  error: z.string(),
  message: z.string(),
  category: z.enum([
    'VALIDATION', 'SECURITY', 'BUSINESS_LOGIC', 'SYSTEM', 'RATE_LIMIT',
  ]),
  statusCode: z.number(),
  details: z.unknown().optional(),
  timestamp: z.string(),
  correlationId: z.string().optional(),
});

export const ValidationErrorSchema = z.object({
  error: z.literal('VALIDATION_ERROR'),
  message: z.string(),
  category: z.literal('VALIDATION'),
  statusCode: z.literal(400),
  details: z.unknown().optional(),
});

export const SecurityErrorSchema = z.object({
  error: z.literal('SECURITY_ERROR'),
  message: z.string(),
  category: z.literal('SECURITY'),
  statusCode: z.literal(403),
  details: z.unknown().optional(),
});

export const RateLimitErrorSchema = z.object({
  error: z.literal('RATE_LIMIT_EXCEEDED'),
  message: z.string(),
  category: z.literal('RATE_LIMIT'),
  statusCode: z.literal(429),
  retryAfter: z.number().optional(),
});

type ErrorCategory =
  | 'VALIDATION'
  | 'SECURITY'
  | 'BUSINESS_LOGIC'
  | 'SYSTEM'
  | 'RATE_LIMIT';

export abstract class SequentialThinkingError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  abstract readonly category: ErrorCategory;
  
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  toJSON(): Record<string, unknown> {
    const errorData = {
      error: this.code,
      message: this.message,
      category: this.category,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: new Date().toISOString(),
      correlationId: this.generateCorrelationId(),
    };
    
    // Note: Zod validation disabled for error serialization to avoid circular dependencies
    return errorData;
  }
  
  private generateCorrelationId(): string {
    return Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
  }
}

export class ValidationError extends SequentialThinkingError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly category = 'VALIDATION' as const;
  
  constructor(message: string, details?: unknown) {
    super(message, details);
    
    // Validate with Zod
    const validation = ValidationErrorSchema.safeParse({
      error: this.code,
      message,
      category: this.category,
      statusCode: this.statusCode,
      details,
    });
    
    if (!validation.success) {
      throw new Error(
        `Invalid validation error: ${validation.error.message}`,
      );
    }
  }
}

export class SecurityError extends SequentialThinkingError {
  readonly code = 'SECURITY_ERROR';
  readonly statusCode = 403;
  readonly category = 'SECURITY' as const;
  
  constructor(message: string, details?: unknown) {
    super(message, details);
    
    // Validate with Zod
    const validation = SecurityErrorSchema.safeParse({
      error: this.code,
      message,
      category: this.category,
      statusCode: this.statusCode,
      details,
    });
    
    if (!validation.success) {
      throw new Error(
        `Invalid security error: ${validation.error.message}`,
      );
    }
  }
}

export class RateLimitError extends SequentialThinkingError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  readonly category = 'RATE_LIMIT' as const;
  
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfter?: number,
  ) {
    super(message, { retryAfter });
    
    // Validate with Zod
    const validation = RateLimitErrorSchema.safeParse({
      error: this.code,
      message,
      category: this.category,
      statusCode: this.statusCode,
      retryAfter,
    });
    
    if (!validation.success) {
      throw new Error(
        `Invalid rate limit error: ${validation.error.message}`,
      );
    }
  }
}

export class StateError extends SequentialThinkingError {
  readonly code = 'STATE_ERROR';
  readonly statusCode = 500;
  readonly category = 'SYSTEM' as const;
}

export class BusinessLogicError extends SequentialThinkingError {
  readonly code = 'BUSINESS_LOGIC_ERROR';
  readonly statusCode = 422;
  readonly category = 'BUSINESS_LOGIC' as const;
}

export class CircuitBreakerError extends SequentialThinkingError {
  readonly code = 'CIRCUIT_BREAKER_OPEN';
  readonly statusCode = 503;
  readonly category = 'SYSTEM' as const;
}

export class ConfigurationError extends SequentialThinkingError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;
  readonly category = 'SYSTEM' as const;
}
