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
            elicitation: {},
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

      // Should register 3 conditional tools + 3 task-based tools when all capabilities present
      expect(mockServerWithCapabilities.registerTool).toHaveBeenCalledTimes(3);

      const registeredTools = (
        mockServerWithCapabilities.registerTool as any
      ).mock.calls.map((call: any[]) => call[0]);
      expect(registeredTools).toContain('get-roots-list');
      expect(registeredTools).toContain('trigger-elicitation-request');
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
