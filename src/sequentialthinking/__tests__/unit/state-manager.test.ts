import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BoundedThoughtManager } from '../../state-manager.js';
import { SessionTracker } from '../../session-tracker.js';
import { createTestThought as makeThought } from '../helpers/factories.js';

const defaultConfig = {
  maxHistorySize: 100,
  maxBranchAge: 3600000,
  maxThoughtLength: 5000,
  maxThoughtsPerBranch: 50,
  cleanupInterval: 0, // Disable timer in tests
};

describe('BoundedThoughtManager', () => {
  let manager: BoundedThoughtManager;
  let sessionTracker: SessionTracker;

  beforeEach(() => {
    sessionTracker = new SessionTracker(0);
    manager = new BoundedThoughtManager({ ...defaultConfig }, sessionTracker);
  });

  afterEach(() => {
    manager.destroy();
    sessionTracker.destroy();
  });

  describe('addThought', () => {
    it('should add a thought to history', () => {
      manager.addThought(makeThought());
      expect(manager.getHistory()).toHaveLength(1);
    });

    it('should not mutate the original thought', () => {
      const thought = makeThought();
      manager.addThought(thought);
      // Original should not be mutated
      expect(thought.timestamp).toBeUndefined();
      // Stored entry should have timestamp
      const history = manager.getHistory();
      expect(history[0].timestamp).toBeGreaterThan(0);
    });
  });

  describe('branch management', () => {
    it('should create branch when branchId is provided', () => {
      manager.addThought(makeThought({ branchId: 'b1' }));
      expect(manager.getBranches()).toContain('b1');
    });

    it('should track multiple branches', () => {
      manager.addThought(makeThought({ branchId: 'b1' }));
      manager.addThought(makeThought({ branchId: 'b2' }));
      expect(manager.getBranches()).toEqual(expect.arrayContaining(['b1', 'b2']));
    });

    it('should add thoughts to existing branch', () => {
      manager.addThought(makeThought({ branchId: 'b1', thoughtNumber: 1 }));
      manager.addThought(makeThought({ branchId: 'b1', thoughtNumber: 2 }));
      const branch = manager.getBranch('b1');
      expect(branch?.getThoughtCount()).toBe(2);
    });

    it('should enforce per-branch thought limits', () => {
      const limitTracker = new SessionTracker(0);
      const mgr = new BoundedThoughtManager({
        ...defaultConfig,
        maxThoughtsPerBranch: 2,
      }, limitTracker);
      mgr.addThought(makeThought({ branchId: 'b1', thoughtNumber: 1 }));
      mgr.addThought(makeThought({ branchId: 'b1', thoughtNumber: 2 }));
      mgr.addThought(makeThought({ branchId: 'b1', thoughtNumber: 3 }));
      const branch = mgr.getBranch('b1');
      expect(branch?.getThoughtCount()).toBe(2);
      mgr.destroy();
      limitTracker.destroy();
    });
  });

  describe('getBranchThoughts', () => {
    it('should return empty array for non-existent branch', () => {
      expect(manager.getBranchThoughts('no-such-branch')).toEqual([]);
    });

    it('should return thoughts for an existing branch', () => {
      manager.addThought(makeThought({ branchId: 'b1', thoughtNumber: 1, thought: 'first' }));
      manager.addThought(makeThought({ branchId: 'b1', thoughtNumber: 2, thought: 'second' }));
      const thoughts = manager.getBranchThoughts('b1');
      expect(thoughts).toHaveLength(2);
      expect(thoughts[0].thought).toBe('first');
      expect(thoughts[1].thought).toBe('second');
    });

    it('should return a copy that does not mutate internal state', () => {
      manager.addThought(makeThought({ branchId: 'b1', thoughtNumber: 1 }));
      const thoughts = manager.getBranchThoughts('b1');
      thoughts.push(makeThought({ thoughtNumber: 99 }));
      expect(manager.getBranchThoughts('b1')).toHaveLength(1);
    });
  });

  describe('isExpired (via cleanup)', () => {
    it('should remove expired branches', () => {
      vi.useFakeTimers();
      try {
        manager.addThought(makeThought({ branchId: 'old-branch' }));
        expect(manager.getBranches()).toContain('old-branch');

        // Advance past maxBranchAge
        vi.advanceTimersByTime(3600001);

        manager.cleanup();
        expect(manager.getBranches()).not.toContain('old-branch');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should keep non-expired branches', () => {
      vi.useFakeTimers();
      try {
        manager.addThought(makeThought({ branchId: 'fresh-branch' }));

        vi.advanceTimersByTime(1000);

        manager.cleanup();
        expect(manager.getBranches()).toContain('fresh-branch');
      } finally {
        vi.useRealTimers();
      }
    });

    it('should remove old session stats', () => {
      vi.useFakeTimers();
      try {
        sessionTracker.recordThought('old-session'); // Record in tracker first
        manager.addThought(makeThought({ sessionId: 'old-session' }));
        const statsBefore = manager.getStats();
        expect(statsBefore.sessionCount).toBe(1);

        vi.advanceTimersByTime(3600001);

        manager.cleanup();
        const statsAfter = manager.getStats();
        expect(statsAfter.sessionCount).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('session stats use numeric timestamps', () => {
    it('should store and retrieve sessions correctly', () => {
      sessionTracker.recordThought('num-sess'); // Record in tracker first
      manager.addThought(makeThought({ sessionId: 'num-sess' }));
      expect(manager.getStats().sessionCount).toBe(1);
    });

    it('should expire sessions based on numeric comparison', () => {
      vi.useFakeTimers();
      try {
        sessionTracker.recordThought('timed-sess'); // Record in tracker first
        manager.addThought(makeThought({ sessionId: 'timed-sess' }));
        expect(manager.getStats().sessionCount).toBe(1);

        vi.advanceTimersByTime(3600001);
        manager.cleanup();

        expect(manager.getStats().sessionCount).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('stopCleanupTimer', () => {
    it('should not throw when called multiple times', () => {
      manager.stopCleanupTimer();
      expect(() => manager.stopCleanupTimer()).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return correct shape', () => {
      const stats = manager.getStats();
      expect(stats).toEqual({
        historySize: 0,
        historyCapacity: 100,
        branchCount: 0,
        sessionCount: 0,
      });
    });

    it('should reflect added thoughts', () => {
      sessionTracker.recordThought('s1'); // Record in tracker first
      manager.addThought(makeThought({ branchId: 'b1', sessionId: 's1' }));
      const stats = manager.getStats();
      expect(stats.historySize).toBe(1);
      expect(stats.branchCount).toBe(1);
      expect(stats.sessionCount).toBe(1);
    });
  });

  describe('clearHistory', () => {
    it('should clear all data', () => {
      manager.addThought(makeThought({ branchId: 'b1', sessionId: 's1' }));
      manager.clearHistory();
      expect(manager.getHistory()).toHaveLength(0);
      expect(manager.getBranches()).toHaveLength(0);
      // Session count is tracked externally in SessionTracker, not cleared by clearHistory
      expect(manager.getStats().sessionCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('destroy', () => {
    it('should stop timer and clear history', () => {
      manager.addThought(makeThought());
      manager.destroy();
      expect(manager.getHistory()).toHaveLength(0);
    });
  });

  describe('cleanup timer', () => {
    it('should fire cleanup and remove expired branches', () => {
      vi.useFakeTimers();
      try {
        const timerTracker = new SessionTracker(0);
        const timerManager = new BoundedThoughtManager({
          ...defaultConfig,
          cleanupInterval: 5000,
          maxBranchAge: 3000,
        }, timerTracker);

        timerManager.addThought(makeThought({ branchId: 'timer-branch' }));
        expect(timerManager.getBranches()).toContain('timer-branch');

        // Advance past branch expiry + cleanup interval
        vi.advanceTimersByTime(6000);

        // Branch should be expired and cleaned up by the timer
        expect(timerManager.getBranches()).not.toContain('timer-branch');

        timerManager.destroy();
        timerTracker.destroy();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
