import type { ThinkingMode, ThinkingModeConfig, ModeGuidance } from './thinking-modes.js';
export type { ThinkingMode, ThinkingModeConfig, ModeGuidance };
export { VALID_THINKING_MODES } from './thinking-modes.js';

export interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  nextThoughtNeeded: boolean;
  timestamp?: number;
  sessionId?: string;
  thinkingMode?: string;
}

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
