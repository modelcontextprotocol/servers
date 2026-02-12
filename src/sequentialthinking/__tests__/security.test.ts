import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecurityValidator } from '../security.js';
import { SecurityError, RateLimitError } from '../errors.js';

describe('SecurityValidator', () => {
  let validator: SecurityValidator;

  beforeEach(() => {
    vi.useFakeTimers();

    validator = new SecurityValidator({
      maxThoughtLength: 5000,
      maxThoughtsPerMinute: 5,
      maxThoughtsPerHour: 50,
      maxConcurrentSessions: 10,
      maxSessionsPerIP: 3,
      blockedPatterns: [/test-block/gi, /forbidden/i],
      allowedOrigins: ['http://localhost:3000', 'https://example.com'],
      enableContentSanitization: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Input Validation', () => {
    it('should allow valid thoughts', () => {
      expect(() => {
        validator.validateThought('This is a valid thought', 'session-1');
      }).not.toThrow();
    });

    it('should reject thoughts exceeding max length', () => {
      const longThought = 'a'.repeat(5001);

      expect(() => {
        validator.validateThought(longThought, 'session-1');
      }).toThrow(SecurityError);
    });

    it('should reject thoughts containing blocked patterns', () => {
      expect(() => {
        validator.validateThought('This contains TEST-BLOCK content', 'session-1');
      }).toThrow(SecurityError);

      expect(() => {
        validator.validateThought('This has FORBIDDEN text', 'session-1');
      }).toThrow(SecurityError);
    });

    it('should reject thoughts from unknown origins', () => {
      expect(() => {
        validator.validateThought(
          'Valid thought',
          'session-1',
          'http://evil.com',
        );
      }).toThrow(SecurityError);
    });

    it('should allow thoughts from allowed origins', () => {
      expect(() => {
        validator.validateThought(
          'Valid thought',
          'session-1',
          'http://localhost:3000',
        );
      }).not.toThrow();

      expect(() => {
        validator.validateThought(
          'Valid thought',
          'session-1',
          'https://example.com',
        );
      }).not.toThrow();
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce per-minute rate limits', () => {
      const sessionId = 'rate-test-session';

      for (let i = 0; i < 5; i++) {
        expect(() => {
          validator.validateThought(`Thought ${i}`, sessionId);
        }).not.toThrow();
      }

      expect(() => {
        validator.validateThought('Thought 6', sessionId);
      }).toThrow(RateLimitError);
    });

    it('should allow requests after rate limit window passes', () => {
      const sessionId = 'rate-test-session-2';

      for (let i = 0; i < 5; i++) {
        validator.validateThought(`Thought ${i}`, sessionId);
      }

      expect(() => {
        validator.validateThought('Thought 6', sessionId);
      }).toThrow(RateLimitError);

      // Advance time by 1 minute
      vi.advanceTimersByTime(60000);

      expect(() => {
        validator.validateThought('Thought after wait', sessionId);
      }).not.toThrow();
    });

    it('should enforce per-hour rate limits', () => {
      // Create a validator with a low hourly limit for testability
      // High per-minute so it doesn't interfere; low per-hour to test exhaustion
      const hourlyValidator = new SecurityValidator({
        maxThoughtLength: 5000,
        maxThoughtsPerMinute: 100,
        maxThoughtsPerHour: 10,
        maxConcurrentSessions: 10,
        maxSessionsPerIP: 3,
        blockedPatterns: [],
        allowedOrigins: ['*'],
        enableContentSanitization: true,
      });

      const sessionId = 'hourly-rate-test';

      // Send 10 thoughts (exactly at the hourly limit)
      for (let i = 0; i < 10; i++) {
        expect(() => {
          hourlyValidator.validateThought(`Thought ${i}`, sessionId);
        }).not.toThrow();
      }

      // 11th should be rate-limited by the hourly bucket
      expect(() => {
        hourlyValidator.validateThought('Thought 11', sessionId);
      }).toThrow(RateLimitError);
    });
  });

  describe('IP-based Session Limiting', () => {
    it('should limit sessions per IP', () => {
      const ipAddress = '192.168.1.100';

      for (let i = 0; i < 3; i++) {
        expect(() => {
          validator.validateThought(`Thought ${i}`, `session-${i}`, undefined, ipAddress);
        }).not.toThrow();
      }

      expect(() => {
        validator.validateThought('Too many sessions', 'session-4', undefined, ipAddress);
      }).toThrow(SecurityError);
    });

    it('should track sessions separately for different IPs', () => {
      const ip1 = '192.168.1.100';
      const ip2 = '192.168.1.101';

      for (let i = 0; i < 3; i++) {
        expect(() => {
          validator.validateThought(`IP1 Thought ${i}`, `ip1-session-${i}`, undefined, ip1);
        }).not.toThrow();

        expect(() => {
          validator.validateThought(`IP2 Thought ${i}`, `ip2-session-${i}`, undefined, ip2);
        }).not.toThrow();
      }

      expect(() => {
        validator.validateThought('IP1 Too many', 'ip1-session-3', undefined, ip1);
      }).toThrow(SecurityError);
    });
  });

  describe('Content Sanitization', () => {
    it('should sanitize script tags', () => {
      const content = 'Normal text <script>alert("xss")</script> more text';
      const sanitized = validator.sanitizeContent(content);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('[SCRIPT_REMOVED]');
    });

    it('should sanitize javascript protocols', () => {
      const content = 'Click here: javascript:alert("xss")';
      const sanitized = validator.sanitizeContent(content);

      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('[JS_REMOVED]');
    });

    it('should sanitize SQL injection patterns', () => {
      const content = 'SELECT * FROM users WHERE id = 1';
      const sanitized = validator.sanitizeContent(content);

      expect(sanitized).toContain('[SQL_REMOVED]');
    });

    it('should sanitize path traversal', () => {
      const content = 'Access file: ../../etc/passwd';
      const sanitized = validator.sanitizeContent(content);

      expect(sanitized).toContain('[PATH_REMOVED]');
    });

    it('should limit consecutive characters', () => {
      const content = 'a'.repeat(100) + 'b';
      const sanitized = validator.sanitizeContent(content);

      expect(sanitized.length).toBeLessThan(content.length);
      expect(sanitized).toContain('[TRUNCATED]');
    });

    it('should leave safe content unchanged', () => {
      const content = 'This is a perfectly safe and normal thought content.';
      const sanitized = validator.sanitizeContent(content);

      expect(sanitized).toBe(content);
    });
  });

  describe('Session Management', () => {
    it('should clean up sessions correctly', () => {
      const sessionId = 'cleanup-test';

      validator.validateThought('Test thought', sessionId);

      const statusBefore = validator.getSecurityStatus(sessionId);
      expect(statusBefore.activeSessions).toBeGreaterThan(0);

      validator.cleanupSession(sessionId);

      vi.advanceTimersByTime(10000);

      const statusAfter = validator.getSecurityStatus(sessionId);
      expect(statusAfter).toBeDefined();
    });
  });

  describe('Status Reporting', () => {
    it('should report security status correctly', () => {
      validator.validateThought('Test thought 1', 'session-1');
      validator.validateThought('Test thought 2', 'session-2');

      const status = validator.getSecurityStatus();

      expect(status).toHaveProperty('activeSessions');
      expect(status).toHaveProperty('ipConnections');
      expect(status).toHaveProperty('blockedPatterns');
      expect(status.activeSessions).toBeGreaterThan(0);
    });

    it('should report per-session status', () => {
      const sessionId = 'status-test';

      for (let i = 0; i < 3; i++) {
        validator.validateThought(`Thought ${i}`, sessionId);
      }

      const status = validator.getSecurityStatus(sessionId);

      expect(status).toHaveProperty('rateLimitStatus');
      expect(status.rateLimitStatus).toHaveProperty('minute');
      expect(status.rateLimitStatus).toHaveProperty('hour');
    });
  });

  describe('Wildcard Origins', () => {
    beforeEach(() => {
      validator = new SecurityValidator({
        maxThoughtLength: 1000,
        maxThoughtsPerMinute: 5,
        maxThoughtsPerHour: 50,
        maxConcurrentSessions: 10,
        blockedPatterns: [],
        allowedOrigins: ['*'],
        enableContentSanitization: true,
        maxSessionsPerIP: 3,
      });
    });

    it('should allow any origin with wildcard', () => {
      expect(() => {
        validator.validateThought('Test', 'session-1', 'http://any-origin.com');
      }).not.toThrow();

      expect(() => {
        validator.validateThought('Test', 'session-2', 'https://another-site.org');
      }).not.toThrow();
    });
  });

  describe('Disabled Sanitization', () => {
    beforeEach(() => {
      validator = new SecurityValidator({
        maxThoughtLength: 1000,
        maxThoughtsPerMinute: 5,
        maxThoughtsPerHour: 50,
        maxConcurrentSessions: 10,
        blockedPatterns: [],
        allowedOrigins: ['*'],
        enableContentSanitization: false,
        maxSessionsPerIP: 3,
      });
    });

    it('should not sanitize when disabled', () => {
      const content = '<script>alert("test")</script>';
      const sanitized = validator.sanitizeContent(content);

      expect(sanitized).toBe(content);
    });
  });
});
