import { describe, it, expect, afterEach } from 'vitest';
import { SecureThoughtStorage } from '../../storage.js';
import { createTestThought as makeThought } from '../helpers/factories.js';

describe('SecureThoughtStorage', () => {
  let storage: SecureThoughtStorage;

  afterEach(() => {
    storage?.destroy();
  });

  function createStorage() {
    storage = new SecureThoughtStorage({
      maxHistorySize: 100,
      maxBranchAge: 3600000,
      maxThoughtLength: 5000,
      maxThoughtsPerBranch: 50,
      cleanupInterval: 0,
    });
    return storage;
  }

  it('should generate anonymous session ID when missing', () => {
    const s = createStorage();
    const thought = makeThought();
    s.addThought(thought);
    // Original should not be mutated (input mutation fix)
    expect(thought.sessionId).toBeUndefined();
    // Stored entry should have session ID
    const history = s.getHistory();
    expect(history[0].sessionId).toMatch(/^anonymous-/);
  });

  it('should keep provided session ID', () => {
    const s = createStorage();
    const thought = makeThought({ sessionId: 'my-session' });
    s.addThought(thought);
    expect(thought.sessionId).toBe('my-session');
    const history = s.getHistory();
    expect(history[0].sessionId).toBe('my-session');
  });

  it('should delegate getHistory to manager', () => {
    const s = createStorage();
    s.addThought(makeThought());
    s.addThought(makeThought({ thoughtNumber: 2 }));
    expect(s.getHistory()).toHaveLength(2);
    expect(s.getHistory(1)).toHaveLength(1);
  });

  it('should delegate getBranches to manager', () => {
    const s = createStorage();
    s.addThought(makeThought({ branchId: 'b1' }));
    expect(s.getBranches()).toContain('b1');
  });

  it('should delegate getStats to manager', () => {
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
