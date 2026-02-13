import type { ThoughtTree } from './thought-tree.js';
import type { MCTSEngine } from './mcts.js';
import type { TreeStats, TreeNodeInfo, ThoughtData } from './interfaces.js';
import { metacognition } from './metacognition.js';

export const VALID_THINKING_MODES = ['fast', 'expert', 'deep'] as const;
export type ThinkingMode = (typeof VALID_THINKING_MODES)[number];

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
  backtrackThreshold: number;
  branchMinDepth: number;
  useMCTSForBranching: boolean;
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
  circularityWarning: string | null;
  confidenceScore: number | null;
  perspectiveSuggestions: Array<{ perspective: string; description: string }>;
  problemType: string | null;
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
    backtrackThreshold: 0,
    branchMinDepth: Infinity,
    useMCTSForBranching: false,
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
    backtrackThreshold: 0.4,
    branchMinDepth: 2,
    useMCTSForBranching: false,
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
    backtrackThreshold: 0.5,
    branchMinDepth: 0,
    useMCTSForBranching: true,
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

interface BuildTemplateContext {
  config: ThinkingModeConfig;
  tree: ThoughtTree;
  stats: TreeStats;
  bestPath: TreeNodeInfo[];
  convergenceStatus: ModeGuidance['convergenceStatus'];
  branchingSuggestion: ModeGuidance['branchingSuggestion'];
  backtrackSuggestion: ModeGuidance['backtrackSuggestion'];
}

interface DetermineActionContext {
  config: ThinkingModeConfig;
  tree: ThoughtTree;
  engine: MCTSEngine;
  currentPhase: ModeGuidance['currentPhase'];
  currentDepth: number;
  convergenceStatus: ModeGuidance['convergenceStatus'];
}

interface ActionResult {
  recommendedAction: ModeGuidance['recommendedAction'];
  reasoning: string;
  branchingSuggestion: ModeGuidance['branchingSuggestion'];
  backtrackSuggestion: ModeGuidance['backtrackSuggestion'];
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

