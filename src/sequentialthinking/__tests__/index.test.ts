import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleSequentialThinkingTool } from '../index.js';
import { SequentialThinkingServer } from '../lib.js';

// Silence the chalk-styled stderr boxes during tests.
vi.mock('chalk', () => {
  const id = (str: string) => str;
  return { default: { yellow: id, green: id, blue: id } };
});

describe('handleSequentialThinkingTool', () => {
  let thinking: SequentialThinkingServer;

  beforeEach(() => {
    process.env.DISABLE_THOUGHT_LOGGING = 'true';
    thinking = new SequentialThinkingServer();
  });

  it('returns content + structuredContent on a successful call', async () => {
    const result = await handleSequentialThinkingTool(thinking, {
      thought: 'analyze',
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
    });

    // Pass-through of the underlying content array, plus a parsed
    // structuredContent matching the registered outputSchema.
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('structuredContent');

    const sc = (result as { structuredContent: Record<string, unknown> }).structuredContent;
    expect(sc).toMatchObject({
      thoughtNumber: 1,
      totalThoughts: 3,
      nextThoughtNeeded: true,
      thoughtHistoryLength: 1,
    });
    expect(Array.isArray(sc.branches)).toBe(true);
  });

  it('passes through isError results without trying to parse structured content', async () => {
    // Force the underlying call to fail by having the formatter throw on
    // its console.error step. (Logging is enabled inside processThought.)
    delete process.env.DISABLE_THOUGHT_LOGGING;
    thinking = new SequentialThinkingServer();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('stderr unavailable');
    });

    const result = await handleSequentialThinkingTool(thinking, {
      thought: 'will explode',
      thoughtNumber: 1,
      totalThoughts: 1,
      nextThoughtNeeded: false,
    });

    errSpy.mockRestore();
    process.env.DISABLE_THOUGHT_LOGGING = 'true';

    expect(result).toHaveProperty('isError', true);
    // Crucially, NOT structuredContent — that would imply a successful parse
    // and the SDK shouldn't see a half-formed response on the error branch.
    expect(result).not.toHaveProperty('structuredContent');
  });

  it('reflects auto-adjusted totalThoughts in structuredContent', async () => {
    const result = await handleSequentialThinkingTool(thinking, {
      thought: 'jump ahead',
      thoughtNumber: 5,
      totalThoughts: 3, // less than thoughtNumber: should be bumped to 5
      nextThoughtNeeded: true,
    });

    const sc = (result as { structuredContent: Record<string, unknown> }).structuredContent;
    expect(sc.totalThoughts).toBe(5);
  });

  it('returns an isError response when isRevision is set without revisesThought', async () => {
    const result = await handleSequentialThinkingTool(thinking, {
      thought: 'oops',
      thoughtNumber: 2,
      totalThoughts: 2,
      nextThoughtNeeded: false,
      isRevision: true,
    });

    expect(result).toMatchObject({ isError: true });
    expect(result).not.toHaveProperty('structuredContent');
    const text = (result as { content: { text: string }[] }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/revisesThought is required/),
    });
  });

  it('returns an isError response when branchFromThought is set without branchId', async () => {
    const result = await handleSequentialThinkingTool(thinking, {
      thought: 'oops',
      thoughtNumber: 2,
      totalThoughts: 2,
      nextThoughtNeeded: false,
      branchFromThought: 1,
    });

    expect(result).toMatchObject({ isError: true });
    const text = (result as { content: { text: string }[] }).content[0].text;
    expect(JSON.parse(text)).toMatchObject({
      error: expect.stringMatching(/branchId is required/),
    });
  });
});
