import { z } from 'zod';
import type { SecurityService } from './interfaces.js';
import { SecurityError } from './errors.js';

// eslint-disable-next-line no-script-url
const JS_PROTOCOL = 'javascript:';

export const SecurityServiceConfigSchema = z.object({
  enableContentSanitization: z.boolean().default(true),
  blockDangerousPatterns: z.array(z.string()).default([
    '<script',
    'forbidden',
    JS_PROTOCOL,
  ]),
  maxThoughtLength: z.number().default(5000),
  maxThoughtsPerMinute: z.number().default(10),
  maxConcurrentSessions: z.number().default(10),
  maxSessionsPerIP: z.number().default(3),
  blockedPatterns: z.array(z.string()).default([
    'test-block',
    'forbidden',
    JS_PROTOCOL,
    'eval(',
    'Function(',
  ]),
  allowedOrigins: z.array(z.string()).default([
    'http://localhost:3000',
    'https://example.com',
  ]),
  enableRateLimiting: z.boolean().default(true),
  rateLimiting: z
    .object({
      enabled: z.boolean().default(true),
      maxRequests: z.number().default(1000),
      windowMs: z.number().default(60000),
    })
    .default({}),
});

export type SecurityServiceConfig = z.infer<typeof SecurityServiceConfigSchema>;

export class SecureThoughtSecurity implements SecurityService {
  private readonly config: SecurityServiceConfig;

  constructor(
    config: SecurityServiceConfig = SecurityServiceConfigSchema.parse({}),
  ) {
    this.config = config;
  }

  validateThought(
    thought: string,
    sessionId: string = '',
    _origin: string = '',
    _ipAddress: string = '',
  ): void {
    if (thought.length > this.config.maxThoughtLength) {
      throw new SecurityError(
        `Thought exceeds maximum length of ${this.config.maxThoughtLength}`,
      );
    }

    for (const pattern of this.config.blockedPatterns) {
      if (thought.includes(pattern)) {
        throw new SecurityError(
          `Thought contains prohibited content in session ${sessionId}`,
        );
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

  cleanupSession(_sessionId: string): void {
    // No per-session state in this simple implementation
  }

  generateSessionId(): string {
    return 'session-' + Math.random().toString(36).substring(2, 15);
  }

  validateSession(sessionId: string): boolean {
    return sessionId.length > 0 && sessionId.length <= 100;
  }

  getSecurityStatus(
    _sessionId?: string,
  ): Record<string, unknown> {
    return {
      status: 'healthy',
      activeSessions: 0,
      ipConnections: 0,
      blockedPatterns: this.config.blockedPatterns.length,
    };
  }
}
