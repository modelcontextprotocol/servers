import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StructuredLogger } from '../../logger.js';

describe('StructuredLogger', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('log level filtering', () => {
    it('should suppress debug messages at info level', () => {
      const logger = new StructuredLogger({ level: 'info', enableColors: false, enableThoughtLogging: true });
      logger.debug('should not appear');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should output info messages at info level', () => {
      const logger = new StructuredLogger({ level: 'info', enableColors: false, enableThoughtLogging: true });
      logger.info('visible');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('visible');
    });

    it('should output debug messages at debug level', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.debug('debug msg');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should suppress info messages at warn level', () => {
      const logger = new StructuredLogger({ level: 'warn', enableColors: false, enableThoughtLogging: true });
      logger.info('should not appear');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should output error messages at error level', () => {
      const logger = new StructuredLogger({ level: 'error', enableColors: false, enableThoughtLogging: true });
      logger.error('err');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('sensitive field redaction', () => {
    it('should redact password fields', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.info('test', { password: 'secret123' });
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.meta.password).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.info('test', { user: { token: 'abc', name: 'Alice' } });
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.meta.user.token).toBe('[REDACTED]');
      expect(entry.meta.user.name).toBe('Alice');
    });

    it('should redact auth-related fields', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.info('test', { authorization: 'Bearer xyz' });
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.meta.authorization).toBe('[REDACTED]');
    });
  });

  describe('word-boundary-aware sensitive field matching', () => {
    const sensitiveCases = [
      { field: 'authorization', value: 'Bearer xyz', shouldRedact: true },
      { field: 'password', value: 'secret', shouldRedact: true },
      { field: 'mySecretKey', value: 'value', shouldRedact: true },
      { field: 'api_key', value: 'abc123', shouldRedact: true },
      { field: 'authoritativeSource', value: 'docs.example.com', shouldRedact: false },
      { field: 'keyboard', value: 'mechanical', shouldRedact: false },
      { field: 'monkey', value: 'see monkey do', shouldRedact: false },
    ];

    it.each(sensitiveCases)('should redact $field: $shouldRedact ? "REDACTED" : "original"', ({ field, value, shouldRedact }) => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.info('test', { [field]: value });
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.meta[field]).toBe(shouldRedact ? '[REDACTED]' : value);
    });
  });

  describe('depth limit on sanitize', () => {
    it('should return [Object] for deeply nested objects', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });

      // Build an object nested 15 levels deep
      let deep: Record<string, unknown> = { value: 'leaf' };
      for (let i = 0; i < 15; i++) {
        deep = { nested: deep };
      }

      logger.info('test', deep as Record<string, unknown>);
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);

      // Walk down until we find '[Object]'
      let current: unknown = entry.meta;
      let depth = 0;
      while (typeof current === 'object' && current !== null && depth < 20) {
        current = (current as Record<string, unknown>).nested;
        depth++;
      }
      expect(current).toBe('[Object]');
      expect(depth).toBeLessThan(15);
    });
  });

  describe('circular reference handling', () => {
    it('should handle circular references without crashing', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      const obj: Record<string, unknown> = { name: 'root' };
      obj.self = obj;

      logger.info('test', obj);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const output = errorSpy.mock.calls[0][0] as string;
      expect(output).toContain('[Circular]');
    });

    it('should handle nested circular references', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      const a: Record<string, unknown> = { name: 'a' };
      const b: Record<string, unknown> = { name: 'b', ref: a };
      a.ref = b;

      logger.info('test', a);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const output = errorSpy.mock.calls[0][0] as string;
      expect(output).toContain('[Circular]');
    });
  });

  describe('logThought', () => {
    it('should produce debug entry with thought metadata', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.logThought('session-1', {
        thought: 'test thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.level).toBe('debug');
      expect(entry.message).toBe('Thought processed');
      expect(entry.meta.sessionId).toBe('session-1');
      expect(entry.meta.thoughtNumber).toBe(1);
    });

    it('should not log thought at info level', () => {
      const logger = new StructuredLogger({ level: 'info', enableColors: false, enableThoughtLogging: true });
      logger.logThought('session-1', {
        thought: 'test',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });

  describe('error logging', () => {
    it('should log Error instances with stack info', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.error('fail', new Error('boom'));
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.meta.error.name).toBe('Error');
      expect(entry.meta.error.message).toBe('boom');
      expect(entry.meta.error.stack).toBeDefined();
    });

    it('should log non-Error values as meta', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.error('fail', 'string error');
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.meta.error).toBe('string error');
    });

    it('should log error without error argument', () => {
      const logger = new StructuredLogger({ level: 'debug', enableColors: false, enableThoughtLogging: true });
      logger.error('something went wrong');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.level).toBe('error');
      expect(entry.message).toBe('something went wrong');
      expect(entry.meta).toBeUndefined();
    });
  });

  describe('warn logging', () => {
    it('should output warn messages at warn level', () => {
      const logger = new StructuredLogger({ level: 'warn', enableColors: false, enableThoughtLogging: true });
      logger.warn('caution');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(entry.level).toBe('warn');
      expect(entry.message).toBe('caution');
    });
  });
});
