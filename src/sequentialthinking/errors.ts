type ErrorCategory =
  | 'VALIDATION'
  | 'SECURITY'
  | 'BUSINESS_LOGIC'
  | 'SYSTEM';

export abstract class SequentialThinkingError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  abstract readonly category: ErrorCategory;
  readonly timestamp = new Date().toISOString();

  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      category: this.category,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

export class ValidationError extends SequentialThinkingError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly category = 'VALIDATION' as const;
}

export class SecurityError extends SequentialThinkingError {
  readonly code = 'SECURITY_ERROR';
  readonly statusCode = 403;
  readonly category = 'SECURITY' as const;
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

export class TreeError extends SequentialThinkingError {
  readonly code = 'TREE_ERROR';
  readonly statusCode = 404;
  readonly category = 'BUSINESS_LOGIC' as const;
}
