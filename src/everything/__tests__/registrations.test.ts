import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Create mock server
function createMockServer() {
  return {
    registerTool: vi.fn(),
    registerPrompt: vi.fn(),
    registerResource: vi.fn(),
    server: {
      getClientCapabilities: vi.fn(() => ({})),
      setRequestHandler: vi.fn(),
    },
    sendLoggingMessage: vi.fn(),
    sendResourceUpdated: vi.fn(),
  } as unknown as McpServer;
}

describe('Registration Index Files', () => {
  describe('tools/index.ts', () => {
    it('should register all standard tools', async () => {
      const { registerTools } = await import('../tools/index.js');
      const mockServer = createMockServer();

      registerTools(mockServer);

      // Should register 12 standard tools (non-conditional)
      expect(mockServer.registerTool).toHaveBeenCalledTimes(12);

      // Verify specific tools are registered
      const registeredTools = (mockServer.registerTool as any).mock.calls.map(
        (call: any[]) => call[0]
      );
      expect(registeredTools).toContain('echo');
      expect(registeredTools).toContain('get-sum');
      expect(registeredTools).toContain('get-env');
      expect(registeredTools).toContain('get-tiny-image');
      expect(registeredTools).toContain('get-structured-content');
      expect(registeredTools).toContain('get-annotated-message');
      expect(registeredTools).toContain('trigger-long-running-operation');
      expect(registeredTools).toContain('get-resource-links');
      expect(registeredTools).toContain('get-resource-reference');
      expect(registeredTools).toContain('gzip-file-as-resource');
      expect(registeredTools).toContain('toggle-simulated-logging');
      expect(registeredTools).toContain('toggle-subscriber-updates');
    });

    it('should register conditional tools based on capabilities', async () => {
      const { registerConditionalTools } = await import('../tools/index.js');

      // Server with all capabilities including experimental tasks API
      const mockServerWithCapabilities = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => ({
            roots: {},
            elicitation: { url: {} },
            sampling: {},
          })),
        },
        experimental: {
          tasks: {
            registerToolTask: vi.fn(),
          },
        },
      } as unknown as McpServer;

      registerConditionalTools(mockServerWithCapabilities);

      // Should register 4 conditional tools via registerTool when all capabilities
      // are present. Task-based tools register via registerToolTask (counted separately),
      // so they are not included in this registerTool count.
      expect(mockServerWithCapabilities.registerTool).toHaveBeenCalledTimes(4);

      const registeredTools = (
        mockServerWithCapabilities.registerTool as any
      ).mock.calls.map((call: any[]) => call[0]);
      expect(registeredTools).toContain('get-roots-list');
      expect(registeredTools).toContain('trigger-elicitation-request');
      expect(registeredTools).toContain('trigger-url-elicitation');
      expect(registeredTools).toContain('trigger-sampling-request');

      // Task-based tools are registered via experimental.tasks.registerToolTask
      expect(mockServerWithCapabilities.experimental.tasks.registerToolTask).toHaveBeenCalled();
    });

    it('should not register conditional tools when capabilities missing', async () => {
      const { registerConditionalTools } = await import('../tools/index.js');

      const mockServerNoCapabilities = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => ({})),
        },
        experimental: {
          tasks: {
            registerToolTask: vi.fn(),
          },
        },
      } as unknown as McpServer;

      registerConditionalTools(mockServerNoCapabilities);

      // Should not register any capability-gated tools when capabilities are missing
      expect(mockServerNoCapabilities.registerTool).not.toHaveBeenCalled();
    });
  });

  describe('prompts/index.ts', () => {
    it('should register all prompts', async () => {
      const { registerPrompts } = await import('../prompts/index.js');
      const mockServer = createMockServer();

      registerPrompts(mockServer);

      // Should register 4 prompts
      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(4);

      const registeredPrompts = (mockServer.registerPrompt as any).mock.calls.map(
        (call: any[]) => call[0]
      );
      expect(registeredPrompts).toContain('simple-prompt');
      expect(registeredPrompts).toContain('args-prompt');
      expect(registeredPrompts).toContain('completable-prompt');
      expect(registeredPrompts).toContain('resource-prompt');
    });
  });

  describe('instructions vs. capability-gated tools', () => {
    // The instructions are read once in the server factory and handed to the
    // McpServer constructor, before `oninitialized` runs and client capabilities
    // are known. They are therefore the same string for every client, while the
    // tools registered by registerConditionalTools are not. These tests pin the
    // two together.

    // Every capability the conditional tools gate on, so the "all capabilities"
    // registration below is the full set.
    const allCapabilities = {
      roots: {},
      sampling: {},
      elicitation: { url: {} },
      tasks: {
        requests: {
          sampling: { createMessage: {} },
          elicitation: { create: {} },
        },
      },
    };

    const registeredWith = async (capabilities: object): Promise<string[]> => {
      const { registerConditionalTools } = await import('../tools/index.js');
      const mockServer = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => capabilities),
        },
        experimental: {
          tasks: {
            registerToolTask: vi.fn(),
          },
        },
      } as unknown as McpServer;

      registerConditionalTools(mockServer);

      const viaRegisterTool = (mockServer.registerTool as any).mock.calls.map(
        (call: any[]) => call[0]
      );
      const viaRegisterToolTask = (
        mockServer.experimental.tasks.registerToolTask as any
      ).mock.calls.map((call: any[]) => call[0]);
      return [...viaRegisterTool, ...viaRegisterToolTask];
    };

    // A tool is capability-gated if declaring the capabilities makes it appear.
    // Deriving it as a difference rather than hard-coding a list means a tool
    // that stops being gated drops out of these assertions on its own.
    const gatedTools = async (): Promise<string[]> => {
      const withAll = await registeredWith(allCapabilities);
      const withNone = await registeredWith({});
      return withAll.filter((name) => !withNone.includes(name)).sort();
    };

    // The rows of the "Capability-Gated Tools" table, by tool name.
    const documentedTools = (instructions: string): string[] => {
      const section = instructions
        .split(/^## /m)
        .find((part) => part.startsWith('Capability-Gated Tools'));
      expect(section, 'instructions.md has no "Capability-Gated Tools" section').toBeDefined();
      return [...section!.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)]
        .map((match) => match[1])
        .sort();
    };

    it('documents exactly the tools that client capabilities gate', async () => {
      const { readInstructions } = await import('../resources/index.js');

      // A tool registered only when a capability is declared is absent from
      // tools/list for every other client, so an agent told to use it has
      // nothing to call. The instructions must name the same set the gates do.
      expect(documentedTools(readInstructions())).toEqual(await gatedTools());
    });

    it('never tells an agent to use a capability-gated tool unconditionally', async () => {
      const { readInstructions } = await import('../resources/index.js');
      const instructions = readInstructions();
      const gated = await gatedTools();

      // Lines in the gated section are already qualified by the section itself.
      const sections = instructions.split(/^## /m);
      const otherLines = sections
        .filter((part) => !part.startsWith('Capability-Gated Tools'))
        .flatMap((part) => part.split('\n'));

      const unconditional = otherLines.filter(
        (line) => gated.some((name) => line.includes(`\`${name}\``)) && !/\bif\b/i.test(line)
      );

      expect(unconditional, 'mention a gated tool without saying it may be absent').toEqual([]);
    });
  });

  describe('resources/index.ts', () => {
    it('should register resource templates', async () => {
      const { registerResources } = await import('../resources/index.js');
      const mockServer = createMockServer();

      registerResources(mockServer);

      // Should register at least the 2 resource templates (text and blob) plus file resources
      expect(mockServer.registerResource).toHaveBeenCalled();
      const registeredResources = (mockServer.registerResource as any).mock.calls.map(
        (call: any[]) => call[0]
      );
      expect(registeredResources).toContain('Dynamic Text Resource');
      expect(registeredResources).toContain('Dynamic Blob Resource');
    });

    it('should read instructions from file', async () => {
      const { readInstructions } = await import('../resources/index.js');

      const instructions = readInstructions();

      // Should return a string (either content or error message)
      expect(typeof instructions).toBe('string');
      expect(instructions.length).toBeGreaterThan(0);
    });
  });
});
