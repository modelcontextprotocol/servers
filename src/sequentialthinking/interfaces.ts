import { z } from 'zod';
import type { ThinkingMode, ThinkingModeConfig, ModeGuidance } from './thinking-modes.js';
import { VALID_THINKING_MODES } from './thinking-modes.js';
export type { ThinkingMode, ThinkingModeConfig, ModeGuidance };
export { VALID_THINKING_MODES };

const SESSION_ID_MIN_LENGTH = 1;
const SESSION_ID_MAX_LENGTH = 100;
const THOUGHT_NUMBER_MIN = 1;
const MAX_CONSECUTIVE_WHITESPACE = 10;

const PRE_COMPILED_NORMALIZE_PATTERNS: RegExp[] = [
  /\r\n/g,
  /\r/g,
  /\t/g,
  / {2,}/g,
  /\n\n+/g,
];

const PRE_COMPILED_VALIDATE_PATTERN = /[ \n]{2,}/g;

const sanitizeAndNormalizeThought = (val: string): string => {
  const normalized = val
    .replace(PRE_COMPILED_NORMALIZE_PATTERNS[0], '\n')
    .replace(PRE_COMPILED_NORMALIZE_PATTERNS[1], '\n')
    .replace(PRE_COMPILED_NORMALIZE_PATTERNS[2], ' ')
    .trim()
    .replace(PRE_COMPILED_NORMALIZE_PATTERNS[3], ' ')
    .replace(PRE_COMPILED_NORMALIZE_PATTERNS[4], '\n');
  return normalized;
};

const validateThoughtContent = (val: string): boolean => {
  const normalized = sanitizeAndNormalizeThought(val);
  if (normalized.length === 0) return false;
  const consecutiveWhitespace = normalized.match(PRE_COMPILED_VALIDATE_PATTERN);
  if (consecutiveWhitespace?.some((m) => m.length > MAX_CONSECUTIVE_WHITESPACE)) {
    return false;
  }
  return true;
};

export const sessionIdSchema = z
  .string()
  .min(SESSION_ID_MIN_LENGTH, {
    message: `Session ID must be at least ${SESSION_ID_MIN_LENGTH} character`,
  })
  .max(SESSION_ID_MAX_LENGTH, {
    message: `Session ID must be at most ${SESSION_ID_MAX_LENGTH} characters`,
  })
  .regex(/^[\p{L}\p{N}_-]+$/u, {
    message: 'Session ID must contain only letters, numbers, underscores, and hyphens',
  })
  .transform((val) => val.trim().toLowerCase());

export const rawSessionIdSchema = z
  .string()
  .min(SESSION_ID_MIN_LENGTH, {
    message: `Session ID must be at least ${SESSION_ID_MIN_LENGTH} character`,
  })
  .max(SESSION_ID_MAX_LENGTH, {
    message: `Session ID must be at most ${SESSION_ID_MAX_LENGTH} characters`,
  })
  .regex(/^[\p{L}\p{N}_-]+$/u, {
    message: 'Session ID must contain only letters, numbers, underscores, and hyphens',
  });

export const thinkingModeSchema = z.enum(VALID_THINKING_MODES)
  .describe('Thinking mode: fast=quick decisions (3-5 steps), expert=complex analysis (5-10 steps), deep=thorough exploration (10-20 steps)');

export const THOUGHT_CATEGORIES = [
  'analysis',
  'hypothesis',
  'conclusion',
  'question',
  'reflection',
  'planning',
  'evaluation',
] as const;

export const THOUGHT_CATEGORY_DESCRIPTIONS: Record<string, string> = {
  analysis: 'Breaking down a problem into components',
  hypothesis: 'Forming a testable assumption or theory',
  conclusion: 'Drawing a final inference from evidence',
  question: 'Asking for clarification or more information',
  reflection: 'Thinking about the thinking process itself',
  planning: 'Outlining steps to achieve a goal',
  evaluation: 'Assessing the merit or quality of something',
};

export type ThoughtCategory = (typeof THOUGHT_CATEGORIES)[number];

export const thoughtCategorySchema = z.enum(THOUGHT_CATEGORIES)
  .describe('Category of thought: analysis|hypothesis|conclusion|question|reflection|planning|evaluation');

