import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BasicMetricsCollector } from '../../metrics.js';
import { SessionTracker } from '../../session-tracker.js';
import { BoundedThoughtManager } from '../../state-manager.js';
import { createTestThought as makeThought } from '../helpers/factories.js';

describe('BasicMetricsCollector', () => {
  let metrics: BasicMetricsCollector;
  let sessionTracker: SessionTracker;
  let storage: BoundedThoughtManager;

  beforeEach(() => {
    sessionTracker = new SessionTracker(0);
    storage = new BoundedThoughtManager({
      maxHistorySize: 100,
      maxBranchAge: 3600000,
      maxThoughtLength: 5000,
      maxThoughtsPerBranch: 50,
      cleanupInterval: 0,
    }, sessionTracker);
    metrics = new BasicMetricsCollector(sessionTracker, storage);
  });

  afterEach(() => {
    storage.destroy();
    sessionTracker.destroy();
  });

  describe('recordRequest', () => {
    it('should increment total and successful on success', () => {
      metrics.recordRequest(10, true);
      const m = metrics.getMetrics();
      expect(m.requests.totalRequests).toBe(1);
      expect(m.requests.successfulRequests).toBe(1);
      expect(m.requests.failedRequests).toBe(0);
    });

    it('should increment total and failed on failure', () => {
      metrics.recordRequest(10, false);
      const m = metrics.getMetrics();
      expect(m.requests.totalRequests).toBe(1);
      expect(m.requests.failedRequests).toBe(1);
      expect(m.requests.successfulRequests).toBe(0);
    });

    it('should compute average response time', () => {
      metrics.recordRequest(10, true);
      metrics.recordRequest(20, true);
      const m = metrics.getMetrics();
      expect(m.requests.averageResponseTime).toBe(15);
    });

    it('should update lastRequestTime', () => {
      metrics.recordRequest(5, true);
      const m = metrics.getMetrics();
      expect(m.requests.lastRequestTime).toBeInstanceOf(Date);
    });
  });

  describe('recordThoughtProcessed', () => {
    it('should track total thoughts', () => {
      metrics.recordThoughtProcessed(makeThought());
      metrics.recordThoughtProcessed(makeThought({ thoughtNumber: 2 }));
      expect(metrics.getMetrics().thoughts.totalThoughts).toBe(2);
    });

    it('should track unique branches', () => {
      // Branch count is now queried from storage, so add to storage first
      const t1 = makeThought({ branchId: 'b1' });
      storage.addThought(t1);
      metrics.recordThoughtProcessed(t1);

      const t2 = makeThought({ branchId: 'b1' });
      storage.addThought(t2);
      metrics.recordThoughtProcessed(t2);

      const t3 = makeThought({ branchId: 'b2' });
      storage.addThought(t3);
      metrics.recordThoughtProcessed(t3);

      expect(metrics.getMetrics().thoughts.branchCount).toBe(2);
    });

    it('should track sessions', () => {
      // Record thoughts in tracker first (mimics what happens in real flow)
      sessionTracker.recordThought('s1');
      metrics.recordThoughtProcessed(makeThought({ sessionId: 's1' }));
      sessionTracker.recordThought('s2');
      metrics.recordThoughtProcessed(makeThought({ sessionId: 's2' }));
      expect(metrics.getMetrics().thoughts.activeSessions).toBe(2);
    });

    it('should track revisions', () => {
      metrics.recordThoughtProcessed(makeThought({ isRevision: true }));
      expect(metrics.getMetrics().thoughts.revisionCount).toBe(1);
    });

    it('should compute average thought length', () => {
      metrics.recordThoughtProcessed(makeThought({ thought: 'abcde' })); // 5
      metrics.recordThoughtProcessed(makeThought({ thought: 'abcdefghij' })); // 10
      // average: (5+10)/2 = 7.5, rounded = 8
      expect(metrics.getMetrics().thoughts.averageThoughtLength).toBe(8);
    });
  });

  describe('response time ring buffer', () => {
    it('should keep only last 100 response times', () => {
      for (let i = 0; i < 110; i++) {
        metrics.recordRequest(i, true);
      }
      // Average should be based on last 100 values (10-109)
      const avg = metrics.getMetrics().requests.averageResponseTime;
      // Sum of 10..109 = 5950, avg = 59.5
      expect(avg).toBeCloseTo(59.5, 0);
    });

    it('should compute correct average after adding 150 response times', () => {
      for (let i = 1; i <= 150; i++) {
        metrics.recordRequest(i, true);
      }
      // Last 100 values are 51..150
      // Sum = (51+150)*100/2 = 10050, avg = 100.5
      const avg = metrics.getMetrics().requests.averageResponseTime;
      expect(avg).toBeCloseTo(100.5, 0);
    });
  });

  describe('getMetrics shape', () => {
    it('should return correct top-level structure', () => {
      const m = metrics.getMetrics();
      expect(m).toHaveProperty('requests');
      expect(m).toHaveProperty('thoughts');
      expect(m).toHaveProperty('system');
    });

    it('should include system metrics', () => {
      const m = metrics.getMetrics();
      expect(m.system.memoryUsage).toHaveProperty('heapUsed');
      expect(m.system.cpuUsage).toHaveProperty('user');
      expect(typeof m.system.uptime).toBe('number');
      expect(m.system.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('destroy', () => {
    it('should reset all counters and collections', () => {
      metrics.recordRequest(10, true);
      metrics.recordRequest(20, false);
      metrics.recordThoughtProcessed(makeThought({ sessionId: 's1', branchId: 'b1' }));
      metrics.recordThoughtProcessed(makeThought({ sessionId: 's2', isRevision: true }));

      metrics.destroy();

      const m = metrics.getMetrics();
      expect(m.requests.totalRequests).toBe(0);
      expect(m.requests.successfulRequests).toBe(0);
      expect(m.requests.failedRequests).toBe(0);
      expect(m.requests.averageResponseTime).toBe(0);
      expect(m.requests.lastRequestTime).toBeNull();
      expect(m.requests.requestsPerMinute).toBe(0);
      expect(m.thoughts.totalThoughts).toBe(0);
      expect(m.thoughts.averageThoughtLength).toBe(0);
      expect(m.thoughts.thoughtsPerMinute).toBe(0);
      expect(m.thoughts.revisionCount).toBe(0);
      expect(m.thoughts.branchCount).toBe(0);
      expect(m.thoughts.activeSessions).toBe(0);
    });
  });
});
