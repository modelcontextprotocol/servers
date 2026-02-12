import type { AppConfig, StorageStats, ThoughtStorage, ThoughtData } from './interfaces.js';
import { BoundedThoughtManager } from './state-manager.js';

export class SecureThoughtStorage implements ThoughtStorage {
  private readonly manager: BoundedThoughtManager;

  constructor(config: AppConfig['state']) {
    this.manager = new BoundedThoughtManager(config);
  }

  addThought(thought: ThoughtData): void {
    // Work on a shallow copy to avoid mutating the caller's object
    const entry = { ...thought };

    // Ensure session ID for tracking
    if (!entry.sessionId) {
      entry.sessionId = 'anonymous-' + crypto.randomUUID();
    }

    this.manager.addThought(entry);
  }

  getHistory(limit?: number): ThoughtData[] {
    return this.manager.getHistory(limit);
  }

  getBranches(): string[] {
    return this.manager.getBranches();
  }

  clearHistory(): void {
    this.manager.clearHistory();
  }

  cleanup(): void {
    this.manager.cleanup();
  }

  getStats(): StorageStats {
    return this.manager.getStats();
  }

  destroy(): void {
    this.manager.destroy();
  }
}