export const STRATEGY_TYPES = ['explore', 'exploit', 'balanced'] as const;

export const STRATEGY_DESCRIPTIONS: Record<string, string> = {
  explore: 'Favor unvisited nodes - good for discovery',
  exploit: 'Favor high-value nodes - good for optimization',
  balanced: 'Balance exploration and exploitation - default',
};

export type StrategyType = (typeof STRATEGY_TYPES)[number];

export const strategySchema = z.enum(STRATEGY_TYPES)
  .describe('MCTS selection strategy: explore=find new paths, exploit=follow best path, balanced=mix both');

export const PROBLEM_TYPES = [
  'analysis',
  'design',
  'debugging',
  'planning',
  'optimization',
  'decision',
  'creative',
  'refactoring',
  'testing',
  'security',
  'performance',
  'integration',
  'migration',
  'documentation',
  'research',
  'review',
  'deployment',
  'troubleshooting',
  'architecture',
  'api_design',
  'data_modeling',
  'ux_design',
  'technical_writing',
  'code_generation',
  'unknown',
] as const;

export const PROBLEM_TYPE_DESCRIPTIONS: Record<string, string> = {
  analysis: 'Breaking down and understanding a problem',
  design: 'Creating a solution or system architecture',
  debugging: 'Finding and fixing errors',
  planning: 'Mapping out steps to achieve a goal',
  optimization: 'Improving efficiency or performance',
  decision: 'Choosing between alternatives',
  creative: 'Generating novel ideas or solutions',
  refactoring: 'Improving existing code structure',
  testing: 'Creating or improving test coverage',
  security: 'Identifying or fixing security vulnerabilities',
  performance: 'Improving speed or resource usage',
  integration: 'Connecting systems or components',
  migration: 'Moving data or systems to new platforms',
  documentation: 'Creating or updating documentation',
  research: 'Investigating options or technologies',
  review: 'Evaluating code or designs for quality',
  deployment: 'Releasing to production environments',
  troubleshooting: 'Diagnosing and resolving issues',
  architecture: 'Designing system-level structures',
  api_design: 'Designing programmatic interfaces',
  data_modeling: 'Designing data structures and relationships',
  ux_design: 'Designing user experiences',
  technical_writing: 'Creating technical content',
  code_generation: 'Writing code from specifications',
  unknown: 'Unable to classify the problem type',
};

export type ProblemType = (typeof PROBLEM_TYPES)[number];

export const REASONING_STYLES = ['deductive', 'inductive', 'abductive', 'analogical', 'recursive', 'systems'] as const;

export const REASONING_STYLE_DESCRIPTIONS: Record<string, string> = {
  deductive: 'Reasoning from general principles to specific conclusions',
  inductive: 'Reasoning from specific observations to general rules',
  abductive: 'Reasoning to best explanation from incomplete info',
  analogical: 'Reasoning from similar known cases',
  recursive: 'Breaking problem into self-similar subproblems',
  systems: 'Thinking about component interactions and relationships',
};

export type ReasoningStyle = (typeof REASONING_STYLES)[number];

export const CONFIDENCE_TRENDS = ['improving', 'declining', 'stable', 'insufficient'] as const;

export const CONFIDENCE_TREND_DESCRIPTIONS: Record<string, string> = {
  improving: 'Confidence is increasing over time',
  declining: 'Confidence is decreasing over time',
  stable: 'Confidence is consistent',
  insufficient: 'Not enough data to determine trend',
};

export type ConfidenceTrend = (typeof CONFIDENCE_TRENDS)[number];

export const COMPLEXITY_LEVELS = ['simple', 'moderate', 'complex'] as const;

export const COMPLEXITY_DESCRIPTIONS: Record<string, string> = {
  simple: 'Straightforward, few factors to consider',
  moderate: 'Multiple factors with some tradeoffs',
  complex: 'Many factors, significant tradeoffs, requires deep analysis',
};

export type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

export const INSIGHT_TYPES = [
  'breakthrough',
  'connection',
  'pivot',
  'validation',
  'dead_end',
  'simplification',
  'pattern_recognition',
  'question_reframing',
] as const;