  generateGuidance(
    config: ThinkingModeConfig,
    tree: ThoughtTree,
    engine: MCTSEngine,
    precomputedStats?: TreeStats,
  ): ModeGuidance {
    const stats = precomputedStats ?? engine.getTreeStats(tree);
    const bestPath = engine.extractBestPath(tree);
    const currentDepth = stats.maxDepth;
    const totalEvaluated = stats.totalNodes - stats.unexploredCount;

    const convergenceStatus = this.computeConvergenceStatus(
      config, bestPath, totalEvaluated,
    );
    const currentPhase = this.determinePhase(
      config, currentDepth, totalEvaluated, convergenceStatus,
    );

    const actionResult = this.determineAction({
      config, tree, engine,
      currentPhase, currentDepth, convergenceStatus,
    });
    const { recommendedAction, reasoning } = actionResult;
    const { branchingSuggestion, backtrackSuggestion } = actionResult;

    const templateParams = this.buildTemplateParams({
      config, tree, stats, bestPath,
      convergenceStatus, branchingSuggestion, backtrackSuggestion,
    });
    const template = this.selectTemplate(config.mode, recommendedAction);
    const thoughtPrompt = this.renderTemplate(
      template, { ...templateParams, recommendedAction },
    );

    const progressOverview = this.generateProgressOverview(
      config, tree, stats, bestPath,
    );
    const critique = this.generateCritique(config, tree, bestPath, stats);

    const thoughtHistory = tree.getAllNodes().map(n => ({
      thought: n.thought,
      thoughtNumber: n.thoughtNumber,
      totalThoughts: n.thoughtNumber,
      nextThoughtNeeded: true,
    }));

    const circularity = metacognition.detectCircularity(thoughtHistory);
    const confidence = metacognition.assessConfidence(
      thoughtHistory[thoughtHistory.length - 1]?.thought || '',
      thoughtHistory.slice(0, -1),
      null,
    );
    const problemType = metacognition.classifyProblemType(thoughtHistory);
    const perspectiveSuggestions = metacognition.suggestPerspective(
      recommendedAction === 'evaluate',
      stats.totalNodes - stats.terminalCount,
    );

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
      circularityWarning: circularity.warning,
      confidenceScore: confidence.confidence,
      perspectiveSuggestions: perspectiveSuggestions.map(p => ({
        perspective: p.perspective,
        description: p.description,
      })),
      problemType: problemType.type !== 'unknown' ? problemType.type : null,
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

  private computeCursorValue(
    cursor: ThoughtTree['cursor'],
  ): string {
    if (!cursor || cursor.visitCount === 0) return 'unscored';
    return (cursor.totalValue / cursor.visitCount).toFixed(2);
  }

  private computeBestPathValue(
    bestPath: TreeNodeInfo[],
  ): string {
    if (bestPath.length === 0) return '0.00';
    return bestPath[bestPath.length - 1].averageValue.toFixed(2);
  }

  private getParentThought(
    tree: ThoughtTree,
    maxLen: number,
  ): string {
    const { cursor } = tree;
    if (!cursor?.parentId) return '(root)';
    const parent = tree.getNode(cursor.parentId);
    if (!parent) return '(root)';
    return this.compressThought(parent.thought, maxLen);
  }

  private computeProgress(
    cursorDepth: number,
    targetDepthMax: number,
  ): string {
    if (targetDepthMax <= 0) return '0.00';
    return (cursorDepth / targetDepthMax).toFixed(2);
  }

  private getCursorFields(
    tree: ThoughtTree,
    maxLen: number,
  ): Pick<
    TemplateParams,
    'thoughtNumber' | 'currentDepth' | 'branchCount' | 'currentThought'
  > {
    const { cursor } = tree;
    if (!cursor) {
      return {
        thoughtNumber: 0,
        currentDepth: 0,
        branchCount: 0,
        currentThought: '(none)',
      };
    }
    return {
      thoughtNumber: cursor.thoughtNumber,
      currentDepth: cursor.depth,
      branchCount: cursor.children.length,
      currentThought: this.compressThought(cursor.thought, maxLen),
    };
  }

  private buildTemplateParams(ctx: BuildTemplateContext): TemplateParams {
    const {
      config, tree, stats, bestPath,
      convergenceStatus, branchingSuggestion, backtrackSuggestion,
    } = ctx;
    const maxLen = config.maxThoughtDisplayLength;
    const cf = this.getCursorFields(tree, maxLen);

    const bestPathSummary = bestPath.length > 0
      ? bestPath.map(n => n.thoughtNumber).join(' -> ')
      : '(none)';

    const backtrackNodeId = backtrackSuggestion?.toNodeId;
    const backtrackTarget = backtrackNodeId
      ? tree.getNode(backtrackNodeId) : undefined;

    return {
      ...cf,
      targetDepthMin: config.targetDepthMin,
      targetDepthMax: config.targetDepthMax,
      totalNodes: stats.totalNodes,
      unexploredCount: stats.unexploredCount,
      leafCount: tree.getLeafNodes().length,
      terminalCount: stats.terminalCount,
      progress: this.computeProgress(
        cf.currentDepth, config.targetDepthMax,
      ),
      cursorValue: this.computeCursorValue(tree.cursor),
      bestPathValue: this.computeBestPathValue(bestPath),
      convergenceScore: convergenceStatus
        ? convergenceStatus.score.toFixed(2)
        : 'N/A',
      maxBranches: config.maxBranchingFactor,
      convergenceThreshold: config.convergenceThreshold,
      parentThought: this.getParentThought(tree, maxLen),
      bestPathSummary,
      branchFromNodeId: branchingSuggestion?.fromNodeId ?? '',
      backtrackToNodeId: backtrackNodeId ?? '',
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

    // Average value across visited nodes, penalized by visited ratio.
    // Prevents premature convergence when most of the path is unexplored.
    const visitedNodes = bestPath.filter(n => n.visitCount > 0);
    let score: number;
    if (visitedNodes.length === 0 || bestPath.length === 0) {
      score = 0;
    } else {
      const avgValue = visitedNodes.reduce(
        (sum, n) => sum + n.averageValue, 0,
      ) / visitedNodes.length;
      const visitedRatio = visitedNodes.length / bestPath.length;
      score = avgValue * visitedRatio;
    }

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

  private checkBacktrack(
    ctx: DetermineActionContext,
  ): ActionResult | null {
    const { config, tree, engine, currentDepth } = ctx;
    const { cursor } = tree;
    if (!cursor || !config.enableBacktracking) return null;
    if (cursor.visitCount === 0 || config.backtrackThreshold <= 0) {
      return null;
    }
    const cursorAvg = cursor.totalValue / cursor.visitCount;
    const eligible = cursor.children.length > 0 || currentDepth > 1;
    if (cursorAvg >= config.backtrackThreshold || !eligible) {
      return null;
    }
    const ancestor = this.findBestAncestorForBacktrack(
      tree, engine, cursor.nodeId,
    );
    if (!ancestor) return null;
    return {
      recommendedAction: 'backtrack',
      reasoning: `Current path scoring ${cursorAvg.toFixed(2)} (threshold ${config.backtrackThreshold}). Backtrack to explore alternatives.`,
      branchingSuggestion: null,
      backtrackSuggestion: {
        shouldBacktrack: true,
        toNodeId: ancestor.nodeId,
        reason: `Node at depth ${ancestor.depth} has better potential for branching.`,
      },
    };
  }

  private checkBranch(ctx: DetermineActionContext): ActionResult | null {
    const { config, tree, engine, currentDepth } = ctx;
    const { cursor } = tree;
    if (!cursor) return null;
    const belowCap = cursor.children.length < config.maxBranchingFactor;
    if (!belowCap || cursor.isTerminal) return null;
    if (currentDepth < config.branchMinDepth) return null;

    let branchFrom = cursor.nodeId;
    if (config.useMCTSForBranching) {
      const s = engine.suggestNext(tree, config.suggestStrategy);
      if (s.suggestion) branchFrom = s.suggestion.nodeId;
    }
    const remaining = config.maxBranchingFactor - cursor.children.length;
    return {
      recommendedAction: 'branch',
      reasoning: `${config.mode} mode — ${cursor.children.length}/${config.maxBranchingFactor} branches explored. Consider alternative approaches.`,
      branchingSuggestion: {
        shouldBranch: true,
        fromNodeId: branchFrom,
        reason: `Node has capacity for ${remaining} more branches.`,
      },
      backtrackSuggestion: null,
    };
  }

  private determineAction(ctx: DetermineActionContext): ActionResult {
    const { config, currentPhase, currentDepth, convergenceStatus } = ctx;
    const none = { branchingSuggestion: null, backtrackSuggestion: null };

    // 1. Concluded check
    const concluded = currentPhase === 'concluded'
      || (config.convergenceThreshold === 0
        && currentDepth >= config.targetDepthMax);
    if (concluded) {
      const scoreInfo = convergenceStatus?.score != null
        ? ` (score: ${convergenceStatus.score.toFixed(2)}, threshold: ${config.convergenceThreshold})`
        : ` (${currentDepth}/${config.targetDepthMax})`;
      return {
        recommendedAction: 'conclude',
        reasoning: `Target reached${scoreInfo}. ${config.mode} mode — conclude.`,
        ...none,
      };
    }

    // 2. No cursor → continue
    if (!ctx.tree.cursor) {
      return {
        recommendedAction: 'continue',
        reasoning: 'No cursor — submit a thought to begin.',
        ...none,
      };
    }

    // 3. Backtrack check
    const backtrack = this.checkBacktrack(ctx);
    if (backtrack) return backtrack;

    // 4. Branch check
    const branch = this.checkBranch(ctx);
    if (branch) return branch;

    // 5. Evaluate unevaluated leaves
    const leaves = !config.autoEvaluate
      ? ctx.tree.getLeafNodes() : [];
    const unevaluated = leaves.filter(l => l.visitCount === 0);
    if (unevaluated.length > 0) {
      return {
        recommendedAction: 'evaluate',
        reasoning: `${unevaluated.length} leaf node(s) unevaluated. Score them to guide exploration.`,
        ...none,
      };
    }

    // 6. Default continue
    return {
      recommendedAction: 'continue',
      reasoning: `${config.mode} mode — continue exploring (depth ${currentDepth}/${config.targetDepthMax}).`,
      ...none,
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

    const [first] = sentences;
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

  private findWeakestNode(
    bestPath: TreeNodeInfo[],
  ): { node: TreeNodeInfo; value: number } | null {
    let weakest: TreeNodeInfo | null = null;
    let weakestValue = Infinity;
    for (const node of bestPath) {
      if (node.visitCount > 0 && node.averageValue < weakestValue) {
        weakestValue = node.averageValue;
        weakest = node;
      }
    }
    return weakest ? { node: weakest, value: weakestValue } : null;
  }

  private countUnchallenged(
    tree: ThoughtTree,
    bestPath: TreeNodeInfo[],
  ): number {
    let count = 0;
    for (let i = 1; i < bestPath.length; i++) {
      const parentNode = tree.getNode(bestPath[i - 1].nodeId);
      if (parentNode?.children.length === 1) {
        count++;
      }
    }
    return count;
  }

  private computeBranchCoverage(
    bestPath: TreeNodeInfo[],
    maxBranchingFactor: number,
  ): { totalChildren: number; theoreticalMax: number; percent: number } {
    let totalChildren = 0;
    for (const node of bestPath) {
      totalChildren += node.childCount;
    }
    const theoreticalMax = bestPath.length * maxBranchingFactor;
    const percent = theoreticalMax > 0
      ? Math.round((totalChildren / theoreticalMax) * 100)
      : 0;
    return { totalChildren, theoreticalMax, percent };
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

    const weakest = this.findWeakestNode(bestPath);
    const unchallenged = this.countUnchallenged(tree, bestPath);
    const coverage = this.computeBranchCoverage(
      bestPath, config.maxBranchingFactor,
    );

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

    const weakestInfo = weakest
      ? `Weakest: step ${weakest.node.thoughtNumber} (score ${weakest.value.toFixed(2)}) \u2014 "${this.compressThought(weakest.node.thought, 60)}".`
      : 'Weakest: N/A (no scored nodes).';

    const { totalChildren, theoreticalMax, percent } = coverage;
    return [
      `CRITIQUE: ${weakestInfo}`,
      `Unchallenged: ${unchallenged}/${bestPath.length - 1} steps have no alternatives. Coverage: ${totalChildren}/${theoreticalMax} branches (${percent}%).`,
      `Balance: ${balanceLabel} \u2014 ${balancePercent}% of nodes on best path.`,
    ].join('\n');
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
