import type { AppConfig, Logger, ThoughtData } from './interfaces.js';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  service: string;
  meta?: unknown;
}

export class StructuredLogger implements Logger {
  private readonly sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'auth',
    'authorization',
    'credential',
  ];

  constructor(private readonly config: AppConfig['logging']) {}

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  private sanitize(
    obj: unknown,
    depth: number = 0,
    visited: WeakSet<object> = new WeakSet(),
  ): unknown {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (depth > 10) {
      return '[Object]';
    }

    if (visited.has(obj)) {
      return '[Circular]';
    }

    visited.add(obj);

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitize(item, depth + 1, visited));
    }

    const record = obj as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitize(value, depth + 1, visited);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private isSensitiveField(fieldName: string): boolean {
    const segments = this.splitFieldName(fieldName);
    return this.sensitiveFields.some(sensitive =>
      segments.some(segment => segment === sensitive),
    );
  }

  private splitFieldName(fieldName: string): string[] {
    // Split on common separators: underscore, hyphen, dot
    // Then split camelCase segments
    return fieldName
      .split(/[_\-.]/)
      .flatMap(part => part.replace(/([a-z])([A-Z])/g, '$1\0$2').split('\0'))
      .map(s => s.toLowerCase());
  }

  private createLogEntry(
    level: string,
    message: string,
    meta?: unknown,
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'sequential-thinking-server',
      ...(meta ? { meta: this.sanitize(meta) } : {}),
    };

    return entry;
  }

  private output(entry: LogEntry): void {
    // All output to stderr — MCP reserves stdout for JSON-RPC protocol
    console.error(JSON.stringify(entry));
  }

  info(message: string, meta?: unknown): void {
    if (!this.shouldLog('info')) return;

    const entry = this.createLogEntry('info', message, meta);
    this.output(entry);
  }

  error(message: string, error?: unknown): void {
    if (!this.shouldLog('error')) return;

    let meta: Record<string, unknown> | undefined;
    if (error instanceof Error) {
      meta = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      };
    } else if (error) {
      meta = { error };
    }

    const entry = this.createLogEntry('error', message, meta);
    this.output(entry);
  }

  debug(message: string, meta?: unknown): void {
    if (!this.shouldLog('debug')) return;

    const entry = this.createLogEntry('debug', message, meta);
    this.output(entry);
  }

  warn(message: string, meta?: unknown): void {
    if (!this.shouldLog('warn')) return;

    const entry = this.createLogEntry('warn', message, meta);
    this.output(entry);
  }

  // Context-specific logging methods
  logThought(sessionId: string, thought: ThoughtData): void {
    if (!this.shouldLog('debug')) return;

    const logEntry = {
      sessionId,
      thoughtNumber: thought.thoughtNumber,
      totalThoughts: thought.totalThoughts,
      isRevision: thought.isRevision,
      branchId: thought.branchId,
      thoughtLength: thought.thought.length,
      hasContent: !!thought.thought,
    };

    this.debug('Thought processed', logEntry);
  }

}
