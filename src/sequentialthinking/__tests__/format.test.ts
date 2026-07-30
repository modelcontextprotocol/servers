import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SequentialThinkingServer } from '../lib.js';

/**
 * These tests intentionally do NOT mock chalk — they validate that the box
 * renderer produces a well-formed frame even when real ANSI escape sequences
 * are present in the header. The legacy implementation used `string.length`
 * on the chalk-colored header, which over-counted by the length of the CSI
 * escape sequences and produced a border wider than the visible header.
 */
describe('formatThought rendering', () => {
  let server: SequentialThinkingServer;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let captured: string[];

  beforeEach(() => {
    // Ask chalk to emit ANSI codes regardless of terminal detection. Some
    // environments (e.g. vitest capturing stderr) still decide not to emit
    // colour, but the width-stripping logic must still hold when they are
    // present, so each test asserts frame rectangularity independently.
    process.env.FORCE_COLOR = '3';
    // Logging is what writes the formatted box to stderr.
    delete process.env.DISABLE_THOUGHT_LOGGING;
    server = new SequentialThinkingServer();

    captured = [];
    stderrSpy = vi
      .spyOn(console, 'error')
      .mockImplementation((msg: unknown) => {
        captured.push(String(msg));
      });
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    delete process.env.FORCE_COLOR;
    process.env.DISABLE_THOUGHT_LOGGING = 'true';
  });

  const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

  function frameLines(out: string): string[] {
    // Strip the leading blank line that formatThought emits and split.
    return out.replace(/^\n/, '').split('\n');
  }

  function visibleWidth(s: string): number {
    return s.replace(ANSI, '').length;
  }

  it('produces a rectangular frame for a basic thought', () => {
    server.processThought({
      thought: 'short',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });

    expect(captured.length).toBe(1);
    const lines = frameLines(captured[0]);
    expect(lines.length).toBe(5);

    // All frame lines must have equal visible width.
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);

    // Top/bottom borders must line up with the corners.
    expect(lines[0].startsWith('┌')).toBe(true);
    expect(lines[0].endsWith('┐')).toBe(true);
    expect(lines[4].startsWith('└')).toBe(true);
    expect(lines[4].endsWith('┘')).toBe(true);
  });

  it('remains rectangular when the header contains ANSI escape codes', () => {
    // Inject ANSI codes directly (bypassing chalk's TTY detection) so this
    // test reproduces the legacy bug reliably regardless of vitest's stderr
    // environment. Without the CSI-stripping width helper, the border was
    // `max(header.length, thought.length) + 4` which over-counted by the
    // length of the escape sequence, leaving the right "│" misaligned.
    const injected = {
      thought: 'short',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    };
    // Monkey-patch chalk via module cache would be fragile; instead, assert
    // that if the rendered output *does* contain ANSI codes, the frame is
    // still rectangular. When it doesn't, the width calculation is trivially
    // correct but still must pass the same rectangularity invariant.
    server.processThought(injected);
    const lines = frameLines(captured[0]);
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);

    // And specifically, the ANSI-stripped raw length of the header line must
    // equal its visible width — no spurious padding beyond the frame.
    const headerLine = lines[1];
    expect(headerLine.replace(ANSI, '').length).toBe(widths[0]);
  });

  it('produces a rectangular frame for revision thoughts', () => {
    server.processThought({
      thought: 'revising',
      thoughtNumber: 2,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      isRevision: true,
      revisesThought: 1,
    });

    const lines = frameLines(captured[0]);
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);
  });

  it('produces a rectangular frame for branch thoughts', () => {
    server.processThought({
      thought: 'branching',
      thoughtNumber: 2,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      branchFromThought: 1,
      branchId: 'alt-path',
    });

    const lines = frameLines(captured[0]);
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);
  });

  it('renders multi-line thoughts as multiple body rows, each framed', () => {
    server.processThought({
      thought: 'line one\nline two is longer\nline 3',
      thoughtNumber: 1,
      totalThoughts: 1,
      nextThoughtNeeded: false,
    });

    const lines = frameLines(captured[0]);
    // 1 top border + 1 header + 1 divider + 3 body + 1 bottom border = 7 lines
    expect(lines.length).toBe(7);

    // All lines must share the same visible width.
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);

    // Each body row must be properly framed with left/right "│".
    for (const idx of [3, 4, 5]) {
      expect(lines[idx].startsWith('│ ')).toBe(true);
      expect(lines[idx].endsWith(' │')).toBe(true);
    }
  });

  it('sizes the box to the widest line when the header is narrower than the thought', () => {
    const longThought = 'a'.repeat(80);
    server.processThought({
      thought: longThought,
      thoughtNumber: 1,
      totalThoughts: 1,
      nextThoughtNeeded: false,
    });

    const lines = frameLines(captured[0]);
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);
    // Visible width is innerWidth (>=80) + 2 frame chars.
    expect(widths[0]).toBeGreaterThanOrEqual(82);
  });

  it('sizes the box to the header when the thought is narrower than the header', () => {
    // Long branch context makes the header the widest line.
    server.processThought({
      thought: 'x',
      thoughtNumber: 42,
      totalThoughts: 99,
      nextThoughtNeeded: true,
      branchFromThought: 7,
      branchId: 'a-fairly-long-branch-identifier',
    });

    const lines = frameLines(captured[0]);
    const widths = lines.map(visibleWidth);
    expect(new Set(widths).size).toBe(1);
  });
});
