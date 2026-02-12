import { SequentialThinkingError } from './errors.js';
import type { ProcessThoughtResponse } from './lib.js';

export class CompositeErrorHandler {
  handle(error: Error): ProcessThoughtResponse {
    if (error instanceof SequentialThinkingError) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(error.toJSON(), null, 2),
        }],
        isError: true,
        statusCode: error.statusCode,
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          category: 'SYSTEM',
          statusCode: 500,
          timestamp: new Date().toISOString(),
        }, null, 2),
      }],
      isError: true,
      statusCode: 500,
    };
  }
}
