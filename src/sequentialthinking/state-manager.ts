import type { ThoughtData } from './circular-buffer.js';
import { CircularBuffer } from './circular-buffer.js';
import { StateError } from './errors.js';
import { SESSION_EXPIRY_MS } from './config.js';

class BranchData {
  private thoughts: ThoughtData[] = [];
  private lastAccessed: Date = new Date();

  addThought(thought: ThoughtData): void {
    this.thoughts.push(thought);
  }

  updateLastAccessed(): void {
    this.lastAccessed = new Date();
  }

  isExpired(maxAge: number): boolean {
    return Date.now() - this.lastAccessed.getTime() > maxAge;
  }

  cleanup(maxThoughts: number): void {
    if (this.thoughts.length > maxThoughts) {
      this.thoughts = this.thoughts.slice(-maxThoughts);
    }
  }

  getThoughtCount(): number {
    return this.thoughts.length;
  }

}

interface StateConfig {
  maxHistorySize: number;
  maxBranchAge: number;
  maxThoughtLength: number;
  maxThoughtsPerBranch: number;
  cleanupInterval: number;
}

export class BoundedThoughtManager {
  private readonly thoughtHistory: CircularBuffer<ThoughtData>;
  private readonly branches: Map<string, BranchData>;
  private readonly config: StateConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly sessionStats: Map<string, { count: number; lastAccess: number }> = new Map();

  constructor(config: StateConfig) {
    this.config = config;
    this.thoughtHistory = new CircularBuffer(config.maxHistorySize);
    this.branches = new Map();
    this.startCleanupTimer();
  }

  addThought(thought: ThoughtData): void {
    // Validate input size
    if (thought.thought.length > this.config.maxThoughtLength) {
      throw new StateError(
        `Thought exceeds maximum length of ${this.config.maxThoughtLength} characters`,
        { maxLength: this.config.maxThoughtLength, actualLength: thought.thought.length },
      );
    }

    // Work on a shallow copy to avoid mutating the caller's object
    const entry = { ...thought };
    entry.timestamp = Date.now();

    // Update session stats
    this.updateSessionStats(entry.sessionId ?? 'anonymous');

    // Add to main history
    this.thoughtHistory.add(entry);

    // Handle branch management
    if (entry.branchId) {
      const branch = this.getOrCreateBranch(entry.branchId);
      branch.addThought(entry);
      branch.updateLastAccessed();

      // Enforce per-branch limits
      if (branch.getThoughtCount() > this.config.maxThoughtsPerBranch) {
        branch.cleanup(this.config.maxThoughtsPerBranch);
      }
    }
  }

  private getOrCreateBranch(branchId: string): BranchData {
    let branch = this.branches.get(branchId);
    if (!branch) {
      branch = new BranchData();
      this.branches.set(branchId, branch);
    }
    return branch;
  }

  private updateSessionStats(sessionId: string): void {
    const stats = this.sessionStats.get(sessionId) ?? { count: 0, lastAccess: Date.now() };
    stats.count++;
    stats.lastAccess = Date.now();
    this.sessionStats.set(sessionId, stats);
  }

  getHistory(limit?: number): ThoughtData[] {
    return this.thoughtHistory.getAll(limit);
  }

  getBranches(): string[] {
    return Array.from(this.branches.keys());
  }

  getBranch(branchId: string): BranchData | undefined {
    const branch = this.branches.get(branchId);
    if (branch) {
      branch.updateLastAccessed();
    }
    return branch;
  }

  clearHistory(): void {
    this.thoughtHistory.clear();
    this.branches.clear();
    this.sessionStats.clear();
  }

  cleanup(): void {
    try {
      // Clean up expired branches
      const expiredBranches: string[] = [];

      for (const [branchId, branch] of this.branches.entries()) {
        if (branch.isExpired(this.config.maxBranchAge)) {
          expiredBranches.push(branchId);
        } else {
          // Cleanup old thoughts within active branches
          branch.cleanup(this.config.maxThoughtsPerBranch);
        }
      }

      // Remove expired branches
      for (const branchId of expiredBranches) {
        this.branches.delete(branchId);
      }

      // Clean up old session stats (older than 1 hour)
      const oneHourAgo = Date.now() - SESSION_EXPIRY_MS;
      for (const [sessionId, stats] of this.sessionStats.entries()) {
        if (stats.lastAccess < oneHourAgo) {
          this.sessionStats.delete(sessionId);
        }
      }

    } catch (error) {
      throw new StateError('Cleanup operation failed', { error });
    }
  }

  private startCleanupTimer(): void {
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        try {
          this.cleanup();
        } catch (error) {
          console.error('Cleanup timer error:', error);
        }
      }, this.config.cleanupInterval);
      // Don't prevent clean process exit
      this.cleanupTimer.unref();
    }
  }

  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  getStats(): {
    historySize: number;
    historyCapacity: number;
    branchCount: number;
    sessionCount: number;
    } {
    return {
      historySize: this.thoughtHistory.currentSize,
      historyCapacity: this.config.maxHistorySize,
      branchCount: this.branches.size,
      sessionCount: this.sessionStats.size,
    };
  }

  destroy(): void {
    this.stopCleanupTimer();
    this.clearHistory();
  }
}