export const INSIGHT_TYPE_DESCRIPTIONS: Record<string, string> = {
  breakthrough: 'A major realization that changes the approach entirely',
  connection: 'Linking two previously unrelated ideas or concepts',
  pivot: 'Shifting to a completely different solution direction',
  validation: 'Confirming an approach or assumption is correct',
  dead_end: 'Recognizing the current path will not succeed',
  simplification: 'Finding a simpler solution than originally thought',
  pattern_recognition: 'Identifying a familiar pattern in the problem',
  question_reframing: 'Asking a better question that leads to progress',
};

export type InsightType = (typeof INSIGHT_TYPES)[number];

export const DOMAIN_TYPES = [
  'reasoning',
  'decision',
  'learning',
  'memory',
  'attention',
  'perception',
  'language',
  'emotion',
  'metacognition',
  'creativity',
  'problem_solving',
  'social',
  'general',
] as const;

export const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  reasoning: 'Logical thinking, deduction, induction, analysis',
  decision: 'Making choices under uncertainty',
  learning: 'Acquiring knowledge or skills',
  memory: 'Encoding, storing, retrieving information',
  attention: 'Focus, filtering, managing cognitive load',
  perception: 'Interpreting sensory information',
  language: 'Communication, comprehension, expression',
  emotion: 'Feeling states affecting cognition',
  metacognition: 'Thinking about thinking, self-awareness',
  creativity: 'Generating novel ideas',
  problem_solving: 'Goal-directed thinking',
  social: 'Understanding others, collaboration',
  general: 'General cognitive task',
};

export type DomainType = (typeof DOMAIN_TYPES)[number];

export const COGNITIVE_PROCESS_TYPES = [
  'understanding',
  'creating',
  'deciding',
  'remembering',
  'explaining',
  'predicting',
  'evaluating',
  'planning',
  'communicating',
  'transforming',
] as const;

export const COGNITIVE_PROCESS_DESCRIPTIONS: Record<string, string> = {
  understanding: 'Making sense of something, grasping meaning',
  creating: 'Generating something new, synthesis',
  deciding: 'Choosing between alternatives',
  remembering: 'Retrieving or storing information',
  explaining: 'Cause and effect, making things clear',
  predicting: 'Forecasting future outcomes',
  evaluating: 'Assessing quality, value, or merit',
  planning: 'Mapping out future actions',
  communicating: 'Conveying meaning to others',
  transforming: 'Changing form, converting, adapting',
};

export type CognitiveProcessType = (typeof COGNITIVE_PROCESS_TYPES)[number];

export const META_STATES = [
  'clarity',
  'certainty',
  'progress',
  'blockage',
  'scope_narrow',
  'scope_broad',
  'bias',
  'momentum_gaining',
  'momentum_losing',
  'stuck',
] as const;

export const META_STATE_DESCRIPTIONS: Record<string, string> = {
  clarity: 'How clear is the current thinking?',
  certainty: 'How confident/sure is the thinker?',
  progress: 'Is the thinking making forward progress?',
  blockage: 'Is the thinker stuck or blocked?',
  scope_narrow: 'Thinking is too narrow or focused',
  scope_broad: 'Thinking is too broad or scattered',
  bias: 'Potential blind spots or biases detected',
  momentum_gaining: 'Gaining momentum, productive flow',
  momentum_losing: 'Losing momentum, productivity declining',
  stuck: 'Completely stuck with no progress',
};

export const thoughtTagSchema = z
  .string()
  .min(1, 'Tag must be non-empty')
  .max(50, 'Tag must be at most 50 characters')
  .regex(/^[a-z0-9_-]+$/i, {
    message: 'Tag must contain only alphanumeric characters, underscores, and hyphens',
  });

