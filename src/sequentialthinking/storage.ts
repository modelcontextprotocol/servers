import type { AppConfig, StorageStats } from './interfaces.js';
import { ThoughtStorage, ThoughtData } from './interfaces.js';
import { BoundedThoughtManager } from './state-manager.js';

// Re-export for other modules
export { ThoughtStorage, ThoughtData };

export class SecureThoughtStorage implements ThoughtStorage {
  private readonly manager: BoundedThoughtManager;
  
  constructor(config: AppConfig['state']) {
    this.manager = new BoundedThoughtManager(config);
  }
  
  addThought(thought: ThoughtData): void {
    // Ensure session ID for tracking
    if (!thought.sessionId) {
      thought.sessionId = 'anonymous-' + Math.random().toString(36).substring(2);
    }
    
    this.manager.addThought(thought);
  }
  
  getHistory(limit?: number): ThoughtData[] {
    return this.manager.getHistory(limit);
  }
  
  getBranches(): string[] {
    return this.manager.getBranches();
  }
  
  getBranch(
    branchId: string,
  ): Record<string, unknown> | undefined {
    const branch = this.manager.getBranch(branchId);
    if (!branch) return undefined;
    return { ...branch } as Record<string, unknown>;
  }
  
  clearHistory(): void {
    this.manager.clearHistory();
  }
  
  async cleanup(): Promise<void> {
    await this.manager.cleanup();
  }
  
  getStats(): StorageStats {
    return this.manager.getStats();
  }
  
  // Additional security-focused methods
  getSessionHistory(sessionId: string, limit?: number): ThoughtData[] {
    const allHistory = this.getHistory();
    const sessionHistory = allHistory.filter(thought => thought.sessionId === sessionId);
    return limit ? sessionHistory.slice(-limit) : sessionHistory;
  }
  
  getThoughtStats(): {
    totalThoughts: number;
    averageThoughtLength: number;
    sessionCount: number;
    branchCount: number;
    revisionCount: number;
    } {
    const history = this.getHistory();
    const sessions = new Set<string>();
    let totalLength = 0;
    let revisionCount = 0;
    
    for (const thought of history) {
      if (thought.sessionId) {
        sessions.add(thought.sessionId);
      }
      totalLength += thought.thought.length;
      if (thought.isRevision) {
        revisionCount++;
      }
    }
    
    return {
      totalThoughts: history.length,
      averageThoughtLength: history.length > 0 ? Math.round(totalLength / history.length) : 0,
      sessionCount: sessions.size,
      branchCount: this.getBranches().length,
      revisionCount,
    };
  }
  
  destroy(): void {
    this.manager.destroy();
  }
}