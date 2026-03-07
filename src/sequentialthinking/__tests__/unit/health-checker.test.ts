import { describe, it, expect } from 'vitest';
import { ComprehensiveHealthChecker } from '../../health-checker.js';
import type { MetricsCollector, ThoughtStorage, SecurityService, StorageStats, RequestMetrics, ThoughtMetrics, SystemMetrics } from '../../interfaces.js';

function makeMockMetrics(overrides?: Partial<RequestMetrics>): MetricsCollector {
  return {
    recordRequest: () => {},
    recordThoughtProcessed: () => {},
    destroy: () => {},
    getMetrics: () => ({
      requests: {
        totalRequests: 10,
        successfulRequests: 10,
        failedRequests: 0,
        averageResponseTime: 50,
        lastRequestTime: new Date(),
        requestsPerMinute: 5,
        ...overrides,
      },
      thoughts: {
        totalThoughts: 0,
        averageThoughtLength: 0,
        thoughtsPerMinute: 0,
        revisionCount: 0,
        branchCount: 0,
        activeSessions: 0,
      },
      system: {
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        uptime: process.uptime(),
        timestamp: new Date(),
      },
    }),
  };
}

function makeMockStorage(overrides?: Partial<StorageStats>): ThoughtStorage {
  return {
    addThought: () => {},
    getHistory: () => [],
    getBranches: () => [],
    destroy: () => {},
    getStats: () => ({
      historySize: 10,
      historyCapacity: 100,
      branchCount: 0,
      sessionCount: 0,
      ...overrides,
    }),
  };
}

function makeMockSecurity(): SecurityService {
  return {
    validateThought: () => {},
    sanitizeContent: (c: string) => c,
    getSecurityStatus: () => ({ status: 'healthy', activeSessions: 0, blockedPatterns: 5 }),
    generateSessionId: () => 'test-id',
    validateSession: () => true,
  };
}

describe('ComprehensiveHealthChecker', () => {
  it('should return healthy when all checks pass', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics(),
      makeMockStorage(),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(health.status).toBe('healthy');
    expect(health.checks.memory.status).toBe('healthy');
    expect(health.checks.storage.status).toBe('healthy');
    expect(health.checks.security.status).toBe('healthy');
  });

  it('should return degraded on elevated storage usage (>64% of capacity)', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics(),
      makeMockStorage({ historySize: 70, historyCapacity: 100 }),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(health.checks.storage.status).toBe('degraded');
  });

  it('should handle division-by-zero guard (capacity = 0)', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics(),
      makeMockStorage({ historySize: 0, historyCapacity: 0 }),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    // Should not produce NaN/Infinity — should be healthy with 0%
    expect(health.checks.storage.status).toBe('healthy');
    expect(health.checks.storage.message).toContain('0');
  });

  it('should use fallback on rejected check', async () => {
    const brokenSecurity: SecurityService = {
      validateThought: () => {},
      sanitizeContent: (c: string) => c,
      getSecurityStatus: () => { throw new Error('boom'); },
      generateSessionId: () => 'x',
      validateSession: () => true,
    };

    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics(),
      makeMockStorage(),
      brokenSecurity,
    );
    const health = await checker.checkHealth();
    // Security check should be unhealthy but others should be fine
    expect(health.checks.security.status).toBe('unhealthy');
    expect(health.checks.memory.status).toBe('healthy');
  });

  it('should return degraded on elevated response time (>80% of max)', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics({ averageResponseTime: 170 }),
      makeMockStorage(),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(health.checks.responseTime.status).toBe('degraded');
  });

  it('should include all 5 check fields', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics(),
      makeMockStorage(),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(health.checks).toHaveProperty('memory');
    expect(health.checks).toHaveProperty('responseTime');
    expect(health.checks).toHaveProperty('errorRate');
    expect(health.checks).toHaveProperty('storage');
    expect(health.checks).toHaveProperty('security');
  });

  it('should include summary, uptime, and timestamp', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics(),
      makeMockStorage(),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(typeof health.summary).toBe('string');
    expect(typeof health.uptime).toBe('number');
    expect(health.timestamp).toBeInstanceOf(Date);
  });

  it('should return degraded on elevated error rate (>2%)', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics({ totalRequests: 100, failedRequests: 3, successfulRequests: 97 }),
      makeMockStorage(),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(health.checks.errorRate.status).toBe('degraded');
  });

  it('should return unhealthy on high error rate (>5%)', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics({ totalRequests: 100, failedRequests: 6, successfulRequests: 94 }),
      makeMockStorage(),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(health.checks.errorRate.status).toBe('unhealthy');
  });

  it('should return unhealthy on response time exceeding max', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics({ averageResponseTime: 250 }),
      makeMockStorage(),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(health.checks.responseTime.status).toBe('unhealthy');
  });

  it('should return unhealthy on storage usage exceeding max', async () => {
    const checker = new ComprehensiveHealthChecker(
      makeMockMetrics(),
      makeMockStorage({ historySize: 90, historyCapacity: 100 }),
      makeMockSecurity(),
    );
    const health = await checker.checkHealth();
    expect(health.checks.storage.status).toBe('unhealthy');
  });

  describe('custom thresholds', () => {
    it('should use custom maxStoragePercent threshold', async () => {
      const checker = new ComprehensiveHealthChecker(
        makeMockMetrics(),
        makeMockStorage({ historySize: 55, historyCapacity: 100 }),
        makeMockSecurity(),
        { maxMemoryPercent: 90, maxStoragePercent: 50, maxResponseTimeMs: 200, errorRateDegraded: 2, errorRateUnhealthy: 5 },
      );
      const health = await checker.checkHealth();
      // 55% > 50% maxStoragePercent → unhealthy
      expect(health.checks.storage.status).toBe('unhealthy');
    });

    it('should use custom maxResponseTimeMs threshold', async () => {
      const checker = new ComprehensiveHealthChecker(
        makeMockMetrics({ averageResponseTime: 60 }),
        makeMockStorage(),
        makeMockSecurity(),
        { maxMemoryPercent: 90, maxStoragePercent: 80, maxResponseTimeMs: 50, errorRateDegraded: 2, errorRateUnhealthy: 5 },
      );
      const health = await checker.checkHealth();
      // 60 > 50 → unhealthy
      expect(health.checks.responseTime.status).toBe('unhealthy');
    });

    it('should use custom error rate thresholds', async () => {
      const checker = new ComprehensiveHealthChecker(
        makeMockMetrics({ totalRequests: 100, failedRequests: 2, successfulRequests: 98 }),
        makeMockStorage(),
        makeMockSecurity(),
        { maxMemoryPercent: 90, maxStoragePercent: 80, maxResponseTimeMs: 200, errorRateDegraded: 1, errorRateUnhealthy: 3 },
      );
      const health = await checker.checkHealth();
      // 2% > 1% degraded threshold → degraded
      expect(health.checks.errorRate.status).toBe('degraded');
    });
  });

  describe('error rate clamping', () => {
    it('should clamp error rate to 100% when failedRequests > totalRequests', async () => {
      const checker = new ComprehensiveHealthChecker(
        makeMockMetrics({ totalRequests: 100, failedRequests: 200, successfulRequests: 0 }),
        makeMockStorage(),
        makeMockSecurity(),
      );
      const health = await checker.checkHealth();
      expect(health.checks.errorRate.status).toBe('unhealthy');
      // Error rate should be clamped to 100, not 200
      const details = health.checks.errorRate.details as { errorRate: number };
      expect(details.errorRate).toBe(100);
    });
  });
});
