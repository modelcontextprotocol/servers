import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BasicMetricsCollector } from '../../metrics.js';
import { SessionTracker } from '../../session-tracker.js';
import { BoundedThoughtManager } from '../../state-manager.js';
import { createTestThought as makeThought } from '../helpers/factories.js';

describe('Timestamp Tracking with CircularBuffer', () => {
  let metrics: BasicMetricsCollector;
  let sessionTracker: SessionTracker;
  let storage: BoundedThoughtManager;

  beforeEach(() => {
    sessionTracker = new SessionTracker(0);
    storage = new BoundedThoughtManager({
      maxHistorySize: 100,
      maxBranchAge: 3600000,
      maxThoughtsPerBranch: 50,
      cleanupInterval: 0,
    }, sessionTracker);
    metrics = new BasicMetricsCollector(sessionTracker, storage);
  });

  afterEach(() => {
    storage.destroy();
    sessionTracker.destroy();
    metrics.destroy();
  });

  describe('Request timestamp filtering', () => {
    it('should only count requests within last 60 seconds', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Record 3 requests at base time
        metrics.recordRequest(10, true);
        metrics.recordRequest(15, true);
        metrics.recordRequest(20, true);

        expect(metrics.getMetrics().requests.requestsPerMinute).toBe(3);

        // Advance 30 seconds, add 2 more
        vi.advanceTimersByTime(30000);
        metrics.recordRequest(12, true);
        metrics.recordRequest(18, true);

        expect(metrics.getMetrics().requests.requestsPerMinute).toBe(5);

        // Advance another 31 seconds (total 61s) - first 3 should be excluded
        vi.advanceTimersByTime(31000);
        metrics.recordRequest(14, true);

        const m = metrics.getMetrics();
        // Should only count the 2 from 30s ago + 1 just now = 3
        expect(m.requests.requestsPerMinute).toBe(3);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle rapid bursts of requests correctly', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Record 50 requests in quick succession
        for (let i = 0; i < 50; i++) {
          metrics.recordRequest(10, true);
        }

        expect(metrics.getMetrics().requests.requestsPerMinute).toBe(50);

        // Advance 61 seconds - all should be excluded
        vi.advanceTimersByTime(61000);
        metrics.recordRequest(10, true);

        expect(metrics.getMetrics().requests.requestsPerMinute).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle requests exactly at 60 second boundary', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        metrics.recordRequest(10, true);

        // Advance exactly 60 seconds
        vi.advanceTimersByTime(60000);
        metrics.recordRequest(15, true);

        const m = metrics.getMetrics();
        // Request at exactly 60s old is excluded (> cutoff, not >=)
        // Only the current request is counted
        expect(m.requests.requestsPerMinute).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Thought timestamp filtering', () => {
    it('should only count thoughts within last 60 seconds', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Record 4 thoughts at base time
        for (let i = 0; i < 4; i++) {
          metrics.recordThoughtProcessed(makeThought({ thoughtNumber: i + 1 }));
        }

        expect(metrics.getMetrics().thoughts.thoughtsPerMinute).toBe(4);

        // Advance 40 seconds, add 3 more
        vi.advanceTimersByTime(40000);
        for (let i = 0; i < 3; i++) {
          metrics.recordThoughtProcessed(makeThought({ thoughtNumber: i + 5 }));
        }

        expect(metrics.getMetrics().thoughts.thoughtsPerMinute).toBe(7);

        // Advance another 25 seconds (total 65s) - first 4 should be excluded
        vi.advanceTimersByTime(25000);
        metrics.recordThoughtProcessed(makeThought({ thoughtNumber: 8 }));

        const m = metrics.getMetrics();
        // Should only count the 3 from 40s ago + 1 just now = 4
        expect(m.thoughts.thoughtsPerMinute).toBe(4);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle thought bursts across time windows', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Burst 1: 20 thoughts now
        for (let i = 0; i < 20; i++) {
          metrics.recordThoughtProcessed(makeThought());
        }

        expect(metrics.getMetrics().thoughts.thoughtsPerMinute).toBe(20);

        // Advance 30 seconds
        vi.advanceTimersByTime(30000);

        // Burst 2: 15 thoughts
        for (let i = 0; i < 15; i++) {
          metrics.recordThoughtProcessed(makeThought());
        }

        expect(metrics.getMetrics().thoughts.thoughtsPerMinute).toBe(35);

        // Advance 31 seconds (total 61s) - burst 1 should be excluded
        vi.advanceTimersByTime(31000);

        metrics.recordThoughtProcessed(makeThought());

        const m = metrics.getMetrics();
        // Should only count burst 2 (15) + 1 just now = 16
        expect(m.thoughts.thoughtsPerMinute).toBe(16);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('CircularBuffer overflow behavior', () => {
    it('should handle more than 1000 requests correctly', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Record 1200 requests within 60 seconds (exceed buffer capacity)
        for (let i = 0; i < 1200; i++) {
          metrics.recordRequest(5, true);
          // Advance by 40ms each (1200 * 40ms = 48s total)
          vi.advanceTimersByTime(40);
        }

        const m = metrics.getMetrics();
        // All requests should be within 60s window
        // But CircularBuffer only keeps last 1000
        expect(m.requests.requestsPerMinute).toBe(1000);
        expect(m.requests.totalRequests).toBe(1200); // Total counter should be accurate
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle more than 1000 thoughts correctly', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Record 1500 thoughts within 60 seconds (exceed buffer capacity)
        for (let i = 0; i < 1500; i++) {
          sessionTracker.recordThought('session-1');
          metrics.recordThoughtProcessed(makeThought({ sessionId: 'session-1' }));
          // Advance by 30ms each (1500 * 30ms = 45s total)
          vi.advanceTimersByTime(30);
        }

        const m = metrics.getMetrics();
        // All thoughts should be within 60s window
        // But CircularBuffer only keeps last 1000
        expect(m.thoughts.thoughtsPerMinute).toBe(1000);
        expect(m.thoughts.totalThoughts).toBe(1500); // Total counter should be accurate
      } finally {
        vi.useRealTimers();
      }
    });

    it('should maintain accurate counts after buffer wraps around', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Fill buffer past capacity
        for (let i = 0; i < 1100; i++) {
          metrics.recordRequest(10, true);
        }

        // Advance 61 seconds - all should be stale
        vi.advanceTimersByTime(61000);

        // New request
        metrics.recordRequest(10, true);

        const m = metrics.getMetrics();
        // Should only count the 1 recent request
        expect(m.requests.requestsPerMinute).toBe(1);
        expect(m.requests.totalRequests).toBe(1101);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Mixed request and thought tracking', () => {
    it('should independently track request and thought rates', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Record 10 requests
        for (let i = 0; i < 10; i++) {
          metrics.recordRequest(10, true);
        }

        // Record 5 thoughts
        for (let i = 0; i < 5; i++) {
          metrics.recordThoughtProcessed(makeThought());
        }

        let m = metrics.getMetrics();
        expect(m.requests.requestsPerMinute).toBe(10);
        expect(m.thoughts.thoughtsPerMinute).toBe(5);

        // Advance 61 seconds
        vi.advanceTimersByTime(61000);

        // Record 3 more requests
        for (let i = 0; i < 3; i++) {
          metrics.recordRequest(10, true);
        }

        m = metrics.getMetrics();
        expect(m.requests.requestsPerMinute).toBe(3);
        // Note: thoughtsPerMinute still shows 5 because metrics are only
        // recalculated when recordThoughtProcessed is called
        expect(m.thoughts.thoughtsPerMinute).toBe(5);

        // Record one more thought to trigger recalculation
        metrics.recordThoughtProcessed(makeThought());

        m = metrics.getMetrics();
        expect(m.thoughts.thoughtsPerMinute).toBe(1); // Only the new thought
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Destroy cleanup', () => {
    it('should clear all circular buffers on destroy', () => {
      // Record some data
      metrics.recordRequest(10, true);
      metrics.recordRequest(15, true);
      metrics.recordThoughtProcessed(makeThought());
      metrics.recordThoughtProcessed(makeThought());

      let m = metrics.getMetrics();
      expect(m.requests.requestsPerMinute).toBeGreaterThan(0);
      expect(m.thoughts.thoughtsPerMinute).toBeGreaterThan(0);

      // Destroy
      metrics.destroy();

      // Verify all cleared
      m = metrics.getMetrics();
      expect(m.requests.requestsPerMinute).toBe(0);
      expect(m.thoughts.thoughtsPerMinute).toBe(0);
      expect(m.requests.totalRequests).toBe(0);
      expect(m.thoughts.totalThoughts).toBe(0);
    });

    it('should handle destroy being called multiple times', () => {
      metrics.recordRequest(10, true);
      metrics.recordThoughtProcessed(makeThought());

      metrics.destroy();
      metrics.destroy(); // Second call should be safe

      const m = metrics.getMetrics();
      expect(m.requests.requestsPerMinute).toBe(0);
      expect(m.thoughts.thoughtsPerMinute).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle no requests recorded', () => {
      const m = metrics.getMetrics();
      expect(m.requests.requestsPerMinute).toBe(0);
      expect(m.thoughts.thoughtsPerMinute).toBe(0);
    });

    it('should handle single request at exact boundary', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(60000); // Start at t=60s

        metrics.recordRequest(10, true);

        vi.setSystemTime(120000); // Advance to t=120s (exactly 60s later)

        metrics.recordRequest(10, true);

        const m = metrics.getMetrics();
        // First request at exactly 60s old is excluded (> cutoff, not >=)
        // Only the second request is counted
        expect(m.requests.requestsPerMinute).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle rapid alternating success/failure', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        for (let i = 0; i < 100; i++) {
          metrics.recordRequest(10, i % 2 === 0); // Alternate success/fail
        }

        const m = metrics.getMetrics();
        expect(m.requests.requestsPerMinute).toBe(100);
        expect(m.requests.successfulRequests).toBe(50);
        expect(m.requests.failedRequests).toBe(50);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Performance characteristics', () => {
    it('should efficiently handle sustained high request rate', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Simulate 5 minutes of sustained load at 100 req/min
        for (let minute = 0; minute < 5; minute++) {
          for (let req = 0; req < 100; req++) {
            metrics.recordRequest(10, true);
            vi.advanceTimersByTime(600); // 600ms between requests
          }
        }

        const m = metrics.getMetrics();
        // Should count approximately last minute of requests
        // Allow for off-by-one due to boundary timing
        expect(m.requests.requestsPerMinute).toBeGreaterThanOrEqual(99);
        expect(m.requests.requestsPerMinute).toBeLessThanOrEqual(101);
        expect(m.requests.totalRequests).toBe(500);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should handle sustained high thought rate', () => {
      vi.useFakeTimers();
      try {
        const baseTime = Date.now();
        vi.setSystemTime(baseTime);

        // Simulate 10 minutes of sustained load at 50 thoughts/min
        for (let minute = 0; minute < 10; minute++) {
          for (let thought = 0; thought < 50; thought++) {
            sessionTracker.recordThought('session-1');
            metrics.recordThoughtProcessed(makeThought({ sessionId: 'session-1' }));
            vi.advanceTimersByTime(1200); // 1.2s between thoughts
          }
        }

        const m = metrics.getMetrics();
        // Should count approximately last minute of thoughts
        // Allow for off-by-one due to boundary timing
        expect(m.thoughts.thoughtsPerMinute).toBeGreaterThanOrEqual(49);
        expect(m.thoughts.thoughtsPerMinute).toBeLessThanOrEqual(51);
        expect(m.thoughts.totalThoughts).toBe(500);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
