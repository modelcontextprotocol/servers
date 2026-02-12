import { describe, it, expect } from 'vitest';
import { MCTSEngine } from '../../mcts.js';
import { ThoughtTree } from '../../thought-tree.js';
import type { ThoughtData } from '../../circular-buffer.js';

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

describe('MCTSEngine', () => {
  const engine = new MCTSEngine();

  describe('computeUCB1', () => {
    it('should return Infinity for unvisited nodes', () => {
      const result = engine.computeUCB1(0, 0, 10, Math.SQRT2);
      expect(result).toBe(Infinity);
    });

    it('should compute exploitation + exploration', () => {
      // nodeVisits=4, nodeValue=2.0, parentVisits=10, C=sqrt(2)
      const result = engine.computeUCB1(4, 2.0, 10, Math.SQRT2);
      const exploitation = 2.0 / 4; // 0.5
      const exploration = Math.SQRT2 * Math.sqrt(Math.log(10) / 4);
      expect(result).toBeCloseTo(exploitation + exploration, 10);
    });

    it('should increase with higher exploitation value', () => {
      const low = engine.computeUCB1(4, 1.0, 10, Math.SQRT2);
      const high = engine.computeUCB1(4, 3.0, 10, Math.SQRT2);
      expect(high).toBeGreaterThan(low);
    });

    it('should increase with lower visit count (more exploration bonus)', () => {
      const moreVisits = engine.computeUCB1(10, 5.0, 20, Math.SQRT2);
      const fewerVisits = engine.computeUCB1(2, 1.0, 20, Math.SQRT2);
      expect(fewerVisits).toBeGreaterThan(moreVisits);
    });
  });

  describe('backpropagate', () => {
    it('should update visit count and value along path to root', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));
      const child = tree.addThought(makeThought({ thoughtNumber: 2 }));
      const grandchild = tree.addThought(makeThought({ thoughtNumber: 3 }));

      const updated = engine.backpropagate(tree, grandchild.nodeId, 0.8);

      expect(updated).toBe(3);
      expect(grandchild.visitCount).toBe(1);
      expect(grandchild.totalValue).toBeCloseTo(0.8);
      expect(child.visitCount).toBe(1);
      expect(child.totalValue).toBeCloseTo(0.8);
      expect(root.visitCount).toBe(1);
      expect(root.totalValue).toBeCloseTo(0.8);
    });

    it('should accumulate with multiple evaluations', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));
      const child = tree.addThought(makeThought({ thoughtNumber: 2 }));

      engine.backpropagate(tree, child.nodeId, 0.6);
      engine.backpropagate(tree, child.nodeId, 0.9);

      expect(child.visitCount).toBe(2);
      expect(child.totalValue).toBeCloseTo(1.5);
      expect(root.visitCount).toBe(2);
      expect(root.totalValue).toBeCloseTo(1.5);
    });

    it('should handle root node evaluation', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));

      const updated = engine.backpropagate(tree, root.nodeId, 0.5);
      expect(updated).toBe(1);
      expect(root.visitCount).toBe(1);
      expect(root.totalValue).toBeCloseTo(0.5);
    });
  });

  describe('suggestNext', () => {
    it('should suggest unexplored nodes first', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      // Evaluate root but not child
      engine.backpropagate(tree, root.nodeId, 0.5);

      const result = engine.suggestNext(tree, 'balanced');
      expect(result.suggestion).not.toBeNull();
      // The unvisited node (child, thought 2) should have Infinity UCB1
      expect(result.suggestion!.ucb1Score).toBe(Infinity);
    });

    it('should return null suggestion when all nodes are terminal', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1, nextThoughtNeeded: false }));

      const result = engine.suggestNext(tree, 'balanced');
      expect(result.suggestion).toBeNull();
      expect(result.alternatives).toHaveLength(0);
    });

    it('should return alternatives', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));

      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 3 }));

      const result = engine.suggestNext(tree, 'balanced');
      expect(result.suggestion).not.toBeNull();
      expect(result.alternatives.length).toBeGreaterThan(0);
    });

    it('should respond to different strategies', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 3 }));

      // Evaluate to create some variation
      engine.backpropagate(tree, root.nodeId, 0.5);

      // All strategies should work without error
      const explore = engine.suggestNext(tree, 'explore');
      const exploit = engine.suggestNext(tree, 'exploit');
      const balanced = engine.suggestNext(tree, 'balanced');

      expect(explore.suggestion).not.toBeNull();
      expect(exploit.suggestion).not.toBeNull();
      expect(balanced.suggestion).not.toBeNull();
    });
  });

  describe('extractBestPath', () => {
    it('should extract path following highest average value', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));
      const goodChild = tree.addThought(makeThought({ thoughtNumber: 2 }));

      tree.setCursor(root.nodeId);
      const badChild = tree.addThought(makeThought({ thoughtNumber: 3 }));

      // Make goodChild better
      engine.backpropagate(tree, goodChild.nodeId, 0.9);
      engine.backpropagate(tree, badChild.nodeId, 0.1);

      const path = engine.extractBestPath(tree);
      expect(path).toHaveLength(2);
      expect(path[0].nodeId).toBe(root.nodeId);
      expect(path[1].nodeId).toBe(goodChild.nodeId);
    });

    it('should return empty for empty tree', () => {
      const tree = new ThoughtTree('session-1', 500);
      const path = engine.extractBestPath(tree);
      expect(path).toHaveLength(0);
    });

    it('should return single node for root-only tree', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));

      const path = engine.extractBestPath(tree);
      expect(path).toHaveLength(1);
    });
  });

  describe('getTreeStats', () => {
    it('should compute stats for empty tree', () => {
      const tree = new ThoughtTree('session-1', 500);
      const stats = engine.getTreeStats(tree);

      expect(stats.totalNodes).toBe(0);
      expect(stats.maxDepth).toBe(0);
      expect(stats.unexploredCount).toBe(0);
      expect(stats.averageValue).toBe(0);
      expect(stats.terminalCount).toBe(0);
    });

    it('should compute stats for populated tree', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));
      tree.addThought(makeThought({ thoughtNumber: 3, nextThoughtNeeded: false }));

      const stats = engine.getTreeStats(tree);
      expect(stats.totalNodes).toBe(3);
      expect(stats.maxDepth).toBe(2);
      expect(stats.unexploredCount).toBe(3); // None evaluated yet
      expect(stats.terminalCount).toBe(1);
    });

    it('should track unexplored vs explored correctly', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      const child = tree.addThought(makeThought({ thoughtNumber: 2 }));

      engine.backpropagate(tree, child.nodeId, 0.7);

      const stats = engine.getTreeStats(tree);
      expect(stats.unexploredCount).toBe(0); // Both visited via backprop
      expect(stats.averageValue).toBeCloseTo(0.7);
    });
  });

  describe('toNodeInfo', () => {
    it('should convert ThoughtNode to TreeNodeInfo', () => {
      const tree = new ThoughtTree('session-1', 500);
      const node = tree.addThought(makeThought({ thoughtNumber: 1, thought: 'Hello world' }));

      const info = engine.toNodeInfo(node);
      expect(info.nodeId).toBe(node.nodeId);
      expect(info.thoughtNumber).toBe(1);
      expect(info.thought).toBe('Hello world');
      expect(info.depth).toBe(0);
      expect(info.visitCount).toBe(0);
      expect(info.averageValue).toBe(0);
      expect(info.childCount).toBe(0);
      expect(info.isTerminal).toBe(false);
    });
  });
});
