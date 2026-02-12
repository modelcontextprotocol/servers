import type { ThoughtData } from './circular-buffer.js';

export type { ThoughtData };

export interface ThoughtFormatter {
  format(thought: ThoughtData): string;
  formatHeader?(thought: ThoughtData): string;
  formatBody?(thought: ThoughtData): string;
}

export interface StorageStats {
  historySize: number;
  historyCapacity: number;
  branchCount: number;
  sessionCount: number;
  oldestThought?: ThoughtData;
  newestThought?: ThoughtData;
}

export interface ThoughtStorage {
  addThought(thought: ThoughtData): void;
  getHistory(limit?: number): ThoughtData[];
  getBranches(): string[];
  getBranch(branchId: string): Record<string, unknown> | undefined;
  clearHistory(): void;
  cleanup(): Promise<void>;
  getStats(): StorageStats;
  destroy?(): void;
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error | unknown): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  logThought(sessionId: string, thought: ThoughtData): void;
  logPerformance(
    operation: string,
    duration: number,
    success: boolean,
  ): void;
  logSecurityEvent(
    event: string,
    sessionId: string,
    details: Record<string, unknown>,
  ): void;
}

export interface SecurityService {
  validateThought(
    thought: string,
    sessionId: string,
    origin?: string,
    ipAddress?: string,
  ): void;
  sanitizeContent(content: string): string;
  cleanupSession(sessionId: string): void;
  getSecurityStatus(
    sessionId?: string,
  ): Record<string, unknown>;
  generateSessionId(): string;
  validateSession(sessionId: string): boolean;
}

export interface ErrorHandler {
  handle(error: Error): {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    statusCode?: number;
  };
}

export interface MetricsCollector {
  recordRequest(duration: number, success: boolean): void;
  recordError(error: Error): void;
  recordThoughtProcessed(thought: ThoughtData): void;
  getMetrics(): Record<string, unknown>;
}

export interface HealthChecker {
  checkHealth(): Promise<Record<string, unknown>>;
}

export interface CircuitBreaker {
  execute<T>(operation: () => Promise<T>): Promise<T>;
  getState(): string;
}

export interface ServiceContainer {
  register<T>(key: string, factory: () => T): void;
  get<T>(key: string): T;
  has(key: string): boolean;
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
    enablePersistence: boolean;
  };
  security: {
    maxThoughtLength: number;
    maxThoughtsPerMinute: number;
    maxThoughtsPerHour: number;
    maxConcurrentSessions: number;
    blockedPatterns: RegExp[];
    allowedOrigins: string[];
    enableContentSanitization: boolean;
    maxSessionsPerIP: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableColors: boolean;
    sanitizeContent: boolean;
  };
  monitoring: {
    enableMetrics: boolean;
    enableHealthChecks: boolean;
    metricsInterval: number;
  };
}
