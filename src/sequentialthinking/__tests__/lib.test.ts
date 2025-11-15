import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequentialThinkingServer, ThoughtData } from '../lib.js';

// Mock chalk to avoid ESM issues
vi.mock('chalk', () => {
  const chalkMock = {
    yellow: (str: string) => str,
    green: (str: string) => str,
    blue: (str: string) => str,
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

  describe('processThought - validation', () => {
    it('should reject input with missing thought', () => {
      const input = {
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid thought');
    });

    it('should reject input with non-string thought', () => {
      const input = {
        thought: 123,
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid thought');
    });

    it('should reject input with missing thoughtNumber', () => {
      const input = {
        thought: 'Test thought',
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid thoughtNumber');
    });

    it('should reject input with non-number thoughtNumber', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: '1',
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid thoughtNumber');
    });

    it('should reject input with missing totalThoughts', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid totalThoughts');
    });

    it('should reject input with non-number totalThoughts', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: '3',
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid totalThoughts');
    });

    it('should reject input with missing nextThoughtNeeded', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 3
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid nextThoughtNeeded');
    });

    it('should reject input with non-boolean nextThoughtNeeded', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: 'true'
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid nextThoughtNeeded');
    });
  });

  describe('processThought - valid inputs', () => {
    it('should accept valid basic thought', () => {
      const input = {
        thought: 'This is my first thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(3);
      expect(data.nextThoughtNeeded).toBe(true);
      expect(data.thoughtHistoryLength).toBe(1);
    });

    it('should accept thought with optional fields', () => {
      const input = {
        thought: 'Revising my earlier idea',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1,
        needsMoreThoughts: false
      };

      const result = server.processThought(input);
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(2);
      expect(data.thoughtHistoryLength).toBe(1);
    });

    it('should track multiple thoughts in history', () => {
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

      server.processThought(input1);
      server.processThought(input2);
      const result = server.processThought(input3);

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtHistoryLength).toBe(3);
      expect(data.nextThoughtNeeded).toBe(false);
    });

    it('should auto-adjust totalThoughts if thoughtNumber exceeds it', () => {
      const input = {
        thought: 'Thought 5',
        thoughtNumber: 5,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      const data = JSON.parse(result.content[0].text);

      expect(data.totalThoughts).toBe(5);
    });
  });

  describe('processThought - branching', () => {
    it('should track branches correctly', () => {
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

      server.processThought(input1);
      server.processThought(input2);
      const result = server.processThought(input3);

      const data = JSON.parse(result.content[0].text);
      expect(data.branches).toContain('branch-a');
      expect(data.branches).toContain('branch-b');
      expect(data.branches.length).toBe(2);
      expect(data.thoughtHistoryLength).toBe(3);
    });

    it('should allow multiple thoughts in same branch', () => {
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

      server.processThought(input1);
      const result = server.processThought(input2);

      const data = JSON.parse(result.content[0].text);
      expect(data.branches).toContain('branch-a');
      expect(data.branches.length).toBe(1);
    });
  });

  describe('processThought - edge cases', () => {
    it('should reject empty thought string', () => {
      const input = {
        thought: '',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid thought');
    });

    it('should handle very long thought strings', () => {
      const input = {
        thought: 'a'.repeat(10000),
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = server.processThought(input);
      expect(result.isError).toBeUndefined();
    });

    it('should handle thoughtNumber = 1, totalThoughts = 1', () => {
      const input = {
        thought: 'Only thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = server.processThought(input);
      expect(result.isError).toBeUndefined();

      const data = JSON.parse(result.content[0].text);
      expect(data.thoughtNumber).toBe(1);
      expect(data.totalThoughts).toBe(1);
    });

    it('should handle nextThoughtNeeded = false', () => {
      const input = {
        thought: 'Final thought',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false
      };

      const result = server.processThought(input);
      const data = JSON.parse(result.content[0].text);

      expect(data.nextThoughtNeeded).toBe(false);
    });

    it('should reject negative thoughtNumber', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: -1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('thoughtNumber must be >= 1');
    });

    it('should reject zero thoughtNumber', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 0,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('thoughtNumber must be >= 1');
    });

    it('should reject negative totalThoughts', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: -5,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('totalThoughts must be >= 1');
    });

    it('should reject zero totalThoughts', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 0,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('totalThoughts must be >= 1');
    });

    it('should reject NaN thoughtNumber', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: NaN,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('thoughtNumber must be a valid number');
    });

    it('should reject Infinity totalThoughts', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: Infinity,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('totalThoughts must be a valid number');
    });

    it('should reject non-boolean isRevision', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: 'true'
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('isRevision must be a boolean');
    });

    it('should reject non-number revisesThought', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: '1'
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('revisesThought must be a number');
    });

    it('should reject negative revisesThought', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: -1
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('revisesThought must be >= 1');
    });

    it('should reject non-number branchFromThought', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: '1',
        branchId: 'branch-a'
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('branchFromThought must be a number');
    });

    it('should reject non-string branchId', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: 123
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('branchId must be a string');
    });

    it('should reject empty branchId', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1,
        branchId: ''
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('branchId cannot be empty');
    });

    it('should accept valid optional fields', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1,
        branchFromThought: 1,
        branchId: 'branch-a',
        needsMoreThoughts: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBeUndefined();
    });
  });

  describe('processThought - response format', () => {
    it('should return correct response structure on success', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = server.processThought(input);

      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBe(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');
    });

    it('should return correct error structure on failure', () => {
      const input = {
        thought: 'Test',
        thoughtNumber: 1,
        totalThoughts: 1
        // missing nextThoughtNeeded
      };

      const result = server.processThought(input);

      expect(result).toHaveProperty('isError', true);
      expect(result).toHaveProperty('content');
      expect(Array.isArray(result.content)).toBe(true);

      const errorData = JSON.parse(result.content[0].text);
      expect(errorData).toHaveProperty('error');
      expect(errorData).toHaveProperty('status', 'failed');
    });

    it('should return valid JSON in response', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = server.processThought(input);

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
    });

    it('should format and log regular thoughts', () => {
      const input = {
        thought: 'Test thought with logging',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = serverWithLogging.processThought(input);
      expect(result.isError).toBeUndefined();
    });

    it('should format and log revision thoughts', () => {
      const input = {
        thought: 'Revised thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1
      };

      const result = serverWithLogging.processThought(input);
      expect(result.isError).toBeUndefined();
    });

    it('should format and log branch thoughts', () => {
      const input = {
        thought: 'Branch thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-a'
      };

      const result = serverWithLogging.processThought(input);
      expect(result.isError).toBeUndefined();
    });
  });

  describe('processThought - state isolation (concurrent requests)', () => {
    it('should isolate state between different server instances', () => {
      const server1 = new SequentialThinkingServer();
      const server2 = new SequentialThinkingServer();

      const input1 = {
        thought: 'Server 1 thought',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true
      };

      const input2 = {
        thought: 'Server 2 thought',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      server1.processThought(input1);
      server2.processThought(input2);

      const result1 = server1.processThought({
        thought: 'Server 1 second thought',
        thoughtNumber: 2,
        totalThoughts: 2,
        nextThoughtNeeded: false
      });

      const result2 = server2.processThought({
        thought: 'Server 2 second thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      const data1 = JSON.parse(result1.content[0].text);
      const data2 = JSON.parse(result2.content[0].text);

      // Each server should track only its own history
      expect(data1.thoughtHistoryLength).toBe(2);
      expect(data2.thoughtHistoryLength).toBe(2);
    });

    it('should not leak branches between server instances', () => {
      const server1 = new SequentialThinkingServer();
      const server2 = new SequentialThinkingServer();

      server1.processThought({
        thought: 'Branch A',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-a'
      });

      const result2 = server2.processThought({
        thought: 'No branch',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      });

      const data2 = JSON.parse(result2.content[0].text);

      // Server 2 should have no branches from server 1
      expect(data2.branches.length).toBe(0);
    });

    it('should handle concurrent interleaved requests without state pollution', () => {
      const server1 = new SequentialThinkingServer();
      const server2 = new SequentialThinkingServer();

      // Interleave requests as if they were concurrent
      server1.processThought({
        thought: 'Conversation A - thought 1',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      server2.processThought({
        thought: 'Conversation B - thought 1',
        thoughtNumber: 1,
        totalThoughts: 2,
        nextThoughtNeeded: true
      });

      server1.processThought({
        thought: 'Conversation A - thought 2',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      server2.processThought({
        thought: 'Conversation B - thought 2',
        thoughtNumber: 2,
        totalThoughts: 2,
        nextThoughtNeeded: false
      });

      const result1 = server1.processThought({
        thought: 'Conversation A - thought 3',
        thoughtNumber: 3,
        totalThoughts: 3,
        nextThoughtNeeded: false
      });

      const data1 = JSON.parse(result1.content[0].text);

      // Server 1 should have exactly 3 thoughts, not 5
      expect(data1.thoughtHistoryLength).toBe(3);
    });
  });
});
