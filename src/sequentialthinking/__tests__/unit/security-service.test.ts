import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecureThoughtSecurity } from '../../security-service.js';
import { SessionTracker } from '../../session-tracker.js';
import { SecurityError } from '../../errors.js';

describe('SecureThoughtSecurity', () => {
  let sessionTracker: SessionTracker;

  beforeEach(() => {
    sessionTracker = new SessionTracker(0);
  });

  afterEach(() => {
    sessionTracker.destroy();
  });

  describe('sanitizeContent', () => {
    let security: SecureThoughtSecurity;
    beforeEach(() => {
      security = new SecureThoughtSecurity(undefined, sessionTracker);
    });

    const sanitizeCases = [
      { input: 'hello <script>alert(1)</script> world', expected: 'hello  world' },
      { input: 'visit javascript:void(0)', expected: 'visit void(0)' },
      { input: 'call eval(x)', expected: 'call x)' },
      { input: 'new Function(code)', expected: 'new code)' },
      { input: '<div onclick=alert(1)>', expected: '<div alert(1)>' },
    ];

    it.each(sanitizeCases)('should sanitize: $input', ({ input, expected }) => {
      expect(security.sanitizeContent(input)).toBe(expected);
    });
  });

  describe('validateSession', () => {
    let security: SecureThoughtSecurity;
    beforeEach(() => {
      security = new SecureThoughtSecurity(undefined, sessionTracker);
    });

    const sessionCases = [
      { id: 'a'.repeat(100), valid: true },
      { id: 'a'.repeat(101), valid: false },
      { id: '', valid: false },
      { id: 'session-123', valid: true },
    ];

    it.each(sessionCases)('should $valid ? "accept" : "reject" session ID of length $id.length', ({ id, valid }) => {
      expect(security.validateSession(id)).toBe(valid);
    });
  });

  describe('generateSessionId', () => {
    let security: SecureThoughtSecurity;
    beforeEach(() => {
      security = new SecureThoughtSecurity(undefined, sessionTracker);
    });

    it('should return UUID format', () => {
      const id = security.generateSessionId();
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should return unique IDs', () => {
      const ids = new Set(Array.from({ length: 10 }, () => security.generateSessionId()));
      expect(ids.size).toBe(10);
    });
  });

  describe('validateThought', () => {
    it('should block eval( via regex matching', () => {
      const security = new SecureThoughtSecurity(
        { blockedPatterns: [/eval\s*\(/i] },
        sessionTracker,
      );
      expect(() => security.validateThought('call eval(x)', 'sess')).toThrow(SecurityError);
      expect(() => security.validateThought('call eval (x)', 'sess')).toThrow(SecurityError);
    });

    it('should block literal patterns like javascript:', () => {
      const security = new SecureThoughtSecurity(undefined, sessionTracker);
      expect(() => security.validateThought('visit javascript:void(0)', 'sess')).toThrow(SecurityError);
    });

    it('should accept pre-compiled RegExp patterns', () => {
      const security = new SecureThoughtSecurity(
        { blockedPatterns: [/eval\(/i, /forbidden/i] },
        sessionTracker,
      );
      expect(() => security.validateThought('call eval(x)', 'sess')).toThrow(SecurityError);
      expect(() => security.validateThought('this is forbidden', 'sess2')).toThrow(SecurityError);
    });

    it('should allow safe content', () => {
      const security = new SecureThoughtSecurity(undefined, sessionTracker);
      expect(() => security.validateThought('normal analysis text', 'sess')).not.toThrow();
    });
  });

  describe('repeated regex validation (no lastIndex statefulness)', () => {
    it('should block content consistently on repeated calls', () => {
      const security = new SecureThoughtSecurity(undefined, sessionTracker);
      // Call validateThought 3 times with the same blocked content — all must throw
      expect(() => security.validateThought('visit javascript:void(0)', 'sess')).toThrow(SecurityError);
      expect(() => security.validateThought('visit javascript:void(0)', 'sess')).toThrow(SecurityError);
      expect(() => security.validateThought('visit javascript:void(0)', 'sess')).toThrow(SecurityError);
    });

    it('should block forbidden content consistently on repeated calls', () => {
      const security = new SecureThoughtSecurity(undefined, sessionTracker);
      expect(() => security.validateThought('this is forbidden content', 'sess2')).toThrow(SecurityError);
      expect(() => security.validateThought('this is forbidden content', 'sess2')).toThrow(SecurityError);
      expect(() => security.validateThought('this is forbidden content', 'sess2')).toThrow(SecurityError);
    });
  });

  describe('getSecurityStatus', () => {
    it('should return status object', () => {
      const security = new SecureThoughtSecurity(undefined, sessionTracker);
      const status = security.getSecurityStatus();
      expect(status.status).toBe('healthy');
      expect(typeof status.blockedPatterns).toBe('number');
    });
  });


  describe('rate limiting', () => {
    it('should allow requests within limit', () => {
      const tracker = new SessionTracker(0);
      const security = new SecureThoughtSecurity(
        { maxThoughtsPerMinute: 5 },
        tracker,
      );
      // validateThought now records automatically
      for (let i = 0; i < 5; i++) {
        expect(() => security.validateThought('test thought', 'rate-sess')).not.toThrow();
      }
      tracker.destroy();
    });

    it('should throw SecurityError when rate limit exceeded', () => {
      const tracker = new SessionTracker(0);
      const security = new SecureThoughtSecurity(
        { maxThoughtsPerMinute: 3 },
        tracker,
      );
      // Use up the limit - validateThought records automatically
      security.validateThought('thought 1', 'rate-sess');
      security.validateThought('thought 2', 'rate-sess');
      security.validateThought('thought 3', 'rate-sess');
      // 4th should exceed
      expect(() => security.validateThought('thought 4', 'rate-sess')).toThrow(SecurityError);
      expect(() => security.validateThought('thought 4', 'rate-sess')).toThrow('Rate limit exceeded');
      tracker.destroy();
    });

    it('should not rate-limit different sessions', () => {
      const tracker = new SessionTracker(0);
      const security = new SecureThoughtSecurity(
        { maxThoughtsPerMinute: 2 },
        tracker,
      );
      // validateThought records automatically
      security.validateThought('thought 1', 'sess-a');
      security.validateThought('thought 2', 'sess-a');
      // sess-a is at limit, but sess-b should still work
      expect(() => security.validateThought('thought 1', 'sess-b')).not.toThrow();
      tracker.destroy();
    });

    it('should not rate-limit when sessionId is empty', () => {
      const tracker = new SessionTracker(0);
      const security = new SecureThoughtSecurity(
        { maxThoughtsPerMinute: 1 },
        tracker,
      );
      // Empty sessionId should skip rate limiting entirely
      expect(() => security.validateThought('thought 1', '')).not.toThrow();
      expect(() => security.validateThought('thought 2', '')).not.toThrow();
      tracker.destroy();
    });
  });

  describe('Unicode and Edge Cases', () => {
    let security: SecureThoughtSecurity;
    beforeEach(() => {
      security = new SecureThoughtSecurity(undefined, sessionTracker);
    });

    it('should handle Unicode characters', () => {
      const result = security.sanitizeContent('こんにちは世界 🌍 émoji');
      expect(result).toContain('こんにちは世界');
    });

    it('should handle zero-width characters', () => {
      const result = security.sanitizeContent('test\u200B\u200C\u200Dhidden');
      expect(result).toContain('test');
    });

    it('should handle mixed Unicode and ASCII', () => {
      const result = security.sanitizeContent('Hello <script>alert(1)</script> 世界');
      expect(result).not.toContain('<script>');
    });

    it('should handle newlines and tabs', () => {
      const result = security.sanitizeContent('line1\nline2\ttabbed');
      expect(result).toContain('line1');
      expect(result).toContain('line2');
    });

    it('should handle very long strings efficiently', () => {
      const longInput = 'a'.repeat(100000);
      const startTime = Date.now();
      const result = security.sanitizeContent(longInput);
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should process in < 100ms
    });
  });
});
