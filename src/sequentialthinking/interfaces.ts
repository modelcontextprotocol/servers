import type { ThoughtData } from './circular-buffer.js';

export type { ThoughtData };

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
  getSecurityStatus(
    sessionId?: string,
  ): Record<string, unknown>;
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
  recordError(error: Error): void;
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
}
