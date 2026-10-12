// Checks what each feature area's register function hands the McpServer,
// with a mocked server. Its imports are static (#4854): the per-test dynamic
// imports they replace ran inside the 5 s test timeout, and a cold start
// (transforming the whole tool tree) could take longer than that.
import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";
import {
  registerConditionalTools,
  registerLegacyTools,
  registerModernTools,
  registerTools,
} from "../tools/index.js";
import { registerPrompts } from "../prompts/index.js";
import { readInstructions, registerResources } from "../resources/index.js";
import type { ServerContext } from "../server/context.js";

/** A server context for the given era, with a publisher that does nothing. */
function contextFor(era: "legacy" | "modern"): ServerContext {
  return {
    era,
    subscribed: new Set(),
    publish: {
      toolsChanged: vi.fn(),
      promptsChanged: vi.fn(),
      resourcesChanged: vi.fn(),
      resourceUpdated: vi.fn(),
    },
    onCleanup: vi.fn(),
  };
}

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

      registerTools(mockServer, contextFor("legacy"));

      // Should register 14 standard tools (on both eras, non-conditional)
      expect(mockServer.registerTool).toHaveBeenCalledTimes(14);

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
      expect(registeredTools).toContain("get-header-params");
      expect(registeredTools).toContain("trigger-list-changed");
      expect(registeredTools).toContain("trigger-log-messages");
      expect(registeredTools).toContain("trigger-resource-update");
    });

    it("should register the deprecated 2025-era-only tools", () => {
      const mockServer = createMockServer();

      registerLegacyTools(mockServer, contextFor("legacy"));

      const registeredTools = vi
        .mocked(mockServer.registerTool)
        .mock.calls.map((call) => call[0]);
      expect(registeredTools).toEqual([
        "toggle-simulated-logging",
        "toggle-subscriber-updates",
      ]);
    });

    it("should register the capability-gated and task tools up front for 2026-07-28", () => {
      const mockServer = createMockServer();

      registerModernTools(mockServer, contextFor("modern"));

      const registeredTools = vi
        .mocked(mockServer.registerTool)
        .mock.calls.map((call) => call[0]);
      expect(registeredTools).toEqual([
        "get-roots-list",
        "trigger-elicitation-request",
        "trigger-multi-step-elicitation",
        "trigger-url-elicitation",
        "trigger-sampling-request",
        "simulate-research-query",
        "trigger-sampling-request-async",
        "trigger-elicitation-request-async",
      ]);
    });

    it("should register conditional tools based on capabilities", () => {
      // Server with all capabilities
      const mockServerWithCapabilities = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => ({
            roots: {},
            elicitation: { form: {}, url: {} },
            sampling: {},
          })),
        },
      } as unknown as McpServer;

      registerConditionalTools(
        mockServerWithCapabilities,
        contextFor("legacy"),
      );

      // Should register 5 conditional tools via registerTool when all
      // capabilities are present. The task tools are 2026-07-28 only (#4852).
      expect(mockServerWithCapabilities.registerTool).toHaveBeenCalledTimes(5);

      const registeredTools = vi
        .mocked(mockServerWithCapabilities.registerTool)
        .mock.calls.map((call) => call[0]);
      expect(registeredTools).toContain("get-roots-list");
      expect(registeredTools).toContain("trigger-elicitation-request");
      expect(registeredTools).toContain("trigger-multi-step-elicitation");
      expect(registeredTools).toContain("trigger-url-elicitation");
      expect(registeredTools).toContain("trigger-sampling-request");
    });

    it("should not register conditional tools before capabilities are known", () => {
      // getClientCapabilities() is undefined until initialize; each gated
      // tool treats that as "no capabilities".
      const mockServerBeforeInit = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => undefined),
        },
      } as unknown as McpServer; // partial mock: McpServer's private members rule out a structural literal

      registerConditionalTools(mockServerBeforeInit, contextFor("legacy"));

      expect(mockServerBeforeInit.registerTool).not.toHaveBeenCalled();
    });

    it("should not register conditional tools when capabilities missing", () => {
      const mockServerNoCapabilities = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => ({})),
        },
      } as unknown as McpServer;

      registerConditionalTools(mockServerNoCapabilities, contextFor("legacy"));

      // Should not register any capability-gated tools when capabilities are missing
      expect(mockServerNoCapabilities.registerTool).not.toHaveBeenCalled();
    });

    it("should register no form-mode elicitation tool for a URL-only client", () => {
      // The form elicitation tools send form-mode requests, which a client
      // that declared only `elicitation.url` cannot answer (#4985).
      const mockServerUrlOnly = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => ({
            elicitation: { url: {} },
          })),
        },
      } as unknown as McpServer; // partial mock: McpServer's private members rule out a structural literal

      registerConditionalTools(mockServerUrlOnly, contextFor("legacy"));

      const registeredTools = vi
        .mocked(mockServerUrlOnly.registerTool)
        .mock.calls.map((call) => call[0]);
      expect(registeredTools).toEqual(["trigger-url-elicitation"]);
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

  describe("instructions vs. capability-gated tools", () => {
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
      elicitation: { form: {}, url: {} },
    };

    const registeredWith = (capabilities: object): string[] => {
      const mockServer = {
        registerTool: vi.fn(),
        server: {
          getClientCapabilities: vi.fn(() => capabilities),
        },
      } as unknown as McpServer; // partial mock: McpServer's private members rule out a structural literal

      registerConditionalTools(mockServer, contextFor("legacy"));

      return vi
        .mocked(mockServer.registerTool)
        .mock.calls.map((call) => call[0]);
    };

    // A tool is capability-gated if declaring the capabilities makes it appear.
    // Deriving it as a difference rather than hard-coding a list means a tool
    // that stops being gated drops out of these assertions on its own.
    const gatedTools = (): string[] => {
      const withAll = registeredWith(allCapabilities);
      const withNone = registeredWith({});
      return withAll.filter((name) => !withNone.includes(name)).sort();
    };

    // The entries of the "Capability-Gated Tools" list, by tool name.
    const documentedTools = (instructions: string): string[] => {
      const section = instructions
        .split(/^## /m)
        .find((part) => part.startsWith("Capability-Gated Tools"));
      expect(
        section,
        'instructions.md has no "Capability-Gated Tools" section',
      ).toBeDefined();
      return [...(section ?? "").matchAll(/^- `([a-z0-9-]+)`:/gm)]
        .map((match) => match[1])
        .sort();
    };

    it("documents exactly the tools that client capabilities gate", () => {
      // A tool registered only when a capability is declared is absent from
      // tools/list for every other client, so an agent told to use it has
      // nothing to call. The instructions must name the same set the gates do.
      expect(documentedTools(readInstructions())).toEqual(gatedTools());
    });

    it("never tells an agent to use a capability-gated tool unconditionally", () => {
      const instructions = readInstructions();
      const gated = gatedTools();

      // Lines in the gated section are already qualified by the section itself.
      const sections = instructions.split(/^## /m);
      const otherLines = sections
        .filter((part) => !part.startsWith("Capability-Gated Tools"))
        .flatMap((part) => part.split("\n"));

      const unconditional = otherLines.filter(
        (line) =>
          gated.some((name) => line.includes(`\`${name}\``)) &&
          !/\bif\b/i.test(line),
      );

      expect(
        unconditional,
        "mention a gated tool without saying it may be absent",
      ).toEqual([]);
    });
  });

  describe("resources/index.ts", () => {
    it("should register resource templates", () => {
      const mockServer = createMockServer();

      registerResources(mockServer, contextFor("legacy"));

      // Should register at least the 2 resource templates (text and blob) plus file resources
      expect(mockServer.registerResource).toHaveBeenCalled();
      const registeredResources = vi
        .mocked(mockServer.registerResource)
        .mock.calls.map((call) => call[0]);
      expect(registeredResources).toContain("Dynamic Text Resource");
      expect(registeredResources).toContain("Dynamic Blob Resource");
      expect(registeredResources).not.toContain("Minted Resource");
    });

    it("should also serve minted resources on 2026-07-28", () => {
      const mockServer = createMockServer();

      registerResources(mockServer, contextFor("modern"));

      const registeredResources = vi
        .mocked(mockServer.registerResource)
        .mock.calls.map((call) => call[0]);
      expect(registeredResources).toContain("Minted Resource");
    });

    it("should read instructions from file", () => {
      const instructions = readInstructions();

      // Should return a string (either content or error message)
      expect(typeof instructions).toBe("string");
      expect(instructions.length).toBeGreaterThan(0);
    });
  });
});
