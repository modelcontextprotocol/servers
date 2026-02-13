import type { ThoughtData, ThoughtStorage } from './interfaces.js';
import { CircularBuffer } from './circular-buffer.js';
import type { SessionTracker } from './session-tracker.js';

class BranchData {
  private thoughts: ThoughtData[] = [];
  private lastAccessed: number = Date.now();

  addThought(thought: ThoughtData): void {
    this.thoughts.push(thought);
  }

  updateLastAccessed(): void {
    this.lastAccessed = Date.now();
  }

  isExpired(maxAge: number): boolean {
    return Date.now() - this.lastAccessed > maxAge;
  }

  cleanup(maxThoughts: number): void {
    if (this.thoughts.length > maxThoughts) {
      this.thoughts = this.thoughts.slice(-maxThoughts);
    }
  }

  getThoughtCount(): number {
    return this.thoughts.length;
  }

  getThoughts(): ThoughtData[] {
    return [...this.thoughts];
  }
}

interface StateConfig {
  maxHistorySize: number;
  maxBranchAge: number;
  maxThoughtsPerBranch: number;
  cleanupInterval: number;
}

export class BoundedThoughtManager implements ThoughtStorage {
  private readonly thoughtHistory: CircularBuffer<ThoughtData>;
  private readonly branches: Map<string, BranchData>;
  private readonly config: StateConfig;
  private readonly sessionTracker: SessionTracker;

  constructor(config: StateConfig, sessionTracker: SessionTracker) {
    this.config = config;
    this.sessionTracker = sessionTracker;
    this.thoughtHistory = new CircularBuffer(config.maxHistorySize);
    this.branches = new Map();
    sessionTracker.onPeriodicCleanup(() => this.cleanup());
  }

  addThought(thought: ThoughtData): void {
    // Length validation happens in lib.ts before reaching here
    // Work on a shallow copy to avoid mutating the caller's object
    const entry = { ...thought };

    // Session recording now happens atomically in security validation
    // to prevent race conditions

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

  getHistory(limit?: number): ThoughtData[] {
    return this.thoughtHistory.getAll(limit);
  }

  getBranches(): string[] {
    return Array.from(this.branches.keys());
  }

  getBranchThoughts(branchId: string): ThoughtData[] {
    const branch = this.branches.get(branchId);
    if (!branch) return [];
    return branch.getThoughts();
  }

  clearHistory(): void {
    this.thoughtHistory.clear();
    this.branches.clear();
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

      // Session cleanup is now handled by SessionTracker

    } catch (error) {
      console.error('Cleanup operation failed', error);
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
      sessionCount: this.sessionTracker.getActiveSessionCount(),
    };
  }

  destroy(): void {
    this.thoughtHistory.clear();
    this.branches.clear();
  }
}
