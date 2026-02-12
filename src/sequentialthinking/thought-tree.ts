import type { ThoughtData } from './circular-buffer.js';

export interface ThoughtNode {
  nodeId: string;
  parentId: string | null;
  children: string[];
  depth: number;
  visitCount: number;
  totalValue: number;
  isTerminal: boolean;
  thoughtNumber: number;
  thought: string;
  sessionId: string;
  branchId?: string;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  createdAt: number;
}

export class ThoughtTree {
  private readonly nodes = new Map<string, ThoughtNode>();
  private readonly thoughtNumberIndex = new Map<number, string[]>();
  private rootId: string | null = null;
  private cursorId: string | null = null;
  private readonly maxNodes: number;
  readonly sessionId: string;
  lastAccessed: number;

  constructor(sessionId: string, maxNodes: number) {
    this.sessionId = sessionId;
    this.maxNodes = maxNodes;
    this.lastAccessed = Date.now();
  }

  get size(): number {
    return this.nodes.size;
  }

  get root(): ThoughtNode | undefined {
    return this.rootId ? this.nodes.get(this.rootId) : undefined;
  }

  get cursor(): ThoughtNode | undefined {
    return this.cursorId ? this.nodes.get(this.cursorId) : undefined;
  }

  getNode(nodeId: string): ThoughtNode | undefined {
    return this.nodes.get(nodeId);
  }

  addThought(data: ThoughtData): ThoughtNode {
    this.lastAccessed = Date.now();
    const nodeId = this.generateNodeId();

    let parentId: string | null = null;
    let depth = 0;

    if (this.rootId === null) {
      // First node becomes root
      parentId = null;
      depth = 0;
    } else if (data.branchFromThought) {
      // Branch: child of the node at branchFromThought
      const branchParent = this.findNodeByThoughtNumber(data.branchFromThought);
      if (branchParent) {
        parentId = branchParent.nodeId;
        depth = branchParent.depth + 1;
      } else {
        // Fallback to cursor if branch target not found
        parentId = this.cursorId;
        depth = this.cursor ? this.cursor.depth + 1 : 0;
      }
    } else if (data.isRevision && data.revisesThought) {
      // Revision: sibling of the revised node (child of revised node's parent)
      const revisedNode = this.findNodeByThoughtNumber(data.revisesThought);
      if (revisedNode) {
        if (revisedNode.parentId === null) {
          // Revising root: new node becomes child of root
          parentId = revisedNode.nodeId;
          depth = revisedNode.depth + 1;
        } else {
          parentId = revisedNode.parentId;
          const parent = this.nodes.get(revisedNode.parentId);
          depth = parent ? parent.depth + 1 : 0;
        }
      } else {
        // Fallback to cursor
        parentId = this.cursorId;
        depth = this.cursor ? this.cursor.depth + 1 : 0;
      }
    } else {
      // Sequential: child of cursor
      parentId = this.cursorId;
      depth = this.cursor ? this.cursor.depth + 1 : 0;
    }

    const node: ThoughtNode = {
      nodeId,
      parentId,
      children: [],
      depth,
      visitCount: 0,
      totalValue: 0,
      isTerminal: !data.nextThoughtNeeded,
      thoughtNumber: data.thoughtNumber,
      thought: data.thought,
      sessionId: data.sessionId ?? this.sessionId,
      branchId: data.branchId,
      isRevision: data.isRevision,
      revisesThought: data.revisesThought,
      branchFromThought: data.branchFromThought,
      createdAt: Date.now(),
    };

    this.nodes.set(nodeId, node);

    // Update parent's children list
    if (parentId !== null) {
      const parent = this.nodes.get(parentId);
      if (parent) {
        parent.children.push(nodeId);
      }
    }

    // Update thought number index
    const existing = this.thoughtNumberIndex.get(data.thoughtNumber) ?? [];
    existing.push(nodeId);
    this.thoughtNumberIndex.set(data.thoughtNumber, existing);

    // Set root if first node
    if (this.rootId === null) {
      this.rootId = nodeId;
    }

    // Move cursor to new node
    this.cursorId = nodeId;

    // Prune if over capacity
    if (this.nodes.size > this.maxNodes) {
      this.prune();
    }

    return node;
  }

