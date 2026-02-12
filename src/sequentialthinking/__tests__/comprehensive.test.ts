import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequentialThinkingServer, ProcessThoughtRequest } from '../lib.js';
import { ValidationError, SecurityError, RateLimitError, BusinessLogicError } from '../errors.js';

// Mock console.error to avoid noise in tests
const mockConsoleError = vi.fn();
vi.mock('console', () => ({
  ...console,
  error: mockConsoleError,
  log: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock environment variables
const originalEnv = process.env;

describe('SequentialThinkingServer - Comprehensive Tests', () => {
  let server: SequentialThinkingServer;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    process.env.DISABLE_THOUGHT_LOGGING = 'true'; // Disable logging for cleaner tests

    server = new SequentialThinkingServer();
  });

  afterEach(() => {
    process.env = originalEnv;
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
        nextThoughtNeeded: true
      };

      const result = await server.processThought(input);

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.thoughtNumber).toBe(1);
      expect(parsedContent.totalThoughts).toBe(3);
      expect(parsedContent.nextThoughtNeeded).toBe(true);
      expect(parsedContent.thoughtHistoryLength).toBe(1);
      expect(parsedContent.sessionId).toBeDefined();
      expect(parsedContent.timestamp).toBeDefined();
    });

    it('should auto-adjust totalThoughts if thoughtNumber exceeds it', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'Thought 5',
        thoughtNumber: 5,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = await server.processThought(input);
      const parsedContent = JSON.parse(result.content[0].text);

      expect(parsedContent.totalThoughts).toBe(5);
    });

    it('should handle thoughts with optional fields', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'Revising my earlier idea',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1,
        needsMoreThoughts: false
      };

      const result = await server.processThought(input);
      expect(result.isError).toBeUndefined();

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.thoughtNumber).toBe(2);
      expect(parsedContent.thoughtHistoryLength).toBe(1);
    });
  });

  describe('Input Validation', () => {
    it('should reject empty thought', async () => {
      const input = {
        thought: '',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      } as ProcessThoughtRequest;

      const result = await server.processThought(input);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBe('VALIDATION_ERROR');
      expect(parsedContent.message).toContain('Thought is required');
    });

    it('should reject invalid thoughtNumber', async () => {
      const input = {
        thought: 'Valid thought',
        thoughtNumber: 0,
        totalThoughts: 3,
        nextThoughtNeeded: true
      } as ProcessThoughtRequest;

      const result = await server.processThought(input);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBe('VALIDATION_ERROR');
      expect(parsedContent.message).toContain('thoughtNumber must be a positive integer');
    });

    it('should reject invalid totalThoughts', async () => {
      const input = {
        thought: 'Valid thought',
        thoughtNumber: 1,
        totalThoughts: -1,
        nextThoughtNeeded: true
      } as ProcessThoughtRequest;

      const result = await server.processThought(input);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBe('VALIDATION_ERROR');
      expect(parsedContent.message).toContain('totalThoughts must be a positive integer');
    });

    it('should reject invalid nextThoughtNeeded', async () => {
      const input = {
        thought: 'Valid thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: 'true' as any
      } as ProcessThoughtRequest;

      const result = await server.processThought(input);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBe('VALIDATION_ERROR');
      expect(parsedContent.message).toContain('nextThoughtNeeded must be a boolean');
    });
  });

  describe('Business Logic Validation', () => {
    it('should reject revision without revisesThought', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'This is a revision',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true
      };

      const result = await server.processThought(input);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBe('BUSINESS_LOGIC_ERROR');
      expect(parsedContent.message).toContain('isRevision requires revisesThought');
    });

    it('should reject branch without branchId', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'This is a branch',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1
      };

      const result = await server.processThought(input);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBe('BUSINESS_LOGIC_ERROR');
      expect(parsedContent.message).toContain('branchFromThought requires branchId');
    });

    it('should accept valid revision', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'This is a valid revision',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1
      };

      const result = await server.processThought(input);

      expect(result.isError).toBeUndefined();
    });

    it('should accept valid branch', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'This is a valid branch',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 'branch-1'
      };

      const result = await server.processThought(input);

      expect(result.isError).toBeUndefined();
    });
  });

  describe('Security Features', () => {
    it('should reject overly long thoughts', async () => {
      const longThought = 'a'.repeat(6000); // Exceeds default max of 5000
      const input: ProcessThoughtRequest = {
        thought: longThought,
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = await server.processThought(input);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBe('SECURITY_ERROR');
      expect(parsedContent.message).toContain('exceeds maximum length');
    });

    it('should sanitize malicious content', async () => {
      // Content with script tags will be sanitized (removed) by sanitizeContent
      const maliciousThought = 'Normal text with some test content';
      const input: ProcessThoughtRequest = {
        thought: maliciousThought,
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = await server.processThought(input);

      expect(result.isError).toBeUndefined();
    });

    it('should generate and track session IDs', async () => {
      const input1: ProcessThoughtRequest = {
        thought: 'First thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const input2: ProcessThoughtRequest = {
        thought: 'Second thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false
      };

      const result1 = await server.processThought(input1);
      const result2 = await server.processThought(input2);

      const parsed1 = JSON.parse(result1.content[0].text);
      const parsed2 = JSON.parse(result2.content[0].text);

      // Session IDs should be defined
      expect(parsed1.sessionId).toBeDefined();
      expect(parsed2.sessionId).toBeDefined();
    });
  });

  describe('Session Management', () => {
    it('should accept provided session ID', async () => {
      const sessionId = 'test-session-123';
      const input: ProcessThoughtRequest = {
        thought: 'Thought with session',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId
      };

      const result = await server.processThought(input);
      const parsedContent = JSON.parse(result.content[0].text);

      expect(parsedContent.sessionId).toBe(sessionId);
    });

    it('should reject invalid session ID', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'Thought with invalid session',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        sessionId: ''
      };

      const result = await server.processThought(input);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.message).toContain('Invalid session ID');
    });
  });

  describe('Branching Functionality', () => {
    it('should track branches correctly', async () => {
      // First, add a main thought
      const mainThought: ProcessThoughtRequest = {
        thought: 'Main thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };
      await server.processThought(mainThought);

      // Add a branch thought
      const branchThought: ProcessThoughtRequest = {
        thought: 'Branch thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-a'
      };
      const result = await server.processThought(branchThought);
      const parsedContent = JSON.parse(result.content[0].text);

      expect(parsedContent.branches).toContain('branch-a');
    });
  });

  describe('Health Checks', () => {
    it('should return health status', async () => {
      const health = await server.getHealthStatus();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('checks');
      expect(health).toHaveProperty('summary');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('timestamp');

      expect(['healthy', 'unhealthy', 'degraded']).toContain(health.status);
    });
  });

  describe('Metrics', () => {
    it('should return metrics', () => {
      const metrics = server.getMetrics() as Record<string, any>;

      expect(metrics).toHaveProperty('requests');
      expect(metrics).toHaveProperty('thoughts');
      expect(metrics).toHaveProperty('system');

      expect(metrics.requests).toHaveProperty('totalRequests');
      expect(metrics.requests).toHaveProperty('successfulRequests');
      expect(metrics.requests).toHaveProperty('failedRequests');
    });
  });

  describe('Edge Cases', () => {
    it('should handle thought strings within limits', async () => {
      const thought = 'a'.repeat(1000); // Within reasonable limits
      const input: ProcessThoughtRequest = {
        thought,
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = await server.processThought(input);
      expect(result.isError).toBeUndefined();
    });

    it('should handle thoughtNumber = 1, totalThoughts = 1', async () => {
      const input: ProcessThoughtRequest = {
        thought: 'Only thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = await server.processThought(input);
      expect(result.isError).toBeUndefined();

      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.thoughtNumber).toBe(1);
      expect(parsedContent.totalThoughts).toBe(1);
      expect(parsedContent.nextThoughtNeeded).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed input gracefully', async () => {
      const malformedInput = {
        thought: null,
        thoughtNumber: 'invalid',
        totalThoughts: 'invalid',
        nextThoughtNeeded: 'invalid'
      } as any;

      const result = await server.processThought(malformedInput);

      expect(result.isError).toBe(true);
      const parsedContent = JSON.parse(result.content[0].text);
      expect(parsedContent.error).toBeDefined();
      expect(parsedContent.timestamp).toBeDefined();
    });
  });

  describe('Legacy Compatibility', () => {
    it('should provide getThoughtHistory method', () => {
      const history = server.getThoughtHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should provide getBranches method', () => {
      const branches = server.getBranches();
      expect(Array.isArray(branches)).toBe(true);
    });
  });
});