export const thoughtMetadataSchema = z
  .object({
    category: thoughtCategorySchema.optional(),
    tags: z.array(thoughtTagSchema).max(10, 'Maximum 10 tags allowed').optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict();

export type ThoughtMetadata = z.infer<typeof thoughtMetadataSchema>;

export const thoughtDataSchema = z
  .object({
    thought: z
      .string()
      .min(1, 'Thought is required')
      .refine(
        validateThoughtContent,
        { message: 'Thought content contains invalid patterns (excessive whitespace or repeated characters)' },
      ),
    thoughtNumber: z
      .number()
      .int('thoughtNumber must be a positive integer')
      .min(THOUGHT_NUMBER_MIN, 'thoughtNumber must be a positive integer'),
    totalThoughts: z
      .number()
      .int('totalThoughts must be a positive integer')
      .min(THOUGHT_NUMBER_MIN, 'totalThoughts must be a positive integer'),
    nextThoughtNeeded: z.boolean().describe('must be a boolean'),
    isRevision: z.boolean().optional(),
    revisesThought: z
      .number()
      .int('revisesThought must be an integer')
      .min(THOUGHT_NUMBER_MIN)
      .optional(),
    branchFromThought: z
      .number()
      .int('branchFromThought must be an integer')
      .min(THOUGHT_NUMBER_MIN)
      .optional(),
    branchId: z.string().optional(),
    timestamp: z.number().optional(),
    sessionId: z.string().optional(),
    thinkingMode: thinkingModeSchema.optional(),
    metadata: thoughtMetadataSchema.optional(),
    schemaVersion: z.string().optional(),
  });

export type ThoughtData = z.infer<typeof thoughtDataSchema>;

export const thoughtDataInputSchema = thoughtDataSchema.partial({
  timestamp: true,
  sessionId: true,
});

export type ThoughtDataInput = z.infer<typeof thoughtDataInputSchema>;

export const sanitizedThoughtDataSchema = thoughtDataSchema.transform((data) => ({
  ...data,
  thought: sanitizeAndNormalizeThought(data.thought),
  sessionId: data.sessionId?.trim().toLowerCase(),
}));

export type SanitizedThoughtData = z.infer<typeof sanitizedThoughtDataSchema>;

export const getThoughtHistorySchema = z.object({
  sessionId: sessionIdSchema,
  branchId: z.string().optional(),
  limit: z
    .number()
    .int('limit must be an integer')
    .min(1, 'limit must be at least 1')
    .optional(),
});

export type GetThoughtHistoryInput = z.infer<typeof getThoughtHistorySchema>;

export const setThinkingModeSchema = z.object({
  sessionId: sessionIdSchema,
  mode: thinkingModeSchema,
});

export type SetThinkingModeInput = z.infer<typeof setThinkingModeSchema>;

export const nodeIdSchema = z
  .string()
  .min(1, 'nodeId is required')
  .max(100, 'nodeId must be at most 100 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'nodeId must be alphanumeric with optional hyphens/underscores',
  });

export const backtrackSchema = z.object({
  sessionId: rawSessionIdSchema,
  nodeId: nodeIdSchema,
});

export type BacktrackInput = z.infer<typeof backtrackSchema>;

export const evaluateThoughtSchema = z.object({
  sessionId: rawSessionIdSchema,
  nodeId: nodeIdSchema,
  value: z
    .number()
    .min(0, 'value must be at least 0')
    .max(1, 'value must be at most 1'),
});

export type EvaluateThoughtInput = z.infer<typeof evaluateThoughtSchema>;

export const suggestNextThoughtSchema = z.object({
  sessionId: rawSessionIdSchema,
  strategy: z.enum(['explore', 'exploit', 'balanced']).optional(),
});

export type SuggestNextThoughtInput = z.infer<typeof suggestNextThoughtSchema>;

export const getThinkingSummarySchema = z.object({
  sessionId: rawSessionIdSchema,
  maxDepth: z
    .number()
    .int('maxDepth must be an integer')
    .min(0, 'maxDepth must be at least 0')
    .optional(),
});

export type GetThinkingSummaryInput = z.infer<typeof getThinkingSummarySchema>;

export interface ThoughtFormatter {
  format(thought: ThoughtData): string;
}

export interface StorageStats {
  historySize: number;
  historyCapacity: number;
  branchCount: number;
  sessionCount: number;
}

export interface ThoughtStorage {
  addThought(thought: ThoughtData): void;
  getHistory(limit?: number): ThoughtData[];
  getBranches(): string[];
  getBranchThoughts(branchId: string): ThoughtData[];
  getStats(): StorageStats;
  destroy(): void;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  logThought(sessionId: string, thought: ThoughtData): void;
}

export interface SecurityService {
  validateThought(
    thought: string,
    sessionId: string,
  ): void;
  sanitizeContent(content: string): string;
  getSecurityStatus(): Record<string, unknown>;
  generateSessionId(): string;
  validateSession(sessionId: string): boolean;
}

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime: Date | null;
  requestsPerMinute: number;
}

