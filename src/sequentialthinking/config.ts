import type { AppConfig } from './interfaces.js';

interface EnvironmentInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  pid: number;
  memoryUsage: NodeJS.MemoryUsage;
  uptime: number;
}

export class ConfigManager {
  static load(): AppConfig {
    return {
      server: this.loadServerConfig(),
      state: this.loadStateConfig(),
      security: this.loadSecurityConfig(),
      logging: this.loadLoggingConfig(),
      monitoring: this.loadMonitoringConfig(),
    };
  }

  private static loadServerConfig(): AppConfig['server'] {
    return {
      name: process.env.SERVER_NAME ?? 'sequential-thinking-server',
      version: process.env.SERVER_VERSION ?? '1.0.0',
    };
  }

  private static loadStateConfig(): AppConfig['state'] {
    return {
      maxHistorySize: parseInt(process.env.MAX_HISTORY_SIZE ?? '1000', 10),
      maxBranchAge: parseInt(process.env.MAX_BRANCH_AGE ?? '3600000', 10), // 1 hour
      maxThoughtLength: parseInt(process.env.MAX_THOUGHT_LENGTH ?? '5000', 10),
      maxThoughtsPerBranch: parseInt(process.env.MAX_THOUGHTS_PER_BRANCH ?? '100', 10),
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL ?? '300000', 10), // 5 minutes
      enablePersistence: process.env.ENABLE_PERSISTENCE === 'true',
    };
  }

  private static loadSecurityConfig(): AppConfig['security'] {
    return {
      maxThoughtLength: parseInt(process.env.MAX_THOUGHT_LENGTH ?? '5000', 10),
      maxThoughtsPerMinute: parseInt(process.env.MAX_THOUGHTS_PER_MIN ?? '60', 10),
      maxThoughtsPerHour: parseInt(process.env.MAX_THOUGHTS_PER_HOUR ?? '1000', 10),
      maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS ?? '100', 10),
      blockedPatterns: this.loadBlockedPatterns(),
      allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '*').split(',').map(o => o.trim()),
      enableContentSanitization: process.env.SANITIZE_CONTENT !== 'false',
      maxSessionsPerIP: parseInt(process.env.MAX_SESSIONS_PER_IP ?? '5', 10),
    };
  }

  private static loadLoggingConfig(): AppConfig['logging'] {
    return {
      level: (process.env.LOG_LEVEL as AppConfig['logging']['level']) ?? 'info',
      enableColors: process.env.ENABLE_COLORS !== 'false',
      sanitizeContent: process.env.SANITIZE_LOGS !== 'false',
    };
  }

  private static loadMonitoringConfig(): AppConfig['monitoring'] {
    return {
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
      enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS !== 'false',
      metricsInterval: parseInt(process.env.METRICS_INTERVAL ?? '60000', 10), // 1 minute
    };
  }

  private static loadBlockedPatterns(): RegExp[] {
    const patterns = process.env.BLOCKED_PATTERNS;
    if (!patterns) {
      // Default patterns for security
      return [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /data:text\/html/gi,
        /eval\s*\(/gi,
        /function\s*\(/gi,
        /document\./gi,
        /window\./gi,
        /\.php/gi,
        /\.exe/gi,
        /\.bat/gi,
        /\.cmd/gi,
      ];
    }

    try {
      const patternStrings = patterns.split(',').map(p => p.trim());
      return patternStrings.map(pattern => new RegExp(pattern, 'gi'));
    } catch (error: unknown) {
      console.warn('Invalid BLOCKED_PATTERNS, using defaults:', error);
      return this.loadBlockedPatterns(); // Recursively return defaults
    }
  }

  static validate(config: AppConfig): void {
    // Validate critical configuration values
    if (config.state.maxHistorySize < 1 || config.state.maxHistorySize > 10000) {
      throw new Error('MAX_HISTORY_SIZE must be between 1 and 10000');
    }

    if (config.security.maxThoughtLength < 1 || config.security.maxThoughtLength > 100000) {
      throw new Error('maxThoughtLength must be between 1 and 100000');
    }

    if (config.security.maxThoughtsPerMinute < 1 || config.security.maxThoughtsPerMinute > 1000) {
      throw new Error('maxThoughtsPerMinute must be between 1 and 1000');
    }

    if (config.security.maxThoughtsPerHour < 1 || config.security.maxThoughtsPerHour > 10000) {
      throw new Error('maxThoughtsPerHour must be between 1 and 10000');
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
