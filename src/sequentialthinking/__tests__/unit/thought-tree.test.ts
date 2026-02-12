import { describe, it, expect } from 'vitest';
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

describe('ThoughtTree', () => {
  describe('addThought', () => {
    it('should create root node for the first thought', () => {
      const tree = new ThoughtTree('session-1', 500);
      const node = tree.addThought(makeThought({ thoughtNumber: 1 }));

      expect(node.parentId).toBeNull();
      expect(node.depth).toBe(0);
      expect(node.thoughtNumber).toBe(1);
      expect(tree.size).toBe(1);
      expect(tree.root).toBe(node);
      expect(tree.cursor).toBe(node);
    });

    it('should create sequential child of cursor', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));
      const child = tree.addThought(makeThought({ thoughtNumber: 2 }));

      expect(child.parentId).toBe(root.nodeId);
      expect(child.depth).toBe(1);
      expect(tree.cursor).toBe(child);
      expect(root.children).toContain(child.nodeId);
    });

    it('should create branch as child of branchFromThought target', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      const branch = tree.addThought(makeThought({
        thoughtNumber: 3,
        branchFromThought: 1,
        branchId: 'alt-branch',
      }));

      const root = tree.root!;
      expect(branch.parentId).toBe(root.nodeId);
      expect(branch.depth).toBe(1);
      expect(root.children).toContain(branch.nodeId);
    });

    it('should create revision as sibling of revised node', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      const second = tree.addThought(makeThought({ thoughtNumber: 2 }));

      const revision = tree.addThought(makeThought({
        thoughtNumber: 3,
        isRevision: true,
        revisesThought: 2,
      }));

      // Revision of thought 2 should be sibling (same parent as thought 2)
      expect(revision.parentId).toBe(second.parentId);
      expect(revision.depth).toBe(second.depth);
    });

    it('should create revision of root as child of root', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));

      const revision = tree.addThought(makeThought({
        thoughtNumber: 2,
        isRevision: true,
        revisesThought: 1,
      }));

      expect(revision.parentId).toBe(root.nodeId);
      expect(revision.depth).toBe(1);
    });

    it('should mark terminal nodes when nextThoughtNeeded is false', () => {
      const tree = new ThoughtTree('session-1', 500);
      const node = tree.addThought(makeThought({
        thoughtNumber: 1,
        nextThoughtNeeded: false,
      }));

      expect(node.isTerminal).toBe(true);
    });

    it('should mark non-terminal nodes when nextThoughtNeeded is true', () => {
      const tree = new ThoughtTree('session-1', 500);
      const node = tree.addThought(makeThought({
        thoughtNumber: 1,
        nextThoughtNeeded: true,
      }));

      expect(node.isTerminal).toBe(false);
    });

    it('should initialize visitCount and totalValue to 0', () => {
      const tree = new ThoughtTree('session-1', 500);
      const node = tree.addThought(makeThought());

      expect(node.visitCount).toBe(0);
      expect(node.totalValue).toBe(0);
    });

    it('should fallback to cursor when branchFromThought target not found', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      const second = tree.addThought(makeThought({ thoughtNumber: 2 }));

      const branch = tree.addThought(makeThought({
        thoughtNumber: 3,
        branchFromThought: 99, // doesn't exist
        branchId: 'missing-branch',
      }));

      expect(branch.parentId).toBe(second.nodeId);
    });
  });

  describe('setCursor', () => {
    it('should move cursor to specified node', () => {
      const tree = new ThoughtTree('session-1', 500);
      const first = tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      const result = tree.setCursor(first.nodeId);
      expect(result).toBe(first);
      expect(tree.cursor).toBe(first);
    });

    it('should throw for non-existent node', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought());

      expect(() => tree.setCursor('nonexistent')).toThrow('Node not found');
    });
  });

  describe('findNodeByThoughtNumber', () => {
    it('should find node by thought number', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      const second = tree.addThought(makeThought({ thoughtNumber: 2 }));

      const found = tree.findNodeByThoughtNumber(2);
      expect(found).toBe(second);
    });

    it('should return undefined for missing thought number', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));

      expect(tree.findNodeByThoughtNumber(99)).toBeUndefined();
    });

    it('should prefer cursor ancestor when multiple nodes have same thought number', () => {
      const tree = new ThoughtTree('session-1', 500);
      const first = tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      // Create a branch also with thoughtNumber 2
      tree.setCursor(first.nodeId);
      const branchTwo = tree.addThought(makeThought({
        thoughtNumber: 2,
        branchFromThought: 1,
        branchId: 'branch-alt',
      }));

      // Now cursor is at branchTwo, so it should be preferred
      const found = tree.findNodeByThoughtNumber(2);
      expect(found?.nodeId).toBe(branchTwo.nodeId);
    });
  });

  describe('getAncestorPath', () => {
    it('should return path from root to node', () => {
      const tree = new ThoughtTree('session-1', 500);
      const first = tree.addThought(makeThought({ thoughtNumber: 1 }));
      const second = tree.addThought(makeThought({ thoughtNumber: 2 }));
      const third = tree.addThought(makeThought({ thoughtNumber: 3 }));

      const path = tree.getAncestorPath(third.nodeId);
      expect(path).toHaveLength(3);
      expect(path[0].nodeId).toBe(first.nodeId);
      expect(path[1].nodeId).toBe(second.nodeId);
      expect(path[2].nodeId).toBe(third.nodeId);
    });

    it('should return single element for root', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));

      const path = tree.getAncestorPath(root.nodeId);
      expect(path).toHaveLength(1);
      expect(path[0].nodeId).toBe(root.nodeId);
    });
  });

  describe('getChildren', () => {
    it('should return children of a node', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));
      const child1 = tree.addThought(makeThought({ thoughtNumber: 2 }));

      tree.setCursor(root.nodeId);
      const child2 = tree.addThought(makeThought({ thoughtNumber: 3 }));

      const children = tree.getChildren(root.nodeId);
      expect(children).toHaveLength(2);
      expect(children.map(c => c.nodeId)).toContain(child1.nodeId);
      expect(children.map(c => c.nodeId)).toContain(child2.nodeId);
    });

    it('should return empty for leaf node', () => {
      const tree = new ThoughtTree('session-1', 500);
      const leaf = tree.addThought(makeThought());

      expect(tree.getChildren(leaf.nodeId)).toHaveLength(0);
    });

    it('should return empty for non-existent node', () => {
      const tree = new ThoughtTree('session-1', 500);
      expect(tree.getChildren('nonexistent')).toHaveLength(0);
    });
  });

  describe('getLeafNodes', () => {
    it('should return all leaf nodes', () => {
      const tree = new ThoughtTree('session-1', 500);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));
      const child1 = tree.addThought(makeThought({ thoughtNumber: 2, nextThoughtNeeded: false }));

      tree.setCursor(root.nodeId);
      const child2 = tree.addThought(makeThought({ thoughtNumber: 3, nextThoughtNeeded: false }));

      const leaves = tree.getLeafNodes();
      expect(leaves).toHaveLength(2);
      expect(leaves.map(l => l.nodeId)).toContain(child1.nodeId);
      expect(leaves.map(l => l.nodeId)).toContain(child2.nodeId);
    });
  });

  describe('getExpandableNodes', () => {
    it('should return non-terminal nodes', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1, nextThoughtNeeded: true }));
      tree.addThought(makeThought({ thoughtNumber: 2, nextThoughtNeeded: false }));

      const expandable = tree.getExpandableNodes();
      expect(expandable).toHaveLength(1);
      expect(expandable[0].thoughtNumber).toBe(1);
    });
  });

  describe('toJSON', () => {
    it('should serialize tree structure', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));

      const json = tree.toJSON() as Record<string, unknown>;
      expect(json).not.toBeNull();
      expect(json.thoughtNumber).toBe(1);
      expect(json.childCount).toBe(1);
    });

    it('should return null for empty tree', () => {
      const tree = new ThoughtTree('session-1', 500);
      expect(tree.toJSON()).toBeNull();
    });

    it('should respect maxDepth', () => {
      const tree = new ThoughtTree('session-1', 500);
      tree.addThought(makeThought({ thoughtNumber: 1 }));
      tree.addThought(makeThought({ thoughtNumber: 2 }));
      tree.addThought(makeThought({ thoughtNumber: 3 }));

      const json = tree.toJSON(0) as Record<string, unknown>;
      expect(json.children).toBe('[1 children truncated]');
    });
  });

  describe('prune', () => {
    it('should remove lowest-value leaves when over capacity', () => {
      const tree = new ThoughtTree('session-1', 5);

      // Build a tree with branches so there are prunable leaves
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));

      // Branch A: 2 children off root
      tree.addThought(makeThought({ thoughtNumber: 2 }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 3 }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 4 }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 5 }));

      expect(tree.size).toBe(5);

      // Adding one more should trigger pruning — leaf nodes off root can be pruned
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 6 }));
      expect(tree.size).toBeLessThanOrEqual(5);
    });

    it('should never remove root or cursor', () => {
      const tree = new ThoughtTree('session-1', 4);
      const root = tree.addThought(makeThought({ thoughtNumber: 1 }));

      // Create branches off root so leaves can be pruned
      tree.addThought(makeThought({ thoughtNumber: 2 }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 3 }));
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 4 }));

      // Cursor is at thought 4, root is thought 1; both should survive
      tree.setCursor(root.nodeId);
      tree.addThought(makeThought({ thoughtNumber: 5 }));

      expect(tree.root?.nodeId).toBe(root.nodeId);
      expect(tree.cursor).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle single node tree', () => {
      const tree = new ThoughtTree('session-1', 500);
      const node = tree.addThought(makeThought({ thoughtNumber: 1 }));

      expect(tree.size).toBe(1);
      expect(tree.root).toBe(node);
      expect(tree.cursor).toBe(node);
      expect(tree.getLeafNodes()).toHaveLength(1);
      expect(tree.getAncestorPath(node.nodeId)).toHaveLength(1);
    });

    it('should build deep linear chain', () => {
      const tree = new ThoughtTree('session-1', 500);
      for (let i = 1; i <= 10; i++) {
        tree.addThought(makeThought({ thoughtNumber: i }));
      }
      expect(tree.size).toBe(10);
      expect(tree.cursor?.depth).toBe(9);
      expect(tree.getAncestorPath(tree.cursor!.nodeId)).toHaveLength(10);
    });
  });
});
