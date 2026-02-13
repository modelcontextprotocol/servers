import type { SecurityService } from './interfaces.js';
import { SecurityError } from './errors.js';
import type { SessionTracker } from './session-tracker.js';

export interface SecurityServiceConfig {
  maxThoughtLength: number;
  maxThoughtsPerMinute: number;
  blockedPatterns: RegExp[];
}

const DEFAULT_CONFIG: SecurityServiceConfig = {
  maxThoughtLength: 5000,
  maxThoughtsPerMinute: 60,
  blockedPatterns: [
    /test-block/i,
    /forbidden/i,
    /javascript:/i,
    /eval\s*\(/i,
    /Function\s*\(/i,
  ],
};

export class SecureThoughtSecurity implements SecurityService {
  private readonly config: SecurityServiceConfig;
  private readonly sessionTracker: SessionTracker;

  constructor(
    config: Partial<SecurityServiceConfig> = {},
    sessionTracker: SessionTracker,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sessionTracker = sessionTracker;
  }

  validateThought(
    thought: string,
    sessionId: string = '',
  ): void {
    // Check for blocked patterns (length validation happens in lib.ts)
    for (const regex of this.config.blockedPatterns) {
      if (regex.test(thought)) {
        throw new SecurityError(
          `Thought contains prohibited content in session ${sessionId}`,
        );
      }
    }

    // Rate limiting: single atomic check-and-record to prevent race conditions
    if (sessionId) {
      const withinLimit = this.sessionTracker.checkAndRecordThought(
        sessionId,
        this.config.maxThoughtsPerMinute,
      );
      if (!withinLimit) {
        throw new SecurityError('Rate limit exceeded');
      }
    }
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

  getSecurityStatus(): Record<string, unknown> {
    return {
      status: 'healthy',
      activeSessions: this.sessionTracker.getActiveSessionCount(),
      blockedPatterns: this.config.blockedPatterns.length,
    };
  }
}
