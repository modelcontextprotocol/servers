import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  registeredTools: [] as Array<{
    name: string;
    config: {
      title?: string;
      description?: string;
      inputSchema?: Record<string, { parse: (value: unknown) => unknown }>;
      outputSchema?: Record<string, unknown>;
      annotations?: Record<string, unknown>;
    };
    handler: (args: any) => Promise<any>;
  }>,
  processThought: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
  class FakeMcpServer {
    registerTool(
      name: string,
      config: any,
      handler: (args: any) => Promise<any>
    ) {
      mocks.registeredTools.push({ name, config, handler });
    }
    async connect() {}
  }
  return { McpServer: FakeMcpServer };
});

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class {},
}));

vi.mock('../lib.js', () => ({
  SequentialThinkingServer: class {
    processThought = mocks.processThought;
  },
}));

await import('../index.js');

function getTool(name: string) {
  const tool = mocks.registeredTools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not registered: ${name}`);
  return tool;
}

describe('Sequential Thinking Server Registration', () => {
  it('registers the sequentialthinking tool once', () => {
    const names = mocks.registeredTools.map((t) => t.name);
    expect(names.filter((n) => n === 'sequentialthinking')).toHaveLength(1);
  });

  it('advertises read-only annotations and a detailed description', () => {
    const tool = getTool('sequentialthinking');
    expect(tool.config.annotations).toEqual({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    });
    expect(tool.config.description).toContain('dynamic and reflective problem-solving');
    expect(Object.keys(tool.config.outputSchema ?? {}).sort()).toEqual([
      'branches',
      'nextThoughtNeeded',
      'thoughtHistoryLength',
      'thoughtNumber',
      'totalThoughts'
    ]);
  });
});

describe('sequentialthinking Input Schema', () => {
  const schema = () => getTool('sequentialthinking').config.inputSchema!;

  it.each([
    [true, true],
    ['true', true],
    ['TRUE', true],
    [false, false],
    ['False', false]
  ])('coerces %p to %p for nextThoughtNeeded', (input, expected) => {
    expect(schema().nextThoughtNeeded!.parse(input)).toBe(expected);
  });

  it('passes through values that are neither boolean nor boolean-like strings', () => {
    // The preprocess leaves unknown values untouched; z.boolean() then rejects them
    expect(() => schema().nextThoughtNeeded!.parse(42)).toThrow();
  });

  it('keeps required fields typed as numbers via coercion', () => {
    expect(schema().thoughtNumber!.parse('3')).toBe(3);
    expect(schema().totalThoughts!.parse('5')).toBe(5);
  });

  it('exposes every documented parameter', () => {
    expect(Object.keys(schema()).sort()).toEqual([
      'branchFromThought',
      'branchId',
      'isRevision',
      'needsMoreThoughts',
      'nextThoughtNeeded',
      'revisesThought',
      'thought',
      'thoughtNumber',
      'totalThoughts'
    ]);
  });
});

describe('sequentialthinking Tool Handler', () => {
  beforeEach(() => {
    mocks.processThought.mockReset();
  });

  it('returns structured content parsed from the thinking result', async () => {
    const inner = {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            thoughtNumber: 2,
            totalThoughts: 5,
            nextThoughtNeeded: true,
            branches: [],
            thoughtHistoryLength: 2
          })
        }
      ]
    };
    mocks.processThought.mockReturnValue(inner);

    const args = {
      thought: 'Break the problem into steps',
      nextThoughtNeeded: true,
      thoughtNumber: 2,
      totalThoughts: 5
    };
    const result = await getTool('sequentialthinking').handler(args);

    expect(mocks.processThought).toHaveBeenCalledWith(args);
    expect(result.content).toBe(inner.content);
    expect(result.structuredContent).toEqual({
      thoughtNumber: 2,
      totalThoughts: 5,
      nextThoughtNeeded: true,
      branches: [],
      thoughtHistoryLength: 2
    });
  });

  it('returns error results untouched without parsing them', async () => {
    const errorResult = {
      content: [{ type: 'text' as const, text: 'Invalid thought: revision without revisesThought' }],
      isError: true
    };
    mocks.processThought.mockReturnValue(errorResult);

    const result = await getTool('sequentialthinking').handler({
      thought: 'bad',
      nextThoughtNeeded: false,
      thoughtNumber: 1,
      totalThoughts: 1,
      isRevision: true
    });

    expect(result).toBe(errorResult);
    expect(result.isError).toBe(true);
  });
});

describe('Sequential Thinking Server Startup', () => {
  it('reports a fatal error and exits when the transport cannot connect', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
    const proto = (McpServer as unknown as { prototype: { connect: () => Promise<void> } }).prototype;
    const originalConnect = proto.connect;
    proto.connect = async () => {
      throw new Error('stdio unavailable');
    };

    try {
      vi.resetModules();
      await import('../index.js');
      // Allow runServer().catch(...) to settle
      await new Promise((resolve) => setImmediate(resolve));
      expect(errSpy).toHaveBeenCalledWith('Fatal error running server:', expect.any(Error));
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      proto.connect = originalConnect;
      exitSpy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
