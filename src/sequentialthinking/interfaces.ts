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

export const thinkingModeSchema = z.enum(VALID_THINKING_MODES);

export const THOUGHT_CATEGORIES = [
  'analysis',
  'hypothesis',
  'conclusion',
  'question',
  'reflection',
  'planning',
  'evaluation',
] as const;

export type ThoughtCategory = (typeof THOUGHT_CATEGORIES)[number];

export const thoughtCategorySchema = z.enum(THOUGHT_CATEGORIES);

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
    nextThoughtNeeded: z.boolean({
      invalid_type_error: 'nextThoughtNeeded must be a boolean',
    }),
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
