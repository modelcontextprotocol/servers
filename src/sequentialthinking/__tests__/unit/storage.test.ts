import { describe, it, expect, afterEach } from 'vitest';
import { BoundedThoughtManager } from '../../state-manager.js';
import { SessionTracker } from '../../session-tracker.js';
import { createTestThought as makeThought } from '../helpers/factories.js';

describe('BoundedThoughtManager (Storage Interface)', () => {
  let storage: BoundedThoughtManager;
  let sessionTracker: SessionTracker;

  afterEach(() => {
    storage?.destroy();
    sessionTracker?.destroy();
  });

  function createStorage() {
    sessionTracker = new SessionTracker(0);
    storage = new BoundedThoughtManager({
      maxHistorySize: 100,
      maxBranchAge: 3600000,
      maxThoughtsPerBranch: 50,
      cleanupInterval: 0,
    }, sessionTracker);
    return storage;
  }

  it('should preserve session ID set by caller', () => {
    const s = createStorage();
    const thought = makeThought({ sessionId: 'caller-session' });
    s.addThought(thought);
    const history = s.getHistory();
    expect(history[0].sessionId).toBe('caller-session');
  });

  it('should keep provided session ID', () => {
    const s = createStorage();
    const thought = makeThought({ sessionId: 'my-session' });
    s.addThought(thought);
    expect(thought.sessionId).toBe('my-session');
    const history = s.getHistory();
    expect(history[0].sessionId).toBe('my-session');
  });

  it('should return history', () => {
    const s = createStorage();
    s.addThought(makeThought());
    s.addThought(makeThought({ thoughtNumber: 2 }));
    expect(s.getHistory()).toHaveLength(2);
    expect(s.getHistory(1)).toHaveLength(1);
  });

  it('should track branches', () => {
    const s = createStorage();
    s.addThought(makeThought({ branchId: 'b1' }));
    expect(s.getBranches()).toContain('b1');
  });

  it('should return stats', () => {
    const s = createStorage();
    const stats = s.getStats();
    expect(stats).toHaveProperty('historySize');
    expect(stats).toHaveProperty('historyCapacity');
  });

  it('should clear history', () => {
    const s = createStorage();
    s.addThought(makeThought());
    s.clearHistory();
    expect(s.getHistory()).toHaveLength(0);
  });

  it('should destroy without errors', () => {
    const s = createStorage();
    s.addThought(makeThought());
    expect(() => s.destroy()).not.toThrow();
  });
});
