import { RateLimitError, SecurityError } from './errors.js';

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  
  constructor(
    private readonly capacity: number,
    private readonly refillRate: number, // tokens per second
    private readonly windowMs: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  consume(tokens: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
  
  getTimeUntilAvailable(tokens: number = 1): number {
    this.refill();
    
    if (this.tokens >= tokens) {
      return 0;
    }
    
    const tokensNeeded = tokens - this.tokens;
    const timeNeeded = (tokensNeeded / this.refillRate) * 1000;
    return Math.ceil(timeNeeded);
  }
  
  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = (timePassed / 1000) * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
  
  getStatus(): {
    available: number;
    capacity: number;
    refillRate: number;
    timeUntilAvailable: number;
    } {
    this.refill();
    return {
      available: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
      timeUntilAvailable: this.getTimeUntilAvailable(1),
    };
  }
}

export interface SecurityConfig {
  maxThoughtLength: number;
  maxThoughtsPerMinute: number;
  maxThoughtsPerHour: number;
  maxConcurrentSessions: number;
  blockedPatterns: RegExp[];
  allowedOrigins: string[];
  enableContentSanitization: boolean;
  maxSessionsPerIP: number;
}

export class SecurityValidator {
  private readonly rateLimiters: Map<string, TokenBucket> = new Map();
  private readonly hourlyLimiters: Map<string, TokenBucket> = new Map();
  private readonly ipSessions: Map<string, number> = new Map();
  private readonly sessionOrigins: Map<string, string> = new Map();
  
  constructor(private readonly config: SecurityConfig) {}
  
  validateThought(
    thought: string,
    sessionId: string,
    origin?: string,
    ipAddress?: string,
  ): void {
    this.validateContent(thought, sessionId);
    this.validateOriginAndIp(sessionId, origin, ipAddress);
    this.checkRateLimits(sessionId);
  }

  private validateContent(
    thought: string,
    sessionId: string,
  ): void {
    if (thought.length > this.config.maxThoughtLength) {
      throw new SecurityError(
        `Thought exceeds maximum length of ${this.config.maxThoughtLength} characters`,
        {
          maxLength: this.config.maxThoughtLength,
          actualLength: thought.length,
          sessionId,
        },
      );
    }

    for (const pattern of this.config.blockedPatterns) {
      if (pattern.test(thought)) {
        throw new SecurityError(
          'Thought contains prohibited content',
          {
            pattern: pattern.source,
            sessionId,
            timestamp: Date.now(),
          },
        );
      }
    }
  }

  private validateOriginAndIp(
    sessionId: string,
    origin?: string,
    ipAddress?: string,
  ): void {
    if (origin && this.config.allowedOrigins.length > 0) {
      const isAllowed = this.config.allowedOrigins.includes('*')
        || this.config.allowedOrigins.includes(origin);

      if (!isAllowed) {
        throw new SecurityError(
          'Origin not allowed',
          {
            origin,
            allowedOrigins: this.config.allowedOrigins,
            sessionId,
          },
        );
      }

      this.sessionOrigins.set(sessionId, origin);
    }

    if (ipAddress) {
      const sessionCount = this.ipSessions.get(ipAddress) ?? 0;
      if (sessionCount >= this.config.maxSessionsPerIP) {
        throw new SecurityError(
          'Too many sessions from this IP address',
          {
            ipAddress,
            sessionCount,
            maxSessions: this.config.maxSessionsPerIP,
            sessionId,
          },
        );
      }

      this.ipSessions.set(ipAddress, sessionCount + 1);
    }
  }
  
  private checkRateLimits(sessionId: string): void {
    // Per-minute rate limiting
    const minuteBucket = this.getOrCreateMinuteLimiter(sessionId);
    if (!minuteBucket.consume(1)) {
      const retryAfter = minuteBucket.getTimeUntilAvailable(1);
      throw new RateLimitError(
        `Rate limit exceeded: maximum ${this.config.maxThoughtsPerMinute} thoughts per minute`,
        retryAfter,
      );
    }
    
    // Per-hour rate limiting
    const hourBucket = this.getOrCreateHourLimiter(sessionId);
    if (!hourBucket.consume(1)) {
      const retryAfter = hourBucket.getTimeUntilAvailable(1);
      throw new RateLimitError(
        `Rate limit exceeded: maximum ${this.config.maxThoughtsPerHour} thoughts per hour`,
        retryAfter,
      );
    }
  }
  
  private getOrCreateMinuteLimiter(sessionId: string): TokenBucket {
    let bucket = this.rateLimiters.get(sessionId);
    if (!bucket) {
      bucket = new TokenBucket(
        this.config.maxThoughtsPerMinute,
        this.config.maxThoughtsPerMinute / 60, // tokens per second
        60 * 1000, // 1 minute window
      );
      this.rateLimiters.set(sessionId, bucket);
      
      // Cleanup old limiters periodically
      this.scheduleCleanup(sessionId, 'minute');
    }
    return bucket;
  }
  
  private getOrCreateHourLimiter(sessionId: string): TokenBucket {
    let bucket = this.hourlyLimiters.get(sessionId);
    if (!bucket) {
      bucket = new TokenBucket(
        this.config.maxThoughtsPerHour,
        this.config.maxThoughtsPerHour / 3600, // tokens per second
        60 * 60 * 1000, // 1 hour window
      );
      this.hourlyLimiters.set(sessionId, bucket);
      
      // Cleanup old limiters periodically
      this.scheduleCleanup(sessionId, 'hour');
    }
    return bucket;
  }
  
  private scheduleCleanup(sessionId: string, type: 'minute' | 'hour'): void {
    const delay = type === 'minute' ? 5 * 60 * 1000 : 65 * 60 * 1000; // 5 min or 65 min
    setTimeout(() => {
      this.cleanupRateLimiter(sessionId, type);
    }, delay);
  }
  
  private cleanupRateLimiter(sessionId: string, type: 'minute' | 'hour'): void {
    if (type === 'minute') {
      this.rateLimiters.delete(sessionId);
    } else {
      this.hourlyLimiters.delete(sessionId);
    }
  }
  
  cleanupSession(sessionId: string): void {
    this.rateLimiters.delete(sessionId);
    this.hourlyLimiters.delete(sessionId);
    this.sessionOrigins.delete(sessionId);
    
    // Decrement IP session count
    for (const [ip, count] of this.ipSessions.entries()) {
      if (count > 0) {
        this.ipSessions.set(ip, count - 1);
      }
    }
  }
  
  sanitizeContent(content: string): string {
    if (!this.config.enableContentSanitization) {
      return content;
    }
    
    // Remove potentially dangerous patterns
    let sanitized = content;
    
    // Remove script tags and JavaScript protocols
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '[SCRIPT_REMOVED]');
    sanitized = sanitized.replace(/javascript:/gi, '[JS_REMOVED]');
    
    // Remove potential SQL injection patterns
    sanitized = sanitized.replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\b)/gi, '[SQL_REMOVED]');
    
    // Remove potential path traversal
    sanitized = sanitized.replace(/\.\.[/\\]/g, '[PATH_REMOVED]');
    
    // Limit consecutive characters to prevent DoS
    sanitized = sanitized.replace(/(.)\1{50,}/g, '$1'.repeat(50) + '[TRUNCATED]');
    
    return sanitized;
  }
  
  getSecurityStatus(sessionId?: string): Record<string, unknown> {
    const status = {
      activeSessions: this.rateLimiters.size,
      ipConnections: Array.from(this.ipSessions.values()).reduce((sum, count) => sum + count, 0),
      blockedPatterns: this.config.blockedPatterns.length,
      rateLimitStatus: sessionId ? {
        minute: this.rateLimiters.get(sessionId)?.getStatus(),
        hour: this.hourlyLimiters.get(sessionId)?.getStatus(),
      } : undefined,
    };
    
    return status;
  }
}