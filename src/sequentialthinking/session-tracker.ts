import { SESSION_EXPIRY_MS } from './config.js';

interface SessionData {
  lastAccess: number;
  thoughtCount: number;
  rateTimestamps: number[]; // For rate limiting (60s window)
}

const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_TRACKED_SESSIONS = 10000;

/**
 * Centralized session tracking for state, security, and metrics.
 * Replaces three separate Maps with unified expiry logic.
 */
export class SessionTracker {
  private readonly sessions = new Map<string, SessionData>();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(cleanupInterval: number = 60000) {
    if (cleanupInterval > 0) {
      this.startCleanupTimer(cleanupInterval);
    }
  }

  /**
   * Record a thought for a session. Updates timestamp and count.
   */
  recordThought(sessionId: string): void {
    const now = Date.now();
    const session = this.sessions.get(sessionId) ?? {
      lastAccess: now,
      thoughtCount: 0,
      rateTimestamps: [],
    };

    session.lastAccess = now;
    session.thoughtCount++;
    session.rateTimestamps.push(now);

    this.sessions.set(sessionId, session);

    // Proactive cleanup when approaching limit
    if (this.sessions.size > MAX_TRACKED_SESSIONS * 0.9) {
      this.cleanup();
    }
  }

  /**
   * Check if session exceeds rate limit for given window.
   * Returns true if within limit, throws if exceeded.
   */
  checkRateLimit(sessionId: string, maxRequests: number): boolean {
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;

    const session = this.sessions.get(sessionId);
    if (!session) {
      return true; // New session, no history
    }

    // Prune old timestamps from rate window
    while (session.rateTimestamps.length > 0 && session.rateTimestamps[0] < cutoff) {
      session.rateTimestamps.shift();
    }

    return session.rateTimestamps.length < maxRequests;
  }

  /**
   * Get count of active sessions (accessed within expiry window).
   */
  getActiveSessionCount(): number {
    const now = Date.now();
    const cutoff = now - SESSION_EXPIRY_MS;
    let count = 0;

    for (const session of this.sessions.values()) {
      if (session.lastAccess >= cutoff) {
        count++;
      }
    }

    return count;
  }


  /**
   * Clean up expired sessions (older than 1 hour).
   */
  cleanup(): void {
    const now = Date.now();
    const cutoff = now - SESSION_EXPIRY_MS;
    const rateCutoff = now - RATE_LIMIT_WINDOW_MS;

    for (const [id, session] of this.sessions.entries()) {
      // Remove sessions with no activity in 1 hour
      if (session.lastAccess < cutoff) {
        this.sessions.delete(id);
        continue;
      }

      // Prune old rate timestamps
      while (session.rateTimestamps.length > 0 && session.rateTimestamps[0] < rateCutoff) {
        session.rateTimestamps.shift();
      }
    }

    // If still at capacity, remove oldest sessions (FIFO)
    if (this.sessions.size >= MAX_TRACKED_SESSIONS) {
      const entriesToRemove = this.sessions.size - MAX_TRACKED_SESSIONS + 100;
      const sortedSessions = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess)
        .slice(0, entriesToRemove);

      for (const [id] of sortedSessions) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Clear all session data.
   */
  clear(): void {
    this.sessions.clear();
  }

  private startCleanupTimer(interval: number): void {
    this.cleanupTimer = setInterval(() => {
      try {
        this.cleanup();
      } catch (error) {
        console.error('Session cleanup error:', error);
      }
    }, interval);
    this.cleanupTimer.unref();
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
  }
}
