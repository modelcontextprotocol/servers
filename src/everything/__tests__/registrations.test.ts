// Checks what each feature area's register function hands the McpServer,
// with a mocked server. Its imports are static (#4854): the per-test dynamic
// imports they replace ran inside the 5 s test timeout, and a cold start
// (transforming the whole tool tree) could take longer than that.
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConditionalTools, registerTools } from "../tools/index.js";
import { registerPrompts } from "../prompts/index.js";
import { readInstructions, registerResources } from "../resources/index.js";

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

describe("Registration Index Files", () => {
  describe("tools/index.ts", () => {
    it("should register all standard tools", () => {
      const mockServer = createMockServer();

      registerTools(mockServer);

      // Should register 12 standard tools (non-conditional)
      expect(mockServer.registerTool).toHaveBeenCalledTimes(12);

      // Verify specific tools are registered
      const registeredTools = vi
        .mocked(mockServer.registerTool)
        .mock.calls.map((call) => call[0]);
      expect(registeredTools).toContain("echo");
      expect(registeredTools).toContain("get-sum");
      expect(registeredTools).toContain("get-env");
      expect(registeredTools).toContain("get-tiny-image");
      expect(registeredTools).toContain("get-structured-content");
      expect(registeredTools).toContain("get-annotated-message");
      expect(registeredTools).toContain("trigger-long-running-operation");
      expect(registeredTools).toContain("get-resource-links");
      expect(registeredTools).toContain("get-resource-reference");
      expect(registeredTools).toContain("gzip-file-as-resource");
      expect(registeredTools).toContain("toggle-simulated-logging");
      expect(registeredTools).toContain("toggle-subscriber-updates");
    });

    it("should register conditional tools based on capabilities", () => {
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

      const registeredTools = vi
        .mocked(mockServerWithCapabilities.registerTool)
        .mock.calls.map((call) => call[0]);
      expect(registeredTools).toContain("get-roots-list");
      expect(registeredTools).toContain("trigger-elicitation-request");
      expect(registeredTools).toContain("trigger-url-elicitation");
      expect(registeredTools).toContain("trigger-sampling-request");

      // Task-based tools are registered via experimental.tasks.registerToolTask
      expect(
        mockServerWithCapabilities.experimental.tasks.registerToolTask,
      ).toHaveBeenCalled();
    });

    it("should not register conditional tools before capabilities are known", () => {
      // getClientCapabilities() is undefined until initialize; each gated
      // tool treats that as "no capabilities".
      const mockServerBeforeInit = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => undefined),
        },
        experimental: {
          tasks: {
            registerToolTask: vi.fn(),
          },
        },
      } as unknown as McpServer; // partial mock: McpServer's private members rule out a structural literal

      registerConditionalTools(mockServerBeforeInit);

      expect(mockServerBeforeInit.registerTool).not.toHaveBeenCalled();
    });

    it("should not register conditional tools when capabilities missing", () => {
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

  describe("prompts/index.ts", () => {
    it("should register all prompts", () => {
      const mockServer = createMockServer();

      registerPrompts(mockServer);

      // Should register 4 prompts
      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(4);

      const registeredPrompts = vi
        .mocked(mockServer.registerPrompt)
        .mock.calls.map((call) => call[0]);
      expect(registeredPrompts).toContain("simple-prompt");
      expect(registeredPrompts).toContain("args-prompt");
      expect(registeredPrompts).toContain("completable-prompt");
      expect(registeredPrompts).toContain("resource-prompt");
    });
  });

  describe("resources/index.ts", () => {
    it("should register resource templates", () => {
      const mockServer = createMockServer();

      registerResources(mockServer);

      // Should register at least the 2 resource templates (text and blob) plus file resources
      expect(mockServer.registerResource).toHaveBeenCalled();
      const registeredResources = vi
        .mocked(mockServer.registerResource)
        .mock.calls.map((call) => call[0]);
      expect(registeredResources).toContain("Dynamic Text Resource");
      expect(registeredResources).toContain("Dynamic Blob Resource");
    });

    it("should read instructions from file", () => {
      const instructions = readInstructions();

      // Should return a string (either content or error message)
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });
  });
});
