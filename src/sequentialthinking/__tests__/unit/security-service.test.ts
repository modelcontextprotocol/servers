import { describe, it, expect } from 'vitest';
import { SecureThoughtSecurity, SecurityServiceConfigSchema } from '../../security-service.js';
import { SecurityError } from '../../errors.js';

describe('SecureThoughtSecurity', () => {
  describe('sanitizeContent', () => {
    const security = new SecureThoughtSecurity();

    it('should strip <script> tags', () => {
      const result = security.sanitizeContent('hello <script>alert(1)</script> world');
      expect(result).toBe('hello  world');
    });

    it('should strip javascript: protocol', () => {
      const result = security.sanitizeContent('visit javascript:void(0)');
      expect(result).toBe('visit void(0)');
    });

    it('should strip eval(', () => {
      const result = security.sanitizeContent('call eval(x)');
      expect(result).toBe('call x)');
    });

    it('should strip Function(', () => {
      const result = security.sanitizeContent('new Function(code)');
      expect(result).toBe('new code)');
    });

    it('should strip event handlers', () => {
      const result = security.sanitizeContent('<div onclick=alert(1)>');
      expect(result).toBe('<div alert(1)>');
    });
  });

  describe('validateSession', () => {
    const security = new SecureThoughtSecurity();

    it('should accept 100-char session ID', () => {
      expect(security.validateSession('a'.repeat(100))).toBe(true);
    });

    it('should reject 101-char session ID', () => {
      expect(security.validateSession('a'.repeat(101))).toBe(false);
    });

    it('should reject empty session ID', () => {
      expect(security.validateSession('')).toBe(false);
    });

    it('should accept normal session ID', () => {
      expect(security.validateSession('session-123')).toBe(true);
    });
  });

  describe('generateSessionId', () => {
    const security = new SecureThoughtSecurity();

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
    it('should throw on overly long thought', () => {
      const security = new SecureThoughtSecurity();
      expect(() => security.validateThought('a'.repeat(5001), 'sess')).toThrow(SecurityError);
    });

    it('should accept thought within length limit', () => {
      const security = new SecureThoughtSecurity();
      expect(() => security.validateThought('a'.repeat(5000), 'sess')).not.toThrow();
    });

    it('should block eval( via regex matching', () => {
      const security = new SecureThoughtSecurity(
        SecurityServiceConfigSchema.parse({
          blockedPatterns: ['eval\\s*\\('],
        }),
      );
      expect(() => security.validateThought('call eval(x)', 'sess')).toThrow(SecurityError);
      expect(() => security.validateThought('call eval (x)', 'sess')).toThrow(SecurityError);
    });

    it('should block literal patterns like javascript:', () => {
      const security = new SecureThoughtSecurity();
      expect(() => security.validateThought('visit javascript:void(0)', 'sess')).toThrow(SecurityError);
    });

    it('should skip malformed regex patterns gracefully', () => {
      const security = new SecureThoughtSecurity(
        SecurityServiceConfigSchema.parse({
          blockedPatterns: ['(invalid[', 'eval\\('],
        }),
      );
      // Should not throw on the malformed pattern, but should catch eval(
      expect(() => security.validateThought('call eval(x)', 'sess')).toThrow(SecurityError);
    });

    it('should allow safe content', () => {
      const security = new SecureThoughtSecurity();
      expect(() => security.validateThought('normal analysis text', 'sess')).not.toThrow();
    });
  });

  describe('repeated regex validation (no lastIndex statefulness)', () => {
    it('should block content consistently on repeated calls', () => {
      const security = new SecureThoughtSecurity();
      // Call validateThought 3 times with the same blocked content — all must throw
      expect(() => security.validateThought('visit javascript:void(0)', 'sess')).toThrow(SecurityError);
      expect(() => security.validateThought('visit javascript:void(0)', 'sess')).toThrow(SecurityError);
      expect(() => security.validateThought('visit javascript:void(0)', 'sess')).toThrow(SecurityError);
    });

    it('should block forbidden content consistently on repeated calls', () => {
      const security = new SecureThoughtSecurity();
      expect(() => security.validateThought('this is forbidden content', 'sess2')).toThrow(SecurityError);
      expect(() => security.validateThought('this is forbidden content', 'sess2')).toThrow(SecurityError);
      expect(() => security.validateThought('this is forbidden content', 'sess2')).toThrow(SecurityError);
    });
  });

  describe('getSecurityStatus', () => {
    it('should return status object', () => {
      const security = new SecureThoughtSecurity();
      const status = security.getSecurityStatus();
      expect(status.status).toBe('healthy');
      expect(typeof status.blockedPatterns).toBe('number');
    });
  });

  describe('custom maxThoughtLength', () => {
    it('should accept thought at custom length limit', () => {
      const security = new SecureThoughtSecurity(
        SecurityServiceConfigSchema.parse({ maxThoughtLength: 100 }),
      );
      expect(() => security.validateThought('a'.repeat(100), 'sess')).not.toThrow();
    });

    it('should reject thought exceeding custom length limit', () => {
      const security = new SecureThoughtSecurity(
        SecurityServiceConfigSchema.parse({ maxThoughtLength: 100 }),
      );
      expect(() => security.validateThought('a'.repeat(101), 'sess')).toThrow(SecurityError);
    });
  });

  describe('rate limiting', () => {
    it('should allow requests within limit', () => {
      const security = new SecureThoughtSecurity(
        SecurityServiceConfigSchema.parse({ maxThoughtsPerMinute: 5 }),
      );
      for (let i = 0; i < 5; i++) {
        expect(() => security.validateThought('test thought', 'rate-sess')).not.toThrow();
      }
    });

    it('should throw SecurityError when rate limit exceeded', () => {
      const security = new SecureThoughtSecurity(
        SecurityServiceConfigSchema.parse({ maxThoughtsPerMinute: 3 }),
      );
      // Use up the limit
      security.validateThought('thought 1', 'rate-sess');
      security.validateThought('thought 2', 'rate-sess');
      security.validateThought('thought 3', 'rate-sess');
      // 4th should exceed
      expect(() => security.validateThought('thought 4', 'rate-sess')).toThrow(SecurityError);
      expect(() => security.validateThought('thought 4', 'rate-sess')).toThrow('Rate limit exceeded');
    });

    it('should not rate-limit different sessions', () => {
      const security = new SecureThoughtSecurity(
        SecurityServiceConfigSchema.parse({ maxThoughtsPerMinute: 2 }),
      );
      security.validateThought('thought 1', 'sess-a');
      security.validateThought('thought 2', 'sess-a');
      // sess-a is at limit, but sess-b should still work
      expect(() => security.validateThought('thought 1', 'sess-b')).not.toThrow();
    });

    it('should not rate-limit when sessionId is empty', () => {
      const security = new SecureThoughtSecurity(
        SecurityServiceConfigSchema.parse({ maxThoughtsPerMinute: 1 }),
      );
      // Empty sessionId should skip rate limiting entirely
      expect(() => security.validateThought('thought 1', '')).not.toThrow();
      expect(() => security.validateThought('thought 2', '')).not.toThrow();
    });
  });
});
