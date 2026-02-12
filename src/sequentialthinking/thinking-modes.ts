import type { ThoughtTree } from './thought-tree.js';
import type { MCTSEngine } from './mcts.js';
import type { TreeStats, TreeNodeInfo } from './interfaces.js';

export type ThinkingMode = 'fast' | 'expert' | 'deep';

export interface ThinkingModeConfig {
  mode: ThinkingMode;
  explorationConstant: number;
  suggestStrategy: 'explore' | 'exploit' | 'balanced';
  maxBranchingFactor: number;
  targetDepthMin: number;
  targetDepthMax: number;
  autoEvaluate: boolean;
  autoEvalValue: number;
  enableBacktracking: boolean;
  minEvaluationsBeforeConverge: number;
  convergenceThreshold: number;
  progressOverviewInterval: number;
  maxThoughtDisplayLength: number;
  enableCritique: boolean;
}

export interface ModeGuidance {
  mode: ThinkingMode;
  currentPhase: 'exploring' | 'evaluating' | 'converging' | 'concluded';
  recommendedAction: 'continue' | 'branch' | 'evaluate' | 'backtrack' | 'conclude';
  reasoning: string;
  targetTotalThoughts: number;
  convergenceStatus: {
    isConverged: boolean;
    score: number;
    bestPathValue: number;
  } | null;
  branchingSuggestion: {
    shouldBranch: boolean;
    fromNodeId: string;
    reason: string;
  } | null;
  backtrackSuggestion: {
    shouldBacktrack: boolean;
    toNodeId: string;
    reason: string;
  } | null;
  thoughtPrompt: string;
  progressOverview: string | null;
  critique: string | null;
}

const PRESETS: Record<ThinkingMode, ThinkingModeConfig> = {
  fast: {
    mode: 'fast',
    explorationConstant: 0.5,
    suggestStrategy: 'exploit',
    maxBranchingFactor: 1,
    targetDepthMin: 3,
    targetDepthMax: 5,
    autoEvaluate: true,
    autoEvalValue: 0.7,
    enableBacktracking: false,
    minEvaluationsBeforeConverge: 0,
    convergenceThreshold: 0,
    progressOverviewInterval: 3,
    maxThoughtDisplayLength: 150,
    enableCritique: false,
  },
  expert: {
    mode: 'expert',
    explorationConstant: Math.SQRT2,
    suggestStrategy: 'balanced',
    maxBranchingFactor: 3,
    targetDepthMin: 5,
    targetDepthMax: 10,
    autoEvaluate: false,
    autoEvalValue: 0,
    enableBacktracking: true,
    minEvaluationsBeforeConverge: 3,
    convergenceThreshold: 0.7,
    progressOverviewInterval: 4,
    maxThoughtDisplayLength: 250,
    enableCritique: true,
  },
  deep: {
    mode: 'deep',
    explorationConstant: 2.0,
    suggestStrategy: 'explore',
    maxBranchingFactor: 5,
    targetDepthMin: 10,
    targetDepthMax: 20,
    autoEvaluate: false,
    autoEvalValue: 0,
    enableBacktracking: true,
    minEvaluationsBeforeConverge: 5,
    convergenceThreshold: 0.85,
    progressOverviewInterval: 5,
    maxThoughtDisplayLength: 300,
    enableCritique: true,
  },
};

interface TemplateParams {
  thoughtNumber: number;
  currentDepth: number;
  targetDepthMin: number;
  targetDepthMax: number;
  totalNodes: number;
  unexploredCount: number;
  leafCount: number;
  terminalCount: number;
  progress: string;
  cursorValue: string;
  bestPathValue: string;
  convergenceScore: string;
  branchCount: number;
  maxBranches: number;
  convergenceThreshold: number;
  currentThought: string;
  parentThought: string;
  bestPathSummary: string;
  branchFromNodeId: string;
  backtrackToNodeId: string;
  backtrackDepth: number;
}

