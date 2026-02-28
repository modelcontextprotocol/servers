import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigManager } from '../../config.js';

describe('ConfigManager', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save env vars we'll modify
    for (const key of [
      'MAX_HISTORY_SIZE', 'MAX_THOUGHT_LENGTH', 'MAX_THOUGHTS_PER_MIN',
      'SERVER_NAME', 'SERVER_VERSION', 'BLOCKED_PATTERNS',
      'LOG_LEVEL', 'ENABLE_COLORS', 'ENABLE_METRICS', 'ENABLE_HEALTH_CHECKS',
      'MAX_BRANCH_AGE', 'MAX_THOUGHTS_PER_BRANCH', 'CLEANUP_INTERVAL',
      'DISABLE_THOUGHT_LOGGING',
      'HEALTH_MAX_MEMORY', 'HEALTH_MAX_STORAGE', 'HEALTH_MAX_RESPONSE_TIME',
      'HEALTH_ERROR_RATE_DEGRADED', 'HEALTH_ERROR_RATE_UNHEALTHY',
    ]) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('load()', () => {
    it('should return default config when no env vars set', () => {
      // Clear env vars
      delete process.env.MAX_HISTORY_SIZE;
      delete process.env.SERVER_NAME;
      delete process.env.DISABLE_THOUGHT_LOGGING;

      const config = ConfigManager.load();

      expect(config.server.name).toBe('sequential-thinking-server');
      expect(config.server.version).toBe('0.6.2');
      expect(config.state.maxHistorySize).toBe(1000);
      expect(config.state.maxThoughtLength).toBe(5000);
      expect(config.state.maxBranchAge).toBe(3600000);
      expect(config.state.maxThoughtsPerBranch).toBe(100);
      expect(config.state.cleanupInterval).toBe(300000);
      expect(config.security.maxThoughtsPerMinute).toBe(60);
      expect(config.logging.level).toBe('info');
      expect(config.logging.enableColors).toBe(true);
      expect(config.logging.enableThoughtLogging).toBe(true);
      expect(config.monitoring.enableMetrics).toBe(true);
      expect(config.monitoring.enableHealthChecks).toBe(true);
      expect(config.monitoring.healthThresholds.maxMemoryPercent).toBe(90);
      expect(config.monitoring.healthThresholds.maxStoragePercent).toBe(80);
      expect(config.monitoring.healthThresholds.maxResponseTimeMs).toBe(200);
      expect(config.monitoring.healthThresholds.errorRateDegraded).toBe(2);
      expect(config.monitoring.healthThresholds.errorRateUnhealthy).toBe(5);
    });

    it('should respect env var overrides', () => {
      process.env.MAX_HISTORY_SIZE = '500';
      process.env.SERVER_NAME = 'custom-server';

      const config = ConfigManager.load();

      expect(config.state.maxHistorySize).toBe(500);
      expect(config.server.name).toBe('custom-server');
    });

    it('should use defaults for NaN env values', () => {
      process.env.MAX_HISTORY_SIZE = 'not-a-number';

      const config = ConfigManager.load();

      expect(config.state.maxHistorySize).toBe(1000);
    });

    it('should use defaults for undefined env values', () => {
      delete process.env.MAX_HISTORY_SIZE;

      const config = ConfigManager.load();

      expect(config.state.maxHistorySize).toBe(1000);
    });
  });

  describe('enableThoughtLogging', () => {
    it('should default to true when DISABLE_THOUGHT_LOGGING is not set', () => {
      delete process.env.DISABLE_THOUGHT_LOGGING;
      const config = ConfigManager.load();
      expect(config.logging.enableThoughtLogging).toBe(true);
    });

    it('should be false when DISABLE_THOUGHT_LOGGING is true', () => {
      process.env.DISABLE_THOUGHT_LOGGING = 'true';
      const config = ConfigManager.load();
      expect(config.logging.enableThoughtLogging).toBe(false);
    });

    it('should remain true for non-true values of DISABLE_THOUGHT_LOGGING', () => {
      process.env.DISABLE_THOUGHT_LOGGING = 'false';
      const config = ConfigManager.load();
      expect(config.logging.enableThoughtLogging).toBe(true);
    });
  });

  describe('health threshold env vars', () => {
    it('should load custom health thresholds from env', () => {
      process.env.HEALTH_MAX_MEMORY = '70';
      process.env.HEALTH_MAX_STORAGE = '60';
      process.env.HEALTH_MAX_RESPONSE_TIME = '100';
      process.env.HEALTH_ERROR_RATE_DEGRADED = '1';
      process.env.HEALTH_ERROR_RATE_UNHEALTHY = '3';

      const config = ConfigManager.load();

      expect(config.monitoring.healthThresholds.maxMemoryPercent).toBe(70);
      expect(config.monitoring.healthThresholds.maxStoragePercent).toBe(60);
      expect(config.monitoring.healthThresholds.maxResponseTimeMs).toBe(100);
      expect(config.monitoring.healthThresholds.errorRateDegraded).toBe(1);
      expect(config.monitoring.healthThresholds.errorRateUnhealthy).toBe(3);
    });
  });

  describe('validate()', () => {
    it('should accept valid config', () => {
      const config = ConfigManager.load();
      expect(() => ConfigManager.validate(config)).not.toThrow();
    });

    it('should reject maxHistorySize = 0', () => {
      const config = ConfigManager.load();
      config.state.maxHistorySize = 0;
      expect(() => ConfigManager.validate(config)).toThrow('MAX_HISTORY_SIZE must be between 1 and 10000');
    });

    it('should reject maxHistorySize = 10001', () => {
      const config = ConfigManager.load();
      config.state.maxHistorySize = 10001;
      expect(() => ConfigManager.validate(config)).toThrow('MAX_HISTORY_SIZE must be between 1 and 10000');
    });

    it('should reject maxThoughtLength = -1', () => {
      const config = ConfigManager.load();
      config.state.maxThoughtLength = -1;
      expect(() => ConfigManager.validate(config)).toThrow('maxThoughtLength must be between 1 and 100000');
    });

    it('should reject maxThoughtLength = 100001', () => {
      const config = ConfigManager.load();
      config.state.maxThoughtLength = 100001;
      expect(() => ConfigManager.validate(config)).toThrow('maxThoughtLength must be between 1 and 100000');
    });

    it('should accept maxThoughtLength = 1', () => {
      const config = ConfigManager.load();
      config.state.maxThoughtLength = 1;
      expect(() => ConfigManager.validate(config)).not.toThrow();
    });

    it('should accept maxThoughtLength = 100000', () => {
      const config = ConfigManager.load();
      config.state.maxThoughtLength = 100000;
      expect(() => ConfigManager.validate(config)).not.toThrow();
    });

    it('should reject maxThoughtsPerMinute out of range', () => {
      const config = ConfigManager.load();
      config.security.maxThoughtsPerMinute = 0;
      expect(() => ConfigManager.validate(config)).toThrow('maxThoughtsPerMinute must be between 1 and 1000');
    });

    it('should reject negative maxBranchAge', () => {
      const config = ConfigManager.load();
      config.state.maxBranchAge = -1;
      expect(() => ConfigManager.validate(config)).toThrow('maxBranchAge must be >= 0');
    });

    it('should reject maxThoughtsPerBranch out of range', () => {
      const config = ConfigManager.load();
      config.state.maxThoughtsPerBranch = 0;
      expect(() => ConfigManager.validate(config)).toThrow('maxThoughtsPerBranch must be between 1 and 10000');
    });

    it('should reject maxThoughtsPerBranch exceeding 10000', () => {
      const config = ConfigManager.load();
      config.state.maxThoughtsPerBranch = 10001;
      expect(() => ConfigManager.validate(config)).toThrow('maxThoughtsPerBranch must be between 1 and 10000');
    });

    it('should reject negative cleanupInterval', () => {
      const config = ConfigManager.load();
      config.state.cleanupInterval = -1;
      expect(() => ConfigManager.validate(config)).toThrow('cleanupInterval must be >= 0');
    });
  });

  describe('getEnvironmentInfo()', () => {
    it('should return correct shape', () => {
      const info = ConfigManager.getEnvironmentInfo();

      expect(typeof info.nodeVersion).toBe('string');
      expect(typeof info.platform).toBe('string');
      expect(typeof info.arch).toBe('string');
      expect(typeof info.pid).toBe('number');
      expect(info.memoryUsage).toHaveProperty('heapUsed');
      expect(typeof info.uptime).toBe('number');
    });
  });

  describe('loadBlockedPatterns()', () => {
    it('should load defaults when BLOCKED_PATTERNS is not set', () => {
      delete process.env.BLOCKED_PATTERNS;

      const config = ConfigManager.load();

      expect(config.security.blockedPatterns.length).toBeGreaterThan(0);
      expect(config.security.blockedPatterns[0]).toBeInstanceOf(RegExp);
    });

    it('should parse BLOCKED_PATTERNS env var', () => {
      process.env.BLOCKED_PATTERNS = 'foo,bar';

      const config = ConfigManager.load();

      expect(config.security.blockedPatterns).toHaveLength(2);
      expect(config.security.blockedPatterns[0].test('foo')).toBe(true);
    });

    it('should fall back to defaults on invalid regex', () => {
      process.env.BLOCKED_PATTERNS = '(invalid[';

      const config = ConfigManager.load();

      // Should fall back to defaults
      expect(config.security.blockedPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('LOG_LEVEL validation', () => {
    it('should fall back to info for invalid LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'verbose';
      const config = ConfigManager.load();
      expect(config.logging.level).toBe('info');
    });

    it('should accept valid LOG_LEVEL values', () => {
      for (const level of ['debug', 'info', 'warn', 'error']) {
        process.env.LOG_LEVEL = level;
        const config = ConfigManager.load();
        expect(config.logging.level).toBe(level);
      }
    });
  });
});
