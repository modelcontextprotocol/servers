import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequentialThinkingServer, ThoughtData } from '../lib.js';

// Mock chalk to avoid ESM issues
vi.mock('chalk', () => {
  const identity = (str: string) => str;
  const chalkMock = {
    yellow: identity,
    green: identity,
    blue: identity,
    gray: identity,
    cyan: identity,
    red: identity,
    white: identity,
    bold: identity,
  };
  return {
    default: chalkMock,
  };
});

describe('SequentialThinkingServer', () => {
  let server: SequentialThinkingServer;

  beforeEach(() => {
    // Disable thought logging for tests
    process.env.DISABLE_THOUGHT_LOGGING = 'true';
    server = new SequentialThinkingServer();
  });

  afterEach(() => {
    if (server && typeof server.destroy === 'function') {
      server.destroy();
    }
  });

  // Note: Input validation tests removed - validation now happens at the tool
  // registration layer via Zod schemas before processThought is called

  describe('processThought - valid inputs', () => {
    it('should accept valid basic thought', async () => {
      const input = {
        thought: 'This is my first thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = await server.processThought(input);
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(3);
      expect(data.nextThoughtNeeded).toBe(true);
      expect(data.thoughtHistoryLength).toBe(1);
    });

    it('should accept thought with optional fields', async () => {
      const input = {
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

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(2);
      expect(data.thoughtHistoryLength).toBe(1);
    });

    it('should track multiple thoughts in history', async () => {
      const input1 = {
        thought: 'First thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const input2 = {
        thought: 'Second thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const input3 = {
        thought: 'Final thought',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false
      };

      await server.processThought(input1);
      await server.processThought(input2);
      const result = await server.processThought(input3);

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtHistoryLength).toBe(3);
      expect(data.nextThoughtNeeded).toBe(false);
    });

    it('should auto-adjust totalThoughts if thoughtNumber exceeds it', async () => {
      const input = {
        thought: 'Thought 5',
        thoughtNumber: 5,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = await server.processThought(input);
      const data = JSON.parse(result.content[0].text);

      expect(data.totalThoughts).toBe(5);
    });
  });

  describe('processThought - branching', () => {
    it('should track branches correctly', async () => {
      const input1 = {
        thought: 'Main thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const input2 = {
        thought: 'Branch A thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 'branch-a'
      };

      const input3 = {
        thought: 'Branch B thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-b'
      };

      await server.processThought(input1);
      await server.processThought(input2);
      const result = await server.processThought(input3);

      const data = JSON.parse(result.content[0].text);
      expect(data.branches).toContain('branch-a');
      expect(data.branches).toContain('branch-b');
      expect(data.branches.length).toBe(2);
      expect(data.thoughtHistoryLength).toBe(3);
    });

    it('should allow multiple thoughts in same branch', async () => {
      const input1 = {
        thought: 'Branch thought 1',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 'branch-a'
      };

      const input2 = {
        thought: 'Branch thought 2',
        thoughtNumber: 2,
        totalThoughts: 2,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-a'
      };

      await server.processThought(input1);
      const result = await server.processThought(input2);

      const data = JSON.parse(result.content[0].text);
      expect(data.branches).toContain('branch-a');
      expect(data.branches.length).toBe(1);
    });
  });

  describe('processThought - edge cases', () => {
    it('should handle thought strings within limits', async () => {
      const input = {
        thought: 'a'.repeat(4000), // Within default 5000 limit
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = await server.processThought(input);
      expect(result.isError).toBeUndefined();
    });

    it('should handle thoughtNumber = 1, totalThoughts = 1', async () => {
      const input = {
        thought: 'Only thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = await server.processThought(input);
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(1);
    });

    it('should handle nextThoughtNeeded = false', async () => {
      const input = {
        thought: 'Final thought',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false
      };

      const result = await server.processThought(input);
      const data = JSON.parse(result.content[0].text);

      expect(data.nextThoughtNeeded).toBe(false);
    });
  });

  describe('processThought - response format', () => {
    it('should return correct response structure on success', async () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = await server.processThought(input);

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBe(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return valid JSON in response', async () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = await server.processThought(input);

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe('processThought - with logging enabled', () => {
    let serverWithLogging: SequentialThinkingServer;

    beforeEach(() => {
      // Enable thought logging for these tests
      delete process.env.DISABLE_THOUGHT_LOGGING;
      serverWithLogging = new SequentialThinkingServer();
    });

    afterEach(() => {
      // Reset to disabled for other tests
      process.env.DISABLE_THOUGHT_LOGGING = 'true';
      if (serverWithLogging && typeof serverWithLogging.destroy === 'function') {
        serverWithLogging.destroy();
      }
    });

    it('should format and log regular thoughts', async () => {
      const input = {
        thought: 'Test thought with logging',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = await serverWithLogging.processThought(input);
      expect(result.isError).toBeUndefined();
    });

    it('should format and log revision thoughts', async () => {
      const input = {
        thought: 'Revised thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1
      };

      const result = await serverWithLogging.processThought(input);
      expect(result.isError).toBeUndefined();
    });

    it('should format and log branch thoughts', async () => {
      const input = {
        thought: 'Branch thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-a'
      };

      const result = await serverWithLogging.processThought(input);
      expect(result.isError).toBeUndefined();
    });
  });
});
