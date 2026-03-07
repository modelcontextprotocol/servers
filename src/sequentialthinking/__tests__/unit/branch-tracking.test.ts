import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BasicMetricsCollector } from '../../metrics.js';
import { BoundedThoughtManager } from '../../state-manager.js';
import { SessionTracker } from '../../session-tracker.js';
import { createTestThought as makeThought } from '../helpers/factories.js';

describe('Branch Tracking Consistency', () => {
  let metrics: BasicMetricsCollector;
  let storage: BoundedThoughtManager;
  let sessionTracker: SessionTracker;

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
  });

  it('should reflect actual branch count from storage', () => {
    // Add thoughts to different branches
    storage.addThought(makeThought({ branchId: 'branch-a' }));
    metrics.recordThoughtProcessed(makeThought({ branchId: 'branch-a' }));

    storage.addThought(makeThought({ branchId: 'branch-b' }));
    metrics.recordThoughtProcessed(makeThought({ branchId: 'branch-b' }));

    storage.addThought(makeThought({ branchId: 'branch-c' }));
    metrics.recordThoughtProcessed(makeThought({ branchId: 'branch-c' }));

    // Metrics should show 3 branches
    const m = metrics.getMetrics();
    expect(m.thoughts.branchCount).toBe(3);

    // Verify storage agrees
    expect(storage.getBranches()).toHaveLength(3);
  });

  it('should update when branches expire in storage', () => {
    vi.useFakeTimers();
    try {
      // Create storage with short branch expiry
      const shortStorage = new BoundedThoughtManager({
        maxHistorySize: 100,
        maxBranchAge: 1000, // 1 second
  
        maxThoughtsPerBranch: 50,
        cleanupInterval: 0,
      }, sessionTracker);

      const shortMetrics = new BasicMetricsCollector(sessionTracker, shortStorage);

      // Add branch
      shortStorage.addThought(makeThought({ branchId: 'expiring-branch' }));
      shortMetrics.recordThoughtProcessed(makeThought({ branchId: 'expiring-branch' }));

      expect(shortMetrics.getMetrics().thoughts.branchCount).toBe(1);

      // Advance time past expiry
      vi.advanceTimersByTime(2000);

      // Trigger cleanup
      shortStorage.cleanup();

      // Record a new thought to trigger metrics update
      shortMetrics.recordThoughtProcessed(makeThought());

      // Branch should be gone from both storage and metrics
      expect(shortStorage.getBranches()).toHaveLength(0);
      expect(shortMetrics.getMetrics().thoughts.branchCount).toBe(0);

      shortStorage.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should handle duplicate branch IDs correctly', () => {
    // Add multiple thoughts to same branch
    storage.addThought(makeThought({ branchId: 'duplicate-branch', thoughtNumber: 1 }));
    metrics.recordThoughtProcessed(makeThought({ branchId: 'duplicate-branch', thoughtNumber: 1 }));

    storage.addThought(makeThought({ branchId: 'duplicate-branch', thoughtNumber: 2 }));
    metrics.recordThoughtProcessed(makeThought({ branchId: 'duplicate-branch', thoughtNumber: 2 }));

    storage.addThought(makeThought({ branchId: 'duplicate-branch', thoughtNumber: 3 }));
    metrics.recordThoughtProcessed(makeThought({ branchId: 'duplicate-branch', thoughtNumber: 3 }));

    // Should only count as 1 branch
    expect(metrics.getMetrics().thoughts.branchCount).toBe(1);
    expect(storage.getBranches()).toHaveLength(1);
  });

  it('should handle mixed branch and non-branch thoughts', () => {
    // Add non-branch thought
    storage.addThought(makeThought({ thoughtNumber: 1 }));
    metrics.recordThoughtProcessed(makeThought({ thoughtNumber: 1 }));

    // Branch count should be 0
    expect(metrics.getMetrics().thoughts.branchCount).toBe(0);

    // Add branch thought
    storage.addThought(makeThought({ branchId: 'new-branch', thoughtNumber: 2 }));
    metrics.recordThoughtProcessed(makeThought({ branchId: 'new-branch', thoughtNumber: 2 }));

    // Branch count should be 1
    expect(metrics.getMetrics().thoughts.branchCount).toBe(1);

    // Add more non-branch thoughts
    storage.addThought(makeThought({ thoughtNumber: 3 }));
    metrics.recordThoughtProcessed(makeThought({ thoughtNumber: 3 }));

    // Branch count should still be 1
    expect(metrics.getMetrics().thoughts.branchCount).toBe(1);
  });

  it('should maintain consistency after storage clear', () => {
    // Add several branches
    for (let i = 0; i < 5; i++) {
      storage.addThought(makeThought({ branchId: `branch-${i}` }));
      metrics.recordThoughtProcessed(makeThought({ branchId: `branch-${i}` }));
    }

    expect(metrics.getMetrics().thoughts.branchCount).toBe(5);

    // Clear storage
    storage.clearHistory();

    // Record a new thought to trigger metrics refresh
    metrics.recordThoughtProcessed(makeThought());

    // Metrics should reflect empty storage
    expect(metrics.getMetrics().thoughts.branchCount).toBe(0);
    expect(storage.getBranches()).toHaveLength(0);
  });

  it('should handle rapid branch creation correctly', () => {
    // Create many branches rapidly
    const branchCount = 100;
    for (let i = 0; i < branchCount; i++) {
      storage.addThought(makeThought({ branchId: `rapid-${i}` }));
      metrics.recordThoughtProcessed(makeThought({ branchId: `rapid-${i}` }));
    }

    // Should count all branches
    expect(metrics.getMetrics().thoughts.branchCount).toBe(branchCount);
    expect(storage.getBranches()).toHaveLength(branchCount);
  });
});
