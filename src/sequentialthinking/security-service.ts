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

const PRE_COMPILED_SANITIZE_PATTERNS: RegExp[] = [
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  /eval\(/gi,
  /Function\(/gi,
  /on\w+=/gi,
];

const SANITIZE_REPLACEMENTS = ['', '', '', '', ''];

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
    sessionId = '',
  ): void {
    for (const regex of this.config.blockedPatterns) {
      if (regex.test(thought)) {
        throw new SecurityError(
          `Thought contains prohibited content in session ${sessionId}`,
        );
      }
    }

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
    let result = content;
    for (let i = 0; i < PRE_COMPILED_SANITIZE_PATTERNS.length; i++) {
      result = result.replace(PRE_COMPILED_SANITIZE_PATTERNS[i], SANITIZE_REPLACEMENTS[i]);
    }
    return result;
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
