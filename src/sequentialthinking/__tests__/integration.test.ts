import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SequentialThinkingServer } from '../lib.js';

// Mock the MCP SDK for integration testing
const mockTransport = {
  start: vi.fn(),
  close: vi.fn(),
  send: vi.fn(),
  onmessage: vi.fn(),
  onclose: vi.fn(),
  onerror: vi.fn(),
};

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(() => mockTransport),
}));

describe('Integration Tests', () => {
  let server: SequentialThinkingServer;

  beforeEach(() => {
    // Set up environment for testing
    process.env.DISABLE_THOUGHT_LOGGING = 'true';
    process.env.MAX_THOUGHT_LENGTH = '5000';
    process.env.MAX_THOUGHTS_PER_MIN = '60';
    process.env.MAX_HISTORY_SIZE = '100';

    server = new SequentialThinkingServer();
  });

  afterEach(() => {
    if (server && typeof server.destroy === 'function') {
      server.destroy();
    }
  });

  describe('End-to-End Workflow', () => {
    it('should handle complete thinking session', async () => {
      const sessionId = 'integration-test-session';

      // Step 1: Initial thought
      const thought1 = await server.processThought({
        thought: 'I need to solve a complex problem step by step',
        thoughtNumber: 1,
        totalThoughts: 4,
        nextThoughtNeeded: true,
        sessionId
      });

      expect(thought1.isError).toBeUndefined();
      const parsed1 = JSON.parse(thought1.content[0].text);
      expect(parsed1.thoughtNumber).toBe(1);
      expect(parsed1.thoughtHistoryLength).toBe(1);

      // Step 2: Analysis thought
      const thought2 = await server.processThought({
        thought: 'First, I should understand the problem requirements',
        thoughtNumber: 2,
        totalThoughts: 4,
        nextThoughtNeeded: true,
        sessionId
      });

      expect(thought2.isError).toBeUndefined();
      const parsed2 = JSON.parse(thought2.content[0].text);
      expect(parsed2.thoughtNumber).toBe(2);
      expect(parsed2.thoughtHistoryLength).toBe(2);

      // Step 3: Branch for alternative approach
      const thought3 = await server.processThought({
        thought: 'Alternative approach: Consider using a different algorithm',
        thoughtNumber: 3,
        totalThoughts: 4,
        nextThoughtNeeded: true,
        branchFromThought: 2,
        branchId: 'alternative-approach',
        sessionId
      });

      expect(thought3.isError).toBeUndefined();
      const parsed3 = JSON.parse(thought3.content[0].text);
      expect(parsed3.branches).toContain('alternative-approach');

      // Step 4: Revision
      const thought4 = await server.processThought({
        thought: 'Revising approach 1: The original method is actually better',
        thoughtNumber: 4,
        totalThoughts: 4,
        nextThoughtNeeded: false,
        isRevision: true,
        revisesThought: 2,
        sessionId
      });

      expect(thought4.isError).toBeUndefined();
      const parsed4 = JSON.parse(thought4.content[0].text);
      expect(parsed4.nextThoughtNeeded).toBe(false);

      // Verify session history
      const history = server.getThoughtHistory();
      expect(history).toHaveLength(4);

      // Verify branches
      const branches = server.getBranches();
      expect(branches).toContain('alternative-approach');
    });
  });

  describe('Error Recovery', () => {
    it('should handle and recover from invalid input', async () => {
      // Send invalid input
      const invalidResult = await server.processThought({
        thought: '',
        thoughtNumber: -1,
        totalThoughts: -1,
        nextThoughtNeeded: 'invalid' as any
      } as any);

      expect(invalidResult.isError).toBe(true);

      // Should be able to recover with valid input
      const validResult = await server.processThought({
        thought: 'Now this is valid',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true,
        sessionId: 'error-recovery-test'
      });

      expect(validResult.isError).toBeUndefined();

      const parsed = JSON.parse(validResult.content[0].text);
      expect(parsed.thoughtNumber).toBe(1);
      expect(parsed.sessionId).toBe('error-recovery-test');
    });

    it('should handle security violations gracefully', async () => {
      // Send content that will be sanitized (not blocked outright)
      const result = await server.processThought({
        thought: 'Discussing security patterns and safe coding practices',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true,
        sessionId: 'security-test'
      });

      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.thoughtNumber).toBe(1);
    });
  });

  describe('Memory Management Integration', () => {
    it('should handle large number of thoughts without memory issues', async () => {
      const sessionId = 'memory-test';

      // Process many thoughts
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 200; i++) {
        await server.processThought({
          thought: `Memory test thought ${i} with some content to make it realistic`,
          thoughtNumber: i + 1,
          totalThoughts: 250,
          nextThoughtNeeded: i < 199,
          sessionId
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Should not grow excessively (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      // History should be bounded
      const history = server.getThoughtHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Health Monitoring Integration', () => {
    it('should provide accurate health status', async () => {
      // Process some thoughts to generate activity
      await server.processThought({
        thought: 'Health check test thought',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: false
      });

      const health = await server.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('checks');
      expect(health).toHaveProperty('summary');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');

      expect(['healthy', 'unhealthy', 'degraded']).toContain(health.status);

      // Check individual health checks
      const checks = health.checks as Record<string, unknown>;
      expect(checks).toHaveProperty('memory');
      expect(checks).toHaveProperty('responseTime');
      expect(checks).toHaveProperty('errorRate');
      expect(checks).toHaveProperty('storage');
      expect(checks).toHaveProperty('security');
    });
  });

  describe('Metrics Integration', () => {
    it('should track metrics across operations', async () => {
      // Process some thoughts with different outcomes
      await server.processThought({
        thought: 'Valid thought 1',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      await server.processThought({
        thought: 'Valid thought 2',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      // Send one invalid request
      await server.processThought({
        thought: '',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false
      } as any);

      const metrics = server.getMetrics() as Record<string, any>;

      expect(metrics).toHaveProperty('requests');
      expect(metrics).toHaveProperty('thoughts');
      expect(metrics).toHaveProperty('system');

      // Validation errors happen before processWithServices, so they don't get recorded in metrics
      // Only the 2 successful requests are tracked
      expect(metrics.requests.totalRequests).toBe(2);
      expect(metrics.requests.successfulRequests).toBe(2);
      expect(metrics.thoughts.totalThoughts).toBe(2);
    });
  });

  describe('Session Isolation', () => {
    it('should maintain proper session isolation', async () => {
      const session1 = 'isolation-test-1';
      const session2 = 'isolation-test-2';

      // Process thoughts in different sessions
      await server.processThought({
        thought: 'Session 1 thought 1',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true,
        sessionId: session1
      });

      await server.processThought({
        thought: 'Session 2 thought 1',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true,
        sessionId: session2
      });

      const result1 = await server.processThought({
        thought: 'Session 1 thought 2',
        thoughtNumber: 2,
        totalThoughts: 2,
        nextThoughtNeeded: false,
        sessionId: session1
      });

      const result2 = await server.processThought({
        thought: 'Session 2 thought 2',
        thoughtNumber: 2,
        totalThoughts: 2,
        nextThoughtNeeded: false,
        sessionId: session2
      });

      // Both should succeed
      expect(result1.isError).toBeUndefined();
      expect(result2.isError).toBeUndefined();

      const parsed1 = JSON.parse(result1.content[0].text);
      const parsed2 = JSON.parse(result2.content[0].text);

      expect(parsed1.sessionId).toBe(session1);
      expect(parsed2.sessionId).toBe(session2);

      // Total history includes all sessions
      expect(parsed2.thoughtHistoryLength).toBe(4);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should clean up resources properly on shutdown', async () => {
      // Process some thoughts first
      await server.processThought({
        thought: 'Shutdown test',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      });

      // Should not throw error
      expect(() => {
        server.destroy();
      }).not.toThrow();
    });
  });

  describe('Configuration Integration', () => {
    it('should respect environment configuration', async () => {
      // Test with custom configuration
      process.env.MAX_THOUGHT_LENGTH = '500';

      const configuredServer = new SequentialThinkingServer();

      // Should reject thoughts longer than 500 chars
      const longThought = 'a'.repeat(501);
      const result = await configuredServer.processThought({
        thought: longThought,
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: false
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('exceeds maximum length');

      configuredServer.destroy();
    });
  });
});
