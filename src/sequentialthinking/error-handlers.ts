import { SequentialThinkingError, ValidationError, SecurityError, RateLimitError, BusinessLogicError, StateError, CircuitBreakerError, ConfigurationError } from './errors.js';

export interface ErrorResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
  statusCode?: number;
}

export interface ErrorHandler {
  canHandle(error: Error): boolean;
  handle(error: Error): ErrorResponse;
}

export class ValidationErrorHandler implements ErrorHandler {
  canHandle(error: Error): boolean {
    return error instanceof ValidationError;
  }
  
  handle(error: ValidationError): ErrorResponse {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(error.toJSON(), null, 2),
      }],
      isError: true,
      statusCode: error.statusCode,
    };
  }
}

export class SecurityErrorHandler implements ErrorHandler {
  canHandle(error: Error): boolean {
    return error instanceof SecurityError;
  }
  
  handle(error: SecurityError): ErrorResponse {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(error.toJSON(), null, 2),
      }],
      isError: true,
      statusCode: error.statusCode,
    };
  }
}

export class RateLimitErrorHandler implements ErrorHandler {
  canHandle(error: Error): boolean {
    return error instanceof RateLimitError;
  }
  
  handle(error: RateLimitError): ErrorResponse {
    const response = {
      ...error.toJSON(),
      retryAfter: error.retryAfter,
    };
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(response, null, 2),
      }],
      isError: true,
      statusCode: error.statusCode,
    };
  }
}

export class BusinessLogicErrorHandler implements ErrorHandler {
  canHandle(error: Error): boolean {
    return error instanceof BusinessLogicError;
  }
  
  handle(error: BusinessLogicError): ErrorResponse {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(error.toJSON(), null, 2),
      }],
      isError: true,
      statusCode: error.statusCode,
    };
  }
}

export class SystemErrorHandler implements ErrorHandler {
  canHandle(error: Error): boolean {
    return error instanceof StateError || 
           error instanceof CircuitBreakerError || 
           error instanceof ConfigurationError;
  }
  
  handle(error: SequentialThinkingError): ErrorResponse {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(error.toJSON(), null, 2),
      }],
      isError: true,
      statusCode: error.statusCode,
    };
  }
}

export class FallbackErrorHandler implements ErrorHandler {
  canHandle(_error: Error): boolean {
    return true; // Always can handle as fallback
  }
  
  handle(error: Error): ErrorResponse {
    const isSequentialThinkingError = error instanceof SequentialThinkingError;
    
    const errorResponse = {
      error: 'INTERNAL_ERROR',
      message: isSequentialThinkingError ? error.message : 'An unexpected error occurred',
      category: isSequentialThinkingError ? error.category : 'SYSTEM',
      statusCode: isSequentialThinkingError ? error.statusCode : 500,
      timestamp: new Date().toISOString(),
      correlationId: this.generateCorrelationId(),
    };
    
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify(errorResponse, null, 2),
      }],
      isError: true,
      statusCode: errorResponse.statusCode,
    };
  }
  
  private generateCorrelationId(): string {
    return Math.random().toString(36).substring(2, 15)
      + Math.random().toString(36).substring(2, 15);
  }
}

export class CompositeErrorHandler {
  private handlers: ErrorHandler[] = [];
  
  constructor() {
    this.registerHandlers();
  }
  
  private registerHandlers(): void {
    this.handlers = [
      new ValidationErrorHandler(),
      new SecurityErrorHandler(),
      new RateLimitErrorHandler(),
      new BusinessLogicErrorHandler(),
      new SystemErrorHandler(),
      new FallbackErrorHandler(), // Must be last
    ];
  }
  
  handle(error: Error): ErrorResponse {
    for (const handler of this.handlers) {
      if (handler.canHandle(error)) {
        return handler.handle(error);
      }
    }
    
    // This should never happen due to fallback handler
    throw new Error('No error handler available');
  }
}