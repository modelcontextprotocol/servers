import { SESSION_EXPIRY_MS, RATE_LIMIT_WINDOW_MS } from './config.js';

interface SessionData {
  lastAccess: number;
  rateTimestamps: number[]; // For rate limiting (60s window)
}
const MAX_TRACKED_SESSIONS = 10000;

/** Remove all timestamps before cutoff in O(n) instead of O(n²) shift loop. */
function pruneTimestamps(timestamps: number[], cutoff: number): void {
  const firstValid = timestamps.findIndex(ts => ts >= cutoff);
  if (firstValid > 0) {
    timestamps.splice(0, firstValid);
  } else if (firstValid === -1 && timestamps.length > 0) {
    timestamps.length = 0;
  }
}

/**
 * Centralized session tracking for state, security, and metrics.
 * Replaces three separate Maps with unified expiry logic.
 */
export class SessionTracker {
  private readonly sessions = new Map<string, SessionData>();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly evictionCallbacks: Array<(sessionIds: string[]) => void> = [];
  private readonly periodicCleanupCallbacks: Array<() => void> = [];

  onEviction(callback: (sessionIds: string[]) => void): void {
    this.evictionCallbacks.push(callback);
  }

  onPeriodicCleanup(callback: () => void): void {
    this.periodicCleanupCallbacks.push(callback);
  }

  constructor(cleanupInterval = 60000) {
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
      rateTimestamps: [],
    };

    session.lastAccess = now;
    session.rateTimestamps.push(now);

    this.sessions.set(sessionId, session);

    // Proactive cleanup when approaching limit
    if (this.sessions.size > MAX_TRACKED_SESSIONS * 0.9) {
      this.cleanup();
    }
  }

  /**
   * Atomically check rate limit and record the thought if within limit.
   * Closes the race condition between separate check + record calls.
   * Returns true if within limit (and thought was recorded), false if exceeded.
   */
  checkAndRecordThought(sessionId: string, maxRequests: number): boolean {
    const now = Date.now();
    const cutoff = now - RATE_LIMIT_WINDOW_MS;

    const session = this.sessions.get(sessionId) ?? {
      lastAccess: now,
      rateTimestamps: [],
    };

    pruneTimestamps(session.rateTimestamps, cutoff);

    if (session.rateTimestamps.length >= maxRequests) {
      return false;
    }

    // Atomically record: update access + push timestamp in one operation
    session.lastAccess = now;
    session.rateTimestamps.push(now);
    this.sessions.set(sessionId, session);

    if (this.sessions.size > MAX_TRACKED_SESSIONS * 0.9) {
      this.cleanup();
    }

    return true;
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
    const evictedIds: string[] = [];

    for (const [id, session] of this.sessions.entries()) {
      // Remove sessions with no activity in 1 hour
      if (session.lastAccess < cutoff) {
        this.sessions.delete(id);
        evictedIds.push(id);
        continue;
      }

      pruneTimestamps(session.rateTimestamps, rateCutoff);
    }

    // If still at capacity, remove oldest sessions (FIFO)
    if (this.sessions.size >= MAX_TRACKED_SESSIONS) {
      const entriesToRemove = this.sessions.size - MAX_TRACKED_SESSIONS + 100;
      const sortedSessions = Array.from(this.sessions.entries())
        .sort((a, b) => a[1].lastAccess - b[1].lastAccess)
        .slice(0, entriesToRemove);

      for (const [id] of sortedSessions) {
        this.sessions.delete(id);
        evictedIds.push(id);
      }
    }

    // Notify subscribers of evicted sessions
    if (evictedIds.length > 0) {
      for (const callback of this.evictionCallbacks) {
        try {
          callback(evictedIds);
        } catch (error) {
          console.error('Eviction callback error:', error);
        }
      }
    }

    // Invoke periodic cleanup subscribers
    for (const callback of this.periodicCleanupCallbacks) {
      try {
        callback();
      } catch (error) {
        console.error('Periodic cleanup callback error:', error);
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

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  destroy(): void {
    this.stopCleanupTimer();
    this.clear();
    this.evictionCallbacks.length = 0;
    this.periodicCleanupCallbacks.length = 0;
  }
}
