import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequentialThinkingServer, ProcessThoughtRequest } from '../../lib.js';

describe('SequentialThinkingServer', () => {
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

  describe('Basic Functionality', () => {
    it('should process a valid thought successfully', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'This is my first thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      };

      const result = await server.processThought(input);

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(3);
      expect(data.nextThoughtNeeded).toBe(true);
      expect(data.thoughtHistoryLength).toBe(1);
      expect(typeof data.sessionId).toBe('string');
      expect(data.sessionId.length).toBeGreaterThan(0);
      expect(typeof data.timestamp).toBe('number');
      expect(data.timestamp).toBeGreaterThan(0);
    });

    it('should accept thought with optional fields', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'Revising my earlier idea',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1,
        needsMoreThoughts: false,
      };

      const result = await server.processThought(input);
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(2);
      expect(data.thoughtHistoryLength).toBe(1);
    });

    it('should track multiple thoughts in history', async () => {
      await server.processThought({
        thought: 'First thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      await server.processThought({
        thought: 'Second thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      const result = await server.processThought({
        thought: 'Final thought',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtHistoryLength).toBe(3);
      expect(data.nextThoughtNeeded).toBe(false);
    });

    it('should auto-adjust totalThoughts if thoughtNumber exceeds it', async () => {
      const result = await server.processThought({
        thought: 'Thought 5',
        thoughtNumber: 5,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.totalThoughts).toBe(5);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty thought', async () => {
      const result = await server.processThought({
        thought: '',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      } as ProcessThoughtRequest);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toContain('Thought is required');
    });

    it('should reject invalid thoughtNumber', async () => {
      const result = await server.processThought({
        thought: 'Valid thought',
        thoughtNumber: 0,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      } as ProcessThoughtRequest);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toContain('thoughtNumber must be a positive integer');
    });

    it('should reject invalid totalThoughts', async () => {
      const result = await server.processThought({
        thought: 'Valid thought',
        thoughtNumber: 1,
        totalThoughts: -1,
        nextThoughtNeeded: true,
      } as ProcessThoughtRequest);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toContain('totalThoughts must be a positive integer');
    });

    it('should reject invalid nextThoughtNeeded', async () => {
      const result = await server.processThought({
        thought: 'Valid thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: 'true' as any,
      } as ProcessThoughtRequest);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toContain('nextThoughtNeeded must be a boolean');
    });

    it('should handle malformed input gracefully', async () => {
      const result = await server.processThought({
        thought: null,
        thoughtNumber: 'invalid',
        totalThoughts: 'invalid',
        nextThoughtNeeded: 'invalid',
      } as any);

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBeDefined();
      expect(data.timestamp).toBeDefined();
    });
  });

  describe('Business Logic', () => {
    it('should reject revision without revisesThought', async () => {
      const result = await server.processThought({
        thought: 'This is a revision',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('BUSINESS_LOGIC_ERROR');
      expect(data.message).toContain('isRevision requires revisesThought');
    });

    it('should reject branch without branchId', async () => {
      const result = await server.processThought({
        thought: 'This is a branch',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('BUSINESS_LOGIC_ERROR');
      expect(data.message).toContain('branchFromThought requires branchId');
    });

    it('should accept valid revision', async () => {
      const result = await server.processThought({
        thought: 'This is a valid revision',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1,
      });

      expect(result.isError).toBeUndefined();
    });

    it('should accept valid branch', async () => {
      const result = await server.processThought({
        thought: 'This is a valid branch',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 'branch-1',
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe('Security', () => {
    it('should reject overly long thoughts', async () => {
      const result = await server.processThought({
        thought: 'a'.repeat(6000),
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toContain('exceeds maximum length');
    });

    it('should sanitize and accept previously blocked patterns', async () => {
      // javascript: gets sanitized away before validation
      const result = await server.processThought({
        thought: 'Visit javascript: void(0) for info',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });

      expect(result.isError).toBe(false);
      // Content was sanitized (javascript: removed)
    });

    it('should sanitize and accept normal content', async () => {
      const result = await server.processThought({
        thought: 'Normal text with some test content',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });

      expect(result.isError).toBeUndefined();
    });
  });

  describe('Session Management', () => {
    it('should generate and track session IDs', async () => {
      const result1 = await server.processThought({
        thought: 'First thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      const result2 = await server.processThought({
        thought: 'Second thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
      });

      const parsed1 = JSON.parse(result1.content[0].text);
      const parsed2 = JSON.parse(result2.content[0].text);

      expect(typeof parsed1.sessionId).toBe('string');
      expect(parsed1.sessionId.length).toBeGreaterThan(0);
      expect(typeof parsed2.sessionId).toBe('string');
      expect(parsed2.sessionId.length).toBeGreaterThan(0);
      // Auto-generated session IDs differ between calls (no session persistence)
      expect(parsed1.sessionId).not.toBe(parsed2.sessionId);
    });

    it('should accept provided session ID', async () => {
      const sessionId = 'test-session-123';
      const result = await server.processThought({
        thought: 'Thought with session',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.sessionId).toBe(sessionId);
    });

    it('should reject invalid session ID', async () => {
      const result = await server.processThought({
        thought: 'Thought with invalid session',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: '',
      });

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('Invalid session ID');
    });
  });

  describe('Branching', () => {
    it('should track multiple branches correctly', async () => {
      await server.processThought({
        thought: 'Main thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      await server.processThought({
        thought: 'Branch A thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 'branch-a',
      });
      const result = await server.processThought({
        thought: 'Branch B thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-b',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.branches).toContain('branch-a');
      expect(data.branches).toContain('branch-b');
      expect(data.branches.length).toBe(2);
      expect(data.thoughtHistoryLength).toBe(3);
    });

    it('should allow multiple thoughts in same branch', async () => {
      await server.processThought({
        thought: 'Branch thought 1',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 'branch-a',
      });
      const result = await server.processThought({
        thought: 'Branch thought 2',
        thoughtNumber: 2,
        totalThoughts: 2,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-a',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.branches).toContain('branch-a');
      expect(data.branches.length).toBe(1);
    });
  });

  describe('Response Format', () => {
    it('should return correct response structure on success', async () => {
      const result = await server.processThought({
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBe(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return valid JSON in response', async () => {
      const result = await server.processThought({
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle thought strings within limits', async () => {
      const result = await server.processThought({
        thought: 'a'.repeat(4000),
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBeUndefined();
    });

    it('should handle thoughtNumber = 1, totalThoughts = 1', async () => {
      const result = await server.processThought({
        thought: 'Only thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(1);
      expect(data.nextThoughtNeeded).toBe(false);
    });

    it('should handle nextThoughtNeeded = false', async () => {
      const result = await server.processThought({
        thought: 'Final thought',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.nextThoughtNeeded).toBe(false);
    });
  });

  describe('Logging', () => {
    let serverWithLogging: SequentialThinkingServer;

    beforeEach(() => {
      delete process.env.DISABLE_THOUGHT_LOGGING;
      serverWithLogging = new SequentialThinkingServer();
    });

    afterEach(() => {
      process.env.DISABLE_THOUGHT_LOGGING = 'true';
      if (serverWithLogging && typeof serverWithLogging.destroy === 'function') {
        serverWithLogging.destroy();
      }
    });

    it('should format and log regular thoughts', async () => {
      const result = await serverWithLogging.processThought({
        thought: 'Test thought with logging',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      expect(result.isError).toBeUndefined();
    });

    it('should format and log revision thoughts', async () => {
      const result = await serverWithLogging.processThought({
        thought: 'Revised thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1,
      });
      expect(result.isError).toBeUndefined();
    });

    it('should format and log branch thoughts', async () => {
      const result = await serverWithLogging.processThought({
        thought: 'Branch thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-a',
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe('Health & Metrics', () => {
    it('should return health status with all checks', async () => {
      await server.processThought({
        thought: 'Health check test thought',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: false,
      });

      const health = await server.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('checks');
      expect(health).toHaveProperty('summary');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');
      expect(['healthy', 'unhealthy', 'degraded']).toContain(health.status);

      const checks = health.checks as Record<string, unknown>;
      expect(checks).toHaveProperty('memory');
      expect(checks).toHaveProperty('responseTime');
      expect(checks).toHaveProperty('errorRate');
      expect(checks).toHaveProperty('storage');
      expect(checks).toHaveProperty('security');
    });

    it('should return metrics structure', () => {
      const metrics = server.getMetrics() as Record<string, any>;

      expect(metrics).toHaveProperty('requests');
      expect(metrics).toHaveProperty('thoughts');
      expect(metrics).toHaveProperty('system');
      expect(metrics.requests).toHaveProperty('totalRequests');
      expect(metrics.requests).toHaveProperty('successfulRequests');
      expect(metrics.requests).toHaveProperty('failedRequests');
    });

    it('should track metrics across operations', async () => {
      await server.processThought({
        thought: 'Valid thought 1',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      await server.processThought({
        thought: 'Valid thought 2',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      // Send one invalid request
      await server.processThought({
        thought: '',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false,
      } as any);

      const metrics = server.getMetrics() as Record<string, any>;

      // Validation errors happen before processWithServices, so only 2 successful recorded
      expect(metrics.requests.totalRequests).toBe(2);
      expect(metrics.requests.successfulRequests).toBe(2);
      expect(metrics.thoughts.totalThoughts).toBe(2);
    });
  });

  describe('End-to-End Workflows', () => {
    it('should handle complete thinking session', async () => {
      const sessionId = 'integration-test-session';

      const thought1 = await server.processThought({
        thought: 'I need to solve a complex problem step by step',
        thoughtNumber: 1,
        totalThoughts: 4,
        nextThoughtNeeded: true,
        sessionId,
      });
      expect(thought1.isError).toBeUndefined();
      const parsed1 = JSON.parse(thought1.content[0].text);
      expect(parsed1.thoughtNumber).toBe(1);
      expect(parsed1.thoughtHistoryLength).toBe(1);

      const thought2 = await server.processThought({
        thought: 'First, I should understand the problem requirements',
        thoughtNumber: 2,
        totalThoughts: 4,
        nextThoughtNeeded: true,
        sessionId,
      });
      expect(thought2.isError).toBeUndefined();

      const thought3 = await server.processThought({
        thought: 'Alternative approach: Consider using a different algorithm',
        thoughtNumber: 3,
        totalThoughts: 4,
        nextThoughtNeeded: true,
        branchFromThought: 2,
        branchId: 'alternative-approach',
        sessionId,
      });
      const parsed3 = JSON.parse(thought3.content[0].text);
      expect(parsed3.branches).toContain('alternative-approach');

      const thought4 = await server.processThought({
        thought: 'Revising approach 1: The original method is actually better',
        thoughtNumber: 4,
        totalThoughts: 4,
        nextThoughtNeeded: false,
        isRevision: true,
        revisesThought: 2,
        sessionId,
      });
      const parsed4 = JSON.parse(thought4.content[0].text);
      expect(parsed4.nextThoughtNeeded).toBe(false);

      const history = server.getThoughtHistory();
      expect(history).toHaveLength(4);

      const branches = server.getBranches();
      expect(branches).toContain('alternative-approach');
    });

    it('should handle and recover from invalid input', async () => {
      const invalidResult = await server.processThought({
        thought: '',
        thoughtNumber: -1,
        totalThoughts: -1,
        nextThoughtNeeded: 'invalid' as any,
      } as any);
      expect(invalidResult.isError).toBe(true);

      const validResult = await server.processThought({
        thought: 'Now this is valid',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true,
        sessionId: 'error-recovery-test',
      });
      expect(validResult.isError).toBeUndefined();

      const parsed = JSON.parse(validResult.content[0].text);
      expect(parsed.thoughtNumber).toBe(1);
      expect(parsed.sessionId).toBe('error-recovery-test');
    });

    it('should handle large number of thoughts without memory issues', async () => {
      const sessionId = 'memory-test';
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < 200; i++) {
        await server.processThought({
          thought: `Memory test thought ${i} with some content to make it realistic`,
          thoughtNumber: i + 1,
          totalThoughts: 250,
          nextThoughtNeeded: i < 199,
          sessionId,
        });
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      const history = server.getThoughtHistory();
      expect(history.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Configuration', () => {
    it('should respect environment configuration', async () => {
      const original = process.env.MAX_THOUGHT_LENGTH;
      process.env.MAX_THOUGHT_LENGTH = '500';

      try {
        const configuredServer = new SequentialThinkingServer();

        const result = await configuredServer.processThought({
          thought: 'a'.repeat(501),
          thoughtNumber: 1,
          totalThoughts: 2,
          nextThoughtNeeded: false,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain('exceeds maximum length');

        configuredServer.destroy();
      } finally {
        if (original === undefined) {
          delete process.env.MAX_THOUGHT_LENGTH;
        } else {
          process.env.MAX_THOUGHT_LENGTH = original;
        }
      }
    });
  });

  describe('Lifecycle', () => {
    it('should clean up resources properly on shutdown', async () => {
      await server.processThought({
        thought: 'Shutdown test',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      expect(() => {
        server.destroy();
      }).not.toThrow();
    });

    it('should provide legacy compatibility methods', () => {
      const history = server.getThoughtHistory();
      expect(Array.isArray(history)).toBe(true);

      const branches = server.getBranches();
      expect(Array.isArray(branches)).toBe(true);
    });
  });

  describe('Boundary Tests', () => {
    it('should accept thought at exactly 5000 chars', async () => {
      const result = await server.processThought({
        thought: 'a'.repeat(5000),
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBeUndefined();
    });

    it('should reject thought at 5001 chars', async () => {
      const result = await server.processThought({
        thought: 'a'.repeat(5001),
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
    });

    it('should accept session ID at 100 chars', async () => {
      const result = await server.processThought({
        thought: 'Boundary test',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: 'a'.repeat(100),
      });
      expect(result.isError).toBeUndefined();
    });

    it('should reject session ID at 101 chars', async () => {
      const result = await server.processThought({
        thought: 'Boundary test',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        sessionId: 'a'.repeat(101),
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('Invalid session ID');
    });
  });

  describe('Health Status Error Fallback', () => {
    it('should return unhealthy fallback after destroy', async () => {
      server.destroy();
      const health = await server.getHealthStatus();
      expect(health.status).toBe('unhealthy');
      expect(health.checks.memory.status).toBe('unhealthy');
      expect(health.checks.responseTime.status).toBe('unhealthy');
      expect(health.checks.errorRate.status).toBe('unhealthy');
      expect(health.checks.storage.status).toBe('unhealthy');
      expect(health.checks.security.status).toBe('unhealthy');
    });
  });

  describe('Legacy Methods After Destroy', () => {
    it('should return empty array from getThoughtHistory after destroy and log a warning', () => {
      server.destroy();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = server.getThoughtHistory();
      expect(result).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
      const loggedMessage = errorSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('Warning'),
      );
      expect(loggedMessage).toBeDefined();
    });

    it('should return empty array from getBranches after destroy and log a warning', () => {
      server.destroy();
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = server.getBranches();
      expect(result).toEqual([]);
      expect(errorSpy).toHaveBeenCalled();
      const loggedMessage = errorSpy.mock.calls.find(
        call => typeof call[0] === 'string' && call[0].includes('Warning'),
      );
      expect(loggedMessage).toBeDefined();
    });
  });

  describe('processThought after destroy', () => {
    it('should return well-formed error response after destroy', async () => {
      server.destroy();
      const result = await server.processThought({
        thought: 'After destroy',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      // Should be parseable JSON
      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('Whitespace-only thought rejection', () => {
    it('should reject whitespace-only thought', async () => {
      const result = await server.processThought({
        thought: '   \t\n  ',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Non-integer validation', () => {
    it('should reject non-integer thoughtNumber', async () => {
      const result = await server.processThought({
        thought: 'Valid thought',
        thoughtNumber: 1.5,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toContain('positive integer');
    });

    it('should reject non-integer totalThoughts', async () => {
      const result = await server.processThought({
        thought: 'Valid thought',
        thoughtNumber: 1,
        totalThoughts: 2.5,
        nextThoughtNeeded: true,
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('VALIDATION_ERROR');
      expect(data.message).toContain('positive integer');
    });
  });

  describe('Regex-Based Blocked Pattern Matching', () => {
    it('should block eval( via regex', async () => {
      const result = await server.processThought({
        thought: 'use eval(code) here',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('SECURITY_ERROR');
    });

    it('should block document.cookie via regex', async () => {
      const result = await server.processThought({
        thought: 'steal document.cookie from user',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('SECURITY_ERROR');
    });

    it('should block file.exe via regex', async () => {
      const result = await server.processThought({
        thought: 'download malware.exe from site',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });
      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toBe('SECURITY_ERROR');
    });
  });
});
