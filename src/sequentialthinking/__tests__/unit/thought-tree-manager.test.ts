import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThoughtTreeManager } from '../../thought-tree-manager.js';
import type { MCTSConfig } from '../../interfaces.js';
import type { ThoughtData } from '../../circular-buffer.js';

function defaultConfig(): MCTSConfig {
  return {
    maxNodesPerTree: 500,
    maxTreeAge: 3600000,
    explorationConstant: Math.SQRT2,
    enableAutoTree: true,
  };
}

function makeThought(overrides: Partial<ThoughtData> = {}): ThoughtData {
  return {
    thought: 'Test thought',
    thoughtNumber: 1,
    totalThoughts: 5,
    nextThoughtNeeded: true,
    sessionId: 'test-session',
    ...overrides,
  };
}

describe('ThoughtTreeManager', () => {
  let manager: ThoughtTreeManager;

  beforeEach(() => {
    manager = new ThoughtTreeManager(defaultConfig());
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('recordThought', () => {
    it('should create tree and record first thought', () => {
      const result = manager.recordThought(makeThought({
        sessionId: 'session-1',
        thoughtNumber: 1,
      }));

      expect(result).not.toBeNull();
      expect(result!.nodeId).toBeDefined();
      expect(result!.parentNodeId).toBeNull();
      expect(result!.treeStats.totalNodes).toBe(1);
    });

    it('should record sequential thoughts in same session', () => {
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      const result = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 2 }));

      expect(result).not.toBeNull();
      expect(result!.parentNodeId).not.toBeNull();
      expect(result!.treeStats.totalNodes).toBe(2);
    });

    it('should return null when enableAutoTree is false', () => {
      const disabledManager = new ThoughtTreeManager({
        ...defaultConfig(),
        enableAutoTree: false,
      });

      const result = disabledManager.recordThought(makeThought());
      expect(result).toBeNull();

      disabledManager.destroy();
    });

    it('should return null when sessionId is missing', () => {
      const result = manager.recordThought(makeThought({ sessionId: undefined }));
      expect(result).toBeNull();
    });

    it('should create separate trees for different sessions', () => {
      const r1 = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      const r2 = manager.recordThought(makeThought({ sessionId: 's2', thoughtNumber: 1 }));

      expect(r1).not.toBeNull();
      expect(r2).not.toBeNull();
      expect(r1!.treeStats.totalNodes).toBe(1);
      expect(r2!.treeStats.totalNodes).toBe(1);
    });
  });

  describe('backtrack', () => {
    it('should move cursor to specified node', () => {
      const r1 = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 2 }));

      const result = manager.backtrack('s1', r1!.nodeId);

      expect(result.node.nodeId).toBe(r1!.nodeId);
      expect(result.children).toHaveLength(1);
      expect(result.treeStats.totalNodes).toBe(2);
    });

    it('should throw for non-existent session', () => {
      expect(() => manager.backtrack('nonexistent', 'node-1')).toThrow('No thought tree found');
    });

    it('should throw for non-existent node', () => {
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      expect(() => manager.backtrack('s1', 'nonexistent')).toThrow('Node not found');
    });
  });

  describe('evaluate', () => {
    it('should backpropagate value through tree', () => {
      const r1 = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      const r2 = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 2 }));

      const result = manager.evaluate('s1', r2!.nodeId, 0.8);

      expect(result.nodeId).toBe(r2!.nodeId);
      expect(result.newVisitCount).toBe(1);
      expect(result.newAverageValue).toBeCloseTo(0.8);
      expect(result.nodesUpdated).toBe(2);
    });

    it('should handle boundary value 0', () => {
      const r1 = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      const result = manager.evaluate('s1', r1!.nodeId, 0);

      expect(result.newVisitCount).toBe(1);
      expect(result.newAverageValue).toBe(0);
    });

    it('should handle boundary value 1', () => {
      const r1 = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      const result = manager.evaluate('s1', r1!.nodeId, 1);

      expect(result.newVisitCount).toBe(1);
      expect(result.newAverageValue).toBe(1);
    });

    it('should accumulate multiple evaluations', () => {
      const r1 = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      manager.evaluate('s1', r1!.nodeId, 0.4);
      const result = manager.evaluate('s1', r1!.nodeId, 0.8);

      expect(result.newVisitCount).toBe(2);
      expect(result.newAverageValue).toBeCloseTo(0.6);
    });

    it('should throw for non-existent node', () => {
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      expect(() => manager.evaluate('s1', 'nonexistent', 0.5)).toThrow('Node not found');
    });
  });

  describe('suggest', () => {
    it('should suggest unexplored nodes', () => {
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 2 }));

      const result = manager.suggest('s1');
      expect(result.suggestion).not.toBeNull();
      expect(result.treeStats.totalNodes).toBe(2);
    });

    it('should return null suggestion when all terminal', () => {
      manager.recordThought(makeThought({
        sessionId: 's1',
        thoughtNumber: 1,
        nextThoughtNeeded: false,
      }));

      const result = manager.suggest('s1');
      expect(result.suggestion).toBeNull();
    });

    it('should accept strategy parameter', () => {
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));

      const explore = manager.suggest('s1', 'explore');
      const exploit = manager.suggest('s1', 'exploit');
      const balanced = manager.suggest('s1', 'balanced');

      expect(explore.suggestion).not.toBeNull();
      expect(exploit.suggestion).not.toBeNull();
      expect(balanced.suggestion).not.toBeNull();
    });
  });

  describe('getSummary', () => {
    it('should return summary with best path and tree structure', () => {
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      const r2 = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 2 }));
      manager.evaluate('s1', r2!.nodeId, 0.9);

      const summary = manager.getSummary('s1');
      expect(summary.bestPath).toHaveLength(2);
      expect(summary.treeStructure).not.toBeNull();
      expect(summary.treeStats.totalNodes).toBe(2);
    });

    it('should respect maxDepth parameter', () => {
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 2 }));
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 3 }));

      const summary = manager.getSummary('s1', 0);
      const tree = summary.treeStructure as Record<string, unknown>;
      expect(tree.children).toBe('[1 children truncated]');
    });
  });

  describe('setMode / getMode', () => {
    it('should store and retrieve mode config', () => {
      manager.setMode('s1', 'fast');
      const config = manager.getMode('s1');

      expect(config).not.toBeNull();
      expect(config!.mode).toBe('fast');
      expect(config!.explorationConstant).toBe(0.5);
    });

    it('should return null for session without mode', () => {
      expect(manager.getMode('nonexistent')).toBeNull();
    });

    it('should create tree when setting mode', () => {
      manager.setMode('s-new', 'expert');
      // Tree should exist now — backtrack will fail with node error, not session error
      expect(() => manager.backtrack('s-new', 'nonexistent-node')).toThrow('Node not found');
    });

    it('should override previous mode', () => {
      manager.setMode('s1', 'fast');
      manager.setMode('s1', 'deep');
      const config = manager.getMode('s1');
      expect(config!.mode).toBe('deep');
    });
  });

  describe('recordThought with mode', () => {
    it('should include modeGuidance in result when mode is active', () => {
      manager.setMode('s1', 'expert');
      const result = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));

      expect(result).not.toBeNull();
      expect(result!.modeGuidance).toBeDefined();
      expect(result!.modeGuidance!.mode).toBe('expert');
      expect(result!.modeGuidance!.currentPhase).toBeDefined();
      expect(result!.modeGuidance!.recommendedAction).toBeDefined();
    });

    it('should not include modeGuidance when no mode is set', () => {
      const result = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      expect(result).not.toBeNull();
      expect(result!.modeGuidance).toBeUndefined();
    });

    it('should auto-evaluate in fast mode', () => {
      manager.setMode('s1', 'fast');
      const result = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));

      expect(result).not.toBeNull();
      // Auto-eval should have run backpropagate, so node has visitCount > 0
      expect(result!.treeStats.unexploredCount).toBe(0);
    });

    it('should not auto-evaluate in expert mode', () => {
      manager.setMode('s1', 'expert');
      const result = manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));

      expect(result).not.toBeNull();
      expect(result!.treeStats.unexploredCount).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should remove expired trees', async () => {
      const shortLivedManager = new ThoughtTreeManager({
        ...defaultConfig(),
        maxTreeAge: 1, // 1ms expiry
      });
      shortLivedManager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));

      // Wait for tree to expire
      await new Promise(resolve => setTimeout(resolve, 10));
      shortLivedManager.cleanup();

      expect(() => shortLivedManager.suggest('s1')).toThrow('No thought tree found');
      shortLivedManager.destroy();
    });
  });

  describe('destroy', () => {
    it('should clear all trees and stop timer', () => {
      manager.recordThought(makeThought({ sessionId: 's1', thoughtNumber: 1 }));
      manager.destroy();

      expect(() => manager.backtrack('s1', 'any')).toThrow('No thought tree found');
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        manager.destroy();
        manager.destroy();
      }).not.toThrow();
    });
  });
});
