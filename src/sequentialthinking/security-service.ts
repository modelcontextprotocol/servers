import { z } from 'zod';
import type { SecurityService } from './interfaces.js';
import { SecurityError } from './errors.js';

// eslint-disable-next-line no-script-url
const JS_PROTOCOL = 'javascript:';

const MAX_RATE_LIMIT_SESSIONS = 10000;
const RATE_LIMIT_WINDOW_MS = 60000;

export const SecurityServiceConfigSchema = z.object({
  maxThoughtLength: z.number().default(5000),
  maxThoughtsPerMinute: z.number().default(60),
  blockedPatterns: z.array(z.string()).default([
    'test-block',
    'forbidden',
    JS_PROTOCOL,
    'eval(',
    'Function(',
  ]),
});

type SecurityServiceConfig = z.infer<typeof SecurityServiceConfigSchema>;

export class SecureThoughtSecurity implements SecurityService {
  private readonly config: SecurityServiceConfig;
  private readonly compiledPatterns: RegExp[];
  private readonly requestLog = new Map<string, number[]>();

  constructor(
    config: SecurityServiceConfig = SecurityServiceConfigSchema.parse({}),
  ) {
    this.config = config;
    this.compiledPatterns = [];
    for (const pattern of this.config.blockedPatterns) {
      try {
        this.compiledPatterns.push(new RegExp(pattern, 'i'));
      } catch {
        // Skip malformed regex patterns
      }
    }
  }

  validateThought(
    thought: string,
    sessionId: string = '',
  ): void {
    if (thought.length > this.config.maxThoughtLength) {
      throw new SecurityError(
        `Thought exceeds maximum length of ${this.config.maxThoughtLength}`,
      );
    }

    for (const regex of this.compiledPatterns) {
      if (regex.test(thought)) {
        throw new SecurityError(
          `Thought contains prohibited content in session ${sessionId}`,
        );
      }
    }

    // Rate limiting
    if (sessionId) {
      this.checkRateLimit(sessionId);
    }
  }

  private pruneExpiredSessions(cutoff: number): void {
    // Proactively clean up sessions with no recent activity
    if (this.requestLog.size > MAX_RATE_LIMIT_SESSIONS * 0.9) {
      for (const [id, timestamps] of this.requestLog.entries()) {
        // Remove old timestamps from this session
        while (timestamps.length > 0 && timestamps[0] < cutoff) {
          timestamps.shift();
        }
        // Remove session if no requests in current window
        if (timestamps.length === 0) {
          this.requestLog.delete(id);
        }
      }
    }
  }

  private checkRateLimit(sessionId: string): void {
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;

    this.pruneExpiredSessions(cutoff);

    let timestamps = this.requestLog.get(sessionId);
    if (!timestamps) {
      timestamps = [];
      // Cap map size with FIFO eviction if needed
      if (this.requestLog.size >= MAX_RATE_LIMIT_SESSIONS) {
        // Remove oldest session (FIFO order)
        const firstKey = this.requestLog.keys().next().value;
        if (firstKey !== undefined) {
          this.requestLog.delete(firstKey);
        }
      }
      this.requestLog.set(sessionId, timestamps);
    }

    // Prune old timestamps from current session
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= this.config.maxThoughtsPerMinute) {
      throw new SecurityError('Rate limit exceeded');
    }

    timestamps.push(now);
  }

  sanitizeContent(content: string): string {
    return content
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/eval\(/gi, '')
      .replace(/Function\(/gi, '')
      .replace(/on\w+=/gi, '');
  }

  generateSessionId(): string {
    return crypto.randomUUID();
  }

  validateSession(sessionId: string): boolean {
    return sessionId.length > 0 && sessionId.length <= 100;
  }

  getSecurityStatus(
    _sessionId?: string,
  ): Record<string, unknown> {
    return {
      status: 'healthy',
      activeSessions: this.requestLog.size,
      ipConnections: 0,
      blockedPatterns: this.config.blockedPatterns.length,
    };
  }
}
