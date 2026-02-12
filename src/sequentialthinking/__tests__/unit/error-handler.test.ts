import { describe, it, expect } from 'vitest';
import { CompositeErrorHandler } from '../../error-handlers.js';
import { ValidationError, SecurityError } from '../../errors.js';

describe('CompositeErrorHandler', () => {
  const handler = new CompositeErrorHandler();

  it('should format SequentialThinkingError with correct fields', () => {
    const error = new ValidationError('Bad input', { field: 'thought' });
    const result = handler.handle(error);

    expect(result.isError).toBe(true);
    expect(result.statusCode).toBe(400);

    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('VALIDATION_ERROR');
    expect(data.message).toBe('Bad input');
    expect(data.category).toBe('VALIDATION');
    expect(data.statusCode).toBe(400);
    expect(data.details).toEqual({ field: 'thought' });
    expect(data.timestamp).toBeDefined();
  });

  it('should format SecurityError with correct status code', () => {
    const error = new SecurityError('Forbidden');
    const result = handler.handle(error);

    expect(result.statusCode).toBe(403);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('SECURITY_ERROR');
    expect(data.category).toBe('SECURITY');
  });

  it('should handle non-SequentialThinkingError as INTERNAL_ERROR', () => {
    const error = new Error('Something unexpected');
    const result = handler.handle(error);

    expect(result.isError).toBe(true);
    expect(result.statusCode).toBe(500);

    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('INTERNAL_ERROR');
    expect(data.message).toBe('An unexpected error occurred');
    expect(data.category).toBe('SYSTEM');
    expect(data.statusCode).toBe(500);
    expect(data.timestamp).toBeDefined();
  });

  it('should handle TypeError as INTERNAL_ERROR', () => {
    const error = new TypeError('Cannot read property of undefined');
    const result = handler.handle(error);

    expect(result.statusCode).toBe(500);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toBe('INTERNAL_ERROR');
  });
});