export interface ThoughtMetrics {
  totalThoughts: number;
  averageThoughtLength: number;
  thoughtsPerMinute: number;
  revisionCount: number;
  branchCount: number;
  activeSessions: number;
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  timestamp: Date;
}

export interface MetricsCollector {
  recordRequest(duration: number, success: boolean): void;
  recordThoughtProcessed(thought: ThoughtData): void;
  getMetrics(): { requests: RequestMetrics; thoughts: ThoughtMetrics; system: SystemMetrics };
  destroy(): void;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message: string;
  details?: unknown;
  responseTime: number;
  timestamp: Date;
}

export interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: {
    memory: HealthCheckResult;
    responseTime: HealthCheckResult;
    errorRate: HealthCheckResult;
    storage: HealthCheckResult;
    security: HealthCheckResult;
  };
  summary: string;
  uptime: number;
  timestamp: Date;
}

export interface HealthChecker {
  checkHealth(): Promise<HealthStatus>;
}

export interface ServiceContainer {
  register<T>(key: string, factory: () => T): void;
  get<T>(key: string): T;
  destroy(): void;
}

export interface MCTSConfig {
  maxNodesPerTree: number;
  maxTreeAge: number;
  explorationConstant: number;
  enableAutoTree: boolean;
}

export interface TreeStats {
  totalNodes: number;
  maxDepth: number;
  unexploredCount: number;
  averageValue: number;
  terminalCount: number;
}

export interface TreeNodeInfo {
  nodeId: string;
  thoughtNumber: number;
  thought: string;
  depth: number;
  visitCount: number;
  averageValue: number;
  childCount: number;
  isTerminal: boolean;
}

export interface BacktrackResult {
  node: TreeNodeInfo;
  children: TreeNodeInfo[];
  treeStats: TreeStats;
}

export interface EvaluateResult {
  nodeId: string;
  newVisitCount: number;
  newAverageValue: number;
  nodesUpdated: number;
  treeStats: TreeStats;
}

export interface SuggestResult {
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
  treeStats: TreeStats;
}

export interface ThinkingSummary {
  bestPath: TreeNodeInfo[];
  treeStructure: unknown;
  treeStats: TreeStats;
}

export interface ThoughtTreeRecordResult {
  nodeId: string;
  parentNodeId: string | null;
  treeStats: TreeStats;
  modeGuidance?: ModeGuidance;
}

export interface ThoughtTreeService {
  recordThought(data: ThoughtData): ThoughtTreeRecordResult | null;
  backtrack(sessionId: string, nodeId: string): BacktrackResult;
  findNodeByThoughtNumber(sessionId: string, thoughtNumber: number): TreeNodeInfo | null;
  setMode(sessionId: string, mode: ThinkingMode): ThinkingModeConfig;
  getMode(sessionId: string): ThinkingModeConfig | null;
  cleanup(): void;
  destroy(): void;
}

export interface MCTSService {
  evaluate(sessionId: string, nodeId: string, value: number): EvaluateResult;
  suggest(sessionId: string, strategy?: 'explore' | 'exploit' | 'balanced'): SuggestResult;
  getSummary(sessionId: string, maxDepth?: number): ThinkingSummary;
}

export interface AppConfig {
  server: {
    name: string;
    version: string;
  };
  state: {
    maxHistorySize: number;
    maxBranchAge: number;
    maxThoughtLength: number;
    maxThoughtsPerBranch: number;
    cleanupInterval: number;
    persistence: {
      enabled: boolean;
      path: string;
      saveInterval: number;
    };
  };
  security: {
    maxThoughtsPerMinute: number;
    blockedPatterns: RegExp[];
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableColors: boolean;
    enableThoughtLogging: boolean;
  };
  monitoring: {
    enableMetrics: boolean;
    enableHealthChecks: boolean;
    healthThresholds: {
      maxMemoryPercent: number;
      maxStoragePercent: number;
      maxResponseTimeMs: number;
      errorRateDegraded: number;
      errorRateUnhealthy: number;
    };
  };
  mcts: MCTSConfig;
}
