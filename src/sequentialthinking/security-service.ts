import { z } from 'zod';
import type { SecurityService } from './interfaces.js';
import { SecurityError } from './errors.js';
import type { SessionTracker } from './session-tracker.js';

// eslint-disable-next-line no-script-url
const JS_PROTOCOL = 'javascript:';

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
  private readonly sessionTracker: SessionTracker;

  constructor(
    config: SecurityServiceConfig = SecurityServiceConfigSchema.parse({}),
    sessionTracker: SessionTracker,
  ) {
    this.config = config;
    this.sessionTracker = sessionTracker;
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
    // Check for blocked patterns (length validation happens in lib.ts)
    for (const regex of this.compiledPatterns) {
      if (regex.test(thought)) {
        throw new SecurityError(
          `Thought contains prohibited content in session ${sessionId}`,
        );
      }
    }

    // Rate limiting: check AND record atomically to prevent race conditions
    if (sessionId) {
      const withinLimit = this.sessionTracker.checkRateLimit(
        sessionId,
        this.config.maxThoughtsPerMinute,
      );
      if (!withinLimit) {
        throw new SecurityError('Rate limit exceeded');
      }
      // IMMEDIATELY record the thought to prevent race condition
      // between validation and storage
      this.sessionTracker.recordThought(sessionId);
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

  getSecurityStatus(
    _sessionId?: string,
  ): Record<string, unknown> {
    return {
      status: 'healthy',
      activeSessions: this.sessionTracker.getActiveSessionCount(),
      ipConnections: 0,
      blockedPatterns: this.config.blockedPatterns.length,
    };
  }
}
