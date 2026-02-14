import type { AppConfig } from './interfaces.js';

export const SESSION_EXPIRY_MS = 3600000;

export interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  pid: number;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
}

export const RATE_LIMIT_WINDOW_MS = 60000;

function parseNumberOrDefault(
  value: string | undefined,
  parser: (v: string) => number,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  const parsed = parser(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

function parseIntOrDefault(
  value: string | undefined,
  defaultValue: number,
): number {
  return parseNumberOrDefault(value, (v) => parseInt(v, 10), defaultValue);
}

function parseFloatOrDefault(
  value: string | undefined,
  defaultValue: number,
): number {
  return parseNumberOrDefault(value, parseFloat, defaultValue);
}

export class ConfigManager {
  static load(): AppConfig {
    return {
      server: this.loadServerConfig(),
      state: this.loadStateConfig(),
      security: this.loadSecurityConfig(),
      logging: this.loadLoggingConfig(),
      monitoring: this.loadMonitoringConfig(),
      mcts: this.loadMctsConfig(),
    };
  }

  private static loadServerConfig(): AppConfig['server'] {
    return {
      name: process.env.SERVER_NAME ?? 'sequential-thinking-server',
      version: process.env.SERVER_VERSION ?? '0.6.2',
    };
  }

  private static loadStateConfig(): AppConfig['state'] {
    return {
      maxHistorySize: parseIntOrDefault(process.env.MAX_HISTORY_SIZE, 1000),
      maxBranchAge: parseIntOrDefault(process.env.MAX_BRANCH_AGE, 3600000),
      maxThoughtLength: parseIntOrDefault(process.env.MAX_THOUGHT_LENGTH, 5000),
      maxThoughtsPerBranch: parseIntOrDefault(process.env.MAX_THOUGHTS_PER_BRANCH, 100),
      cleanupInterval: parseIntOrDefault(process.env.CLEANUP_INTERVAL, 300000),
      persistence: {
        enabled: process.env.PERSISTENCE_ENABLED === 'true',
        path: process.env.PERSISTENCE_PATH ?? './data',
        saveInterval: parseIntOrDefault(process.env.PERSISTENCE_SAVE_INTERVAL, 60000),
      },
    };
  }

  private static loadSecurityConfig(): AppConfig['security'] {
    return {
      maxThoughtsPerMinute: parseIntOrDefault(process.env.MAX_THOUGHTS_PER_MIN, 60),
      blockedPatterns: this.loadBlockedPatterns(),
    };
  }

  private static loadLoggingConfig(): AppConfig['logging'] {
    const validLevels: AppConfig['logging']['level'][] = ['debug', 'info', 'warn', 'error'];
    const envLevel = process.env.LOG_LEVEL;
    const level = envLevel && validLevels.includes(envLevel as AppConfig['logging']['level'])
      ? (envLevel as AppConfig['logging']['level'])
      : 'info';
    return {
      level,
      enableColors: process.env.ENABLE_COLORS !== 'false',
      enableThoughtLogging: process.env.DISABLE_THOUGHT_LOGGING !== 'true',
    };
  }

  private static loadMonitoringConfig(): AppConfig['monitoring'] {
    return {
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
      healthThresholds: {
        maxMemoryPercent: parseIntOrDefault(process.env.HEALTH_MAX_MEMORY, 90),
        maxStoragePercent: parseIntOrDefault(process.env.HEALTH_MAX_STORAGE, 80),
        maxResponseTimeMs: parseIntOrDefault(process.env.HEALTH_MAX_RESPONSE_TIME, 200),
        errorRateDegraded: parseIntOrDefault(process.env.HEALTH_ERROR_RATE_DEGRADED, 2),
        errorRateUnhealthy: parseIntOrDefault(process.env.HEALTH_ERROR_RATE_UNHEALTHY, 5),
      },
    };
  }

  private static defaultBlockedPatterns(): RegExp[] {
    return [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
      /javascript:/i,
      /data:text\/html/i,
      /eval\s*\(/i,
      /function\s*\(/i,
      /document\./i,
      /window\./i,
      /\.php/i,
      /\.exe/i,
      /\.bat/i,
      /\.cmd/i,
    ];
  }

  private static loadBlockedPatterns(): RegExp[] {
    const patterns = process.env.BLOCKED_PATTERNS;
    if (!patterns) {
      return this.defaultBlockedPatterns();
    }

    try {
      const patternStrings = patterns.split(',').map(p => p.trim());
      return patternStrings.map(pattern => new RegExp(pattern, 'i'));
    } catch (error: unknown) {
      console.warn('Invalid BLOCKED_PATTERNS, using defaults:', error);
      return this.defaultBlockedPatterns();
    }
  }

  static validate(config: AppConfig): void {
    this.validateState(config.state);
    this.validateSecurity(config.security);
    this.validateMcts(config.mcts);
  }

  private static validateState(state: AppConfig['state']): void {
    if (state.maxHistorySize < 1 || state.maxHistorySize > 10000) {
      throw new Error('MAX_HISTORY_SIZE must be between 1 and 10000');
    }
    if (state.maxThoughtLength < 1 || state.maxThoughtLength > 100000) {
      throw new Error('maxThoughtLength must be between 1 and 100000');
    }
    if (state.maxBranchAge < 0) {
      throw new Error('maxBranchAge must be >= 0');
    }
    if (state.maxThoughtsPerBranch < 1 || state.maxThoughtsPerBranch > 10000) {
      throw new Error('maxThoughtsPerBranch must be between 1 and 10000');
    }
    if (state.cleanupInterval < 0) {
      throw new Error('cleanupInterval must be >= 0');
    }
  }

  private static validateSecurity(security: AppConfig['security']): void {
    if (security.maxThoughtsPerMinute < 1 || security.maxThoughtsPerMinute > 1000) {
      throw new Error('maxThoughtsPerMinute must be between 1 and 1000');
    }
  }

  private static loadMctsConfig(): AppConfig['mcts'] {
    return {
      maxNodesPerTree: parseIntOrDefault(process.env.MCTS_MAX_NODES, 500),
      maxTreeAge: parseIntOrDefault(process.env.MCTS_MAX_TREE_AGE, 3600000),
      explorationConstant: parseFloatOrDefault(process.env.MCTS_EXPLORATION_CONSTANT, Math.SQRT2),
      enableAutoTree: process.env.MCTS_DISABLE_AUTO_TREE !== 'true',
    };
  }

  private static validateMcts(mcts: AppConfig['mcts']): void {
    if (mcts.maxNodesPerTree < 1 || mcts.maxNodesPerTree > 100000) {
      throw new Error('MCTS_MAX_NODES must be between 1 and 100000');
    }
    if (mcts.maxTreeAge < 0) {
      throw new Error('MCTS_MAX_TREE_AGE must be >= 0');
    }
    if (mcts.explorationConstant < 0 || mcts.explorationConstant > 10) {
      throw new Error('MCTS_EXPLORATION_CONSTANT must be between 0 and 10');
    }
  }

  static getEnvironmentInfo(): EnvironmentInfo {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }
}
