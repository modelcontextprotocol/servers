import type { ThoughtData } from './circular-buffer.js';
import type {
  MCTSConfig,
  ThoughtTreeService,
  ThoughtTreeRecordResult,
  MCTSService,
  TreeStats,
  BacktrackResult,
  EvaluateResult,
  SuggestResult,
  ThinkingSummary,
} from './interfaces.js';
import { ThoughtTree } from './thought-tree.js';
import { MCTSEngine } from './mcts.js';
import { TreeError } from './errors.js';
import { ThinkingModeEngine } from './thinking-modes.js';
import type { ThinkingMode, ThinkingModeConfig } from './thinking-modes.js';

const MAX_CONCURRENT_TREES = 100;
const CLEANUP_INTERVAL_MS = 300000; // 5 minutes

export class ThoughtTreeManager implements ThoughtTreeService, MCTSService {
  private readonly trees = new Map<string, ThoughtTree>();
  private readonly engine: MCTSEngine;
  private readonly config: MCTSConfig;
  private readonly modes = new Map<string, ThinkingModeConfig>();
  private readonly modeEngine = new ThinkingModeEngine();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: MCTSConfig) {
    this.config = config;
    this.engine = new MCTSEngine(config.explorationConstant);
    this.startCleanupTimer();
  }

  recordThought(data: ThoughtData): ThoughtTreeRecordResult | null {
    if (!this.config.enableAutoTree) return null;

    const sessionId = data.sessionId;
    if (!sessionId) return null;

    const tree = this.getOrCreateTree(sessionId);
    const node = tree.addThought(data);

    // Auto-evaluate in fast mode
    const modeConfig = this.modes.get(sessionId);
    if (modeConfig) {
      const autoVal = this.modeEngine.getAutoEvalValue(modeConfig);
      if (autoVal !== null) {
        this.engine.backpropagate(tree, node.nodeId, autoVal);
      }
    }

    const treeStats = this.engine.getTreeStats(tree);

    const result: ThoughtTreeRecordResult = {
      nodeId: node.nodeId,
      parentNodeId: node.parentId,
      treeStats,
    };

    // Generate mode guidance if mode is active
    if (modeConfig) {
      result.modeGuidance = this.modeEngine.generateGuidance(modeConfig, tree, this.engine);
    }

    return result;
  }

  backtrack(sessionId: string, nodeId: string): BacktrackResult {
    const tree = this.getTree(sessionId);
    const node = tree.setCursor(nodeId);
    const children = tree.getChildren(nodeId);

    return {
      node: this.engine.toNodeInfo(node),
      children: children.map(c => this.engine.toNodeInfo(c)),
      treeStats: this.engine.getTreeStats(tree),
    };
  }

  evaluate(sessionId: string, nodeId: string, value: number): EvaluateResult {
    const tree = this.getTree(sessionId);
    const node = tree.getNode(nodeId);
    if (!node) {
      throw new TreeError(`Node not found: ${nodeId}`);
    }

    const nodesUpdated = this.engine.backpropagate(tree, nodeId, value);

    return {
      nodeId,
      newVisitCount: node.visitCount,
      newAverageValue: node.visitCount > 0 ? node.totalValue / node.visitCount : 0,
      nodesUpdated,
      treeStats: this.engine.getTreeStats(tree),
    };
  }

  suggest(sessionId: string, strategy: 'explore' | 'exploit' | 'balanced' = 'balanced'): SuggestResult {
    const tree = this.getTree(sessionId);
    const result = this.engine.suggestNext(tree, strategy);

    return {
      suggestion: result.suggestion,
      alternatives: result.alternatives,
      treeStats: this.engine.getTreeStats(tree),
    };
  }

  getSummary(sessionId: string, maxDepth?: number): ThinkingSummary {
    const tree = this.getTree(sessionId);

    return {
      bestPath: this.engine.extractBestPath(tree),
      treeStructure: tree.toJSON(maxDepth),
      treeStats: this.engine.getTreeStats(tree),
    };
  }

  setMode(sessionId: string, mode: ThinkingMode): ThinkingModeConfig {
    const config = this.modeEngine.getPreset(mode);
    this.modes.set(sessionId, config);
    // Ensure tree exists for this session
    this.getOrCreateTree(sessionId);
    return config;
  }

  getMode(sessionId: string): ThinkingModeConfig | null {
    return this.modes.get(sessionId) ?? null;
  }

  cleanup(): void {
    const now = Date.now();

    // Remove expired trees and their mode configs
    for (const [sessionId, tree] of this.trees.entries()) {
      if (now - tree.lastAccessed > this.config.maxTreeAge) {
        this.trees.delete(sessionId);
        this.modes.delete(sessionId);
      }
    }

    // Cap at MAX_CONCURRENT_TREES, evict LRU
    if (this.trees.size > MAX_CONCURRENT_TREES) {
      const sorted = Array.from(this.trees.entries())
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

      const toRemove = this.trees.size - MAX_CONCURRENT_TREES;
      for (let i = 0; i < toRemove; i++) {
        this.trees.delete(sorted[i][0]);
      }
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.trees.clear();
    this.modes.clear();
  }

  private getOrCreateTree(sessionId: string): ThoughtTree {
    let tree = this.trees.get(sessionId);
    if (!tree) {
      tree = new ThoughtTree(sessionId, this.config.maxNodesPerTree);
      this.trees.set(sessionId, tree);
    }
    return tree;
  }

  private getTree(sessionId: string): ThoughtTree {
    const tree = this.trees.get(sessionId);
    if (!tree) {
      throw new TreeError(`No thought tree found for session: ${sessionId}`);
    }
    tree.lastAccessed = Date.now();
    return tree;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanup();
      } catch (error) {
        console.error('Tree cleanup error:', error);
      }
    }, CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }
}
