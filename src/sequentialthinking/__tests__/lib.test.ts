import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequentialThinkingServer, ThoughtData, displayWidth, validateThoughtData } from '../lib.js';

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

  // Note: Input validation tests removed - validation now happens at the tool
  // registration layer via Zod schemas before processThought is called

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

  describe('formatThought - box alignment', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let serverWithLogging: SequentialThinkingServer;

    // Strip ANSI escape sequences so width comparisons reflect what's actually
    // rendered in a terminal, regardless of whether chalk is mocked or not.
    const stripAnsi = (s: string) => s.replace(/\[\d+(;\d+)*m/g, '');

    beforeEach(() => {
      delete process.env.DISABLE_THOUGHT_LOGGING;
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      serverWithLogging = new SequentialThinkingServer();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      process.env.DISABLE_THOUGHT_LOGGING = 'true';
    });

    const collectBoxLines = (): string[] => {
      const captured = consoleErrorSpy.mock.calls[0][0] as string;
      return captured.split('\n').filter((l) => l.length > 0);
    };

    it('aligns all borders when the thought is longer than the header', () => {
      serverWithLogging.processThought({
        thought: 'Test thought with logging',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });

      const lines = collectBoxLines();
      const widths = lines.map((l) => stripAnsi(l).length);
      expect(new Set(widths).size,
        `Expected uniform line widths, got ${widths.join(',')} for:\n${lines.join('\n')}`
      ).toBe(1);
    });

    it('aligns all borders for revision headers', () => {
      serverWithLogging.processThought({
        thought: 'Revised thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1,
      });

      const widths = collectBoxLines().map((l) => stripAnsi(l).length);
      expect(new Set(widths).size).toBe(1);
    });

    it('aligns all borders for branch headers', () => {
      serverWithLogging.processThought({
        thought: 'Branch thought',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: false,
        branchFromThought: 1,
        branchId: 'branch-a',
      });

      const widths = collectBoxLines().map((l) => stripAnsi(l).length);
      expect(new Set(widths).size).toBe(1);
    });

    it('aligns all borders when the header is longer than the thought', () => {
      serverWithLogging.processThought({
        thought: 'short',
        thoughtNumber: 2,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        isRevision: true,
        revisesThought: 1,
      });

      const widths = collectBoxLines().map((l) => stripAnsi(l).length);
      expect(new Set(widths).size).toBe(1);
    });

    it('renders multi-line thoughts with one row per line and aligned borders', () => {
      serverWithLogging.processThought({
        thought: 'first line of thought\nsecond line is shorter\nthird',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      const lines = collectBoxLines();
      const widths = lines.map((l) => stripAnsi(l).length);
      expect(
        new Set(widths).size,
        `Expected uniform widths, got ${widths.join(',')} for:\n${lines.join('\n')}`
      ).toBe(1);

      // Layout should now be: ┌─┐ + header + ├─┤ + 3 thought rows + └─┘ = 7 lines.
      expect(lines.length).toBe(7);
    });

    it('handles CJK wide characters by treating them as two columns', () => {
      serverWithLogging.processThought({
        thought: '你好世界',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      const lines = collectBoxLines();
      // Use lib's own displayWidth so the test is checking that the formatter
      // is *internally consistent* with its width model. The model itself is
      // pinned by the unit tests in `describe('displayWidth')` below.
      const widths = lines.map(displayWidth);
      expect(
        new Set(widths).size,
        `Expected uniform display widths, got ${widths.join(',')} for:\n${lines.join('\n')}`
      ).toBe(1);
    });
  });

  describe('displayWidth', () => {
    it('treats ASCII as 1 column per char', () => {
      expect(displayWidth('hello')).toBe(5);
    });

    it('treats CJK ideographs as 2 columns', () => {
      expect(displayWidth('你好')).toBe(4);
      expect(displayWidth('世界')).toBe(4);
    });

    it('treats SMP emoji as 2 columns', () => {
      expect(displayWidth('💭')).toBe(2);
      expect(displayWidth('🔄')).toBe(2);
      expect(displayWidth('🌿')).toBe(2);
    });

    it('strips ANSI CSI escapes before counting', () => {
      // [34m and [39m wrap blue text; both should be invisible.
      expect(displayWidth('[34mhi[39m')).toBe(2);
    });

    it('handles mixed ASCII + CJK + emoji', () => {
      expect(displayWidth('a你💭b')).toBe(1 + 2 + 2 + 1);
    });

    it('treats ZWJ-joined emoji as a single 2-column grapheme', () => {
      // 👨‍💻 = man (U+1F468) + ZWJ (U+200D) + laptop (U+1F4BB) = 1 grapheme.
      expect(displayWidth('👨‍💻')).toBe(2);
    });

    it('treats VS-16 emoji presentation as 2 columns', () => {
      // ⚠️ = warning sign (U+26A0) + VS-16 (U+FE0F) — variation selector
      // forces emoji (wide) presentation in modern terminals.
      expect(displayWidth('⚠️')).toBe(2);
    });
  });

  describe('formatThought - tab handling', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let serverWithLogging: SequentialThinkingServer;

    beforeEach(() => {
      delete process.env.DISABLE_THOUGHT_LOGGING;
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      serverWithLogging = new SequentialThinkingServer();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      process.env.DISABLE_THOUGHT_LOGGING = 'true';
    });

    it('expands tabs in thought so the box stays aligned', () => {
      serverWithLogging.processThought({
        thought: 'foo\tbar\tbaz',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      const captured = consoleErrorSpy.mock.calls[0][0] as string;
      // Tabs should not survive into the rendered box — terminals expand
      // them based on tab stops, which would knock the right border out
      // of alignment.
      expect(captured).not.toContain('\t');

      const lines = captured.split('\n').filter((l) => l.length > 0);
      const widths = lines.map(displayWidth);
      expect(
        new Set(widths).size,
        `Expected uniform widths, got ${widths.join(',')} for:\n${lines.join('\n')}`
      ).toBe(1);
    });
  });

  describe('formatThought - line wrapping', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let serverWithLogging: SequentialThinkingServer;

    beforeEach(() => {
      delete process.env.DISABLE_THOUGHT_LOGGING;
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      serverWithLogging = new SequentialThinkingServer();
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      process.env.DISABLE_THOUGHT_LOGGING = 'true';
    });

    const collectBoxLines = (): string[] => {
      const captured = consoleErrorSpy.mock.calls[0][0] as string;
      return captured.split('\n').filter((l) => l.length > 0);
    };

    it('wraps long ASCII thoughts to keep the box within 80 columns', () => {
      serverWithLogging.processThought({
        thought: 'a'.repeat(200),
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      const lines = collectBoxLines();
      const widths = lines.map(displayWidth);
      expect(
        Math.max(...widths),
        `Expected max width <= 80, got ${Math.max(...widths)} for:\n${lines.join('\n')}`
      ).toBeLessThanOrEqual(80);
      // All rendered lines (borders + thought rows) should be uniform width.
      expect(new Set(widths).size).toBe(1);
    });

    it('wraps long CJK thoughts at grapheme boundaries', () => {
      // 100 CJK chars = ~200 display columns, must wrap.
      const longCjk = '测试内容'.repeat(25);
      serverWithLogging.processThought({
        thought: longCjk,
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      const lines = collectBoxLines();
      const widths = lines.map(displayWidth);
      expect(Math.max(...widths)).toBeLessThanOrEqual(80);
      expect(new Set(widths).size).toBe(1);
    });

    it('does not split inside a ZWJ emoji cluster when wrapping', () => {
      // Pad with ASCII filler so wrapping must happen mid-content,
      // and the 👨‍💻 cluster must stay intact across the wrap.
      const filler = 'x'.repeat(76);
      serverWithLogging.processThought({
        thought: `${filler}👨‍💻end`,
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      const captured = consoleErrorSpy.mock.calls[0][0] as string;
      // ZWJ sequence intact: U+1F468 U+200D U+1F4BB must appear contiguously,
      // i.e. no border characters injected mid-cluster.
      expect(captured).toContain('👨‍💻');
    });
  });

  describe('processThought - input handling and error path', () => {
    it('does not mutate the caller-supplied input object', () => {
      const input: ThoughtData = {
        thought: 'first',
        thoughtNumber: 5,
        totalThoughts: 3,  // intentionally less than thoughtNumber
        nextThoughtNeeded: true,
      };
      const snapshot = JSON.parse(JSON.stringify(input));

      const localServer = new SequentialThinkingServer();
      localServer.processThought(input);

      expect(input).toEqual(snapshot);
    });

    it('still reports the auto-adjusted totalThoughts in the response', () => {
      const localServer = new SequentialThinkingServer();
      const result = localServer.processThought({
        thought: 'first',
        thoughtNumber: 5,
        totalThoughts: 3,
        nextThoughtNeeded: true,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.totalThoughts).toBe(5);
    });

    it('returns an error response when logging throws', () => {
      // Re-enable logging so the failing console.error path executes.
      delete process.env.DISABLE_THOUGHT_LOGGING;
      const localServer = new SequentialThinkingServer();

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        throw new Error('stderr unavailable');
      });

      const result = localServer.processThought({
        thought: 'will explode in stderr',
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: false,
      });

      errorSpy.mockRestore();
      process.env.DISABLE_THOUGHT_LOGGING = 'true';

      expect(result.isError).toBe(true);
      const data = JSON.parse(result.content[0].text);
      expect(data.status).toBe('failed');
      expect(data.error).toContain('stderr unavailable');
    });
  });

  describe('validateThoughtData', () => {
    const baseInput: ThoughtData = {
      thought: 'x',
      thoughtNumber: 3,
      totalThoughts: 5,
      nextThoughtNeeded: true,
    };

    it('accepts a plain valid thought', () => {
      expect(validateThoughtData(baseInput)).toEqual({ ok: true });
    });

    it('rejects isRevision=true without revisesThought', () => {
      const result = validateThoughtData({ ...baseInput, isRevision: true });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/revisesThought is required/);
      }
    });

    it('rejects revisesThought >= thoughtNumber', () => {
      const result = validateThoughtData({
        ...baseInput,
        thoughtNumber: 3,
        isRevision: true,
        revisesThought: 3,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/must be earlier than thoughtNumber/);
      }
    });

    it('accepts a valid revision pointing to an earlier thought', () => {
      expect(
        validateThoughtData({
          ...baseInput,
          thoughtNumber: 3,
          isRevision: true,
          revisesThought: 1,
        })
      ).toEqual({ ok: true });
    });

    it('rejects branchFromThought without branchId', () => {
      const result = validateThoughtData({ ...baseInput, branchFromThought: 1 });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/branchId is required/);
      }
    });

    it('rejects branchFromThought >= thoughtNumber', () => {
      const result = validateThoughtData({
        ...baseInput,
        thoughtNumber: 3,
        branchFromThought: 3,
        branchId: 'b',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/must be earlier than thoughtNumber/);
      }
    });

    it('accepts a valid branch from an earlier thought', () => {
      expect(
        validateThoughtData({
          ...baseInput,
          thoughtNumber: 3,
          branchFromThought: 1,
          branchId: 'b',
        })
      ).toEqual({ ok: true });
    });
  });
});
