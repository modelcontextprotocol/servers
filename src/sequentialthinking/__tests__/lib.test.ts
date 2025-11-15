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

  describe('processThought - integer validation', () => {
    it('should reject float thoughtNumber', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1.5,
        totalThoughts: 3,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be an integer');
    });

    it('should reject float totalThoughts', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 1,
        totalThoughts: 3.7,
        nextThoughtNeeded: true
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be an integer');
    });

    it('should reject float revisesThought', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1.5
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be an integer');
    });

    it('should reject float branchFromThought', () => {
      const input = {
        thought: 'Test thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        branchFromThought: 1.5,
        branchId: 'branch-a'
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must be an integer');
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

    it('should accept thought at max size (100KB)', () => {
      const maxSize = 100 * 1024;
      const input = {
        thought: 'a'.repeat(maxSize),
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = server.processThought(input);
      expect(result.isError).toBeUndefined();
    });

    it('should reject thought exceeding max size (100KB)', () => {
      const maxSize = 100 * 1024;
      const input = {
        thought: 'a'.repeat(maxSize + 1),
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      };

      const result = server.processThought(input);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('exceeds maximum size');
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

  describe('processThought - memory limits', () => {
    it('should enforce MAX_THOUGHT_HISTORY limit with default 1000', () => {
      const testServer = new SequentialThinkingServer();

      // Add 1001 thoughts to exceed default limit
      for (let i = 1; i <= 1001; i++) {
        testServer.processThought({
          thought: `Thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 1001,
          nextThoughtNeeded: i < 1001
        });
      }

      const result = testServer.processThought({
        thought: 'Query',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      });

      const data = JSON.parse(result.content[0].text);
      // Should have evicted oldest, kept max 1000
      expect(data.thoughtHistoryLength).toBe(1000);
    });

    it('should enforce MAX_THOUGHTS_PER_BRANCH limit with default 1000', () => {
      const testServer = new SequentialThinkingServer();

      // Add 1001 thoughts to same branch to exceed default limit
      for (let i = 1; i <= 1001; i++) {
        testServer.processThought({
          thought: `Branch thought ${i}`,
          thoughtNumber: i,
          totalThoughts: 1001,
          nextThoughtNeeded: i < 1001,
          branchFromThought: 1,
          branchId: 'test-branch'
        });
      }

      const result = testServer.processThought({
        thought: 'Query',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.branches).toContain('test-branch');
      // Branch should exist but be capped at 1000 thoughts per branch
      expect(data.thoughtHistoryLength).toBe(1000);
    });

    it('should enforce MAX_BRANCHES limit with default 100', () => {
      const testServer = new SequentialThinkingServer();

      // Add 101 different branches to exceed default limit
      for (let i = 1; i <= 101; i++) {
        testServer.processThought({
          thought: `Branch ${i} thought`,
          thoughtNumber: 1,
          totalThoughts: 1,
          nextThoughtNeeded: false,
          branchFromThought: 1,
          branchId: `branch-${i}`
        });
      }

      const result = testServer.processThought({
        thought: 'Query',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false
      });

      const data = JSON.parse(result.content[0].text);
      // Should have evicted oldest branches, kept max 100
      expect(data.branches.length).toBe(100);
      expect(data.branches).not.toContain('branch-1'); // First should be evicted
      expect(data.branches).toContain('branch-101'); // Last should exist
    });
  });

  describe('environment variable validation', () => {
    it('should reject invalid MAX_THOUGHT_HISTORY', () => {
      process.env.MAX_THOUGHT_HISTORY = '200000'; // > 100000
      expect(() => {
        // This triggers env parsing
        const lib = require('../lib.js');
      }).toThrow();
      delete process.env.MAX_THOUGHT_HISTORY;
    });
  });

  describe('ANSI formatting', () => {
    it('should calculate border width using visual length, not ANSI-inclusive length', () => {
      // Enable logging to capture formatted output
      delete process.env.DISABLE_THOUGHT_LOGGING;
      const serverWithLogging = new SequentialThinkingServer();

      // Spy on console.error to capture formatted output
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      serverWithLogging.processThought({
        thought: 'Test',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true
      });

      // Get the formatted output
      const formattedOutput = errorSpy.mock.calls[0][0];

      // Extract border lines
      const lines = formattedOutput.split('\n');
      const topBorder = lines[1]; // ┌───...┐
      const bottomBorder = lines[4]; // └───...┘

      // Borders should have same length (if ANSI handled correctly)
      expect(topBorder.length).toBe(bottomBorder.length);

      errorSpy.mockRestore();
      process.env.DISABLE_THOUGHT_LOGGING = 'true';
    });

    it('should handle long context strings in branch thoughts', () => {
      delete process.env.DISABLE_THOUGHT_LOGGING;
      const serverWithLogging = new SequentialThinkingServer();

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      serverWithLogging.processThought({
        thought: 'Branch thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'very-long-branch-identifier-name'
      });

      const formattedOutput = errorSpy.mock.calls[0][0];
      const lines = formattedOutput.split('\n');
      const topBorder = lines[1];
      const bottomBorder = lines[4];

      // Borders should have same length
      expect(topBorder.length).toBe(bottomBorder.length);

      errorSpy.mockRestore();
      process.env.DISABLE_THOUGHT_LOGGING = 'true';
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
});
