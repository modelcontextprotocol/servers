import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SequentialThinkingServer } from '../../lib.js';

describe('SequentialThinkingServer - Snapshot Tests', () => {
  let server: SequentialThinkingServer;

  beforeEach(() => {
    process.env.DISABLE_THOUGHT_LOGGING = 'true';
    server = new SequentialThinkingServer();
  });

  afterEach(() => {
    if (server && typeof server.destroy === 'function') {
      server.destroy();
    }
  });

  it('should produce consistent thought history format', async () => {
    await server.processThought({
      thought: 'First thought about testing',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      sessionId: 'snapshot-test-1',
    });

    await server.processThought({
      thought: 'Second thought with more detail',
      thoughtNumber: 2,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      sessionId: 'snapshot-test-1',
    });

    await server.processThought({
      thought: 'Final thought with conclusion',
      thoughtNumber: 3,
      totalThoughts: 3,
      nextThoughtNeeded: false,
      sessionId: 'snapshot-test-1',
    });

    const history = server.getThoughtHistory();
    expect(history).toHaveLength(3);
    expect(history[0].thought).toBe('First thought about testing');
    expect(history[1].thought).toBe('Second thought with more detail');
    expect(history[2].thought).toBe('Final thought with conclusion');
    expect(history[2].nextThoughtNeeded).toBe(false);
  });

  it('should produce consistent health check format', async () => {
    const health = await server.getHealthStatus();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('summary');
    expect(health).toHaveProperty('timestamp');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
  });

  it('should produce consistent metrics format', async () => {
    await server.processThought({
      thought: 'Test thought for metrics',
      thoughtNumber: 1,
      totalThoughts: 1,
      nextThoughtNeeded: false,
      sessionId: 'metrics-snapshot',
    });

    const metrics = await server.getMetrics();
    expect(metrics).toHaveProperty('requests');
    expect(metrics).toHaveProperty('thoughts');
    expect(metrics).toHaveProperty('system');
    expect(metrics.thoughts).toHaveProperty('totalThoughts');
  });

  it('should produce consistent thinking summary format', async () => {
    const sessionId = 'summary-snapshot';

    await server.processThought({
      thought: 'Root thought A',
      thoughtNumber: 1,
      totalThoughts: 2,
      nextThoughtNeeded: true,
      sessionId,
    });

    await server.processThought({
      thought: 'Child thought B',
      thoughtNumber: 2,
      totalThoughts: 2,
      nextThoughtNeeded: false,
      sessionId,
    });

    const summary = await server.getThinkingSummary(sessionId);
    const data = JSON.parse(summary.content[0].text);

    expect(data).toHaveProperty('bestPath');
    expect(data).toHaveProperty('treeStructure');
    expect(data).toHaveProperty('treeStats');
    expect(data.treeStats).toHaveProperty('totalNodes');
    expect(data.treeStats).toHaveProperty('maxDepth');
  });

  it('should maintain consistent response structure for revisions', async () => {
    const sessionId = 'revision-snapshot';

    await server.processThought({
      thought: 'Original thought',
      thoughtNumber: 1,
      totalThoughts: 2,
      nextThoughtNeeded: true,
      sessionId,
    });

    await server.processThought({
      thought: 'Revised thought with improvements',
      thoughtNumber: 2,
      totalThoughts: 2,
      nextThoughtNeeded: false,
      sessionId,
      isRevision: true,
      revisesThought: 1,
    });

    const history = server.getFilteredHistory({ sessionId });
    const revised = history.find(t => t.isRevision);
    expect(revised).toBeDefined();
    expect(revised?.revisesThought).toBe(1);
  });

  it('should maintain consistent branch structure', async () => {
    const sessionId = 'branch-snapshot';

    await server.processThought({
      thought: 'Main branch thought',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      sessionId,
    });

    await server.processThought({
      thought: 'Branched alternative thought',
      thoughtNumber: 2,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      sessionId,
      branchFromThought: 1,
      branchId: 'branch-alt',
    });

    const history = server.getFilteredHistory({ sessionId });
    const branchThought = history.find(t => t.branchId === 'branch-alt');
    expect(branchThought).toBeDefined();
    expect(branchThought?.branchFromThought).toBe(1);
  });

  it('should preserve session data across multiple operations', async () => {
    const sessionId = 'persistence-snapshot';

    for (let i = 1; i <= 5; i++) {
      await server.processThought({
        thought: `Thought ${i}`,
        thoughtNumber: i,
        totalThoughts: 5,
        nextThoughtNeeded: i < 5,
        sessionId,
      });
    }

    const history = server.getFilteredHistory({ sessionId, limit: 10 });
    expect(history).toHaveLength(5);
    expect(history.map(t => t.thoughtNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle filtered history consistently', async () => {
    const sessionA = 'filter-snap-a';
    const sessionB = 'filter-snap-b';

    await server.processThought({ thought: 'A1', thoughtNumber: 1, totalThoughts: 2, nextThoughtNeeded: true, sessionId: sessionA });
    await server.processThought({ thought: 'A2', thoughtNumber: 2, totalThoughts: 2, nextThoughtNeeded: false, sessionId: sessionA });
    await server.processThought({ thought: 'B1', thoughtNumber: 1, totalThoughts: 1, nextThoughtNeeded: false, sessionId: sessionB });

    const historyA = server.getFilteredHistory({ sessionId: sessionA });
    const historyB = server.getFilteredHistory({ sessionId: sessionB });

    expect(historyA).toHaveLength(2);
    expect(historyB).toHaveLength(1);
    expect(historyA[0].sessionId).toBe(sessionA);
    expect(historyB[0].sessionId).toBe(sessionB);
  });
});