  setCursor(nodeId: string): ThoughtNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node not found: ${nodeId}`);
    }
    this.cursorId = nodeId;
    this.lastAccessed = Date.now();
    return node;
  }

  findNodeByThoughtNumber(thoughtNumber: number): ThoughtNode | undefined {
    const nodeIds = this.thoughtNumberIndex.get(thoughtNumber);
    if (!nodeIds || nodeIds.length === 0) return undefined;

    if (nodeIds.length === 1) {
      return this.nodes.get(nodeIds[0]);
    }

    // Multiple nodes with same thoughtNumber: prefer cursor's ancestor
    if (this.cursorId) {
      const ancestorIds = new Set(this.getAncestorPath(this.cursorId).map(n => n.nodeId));
      for (const id of nodeIds) {
        if (ancestorIds.has(id)) {
          return this.nodes.get(id);
        }
      }
    }

    // Fallback: return the first one
    return this.nodes.get(nodeIds[0]);
  }

  getAncestorPath(nodeId: string): ThoughtNode[] {
    const path: ThoughtNode[] = [];
    let current = this.nodes.get(nodeId);
    while (current) {
      path.unshift(current);
      if (current.parentId === null) break;
      current = this.nodes.get(current.parentId);
    }
    return path;
  }

  getChildren(nodeId: string): ThoughtNode[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    return node.children
      .map(id => this.nodes.get(id))
      .filter((n): n is ThoughtNode => n !== undefined);
  }

  getLeafNodes(): ThoughtNode[] {
    const leaves: ThoughtNode[] = [];
    for (const node of this.nodes.values()) {
      if (node.children.length === 0) {
        leaves.push(node);
      }
    }
    return leaves;
  }

  getExpandableNodes(): ThoughtNode[] {
    const expandable: ThoughtNode[] = [];
    for (const node of this.nodes.values()) {
      if (!node.isTerminal) {
        expandable.push(node);
      }
    }
    return expandable;
  }

  getAllNodes(): ThoughtNode[] {
    return Array.from(this.nodes.values());
  }

  toJSON(maxDepth?: number): unknown {
    if (!this.rootId) return null;
    return this.serializeNode(this.rootId, 0, maxDepth);
  }

  private serializeNode(nodeId: string, currentDepth: number, maxDepth?: number): unknown {
    const node = this.nodes.get(nodeId);
    if (!node) return null;

    const result: Record<string, unknown> = {
      nodeId: node.nodeId,
      thoughtNumber: node.thoughtNumber,
      thought: node.thought.substring(0, 100) + (node.thought.length > 100 ? '...' : ''),
      depth: node.depth,
      visitCount: node.visitCount,
      averageValue: node.visitCount > 0 ? node.totalValue / node.visitCount : 0,
      isTerminal: node.isTerminal,
      isCursor: node.nodeId === this.cursorId,
      childCount: node.children.length,
    };

    if (maxDepth !== undefined && currentDepth >= maxDepth) {
      if (node.children.length > 0) {
        result.children = `[${node.children.length} children truncated]`;
      }
      return result;
    }

    if (node.children.length > 0) {
      result.children = node.children
        .map(id => this.serializeNode(id, currentDepth + 1, maxDepth))
        .filter(n => n !== null);
    }

    return result;
  }

  prune(): void {
    while (this.nodes.size > this.maxNodes) {
      const leaves = this.getLeafNodes();

      // Find the lowest-value leaf that isn't root or cursor
      let worstLeaf: ThoughtNode | null = null;
      let worstValue = Infinity;

      for (const leaf of leaves) {
        if (leaf.nodeId === this.rootId || leaf.nodeId === this.cursorId) continue;
        const avgValue = leaf.visitCount > 0 ? leaf.totalValue / leaf.visitCount : 0;
        if (avgValue < worstValue) {
          worstValue = avgValue;
          worstLeaf = leaf;
        }
      }

      if (!worstLeaf) break; // Nothing safe to prune

      this.removeNode(worstLeaf.nodeId);
    }
  }

  private removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // Remove from parent's children
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter(id => id !== nodeId);
      }
    }

    // Remove from thought number index
    const indexIds = this.thoughtNumberIndex.get(node.thoughtNumber);
    if (indexIds) {
      const filtered = indexIds.filter(id => id !== nodeId);
      if (filtered.length === 0) {
        this.thoughtNumberIndex.delete(node.thoughtNumber);
      } else {
        this.thoughtNumberIndex.set(node.thoughtNumber, filtered);
      }
    }

    this.nodes.delete(nodeId);
  }

  private nodeCounter = 0;

  private generateNodeId(): string {
    this.nodeCounter++;
    return `node_${this.nodeCounter}_${Date.now().toString(36)}`;
  }
}
