import type { ThoughtTree, ThoughtNode } from './thought-tree.js';
import type { TreeStats, TreeNodeInfo } from './interfaces.js';

const STRATEGY_CONSTANTS: Record<string, number> = {
  explore: 2.0,
  exploit: 0.5,
  balanced: Math.SQRT2,
};

export class MCTSEngine {
  private readonly defaultC: number;

  constructor(explorationConstant: number = Math.SQRT2) {
    this.defaultC = explorationConstant;
  }

  computeUCB1(
    nodeVisits: number,
    nodeValue: number,
    parentVisits: number,
    explorationC: number,
  ): number {
    if (nodeVisits === 0) return Infinity;
    const exploitation = nodeValue / nodeVisits;
    const exploration = explorationC
      * Math.sqrt(Math.log(parentVisits) / nodeVisits);
    return exploitation + exploration;
  }

  backpropagate(tree: ThoughtTree, nodeId: string, value: number): number {
    let updated = 0;
    const path = tree.getAncestorPath(nodeId);

    for (const node of path) {
      node.totalValue += value;
      node.visitCount++;
      updated++;
    }

    return updated;
  }

  suggestNext(
    tree: ThoughtTree,
    strategy: 'explore' | 'exploit' | 'balanced' = 'balanced',
  ): {
    suggestion: {
      nodeId: string;
      thoughtNumber: number;
      thought: string;
      ucb1Score: number;
      reason: string;
    } | null;
    alternatives: Array<{
      nodeId: string;
      thoughtNumber: number;
      ucb1Score: number;
    }>;
  } {
    const explorationC = STRATEGY_CONSTANTS[strategy] ?? this.defaultC;
    const expandable = tree.getExpandableNodes();

    if (expandable.length === 0) {
      return { suggestion: null, alternatives: [] };
    }

    // Compute total visits across tree for parent context
    const totalVisits = Math.max(1, expandable.reduce((sum, n) => sum + n.visitCount, 0));

    const scored = expandable.map(node => ({
      node,
      ucb1: this.computeUCB1(node.visitCount, node.totalValue, totalVisits, explorationC),
    }));

    // Sort descending by UCB1 score
    scored.sort((a, b) => b.ucb1 - a.ucb1);

    const [best] = scored;
    const reason = best.node.visitCount === 0
      ? 'Unexplored node — never evaluated'
      : `UCB1 score ${best.ucb1.toFixed(4)} (${strategy} strategy)`;

    return {
      suggestion: {
        nodeId: best.node.nodeId,
        thoughtNumber: best.node.thoughtNumber,
        thought: best.node.thought,
        ucb1Score: best.ucb1,
        reason,
      },
      alternatives: scored.slice(1, 4).map(s => ({
        nodeId: s.node.nodeId,
        thoughtNumber: s.node.thoughtNumber,
        ucb1Score: s.ucb1,
      })),
    };
  }

  extractBestPath(tree: ThoughtTree): TreeNodeInfo[] {
    const { root } = tree;
    if (!root) return [];

    const path: TreeNodeInfo[] = [];
    let current: ThoughtNode | undefined = root;

    while (current) {
      path.push(this.toNodeInfo(current));

      if (current.children.length === 0) break;

      // Follow highest average value child
      let bestChild: ThoughtNode | undefined;
      let bestAvg = -Infinity;

      for (const childId of current.children) {
        const child = tree.getNode(childId);
        if (!child) continue;
        const avg = child.visitCount > 0 ? child.totalValue / child.visitCount : 0;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestChild = child;
        }
      }

      current = bestChild;
    }

    return path;
  }

  getTreeStats(tree: ThoughtTree): TreeStats {
    const allNodes = tree.getAllNodes();
    if (allNodes.length === 0) {
      return { totalNodes: 0, maxDepth: 0, unexploredCount: 0, averageValue: 0, terminalCount: 0 };
    }

    let maxDepth = 0;
    let unexploredCount = 0;
    let totalValue = 0;
    let totalVisits = 0;
    let terminalCount = 0;

    for (const node of allNodes) {
      if (node.depth > maxDepth) maxDepth = node.depth;
      if (node.visitCount === 0) unexploredCount++;
      totalValue += node.totalValue;
      totalVisits += node.visitCount;
      if (node.isTerminal) terminalCount++;
    }

    return {
      totalNodes: allNodes.length,
      maxDepth,
      unexploredCount,
      averageValue: totalVisits > 0 ? totalValue / totalVisits : 0,
      terminalCount,
    };
  }

  toNodeInfo(node: ThoughtNode): TreeNodeInfo {
    return {
      nodeId: node.nodeId,
      thoughtNumber: node.thoughtNumber,
      thought: node.thought,
      depth: node.depth,
      visitCount: node.visitCount,
      averageValue: node.visitCount > 0 ? node.totalValue / node.visitCount : 0,
      childCount: node.children.length,
      isTerminal: node.isTerminal,
    };
  }
}
