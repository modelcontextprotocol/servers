import { ThoughtData, CircularBuffer } from './circular-buffer.js';
import { StateError } from './errors.js';

// Re-export for other modules
export { ThoughtData, CircularBuffer };

export class BranchData {
  thoughts: ThoughtData[] = [];
  createdAt: Date = new Date();
  lastAccessed: Date = new Date();
  
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
  
  getAge(): number {
    return Date.now() - this.createdAt.getTime();
  }
}

export interface StateConfig {
  maxHistorySize: number;
  maxBranchAge: number;
  maxThoughtLength: number;
  maxThoughtsPerBranch: number;
  cleanupInterval: number;
  enablePersistence: boolean;
}

export class BoundedThoughtManager {
  private readonly thoughtHistory: CircularBuffer<ThoughtData>;
  private readonly branches: Map<string, BranchData>;
  private readonly config: StateConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private readonly sessionStats: Map<string, { count: number; lastAccess: Date }> = new Map();
  
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
    
    // Add timestamp and session tracking
    thought.timestamp = Date.now();
    
    // Update session stats
    this.updateSessionStats(thought.sessionId ?? 'anonymous');
    
    // Add to main history
    this.thoughtHistory.add(thought);
    
    // Handle branch management
    if (thought.branchId) {
      const branch = this.getOrCreateBranch(thought.branchId);
      branch.addThought(thought);
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
    const stats = this.sessionStats.get(sessionId) ?? { count: 0, lastAccess: new Date() };
    stats.count++;
    stats.lastAccess = new Date();
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
  
  getSessionStats(): Record<string, { count: number; lastAccess: Date }> {
    return Object.fromEntries(this.sessionStats);
  }
  
  clearHistory(): void {
    this.thoughtHistory.clear();
    this.branches.clear();
    this.sessionStats.clear();
  }
  
  async cleanup(): Promise<void> {
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
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      for (const [sessionId, stats] of this.sessionStats.entries()) {
        if (stats.lastAccess.getTime() < oneHourAgo) {
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
        this.cleanup().catch(error => {
          console.error('Cleanup timer error:', error);
        });
      }, this.config.cleanupInterval);
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
    oldestThought?: ThoughtData;
    newestThought?: ThoughtData;
    } {
    return {
      historySize: this.thoughtHistory.currentSize,
      historyCapacity: this.config.maxHistorySize,
      branchCount: this.branches.size,
      sessionCount: this.sessionStats.size,
      oldestThought: this.thoughtHistory.getOldest(),
      newestThought: this.thoughtHistory.getNewest(),
    };
  }
  
  destroy(): void {
    this.stopCleanupTimer();
    this.clearHistory();
  }
}