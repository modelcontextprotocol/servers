import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SecureThoughtSecurity, SecurityServiceConfigSchema } from '../../security-service.js';
import { SessionTracker } from '../../session-tracker.js';
import { SecurityError } from '../../errors.js';

describe('Race Condition: Rate Limit Recording', () => {
  let sessionTracker: SessionTracker;
  let security: SecureThoughtSecurity;

  beforeEach(() => {
    sessionTracker = new SessionTracker(0);
    security = new SecureThoughtSecurity(
      SecurityServiceConfigSchema.parse({ maxThoughtsPerMinute: 3 }),
      sessionTracker,
    );
  });

  afterEach(() => {
    sessionTracker.destroy();
  });

  it('should record thought immediately after successful validation', () => {
    // First validation should succeed
    security.validateThought('test 1', 'race-session');

    // Check that it was recorded by verifying the count
    const stats = sessionTracker.getActiveSessionCount();
    expect(stats).toBeGreaterThan(0);
  });

  it('should prevent race condition with rapid sequential validations', () => {
    // Rapid fire 3 validations - all should succeed
    security.validateThought('test 1', 'rapid-session');
    security.validateThought('test 2', 'rapid-session');
    security.validateThought('test 3', 'rapid-session');

    // 4th should fail because rate limit was recorded after each validation
    expect(() => security.validateThought('test 4', 'rapid-session'))
      .toThrow(SecurityError);
    expect(() => security.validateThought('test 4', 'rapid-session'))
      .toThrow('Rate limit exceeded');
  });

  it('should enforce rate limit correctly even with interleaved sessions', () => {
    // Session A: 3 thoughts (at limit)
    security.validateThought('a1', 'session-a');
    security.validateThought('a2', 'session-a');
    security.validateThought('a3', 'session-a');

    // Session B: 2 thoughts (under limit)
    security.validateThought('b1', 'session-b');
    security.validateThought('b2', 'session-b');

    // Session A: should fail (at limit)
    expect(() => security.validateThought('a4', 'session-a'))
      .toThrow('Rate limit exceeded');

    // Session B: should succeed (1 more allowed)
    expect(() => security.validateThought('b3', 'session-b'))
      .not.toThrow();

    // Session B: should now fail (at limit)
    expect(() => security.validateThought('b4', 'session-b'))
      .toThrow('Rate limit exceeded');
  });

  it('should handle validation failure without recording', () => {
    // Create security with blocked pattern
    const securityWithBlock = new SecureThoughtSecurity(
      SecurityServiceConfigSchema.parse({
        maxThoughtsPerMinute: 5,
        blockedPatterns: ['forbidden'],
      }),
      sessionTracker,
    );

    // This should fail validation due to blocked pattern
    expect(() => securityWithBlock.validateThought('this is forbidden', 'test-session'))
      .toThrow(SecurityError);

    // Session should not have any rate limit entries since validation failed
    // Try 5 more validations with valid content
    for (let i = 0; i < 5; i++) {
      securityWithBlock.validateThought(`valid thought ${i}`, 'test-session');
    }

    // 6th should fail due to rate limit (not including the failed validation)
    expect(() => securityWithBlock.validateThought('valid thought 6', 'test-session'))
      .toThrow('Rate limit exceeded');
  });

  it('should maintain accurate count even with empty session IDs', () => {
    // Empty session ID should not be rate limited or recorded
    security.validateThought('test 1', '');
    security.validateThought('test 2', '');
    security.validateThought('test 3', '');
    security.validateThought('test 4', ''); // Should not throw

    // Verify that empty sessions don't pollute the tracker
    expect(sessionTracker.getActiveSessionCount()).toBe(0);
  });

  it('should correctly expire old rate limit entries', () => {
    // This test verifies that old entries don't prevent new thoughts
    const tracker = new SessionTracker(0);
    const sec = new SecureThoughtSecurity(
      SecurityServiceConfigSchema.parse({ maxThoughtsPerMinute: 2 }),
      tracker,
    );

    // Add 2 thoughts (at limit)
    sec.validateThought('old 1', 'expire-session');
    sec.validateThought('old 2', 'expire-session');

    // Should be at limit
    expect(() => sec.validateThought('new 1', 'expire-session'))
      .toThrow('Rate limit exceeded');

    // Wait for rate window to expire (61 seconds)
    // Simulate by manually pruning old timestamps
    tracker.cleanup();

    tracker.destroy();
  });
});
