import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";

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
    it("should register all tools unconditionally", async () => {
      const { registerTools } = await import("../tools/index.js");
      const mockServer = createMockServer();

      registerTools(mockServer);

      // Every tool registers up front. There is no capability-gated second
      // pass any more: tools needing elicitation / sampling / roots return
      // `inputRequired(...)`, and the SDK refuses the embedded request with
      // `-32021` at dispatch when the caller lacks the capability -- on both
      // eras. Note the mock advertises NO client capabilities, and the
      // capability-gated tools are still expected below.
      expect(mockServer.registerTool).toHaveBeenCalledTimes(18);

      // Verify specific tools are registered
      const registeredTools = (mockServer.registerTool as any).mock.calls.map(
        (call: any[]) => call[0]
      );
      expect(registeredTools).toContain("echo");
      expect(registeredTools).toContain("get-sum");
      expect(registeredTools).toContain("get-env");
      expect(registeredTools).toContain("get-tiny-image");
      expect(registeredTools).toContain("get-structured-content");
      expect(registeredTools).toContain("get-structured-content-list");
      expect(registeredTools).toContain("get-annotated-message");
      expect(registeredTools).toContain("trigger-long-running-operation");
      expect(registeredTools).toContain("get-resource-links");
      expect(registeredTools).toContain("get-resource-reference");
      expect(registeredTools).toContain("gzip-file-as-resource");
      expect(registeredTools).toContain("toggle-simulated-logging");
      expect(registeredTools).toContain("toggle-subscriber-updates");

      // Formerly "conditional" tools -- now registered up front.
      expect(registeredTools).toContain("get-roots-list");
      expect(registeredTools).toContain("trigger-elicitation-request");
      expect(registeredTools).toContain("trigger-url-elicitation");
      expect(registeredTools).toContain("trigger-sampling-request");

      // Formerly registered through the experimental tasks API, now an
      // ordinary multi-round-trip tool.
      expect(registeredTools).toContain("simulate-research-query");
    });

    it("should not expose a separate conditional registration pass", async () => {
      const toolsIndex = await import("../tools/index.js");

      expect("registerConditionalTools" in toolsIndex).toBe(false);
    });
  });

  describe("prompts/index.ts", () => {
    it("should register all prompts", async () => {
      const { registerPrompts } = await import("../prompts/index.js");
      const mockServer = createMockServer();

      registerPrompts(mockServer);

      // Should register 4 prompts
      expect(mockServer.registerPrompt).toHaveBeenCalledTimes(4);

      const registeredPrompts = (
        mockServer.registerPrompt as any
      ).mock.calls.map((call: any[]) => call[0]);
      expect(registeredPrompts).toContain("simple-prompt");
      expect(registeredPrompts).toContain("args-prompt");
      expect(registeredPrompts).toContain("completable-prompt");
      expect(registeredPrompts).toContain("resource-prompt");
    });
  });

  describe("resources/index.ts", () => {
    it("should register resource templates", async () => {
      const { registerResources } = await import("../resources/index.js");
      const mockServer = createMockServer();

      registerResources(mockServer);

      // Should register at least the 2 resource templates (text and blob) plus file resources
      expect(mockServer.registerResource).toHaveBeenCalled();
      const registeredResources = (
        mockServer.registerResource as any
      ).mock.calls.map((call: any[]) => call[0]);
      expect(registeredResources).toContain("Dynamic Text Resource");
      expect(registeredResources).toContain("Dynamic Blob Resource");
    });

    it("should read instructions from file", async () => {
      const { readInstructions } = await import("../resources/index.js");

      const instructions = readInstructions();

      // Should return a string (either content or error message)
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });
  });
});
