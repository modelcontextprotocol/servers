import type { MetricsCollector, ThoughtData, RequestMetrics, ThoughtMetrics, SystemMetrics, ThoughtStorage } from './interfaces.js';
import { CircularBuffer } from './circular-buffer.js';
import type { SessionTracker } from './session-tracker.js';

export class BasicMetricsCollector implements MetricsCollector {
  private readonly requestMetrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    lastRequestTime: null,
    requestsPerMinute: 0,
  };

  private readonly thoughtMetrics: ThoughtMetrics = {
    totalThoughts: 0,
    averageThoughtLength: 0,
    thoughtsPerMinute: 0,
    revisionCount: 0,
    branchCount: 0,
    activeSessions: 0,
  };

  private readonly responseTimes = new CircularBuffer<number>(100);
  private readonly requestTimestamps = new CircularBuffer<number>(1000);
  private readonly thoughtTimestamps = new CircularBuffer<number>(1000);
  private readonly sessionTracker: SessionTracker;
  private readonly storage: ThoughtStorage;

  constructor(sessionTracker: SessionTracker, storage: ThoughtStorage) {
    this.sessionTracker = sessionTracker;
    this.storage = storage;
  }

  recordRequest(duration: number, success: boolean): void {
    const now = Date.now();

    this.requestMetrics.totalRequests++;
    this.requestMetrics.lastRequestTime = new Date(now);

    if (success) {
      this.requestMetrics.successfulRequests++;
    } else {
      this.requestMetrics.failedRequests++;
    }

    // Update response time metrics using circular buffer
    this.responseTimes.add(duration);

    const allTimes = this.responseTimes.getAll();
    this.requestMetrics.averageResponseTime =
      allTimes.reduce((sum, time) => sum + time, 0) / allTimes.length;

    // Update requests per minute
    this.requestTimestamps.add(now);
    const cutoff = now - 60 * 1000;
    this.requestMetrics.requestsPerMinute =
      this.requestTimestamps.getAll().filter(ts => ts > cutoff).length;
  }

  recordError(_error: Error): void {
    // No-op: the caller (lib.ts) already calls recordRequest(duration, false)
    // before calling recordError, so we don't double-count.
  }

  recordThoughtProcessed(thought: ThoughtData): void {
    const now = Date.now();

    this.thoughtMetrics.totalThoughts++;
    this.thoughtTimestamps.add(now);

    // Update average thought length
    const prevTotal =
      this.thoughtMetrics.averageThoughtLength *
      (this.thoughtMetrics.totalThoughts - 1);
    const totalLength = prevTotal + thought.thought.length;
    this.thoughtMetrics.averageThoughtLength =
      Math.round(totalLength / this.thoughtMetrics.totalThoughts);

    // Track revisions
    if (thought.isRevision) {
      this.thoughtMetrics.revisionCount++;
    }

    // Branch count is queried from storage (single source of truth)
    this.thoughtMetrics.branchCount = this.storage.getBranches().length;

    // Update thoughts per minute
    const cutoff = now - 60 * 1000;
    this.thoughtMetrics.thoughtsPerMinute =
      this.thoughtTimestamps.getAll().filter(ts => ts > cutoff).length;

    // Session tracking now handled by unified SessionTracker
    this.thoughtMetrics.activeSessions =
      this.sessionTracker.getActiveSessionCount();
  }

  getMetrics(): {
    requests: RequestMetrics;
    thoughts: ThoughtMetrics;
    system: SystemMetrics;
    } {
    return {
      requests: { ...this.requestMetrics },
      thoughts: { ...this.thoughtMetrics },
      system: this.getSystemMetrics(),
    };
  }

  private getSystemMetrics(): SystemMetrics {
    return {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }

  destroy(): void {
    this.responseTimes.clear();
    this.requestTimestamps.clear();
    this.thoughtTimestamps.clear();
    this.requestMetrics.totalRequests = 0;
    this.requestMetrics.successfulRequests = 0;
    this.requestMetrics.failedRequests = 0;
    this.requestMetrics.averageResponseTime = 0;
    this.requestMetrics.lastRequestTime = null;
    this.requestMetrics.requestsPerMinute = 0;
    this.thoughtMetrics.totalThoughts = 0;
    this.thoughtMetrics.averageThoughtLength = 0;
    this.thoughtMetrics.thoughtsPerMinute = 0;
    this.thoughtMetrics.revisionCount = 0;
    this.thoughtMetrics.branchCount = 0;
    this.thoughtMetrics.activeSessions = 0;
  }

}