const TEMPLATES: Record<string, string> = {
  fast_continue: 'Step {{thoughtNumber}} of ~{{targetDepthMax}}. Build on: "{{currentThought}}". Next logical step — no alternatives, stay linear.',
  fast_conclude: 'Reached target depth ({{currentDepth}}/{{targetDepthMax}}). Synthesize your {{totalNodes}} steps into a direct, concise answer.',
  fast_evaluate: 'Assess quality at step {{thoughtNumber}} (depth {{currentDepth}}/{{targetDepthMax}}). Current value: {{cursorValue}}.',

  expert_continue: 'Step {{thoughtNumber}}, depth {{currentDepth}}/{{targetDepthMax}}. {{unexploredCount}} paths unexplored. Building on: "{{currentThought}}". What follows logically?',
  expert_branch: 'Decision point at node {{branchFromNodeId}}. {{branchCount}}/{{maxBranches}} perspectives explored. Current path: "{{currentThought}}". Branch with a different angle, method, or assumption.',
  expert_evaluate: '{{unexploredCount}} paths need scoring. Use evaluate_thought to rate quality and guide exploration. Best path so far: {{bestPathSummary}}.',
  expert_backtrack: 'Path scoring {{cursorValue}} — below threshold. Backtrack to node {{backtrackToNodeId}} (depth {{backtrackDepth}}). What assumption led astray?',
  expert_conclude: 'Convergence reached (score {{convergenceScore}}, threshold {{convergenceThreshold}}). Best path: {{bestPathSummary}}. Synthesize the strongest path into a final answer.',

  deep_continue: 'Depth {{currentDepth}}/{{targetDepthMax}}, {{totalNodes}} nodes, {{unexploredCount}} unscored. Building on: "{{currentThought}}". What nuance, edge case, or deeper implication?',
  deep_branch: '{{branchCount}}/{{maxBranches}} alternatives explored from node {{branchFromNodeId}}. Branch with a contrarian, lateral, or adversarial perspective on: "{{currentThought}}".',
  deep_evaluate: '{{unexploredCount}} paths unscored across {{leafCount}} leaves. Score before convergence check. Best path: {{bestPathSummary}}.',
  deep_backtrack: 'Path scoring {{cursorValue}}. Backtrack to node {{backtrackToNodeId}} (depth {{backtrackDepth}}). Find the weakest link in the reasoning and explore the opposite.',
  deep_conclude: 'Deep convergence (score {{convergenceScore}}, threshold {{convergenceThreshold}}, {{totalNodes}} nodes). Summarize findings, address counterarguments, and state confidence level.',
};

const FALLBACK_TEMPLATE = '{{recommendedAction}} at step {{thoughtNumber}} (depth {{currentDepth}}/{{targetDepthMax}}). {{totalNodes}} nodes explored.';

export class ThinkingModeEngine {
  getPreset(mode: ThinkingMode): ThinkingModeConfig {
    return { ...PRESETS[mode] };
  }

  getAutoEvalValue(config: ThinkingModeConfig): number | null {
    return config.autoEvaluate ? config.autoEvalValue : null;
  }

  generateGuidance(config: ThinkingModeConfig, tree: ThoughtTree, engine: MCTSEngine): ModeGuidance {
    const stats = engine.getTreeStats(tree);
    const bestPath = engine.extractBestPath(tree);
    const currentDepth = stats.maxDepth;
    const totalEvaluated = stats.totalNodes - stats.unexploredCount;

    // Compute convergence status
    const convergenceStatus = this.computeConvergenceStatus(config, bestPath, totalEvaluated);

    // Determine current phase
    const currentPhase = this.determinePhase(config, currentDepth, totalEvaluated, convergenceStatus);

    // Determine recommended action + reasoning + suggestions
    const { recommendedAction, reasoning, branchingSuggestion, backtrackSuggestion } =
      this.determineAction(config, tree, engine, currentPhase, currentDepth, convergenceStatus);

    const templateParams = this.buildTemplateParams(
      config, tree, stats, bestPath, convergenceStatus, branchingSuggestion, backtrackSuggestion,
    );
    const template = this.selectTemplate(config.mode, recommendedAction);
    const thoughtPrompt = this.renderTemplate(template, { ...templateParams, recommendedAction });

    const progressOverview = this.generateProgressOverview(config, tree, stats, bestPath);
    const critique = this.generateCritique(config, tree, bestPath, stats);

    return {
      mode: config.mode,
      currentPhase,
      recommendedAction,
      reasoning,
      targetTotalThoughts: config.targetDepthMax,
      convergenceStatus,
      branchingSuggestion,
      backtrackSuggestion,
      thoughtPrompt,
      progressOverview,
      critique,
    };
  }

  private selectTemplate(mode: ThinkingMode, action: ModeGuidance['recommendedAction']): string {
    return TEMPLATES[`${mode}_${action}`] ?? FALLBACK_TEMPLATE;
  }

  private renderTemplate(template: string, params: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = params[key as keyof typeof params];
      return val !== undefined && val !== null ? String(val) : '';
    });
  }

  private buildTemplateParams(
    config: ThinkingModeConfig,
    tree: ThoughtTree,
    stats: TreeStats,
    bestPath: TreeNodeInfo[],
    convergenceStatus: ModeGuidance['convergenceStatus'],
    branchingSuggestion: ModeGuidance['branchingSuggestion'],
    backtrackSuggestion: ModeGuidance['backtrackSuggestion'],
  ): TemplateParams {
    const cursor = tree.cursor;
    const cursorDepth = cursor?.depth ?? 0;
    const cursorAvg = cursor && cursor.visitCount > 0
      ? (cursor.totalValue / cursor.visitCount).toFixed(2)
      : 'unscored';

    const bestPathValue = bestPath.length > 0
      ? bestPath[bestPath.length - 1].averageValue.toFixed(2)
      : '0.00';

    const bestPathSummary = bestPath.length > 0
      ? bestPath.map(n => n.thoughtNumber).join(' -> ')
      : '(none)';

    const leaves = tree.getLeafNodes();

    const maxLen = config.maxThoughtDisplayLength;
    const currentThought = cursor ? this.compressThought(cursor.thought, maxLen) : '(none)';

    let parentThought = '(root)';
    if (cursor?.parentId) {
      const parent = tree.getNode(cursor.parentId);
      if (parent) {
        parentThought = this.compressThought(parent.thought, maxLen);
      }
    }

    const backtrackTarget = backtrackSuggestion?.toNodeId
      ? tree.getNode(backtrackSuggestion.toNodeId)
      : undefined;

    return {
      thoughtNumber: cursor?.thoughtNumber ?? 0,
      currentDepth: cursorDepth,
      targetDepthMin: config.targetDepthMin,
      targetDepthMax: config.targetDepthMax,
      totalNodes: stats.totalNodes,
      unexploredCount: stats.unexploredCount,
      leafCount: leaves.length,
      terminalCount: stats.terminalCount,
      progress: config.targetDepthMax > 0
        ? (cursorDepth / config.targetDepthMax).toFixed(2)
        : '0.00',
      cursorValue: cursorAvg,
      bestPathValue,
      convergenceScore: convergenceStatus
        ? convergenceStatus.score.toFixed(2)
        : 'N/A',
      branchCount: cursor?.children.length ?? 0,
      maxBranches: config.maxBranchingFactor,
      convergenceThreshold: config.convergenceThreshold,
      currentThought,
      parentThought,
      bestPathSummary,
      branchFromNodeId: branchingSuggestion?.fromNodeId ?? '',
      backtrackToNodeId: backtrackSuggestion?.toNodeId ?? '',
      backtrackDepth: backtrackTarget?.depth ?? 0,
    };
  }

  private computeConvergenceStatus(
    config: ThinkingModeConfig,
    bestPath: Array<{ visitCount: number; averageValue: number }>,
    totalEvaluated: number,
  ): ModeGuidance['convergenceStatus'] {
    if (config.convergenceThreshold === 0) {
      return null;
    }

    const bestPathValue = bestPath.length > 0
      ? bestPath[bestPath.length - 1].averageValue
      : 0;

    // Average value across best path nodes that have been visited
    const visitedNodes = bestPath.filter(n => n.visitCount > 0);
    const score = visitedNodes.length > 0
      ? visitedNodes.reduce((sum, n) => sum + n.averageValue, 0) / visitedNodes.length
      : 0;

    const isConverged =
      totalEvaluated >= config.minEvaluationsBeforeConverge &&
      score >= config.convergenceThreshold;

    return { isConverged, score, bestPathValue };
  }

  private determinePhase(
    config: ThinkingModeConfig,
    currentDepth: number,
    totalEvaluated: number,
    convergenceStatus: ModeGuidance['convergenceStatus'],
  ): ModeGuidance['currentPhase'] {
    // Already converged → concluded
    if (convergenceStatus?.isConverged) {
      return 'concluded';
    }

    // Fast mode: conclude when at target depth
    if (config.mode === 'fast' && currentDepth >= config.targetDepthMax) {
      return 'concluded';
    }

    // Check if enough evaluations for convergence phase
    if (config.convergenceThreshold > 0 && totalEvaluated >= config.minEvaluationsBeforeConverge) {
      return 'converging';
    }

    // If we have some evaluations, we're evaluating
    if (totalEvaluated > 0 && currentDepth >= config.targetDepthMin) {
      return 'evaluating';
    }

    return 'exploring';
  }

  private determineAction(
    config: ThinkingModeConfig,
    tree: ThoughtTree,
    engine: MCTSEngine,
    currentPhase: ModeGuidance['currentPhase'],
    currentDepth: number,
    convergenceStatus: ModeGuidance['convergenceStatus'],
  ): {
    recommendedAction: ModeGuidance['recommendedAction'];
    reasoning: string;
    branchingSuggestion: ModeGuidance['branchingSuggestion'];
    backtrackSuggestion: ModeGuidance['backtrackSuggestion'];
  } {
    switch (config.mode) {
      case 'fast':
        return this.determineFastAction(config, currentPhase, currentDepth);
      case 'expert':
        return this.determineExpertAction(config, tree, engine, currentPhase, currentDepth, convergenceStatus);
      case 'deep':
        return this.determineDeepAction(config, tree, engine, currentPhase, currentDepth, convergenceStatus);
    }
  }

  private determineFastAction(
    config: ThinkingModeConfig,
    currentPhase: ModeGuidance['currentPhase'],
    currentDepth: number,
  ) {
    if (currentPhase === 'concluded' || currentDepth >= config.targetDepthMax) {
      return {
        recommendedAction: 'conclude' as const,
        reasoning: `Target depth reached (${currentDepth}/${config.targetDepthMax}). Fast mode — conclude now.`,
        branchingSuggestion: null,
        backtrackSuggestion: null,
      };
    }

    return {
      recommendedAction: 'continue' as const,
      reasoning: `Fast mode — continue linear exploration (${currentDepth}/${config.targetDepthMax}).`,
      branchingSuggestion: null,
      backtrackSuggestion: null,
    };
  }

  private determineExpertAction(
    config: ThinkingModeConfig,
    tree: ThoughtTree,
    engine: MCTSEngine,
    currentPhase: ModeGuidance['currentPhase'],
    currentDepth: number,
    convergenceStatus: ModeGuidance['convergenceStatus'],
  ) {
    // Concluded
    if (currentPhase === 'concluded') {
      return {
        recommendedAction: 'conclude' as const,
        reasoning: `Convergence reached (score: ${convergenceStatus?.score?.toFixed(2)}). Expert mode — conclude.`,
        branchingSuggestion: null,
        backtrackSuggestion: null,
      };
    }

    const cursor = tree.cursor;
    if (!cursor) {
      return {
        recommendedAction: 'continue' as const,
        reasoning: 'No cursor — submit a thought to begin.',
        branchingSuggestion: null,
        backtrackSuggestion: null,
      };
    }

    // Check for backtracking: current path scores low
    if (config.enableBacktracking && cursor.visitCount > 0) {
      const cursorAvg = cursor.totalValue / cursor.visitCount;
      if (cursorAvg < 0.4 && currentDepth > 1) {
        const ancestor = this.findBestAncestorForBacktrack(tree, engine, cursor.nodeId);
        if (ancestor) {
          return {
            recommendedAction: 'backtrack' as const,
            reasoning: `Current path scoring low (${cursorAvg.toFixed(2)}). Backtrack to explore alternatives.`,
            branchingSuggestion: null,
            backtrackSuggestion: {
              shouldBacktrack: true,
              toNodeId: ancestor.nodeId,
              reason: `Node at depth ${ancestor.depth} has better potential for branching.`,
            },
          };
        }
      }
    }

    // Check for branching: cursor has few children relative to max
    if (cursor.children.length < config.maxBranchingFactor && !cursor.isTerminal && currentDepth >= 2) {
      return {
        recommendedAction: 'branch' as const,
        reasoning: `Decision point — ${cursor.children.length}/${config.maxBranchingFactor} branches explored. Consider alternative approaches.`,
        branchingSuggestion: {
          shouldBranch: true,
          fromNodeId: cursor.nodeId,
          reason: `Node has capacity for ${config.maxBranchingFactor - cursor.children.length} more branches.`,
        },
        backtrackSuggestion: null,
      };
    }

    // Check for evaluation: leaves need scoring
    const leaves = tree.getLeafNodes();
    const unevaluated = leaves.filter(l => l.visitCount === 0);
    if (unevaluated.length > 0) {
      return {
        recommendedAction: 'evaluate' as const,
        reasoning: `${unevaluated.length} leaf node(s) unevaluated. Score them to guide exploration.`,
        branchingSuggestion: null,
        backtrackSuggestion: null,
      };
    }

    return {
      recommendedAction: 'continue' as const,
      reasoning: `Expert mode — continue exploring (depth ${currentDepth}/${config.targetDepthMax}).`,
      branchingSuggestion: null,
      backtrackSuggestion: null,
    };
  }

  private determineDeepAction(
    config: ThinkingModeConfig,
    tree: ThoughtTree,
    engine: MCTSEngine,
    currentPhase: ModeGuidance['currentPhase'],
    currentDepth: number,
    convergenceStatus: ModeGuidance['convergenceStatus'],
  ) {
    // Concluded
    if (currentPhase === 'concluded') {
      return {
        recommendedAction: 'conclude' as const,
        reasoning: `High convergence reached (score: ${convergenceStatus?.score?.toFixed(2)}, threshold: ${config.convergenceThreshold}). Deep mode — conclude.`,
        branchingSuggestion: null,
        backtrackSuggestion: null,
      };
    }

    const cursor = tree.cursor;
    if (!cursor) {
      return {
        recommendedAction: 'continue' as const,
        reasoning: 'No cursor — submit a thought to begin.',
        branchingSuggestion: null,
        backtrackSuggestion: null,
      };
    }

    // Deep mode: aggressive backtracking to visit alternatives
    if (config.enableBacktracking && cursor.visitCount > 0 && cursor.children.length > 0) {
      const cursorAvg = cursor.totalValue / cursor.visitCount;
      if (cursorAvg < 0.5) {
        const ancestor = this.findBestAncestorForBacktrack(tree, engine, cursor.nodeId);
        if (ancestor) {
          return {
            recommendedAction: 'backtrack' as const,
            reasoning: `Deep exploration — current path at ${cursorAvg.toFixed(2)}. Backtrack to explore more alternatives.`,
            branchingSuggestion: null,
            backtrackSuggestion: {
              shouldBacktrack: true,
              toNodeId: ancestor.nodeId,
              reason: `Revisit node at depth ${ancestor.depth} for wider exploration.`,
            },
          };
        }
      }
    }

    // Deep mode: aggressive branching
    if (cursor.children.length < config.maxBranchingFactor && !cursor.isTerminal) {
      // Use MCTS suggestion for best branching point
      const suggestion = engine.suggestNext(tree, config.suggestStrategy);
      const branchFrom = suggestion.suggestion ? suggestion.suggestion.nodeId : cursor.nodeId;

      return {
        recommendedAction: 'branch' as const,
        reasoning: `Deep mode — aggressively branch (${cursor.children.length}/${config.maxBranchingFactor}). Explore diverse perspectives.`,
        branchingSuggestion: {
          shouldBranch: true,
          fromNodeId: branchFrom,
          reason: `Wide exploration: up to ${config.maxBranchingFactor} branches per node.`,
        },
        backtrackSuggestion: null,
      };
    }

    // Evaluate unevaluated leaves
    const leaves = tree.getLeafNodes();
    const unevaluated = leaves.filter(l => l.visitCount === 0);
    if (unevaluated.length > 0) {
      return {
        recommendedAction: 'evaluate' as const,
        reasoning: `${unevaluated.length} unevaluated leaf node(s). Score them before convergence check.`,
        branchingSuggestion: null,
        backtrackSuggestion: null,
      };
    }

    return {
      recommendedAction: 'continue' as const,
      reasoning: `Deep mode — continue exploration (depth ${currentDepth}/${config.targetDepthMax}).`,
      branchingSuggestion: null,
      backtrackSuggestion: null,
    };
  }

  private compressThought(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;

    const sentences = text.split(/(?<=[.!?])\s+/);

    if (sentences.length < 2) {
      // Single sentence or no boundaries: word-boundary truncate
      const cutoff = maxLen - 3;
      const lastSpace = text.lastIndexOf(' ', cutoff);
      const breakAt = lastSpace > 0 ? lastSpace : cutoff;
      return text.substring(0, breakAt) + '...';
    }

    const first = sentences[0];
    const last = sentences[sentences.length - 1];
    const combined = `${first} [...] ${last}`;
    if (combined.length <= maxLen) return combined;

    const firstOnly = `${first} [...]`;
    if (firstOnly.length <= maxLen) return firstOnly;

    // First sentence alone is too long — word-boundary truncate it
    const cutoff = maxLen - 3;
    const lastSpace = first.lastIndexOf(' ', cutoff);
    const breakAt = lastSpace > 0 ? lastSpace : cutoff;
    return first.substring(0, breakAt) + '...';
  }

  private extractFirstSentence(text: string): string {
    const match = text.match(/^(.+?[.!?])(?:\s|$)/);
    if (match) return match[1];
    // No sentence boundary found — compress to 50 chars
    if (text.length <= 50) return text;
    const lastSpace = text.lastIndexOf(' ', 47);
    const breakAt = lastSpace > 0 ? lastSpace : 47;
    return text.substring(0, breakAt) + '...';
  }

  private generateProgressOverview(
    config: ThinkingModeConfig,
    tree: ThoughtTree,
    stats: TreeStats,
    bestPath: TreeNodeInfo[],
  ): string | null {
    const interval = config.progressOverviewInterval;
    if (interval <= 0 || stats.totalNodes <= 0 || stats.totalNodes % interval !== 0) {
      return null;
    }

    const totalEvaluated = stats.totalNodes - stats.unexploredCount;
    const leaves = tree.getLeafNodes();
    const leafCount = leaves.length;

    const bestPathSummary = bestPath.length > 0
      ? bestPath.map(n => this.extractFirstSentence(n.thought)).join(' \u2192 ')
      : '(none)';
    const bestPathScore = bestPath.length > 0
      ? bestPath[bestPath.length - 1].averageValue.toFixed(2)
      : '0.00';

    // Count single-child non-leaf nodes on best path as "branch points to expand"
    let singleChildBranchPoints = 0;
    for (const node of bestPath) {
      if (node.childCount === 1) {
        singleChildBranchPoints++;
      }
    }

    return `PROGRESS [${stats.totalNodes} thoughts, depth ${stats.maxDepth}/${config.targetDepthMax}]: Evaluated ${totalEvaluated}/${stats.totalNodes} | Leaves ${leafCount} | Terminal ${stats.terminalCount}.\nBest path (score ${bestPathScore}): ${bestPathSummary}.\nGaps: ${stats.unexploredCount} unscored, ${singleChildBranchPoints} single-child branch points to expand.`;
  }

  private generateCritique(
    config: ThinkingModeConfig,
    tree: ThoughtTree,
    bestPath: TreeNodeInfo[],
    stats: TreeStats,
  ): string | null {
    if (!config.enableCritique || bestPath.length < 2) {
      return null;
    }

    // Find weakest link: lowest averageValue on bestPath among visited nodes
    let weakestNode: TreeNodeInfo | null = null;
    let weakestValue = Infinity;
    for (const node of bestPath) {
      if (node.visitCount > 0 && node.averageValue < weakestValue) {
        weakestValue = node.averageValue;
        weakestNode = node;
      }
    }

    // Unchallenged steps: bestPath nodes whose parent has only 1 child
    let unchallengedCount = 0;
    for (let i = 1; i < bestPath.length; i++) {
      const parentNode = tree.getNode(bestPath[i - 1].nodeId);
      if (parentNode && parentNode.children.length === 1) {
        unchallengedCount++;
      }
    }

    // Branch coverage: actual children across bestPath / theoretical max
    let totalChildren = 0;
    for (const node of bestPath) {
      totalChildren += node.childCount;
    }
    const theoreticalMax = bestPath.length * config.maxBranchingFactor;
    const coveragePercent = theoreticalMax > 0
      ? Math.round((totalChildren / theoreticalMax) * 100)
      : 0;

    // Balance: bestPath.length / totalNodes ratio
    const balanceRatio = stats.totalNodes > 0
      ? bestPath.length / stats.totalNodes
      : 0;
    const balancePercent = Math.round(balanceRatio * 100);
    let balanceLabel: string;
    if (balanceRatio > 0.8) {
      balanceLabel = 'one-sided';
    } else if (balanceRatio > 0.5) {
      balanceLabel = 'moderate';
    } else {
      balanceLabel = 'well-balanced';
    }

    const weakestInfo = weakestNode
      ? `Weakest: step ${weakestNode.thoughtNumber} (score ${weakestValue.toFixed(2)}) \u2014 "${this.compressThought(weakestNode.thought, 60)}".`
      : 'Weakest: N/A (no scored nodes).';

    return `CRITIQUE: ${weakestInfo}\nUnchallenged: ${unchallengedCount}/${bestPath.length - 1} steps have no alternatives. Coverage: ${totalChildren}/${theoreticalMax} branches (${coveragePercent}%).\nBalance: ${balanceLabel} \u2014 ${balancePercent}% of nodes on best path.`;
  }

  private findBestAncestorForBacktrack(
    tree: ThoughtTree,
    engine: MCTSEngine,
    nodeId: string,
  ): { nodeId: string; depth: number } | null {
    const path = tree.getAncestorPath(nodeId);
    if (path.length <= 1) return null;

    // Find ancestor with capacity for more children (skip root, skip current)
    for (let i = path.length - 2; i >= 0; i--) {
      const ancestor = path[i];
      if (ancestor.children.length > 1 || !ancestor.isTerminal) {
        return { nodeId: ancestor.nodeId, depth: ancestor.depth };
      }
    }

    // Fallback: return root's first child or root
    return path.length > 1
      ? { nodeId: path[0].nodeId, depth: path[0].depth }
      : null;
  }
}
