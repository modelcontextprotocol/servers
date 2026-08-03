import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import { registerEchoTool, EchoSchema } from "../tools/echo.js";
import { registerGetSumTool } from "../tools/get-sum.js";
import { registerGetEnvTool } from "../tools/get-env.js";
import {
  registerGetTinyImageTool,
  MCP_TINY_IMAGE,
} from "../tools/get-tiny-image.js";
import { registerGetStructuredContentTool } from "../tools/get-structured-content.js";
import { registerGetStructuredContentListTool } from "../tools/get-structured-content-list.js";
import { registerGetAnnotatedMessageTool } from "../tools/get-annotated-message.js";
import { registerTriggerLongRunningOperationTool } from "../tools/trigger-long-running-operation.js";
import { registerGetResourceLinksTool } from "../tools/get-resource-links.js";
import { registerGetResourceReferenceTool } from "../tools/get-resource-reference.js";
import { registerToggleSimulatedLoggingTool } from "../tools/toggle-simulated-logging.js";
import { registerToggleSubscriberUpdatesTool } from "../tools/toggle-subscriber-updates.js";
import { registerTriggerSamplingRequestTool } from "../tools/trigger-sampling-request.js";
import { registerTriggerElicitationRequestTool } from "../tools/trigger-elicitation-request.js";
import { registerTriggerUrlElicitationTool } from "../tools/trigger-url-elicitation.js";
import { registerGetRootsListTool } from "../tools/get-roots-list.js";
import { registerGZipFileAsResourceTool } from "../tools/gzip-file-as-resource.js";
import { registerSimulateResearchQueryTool } from "../tools/simulate-research-query.js";

// Helper to capture registered tool handlers
function createMockServer() {
  const handlers: Map<string, Function> = new Map();
  const configs: Map<string, any> = new Map();

  const mockServer = {
    registerTool: vi.fn((name: string, config: any, handler: Function) => {
      handlers.set(name, handler);
      configs.set(name, config);
    }),
    server: {
      getClientCapabilities: vi.fn(() => ({})),
      notification: vi.fn(),
    },
    sendLoggingMessage: vi.fn(),
    sendResourceUpdated: vi.fn(),
  } as unknown as McpServer;

  return { mockServer, handlers, configs };
}

describe("Tools", () => {
  describe("echo", () => {
    it("should echo back the message", async () => {
      const { mockServer, handlers } = createMockServer();
      registerEchoTool(mockServer);

      const handler = handlers.get("echo")!;
      const result = await handler({ message: "Hello, World!" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Echo: Hello, World!" }],
      });
    });

    it("should handle empty message", async () => {
      const { mockServer, handlers } = createMockServer();
      registerEchoTool(mockServer);

      const handler = handlers.get("echo")!;
      const result = await handler({ message: "" });

      expect(result).toEqual({
        content: [{ type: "text", text: "Echo: " }],
      });
    });

    it("should reject invalid input", async () => {
      const { mockServer, handlers } = createMockServer();
      registerEchoTool(mockServer);

      const handler = handlers.get("echo")!;

      await expect(handler({})).rejects.toThrow();
      await expect(handler({ message: 123 })).rejects.toThrow();
    });
  });

  describe("EchoSchema", () => {
    it("should validate correct input", () => {
      const result = EchoSchema.parse({ message: "test" });
      expect(result).toEqual({ message: "test" });
    });

    it("should reject missing message", () => {
      expect(() => EchoSchema.parse({})).toThrow();
    });

    it("should reject non-string message", () => {
      expect(() => EchoSchema.parse({ message: 123 })).toThrow();
    });
  });

  describe("get-sum", () => {
    it("should calculate sum of two positive numbers", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get("get-sum")!;
      const result = await handler({ a: 5, b: 3 });

      expect(result).toEqual({
        content: [{ type: "text", text: "The sum of 5 and 3 is 8." }],
      });
    });

    it("should calculate sum with negative numbers", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get("get-sum")!;
      const result = await handler({ a: -5, b: 3 });

      expect(result).toEqual({
        content: [{ type: "text", text: "The sum of -5 and 3 is -2." }],
      });
    });

    it("should calculate sum with zero", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get("get-sum")!;
      const result = await handler({ a: 0, b: 0 });

      expect(result).toEqual({
        content: [{ type: "text", text: "The sum of 0 and 0 is 0." }],
      });
    });

    it("should handle floating point numbers", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get("get-sum")!;
      const result = await handler({ a: 1.5, b: 2.5 });

      expect(result).toEqual({
        content: [{ type: "text", text: "The sum of 1.5 and 2.5 is 4." }],
      });
    });

    it("should reject invalid input", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetSumTool(mockServer);

      const handler = handlers.get("get-sum")!;

      await expect(handler({})).rejects.toThrow();
      await expect(handler({ a: "not a number", b: 5 })).rejects.toThrow();
      await expect(handler({ a: 5 })).rejects.toThrow();
    });
  });

  describe("get-env", () => {
    it("should return all environment variables as JSON", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetEnvTool(mockServer);

      const handler = handlers.get("get-env")!;
      process.env.TEST_VAR_EVERYTHING = "test_value";
      const result = await handler({});

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");

      const envJson = JSON.parse(result.content[0].text);
      expect(envJson.TEST_VAR_EVERYTHING).toBe("test_value");

      delete process.env.TEST_VAR_EVERYTHING;
    });

    it("should return valid JSON", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetEnvTool(mockServer);

      const handler = handlers.get("get-env")!;
      const result = await handler({});

      expect(() => JSON.parse(result.content[0].text)).not.toThrow();
    });
  });

  describe("get-tiny-image", () => {
    it("should return image content with text descriptions", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetTinyImageTool(mockServer);

      const handler = handlers.get("get-tiny-image")!;
      const result = await handler({});

      expect(result.content).toHaveLength(3);
      expect(result.content[0]).toEqual({
        type: "text",
        text: "Here's the image you requested:",
      });
      expect(result.content[1]).toEqual({
        type: "image",
        data: MCP_TINY_IMAGE,
        mimeType: "image/png",
      });
      expect(result.content[2]).toEqual({
        type: "text",
        text: "The image above is the MCP logo.",
      });
    });

    it("should return valid base64 image data", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetTinyImageTool(mockServer);

      const handler = handlers.get("get-tiny-image")!;
      const result = await handler({});

      const imageContent = result.content[1];
      expect(imageContent.type).toBe("image");
      expect(imageContent.mimeType).toBe("image/png");
      // Verify it's valid base64
      expect(() => Buffer.from(imageContent.data, "base64")).not.toThrow();
    });
  });

  describe("get-structured-content", () => {
    it("should return weather for New York", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentTool(mockServer);

      const handler = handlers.get("get-structured-content")!;
      const result = await handler({ location: "New York" });

      expect(result.structuredContent).toEqual({
        temperature: 33,
        conditions: "Cloudy",
        humidity: 82,
      });
      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text)).toEqual(
        result.structuredContent
      );
    });

    it("should return weather for Chicago", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentTool(mockServer);

      const handler = handlers.get("get-structured-content")!;
      const result = await handler({ location: "Chicago" });

      expect(result.structuredContent).toEqual({
        temperature: 36,
        conditions: "Light rain / drizzle",
        humidity: 82,
      });
    });

    it("should return weather for Los Angeles", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentTool(mockServer);

      const handler = handlers.get("get-structured-content")!;
      const result = await handler({ location: "Los Angeles" });

      expect(result.structuredContent).toEqual({
        temperature: 73,
        conditions: "Sunny / Clear",
        humidity: 48,
      });
    });
  });

  describe("get-structured-content-list", () => {
    it("should advertise an array-rooted output schema", async () => {
      const { mockServer, configs } = createMockServer();
      registerGetStructuredContentListTool(mockServer);

      // The point of this tool: 2026-07-28 lifted the object-root restriction,
      // so the advertised schema is `"type": "array"` rather than an object
      // with a wrapper property. The SDK projects this down to the legacy
      // `{result: ...}` shape for pre-2026 peers; it is NOT authored that way.
      const outputSchema = configs.get(
        "get-structured-content-list"
      )!.outputSchema;
      const asJsonSchema = z.toJSONSchema(outputSchema) as {
        type?: string;
        items?: unknown;
      };

      expect(asJsonSchema.type).toBe("array");
      expect(asJsonSchema.items).toBeDefined();
    });

    it("should return a bare array as structured content", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentListTool(mockServer);

      const handler = handlers.get("get-structured-content-list")!;
      const result = await handler({ location: "Chicago", days: 3 });

      // Bare array at the root -- not `{ result: [...] }`, and not an object
      // with a single array-valued property.
      expect(Array.isArray(result.structuredContent)).toBe(true);
      expect(result.structuredContent).toEqual([
        {
          day: 1,
          temperature: 36,
          conditions: "Light rain / drizzle",
          humidity: 82,
        },
        {
          day: 2,
          temperature: 37,
          conditions: "Light rain / drizzle",
          humidity: 80,
        },
        {
          day: 3,
          temperature: 38,
          conditions: "Light rain / drizzle",
          humidity: 78,
        },
      ]);
    });

    it("should honor the requested number of days", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentListTool(mockServer);

      const handler = handlers.get("get-structured-content-list")!;

      const one = await handler({ location: "New York", days: 1 });
      expect(one.structuredContent).toHaveLength(1);
      expect(one.structuredContent[0]).toEqual({
        day: 1,
        temperature: 33,
        conditions: "Cloudy",
        humidity: 82,
      });

      const five = await handler({ location: "Los Angeles", days: 5 });
      expect(five.structuredContent).toHaveLength(5);
      expect(five.structuredContent[4].day).toBe(5);
    });

    it("should mirror the structured content in a text block", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetStructuredContentListTool(mockServer);

      const handler = handlers.get("get-structured-content-list")!;
      const result = await handler({ location: "New York", days: 2 });

      expect(result.content[0].type).toBe("text");
      expect(JSON.parse(result.content[0].text)).toEqual(
        result.structuredContent
      );
    });

    it("should conform to its own advertised output schema", async () => {
      const { mockServer, handlers, configs } = createMockServer();
      registerGetStructuredContentListTool(mockServer);

      const handler = handlers.get("get-structured-content-list")!;
      const result = await handler({ location: "Chicago", days: 4 });

      // A tool advertising an `outputSchema` MUST return conforming structured
      // content, so validate the real payload against the real schema.
      const outputSchema = configs.get(
        "get-structured-content-list"
      )!.outputSchema;
      expect(() => outputSchema.parse(result.structuredContent)).not.toThrow();
    });
  });

  describe("get-annotated-message", () => {
    it("should return error message with high priority", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetAnnotatedMessageTool(mockServer);

      const handler = handlers.get("get-annotated-message")!;
      const result = await handler({
        messageType: "error",
        includeImage: false,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe("Error: Operation failed");
      expect(result.content[0].annotations).toEqual({
        priority: 1.0,
        audience: ["user", "assistant"],
      });
    });

    it("should return success message with medium priority", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetAnnotatedMessageTool(mockServer);

      const handler = handlers.get("get-annotated-message")!;
      const result = await handler({
        messageType: "success",
        includeImage: false,
      });

      expect(result.content[0].text).toBe("Operation completed successfully");
      expect(result.content[0].annotations.priority).toBe(0.7);
      expect(result.content[0].annotations.audience).toEqual(["user"]);
    });

    it("should return debug message with low priority", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetAnnotatedMessageTool(mockServer);

      const handler = handlers.get("get-annotated-message")!;
      const result = await handler({
        messageType: "debug",
        includeImage: false,
      });

      expect(result.content[0].text).toContain("Debug:");
      expect(result.content[0].annotations.priority).toBe(0.3);
      expect(result.content[0].annotations.audience).toEqual(["assistant"]);
    });

    it("should include annotated image when requested", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetAnnotatedMessageTool(mockServer);

      const handler = handlers.get("get-annotated-message")!;
      const result = await handler({
        messageType: "success",
        includeImage: true,
      });

      expect(result.content).toHaveLength(2);
      expect(result.content[1].type).toBe("image");
      expect(result.content[1].annotations).toEqual({
        priority: 0.5,
        audience: ["user"],
      });
    });
  });

  describe("trigger-long-running-operation", () => {
    it("should complete operation and return result", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerLongRunningOperationTool(mockServer);

      const handler = handlers.get("trigger-long-running-operation")!;
      // Use very short duration for test
      const result = await handler(
        { duration: 0.1, steps: 2 },
        { mcpReq: { _meta: {}, id: "test-123", notify: vi.fn() } }
      );

      expect(result.content[0].text).toContain(
        "Long running operation completed"
      );
      expect(result.content[0].text).toContain("Duration: 0.1 seconds");
      expect(result.content[0].text).toContain("Steps: 2");
    }, 10000);

    it("should send progress notifications when progressToken provided", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerLongRunningOperationTool(mockServer);

      // Progress is now emitted through `ctx.mcpReq.notify`, which binds the
      // notification to the originating request. On 2026-07-28 request-scoped
      // notifications ride that request's own response stream, so there is no
      // standalone `server.notification(..., { relatedRequestId })` call any more.
      const notify = vi.fn();
      const handler = handlers.get("trigger-long-running-operation")!;
      await handler(
        { duration: 0.1, steps: 2 },
        {
          sessionId: "session-1",
          mcpReq: {
            _meta: { progressToken: "token-123" },
            id: "test-456",
            notify,
          },
        }
      );

      expect(notify).toHaveBeenCalledTimes(2);
      expect(notify).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "notifications/progress",
          params: expect.objectContaining({
            progressToken: "token-123",
          }),
        })
      );
    }, 10000);
  });

  describe("get-resource-links", () => {
    it("should return specified number of resource links", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceLinksTool(mockServer);

      const handler = handlers.get("get-resource-links")!;
      const result = await handler({ count: 3 });

      // 1 intro text + 3 resource links
      expect(result.content).toHaveLength(4);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("3 resource links");

      // Check resource links
      for (let i = 1; i < 4; i++) {
        expect(result.content[i].type).toBe("resource_link");
        expect(result.content[i].uri).toBeDefined();
        expect(result.content[i].name).toBeDefined();
      }
    });

    it("should alternate between text and blob resources", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceLinksTool(mockServer);

      const handler = handlers.get("get-resource-links")!;
      const result = await handler({ count: 4 });

      // Odd IDs (1, 3) are blob, even IDs (2, 4) are text
      expect(result.content[1].name).toContain("Blob");
      expect(result.content[2].name).toContain("Text");
      expect(result.content[3].name).toContain("Blob");
      expect(result.content[4].name).toContain("Text");
    });

    it("should use default count of 3", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceLinksTool(mockServer);

      const handler = handlers.get("get-resource-links")!;
      const result = await handler({});

      // 1 intro text + 3 resource links (default)
      expect(result.content).toHaveLength(4);
    });
  });

  describe("get-resource-reference", () => {
    it("should return text resource reference", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceReferenceTool(mockServer);

      const handler = handlers.get("get-resource-reference")!;
      const result = await handler({ resourceType: "Text", resourceId: 1 });

      expect(result.content).toHaveLength(3);
      expect(result.content[0].text).toContain("Resource 1");
      expect(result.content[1].type).toBe("resource");
      expect(result.content[1].resource.uri).toContain("text/1");
      expect(result.content[2].text).toContain("URI");
    });

    it("should return blob resource reference", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceReferenceTool(mockServer);

      const handler = handlers.get("get-resource-reference")!;
      const result = await handler({ resourceType: "Blob", resourceId: 5 });

      expect(result.content[1].resource.uri).toContain("blob/5");
    });

    it("should reject invalid resource type", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceReferenceTool(mockServer);

      const handler = handlers.get("get-resource-reference")!;
      await expect(
        handler({ resourceType: "Invalid", resourceId: 1 })
      ).rejects.toThrow("Invalid resourceType");
    });

    it("should reject invalid resource ID", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetResourceReferenceTool(mockServer);

      const handler = handlers.get("get-resource-reference")!;
      await expect(
        handler({ resourceType: "Text", resourceId: -1 })
      ).rejects.toThrow("Invalid resourceId");
      await expect(
        handler({ resourceType: "Text", resourceId: 0 })
      ).rejects.toThrow("Invalid resourceId");
      await expect(
        handler({ resourceType: "Text", resourceId: 1.5 })
      ).rejects.toThrow("Invalid resourceId");
    });
  });

  describe("toggle-simulated-logging", () => {
    it("should start logging when not active", async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSimulatedLoggingTool(mockServer);

      const handler = handlers.get("toggle-simulated-logging")!;
      const result = await handler({}, { sessionId: "test-session-1" });

      expect(result.content[0].text).toContain("Started");
      expect(result.content[0].text).toContain("test-session-1");
    });

    it("should stop logging when already active", async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSimulatedLoggingTool(mockServer);

      const handler = handlers.get("toggle-simulated-logging")!;

      // First call starts logging
      await handler({}, { sessionId: "test-session-2" });

      // Second call stops logging
      const result = await handler({}, { sessionId: "test-session-2" });

      expect(result.content[0].text).toContain("Stopped");
      expect(result.content[0].text).toContain("test-session-2");
    });

    it("should handle undefined sessionId", async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSimulatedLoggingTool(mockServer);

      const handler = handlers.get("toggle-simulated-logging")!;
      const result = await handler({}, {});

      expect(result.content[0].text).toContain("Started");
    });
  });

  describe("toggle-subscriber-updates", () => {
    it("should start updates when not active", async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSubscriberUpdatesTool(mockServer);

      const handler = handlers.get("toggle-subscriber-updates")!;
      const result = await handler({}, { sessionId: "sub-session-1" });

      expect(result.content[0].text).toContain("Started");
      expect(result.content[0].text).toContain("sub-session-1");
    });

    it("should stop updates when already active", async () => {
      const { mockServer, handlers } = createMockServer();
      registerToggleSubscriberUpdatesTool(mockServer);

      const handler = handlers.get("toggle-subscriber-updates")!;

      // First call starts updates
      await handler({}, { sessionId: "sub-session-2" });

      // Second call stops updates
      const result = await handler({}, { sessionId: "sub-session-2" });

      expect(result.content[0].text).toContain("Stopped");
      expect(result.content[0].text).toContain("sub-session-2");
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-round-trip (MRTR) tools.
  //
  // These tools no longer push server->client requests. They RETURN an
  // `input_required` result naming the input they need, and the client retries
  // the call carrying `inputResponses`. The same handler serves both protocol
  // eras: on 2026-07-28 the client's driver fulfils and retries; on a legacy-era
  // connection the SDK's legacy shim issues real server->client requests and
  // re-enters the handler with the collected answers.
  //
  // So each tool is exercised in two rounds: call once with an empty context to
  // assert the request it asks for, then call again with `inputResponses` to
  // assert how it interprets the answer.
  // ---------------------------------------------------------------------------

  /** A first-round context: no answers yet. */
  const firstRound = () => ({
    mcpReq: { _meta: {}, requestState: () => undefined },
  });

  /** A re-entry context carrying one round's answers. */
  const withResponses = (inputResponses: Record<string, unknown>) => ({
    mcpReq: { _meta: {}, inputResponses, requestState: () => undefined },
  });

  describe("trigger-sampling-request", () => {
    it("should register unconditionally, without a sampling capability", () => {
      // The old version skipped registration unless the client advertised
      // `sampling`. The SDK now refuses the embedded request at dispatch with
      // -32021 instead, on both eras, so registration is unconditional.
      const { mockServer } = createMockServer();
      registerTriggerSamplingRequestTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "trigger-sampling-request",
        expect.objectContaining({ title: "Trigger Sampling Request Tool" }),
        expect.any(Function)
      );
    });

    it("should return an input_required result asking for a completion", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerSamplingRequestTool(mockServer);

      const handler = handlers.get("trigger-sampling-request")!;
      const result = await handler(
        { prompt: "Tell me about MCP", maxTokens: 50 },
        firstRound()
      );

      expect(result.resultType).toBe("input_required");
      const request = result.inputRequests.completion;
      expect(request.method).toBe("sampling/createMessage");
      expect(request.params.maxTokens).toBe(50);
      expect(request.params.messages[0].content.text).toContain(
        "Tell me about MCP"
      );
    });

    it("should format the completion once the client answers", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerSamplingRequestTool(mockServer);

      const handler = handlers.get("trigger-sampling-request")!;
      const result = await handler(
        { prompt: "Tell me about MCP", maxTokens: 50 },
        withResponses({
          completion: {
            role: "assistant",
            content: { type: "text", text: "MCP is a protocol." },
            model: "test-model",
          },
        })
      );

      expect(result.resultType).toBeUndefined();
      expect(result.content[0].text).toContain("LLM sampling result");
      expect(result.content[0].text).toContain("MCP is a protocol.");
    });

    it("should error clearly if the wrong kind of answer comes back", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerSamplingRequestTool(mockServer);

      const handler = handlers.get("trigger-sampling-request")!;
      const result = await handler(
        { prompt: "x", maxTokens: 10 },
        withResponses({ completion: { action: "accept", content: {} } })
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Expected a sampling response");
    });
  });

  describe("trigger-elicitation-request", () => {
    it("should register unconditionally, without an elicitation capability", () => {
      const { mockServer } = createMockServer();
      registerTriggerElicitationRequestTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "trigger-elicitation-request",
        expect.objectContaining({ title: "Trigger Elicitation Request Tool" }),
        expect.any(Function)
      );
    });

    it("should return an input_required result asking for the profile form", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerElicitationRequestTool(mockServer);

      const handler = handlers.get("trigger-elicitation-request")!;
      const result = await handler({}, firstRound());

      expect(result.resultType).toBe("input_required");
      const request = result.inputRequests.profile;
      expect(request.method).toBe("elicitation/create");
      expect(request.params.requestedSchema.required).toContain("name");
    });

    it("should handle accept action with user content", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerElicitationRequestTool(mockServer);

      const handler = handlers.get("trigger-elicitation-request")!;
      const result = await handler(
        {},
        withResponses({
          profile: {
            action: "accept",
            content: {
              name: "John Doe",
              check: true,
              email: "john@example.com",
            },
          },
        })
      );

      expect(result.content[0].text).toContain("✅");
      expect(result.content[1].text).toContain("Name: John Doe");
      expect(result.content[1].text).toContain("Email: john@example.com");
    });

    it("should handle decline action", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerElicitationRequestTool(mockServer);

      const handler = handlers.get("trigger-elicitation-request")!;
      const result = await handler(
        {},
        withResponses({ profile: { action: "decline" } })
      );

      expect(result.content[0].text).toContain("❌");
      expect(result.content[0].text).toContain("declined");
    });

    it("should handle cancel action", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerElicitationRequestTool(mockServer);

      const handler = handlers.get("trigger-elicitation-request")!;
      const result = await handler(
        {},
        withResponses({ profile: { action: "cancel" } })
      );

      expect(result.content[0].text).toContain("⚠️");
      expect(result.content[0].text).toContain("cancelled");
    });
  });

  describe("trigger-url-elicitation", () => {
    it("should register unconditionally", () => {
      const { mockServer } = createMockServer();
      registerTriggerUrlElicitationTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "trigger-url-elicitation",
        expect.objectContaining({ title: "Trigger URL Elicitation Tool" }),
        expect.any(Function)
      );
    });

    it("should return an input_required result carrying a URL-mode request", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerUrlElicitationTool(mockServer);

      const handler = handlers.get("trigger-url-elicitation")!;
      const result = await handler(
        { url: "https://example.com/auth", message: "Open this" },
        firstRound()
      );

      expect(result.resultType).toBe("input_required");
      const request = result.inputRequests.browserFlow;
      expect(request.method).toBe("elicitation/create");
      expect(request.params.mode).toBe("url");
      expect(request.params.url).toBe("https://example.com/auth");
      // The legacy-era `elicitationId` is not part of the 2026 in-band shape;
      // the legacy shim synthesizes one when it needs to.
      expect(request.params.elicitationId).toBeUndefined();
    });

    it("should report completion when the user finishes the flow", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerUrlElicitationTool(mockServer);

      const handler = handlers.get("trigger-url-elicitation")!;
      const result = await handler(
        {
          url: "https://example.com/auth",
          message: "Open this",
          elicitationId: "abc",
        },
        withResponses({ browserFlow: { action: "accept" } })
      );

      expect(result.content[0].text).toContain("✅");
      expect(result.content[0].text).toContain("abc");
      expect(result.content[0].text).toContain("https://example.com/auth");
    });

    it("should report decline and cancel distinctly", async () => {
      const { mockServer, handlers } = createMockServer();
      registerTriggerUrlElicitationTool(mockServer);

      const handler = handlers.get("trigger-url-elicitation")!;
      const args = { url: "https://example.com/auth", message: "Open this" };

      const declined = await handler(
        args,
        withResponses({ browserFlow: { action: "decline" } })
      );
      expect(declined.content[0].text).toContain("❌");

      const cancelled = await handler(
        args,
        withResponses({ browserFlow: { action: "cancel" } })
      );
      expect(cancelled.content[0].text).toContain("⚠️");
    });

    it("should no longer accept an errorPath argument", async () => {
      // The -32042 error path was legacy-era only and has been removed; the
      // schema should reject the argument rather than silently ignore it.
      const { mockServer, configs } = createMockServer();
      registerTriggerUrlElicitationTool(mockServer);

      const schema = configs.get("trigger-url-elicitation")!.inputSchema;
      expect(Object.keys(schema.shape)).not.toContain("errorPath");
    });
  });

  describe("get-roots-list", () => {
    it("should register unconditionally, without a roots capability", () => {
      const { mockServer } = createMockServer();
      registerGetRootsListTool(mockServer);

      expect(mockServer.registerTool).toHaveBeenCalledWith(
        "get-roots-list",
        expect.objectContaining({ title: "Get Roots List Tool" }),
        expect.any(Function)
      );
    });

    it("should ask for roots when none are cached (the 2026-07-28 path)", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetRootsListTool(mockServer);

      const handler = handlers.get("get-roots-list")!;
      const result = await handler({}, firstRound());

      expect(result.resultType).toBe("input_required");
      expect(result.inputRequests.roots.method).toBe("roots/list");
    });

    it("should format the roots the client returns", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetRootsListTool(mockServer);

      const handler = handlers.get("get-roots-list")!;
      const result = await handler(
        {},
        withResponses({
          roots: {
            roots: [
              { uri: "file:///workspace", name: "Workspace" },
              { uri: "file:///other" },
            ],
          },
        })
      );

      expect(result.content[0].text).toContain("Current MCP Roots (2 total)");
      expect(result.content[0].text).toContain("1. Workspace");
      expect(result.content[0].text).toContain("file:///workspace");
      expect(result.content[0].text).toContain("2. Unnamed Root");
    });

    it("should explain when the client returns an empty roots list", async () => {
      const { mockServer, handlers } = createMockServer();
      registerGetRootsListTool(mockServer);

      const handler = handlers.get("get-roots-list")!;
      const result = await handler({}, withResponses({ roots: { roots: [] } }));

      expect(result.content[0].text).toContain(
        "no roots are currently configured"
      );
    });
  });

  describe("simulate-research-query", () => {
    it("should run straight through for an unambiguous query", async () => {
      const { mockServer, handlers } = createMockServer();
      registerSimulateResearchQueryTool(mockServer);

      const notify = vi.fn();
      const handler = handlers.get("simulate-research-query")!;
      const result = await handler(
        { topic: "MCP", ambiguous: false },
        {
          mcpReq: {
            _meta: { progressToken: "tok" },
            notify,
            requestState: () => undefined,
          },
        }
      );

      expect(result.resultType).toBeUndefined();
      expect(result.content[0].text).toContain("Research Report: MCP");
      // One progress notification per stage.
      expect(notify).toHaveBeenCalledTimes(4);
    }, 20000);

    it("should pause for clarification when the query is ambiguous", async () => {
      const { mockServer, handlers } = createMockServer();
      registerSimulateResearchQueryTool(mockServer);

      const handler = handlers.get("simulate-research-query")!;
      const result = await handler(
        { topic: "python", ambiguous: true },
        {
          mcpReq: { _meta: {}, notify: vi.fn(), requestState: () => undefined },
        }
      );

      expect(result.resultType).toBe("input_required");
      const request = result.inputRequests.clarification;
      expect(request.method).toBe("elicitation/create");
      // Interpretations are topic-aware.
      const options =
        request.params.requestedSchema.properties.interpretation.oneOf;
      expect(options.map((o: any) => o.const)).toContain("snake");

      // The topic must be carried forward: `inputResponses` are per round, so
      // nothing else survives the trip through the client.
      expect(typeof result.requestState).toBe("string");
      expect(result.requestState.length).toBeGreaterThan(0);
    }, 20000);

    it("should resume with the clarification and finish the report", async () => {
      const { mockServer, handlers } = createMockServer();
      registerSimulateResearchQueryTool(mockServer);

      const handler = handlers.get("simulate-research-query")!;
      const result = await handler(
        { topic: "python", ambiguous: true },
        {
          mcpReq: {
            _meta: {},
            notify: vi.fn(),
            // The seam verifies and decodes `requestState` before the handler
            // runs, so the handler sees the decoded payload.
            requestState: () => ({
              step: "awaiting-clarification",
              topic: "python",
            }),
            inputResponses: {
              clarification: {
                action: "accept",
                content: { interpretation: "snake" },
              },
            },
          },
        }
      );

      expect(result.resultType).toBeUndefined();
      expect(result.content[0].text).toContain(
        "Research Report: python (snake)"
      );
      expect(result.content[0].text).toContain("Clarification**: snake");
    }, 20000);

    it("should fall back to a default when the user declines to clarify", async () => {
      const { mockServer, handlers } = createMockServer();
      registerSimulateResearchQueryTool(mockServer);

      const handler = handlers.get("simulate-research-query")!;
      const result = await handler(
        { topic: "python", ambiguous: true },
        {
          mcpReq: {
            _meta: {},
            notify: vi.fn(),
            requestState: () => ({
              step: "awaiting-clarification",
              topic: "python",
            }),
            inputResponses: { clarification: { action: "decline" } },
          },
        }
      );

      expect(result.content[0].text).toContain("default interpretation");
    }, 20000);
  });

  describe("gzip-file-as-resource", () => {
    it("should compress data URI and return resource link", async () => {
      const registeredResources: any[] = [];
      const mockServer = {
        registerTool: vi.fn(),
        registerResource: vi.fn((...args) => {
          registeredResources.push(args);
        }),
      } as unknown as McpServer;

      // Get the handler
      let handler: Function | null = null;
      (mockServer.registerTool as any).mockImplementation(
        (name: string, config: any, h: Function) => {
          handler = h;
        }
      );

      registerGZipFileAsResourceTool(mockServer);

      // Create a data URI with test content
      const testContent = "Hello, World!";
      const dataUri = `data:text/plain;base64,${Buffer.from(
        testContent
      ).toString("base64")}`;

      const result = await handler!({
        name: "test.txt.gz",
        data: dataUri,
        outputType: "resourceLink",
      });

      expect(result.content[0].type).toBe("resource_link");
      expect(result.content[0].uri).toContain("test.txt.gz");
    });

    it("should return resource directly when outputType is resource", async () => {
      const mockServer = {
        registerTool: vi.fn(),
        registerResource: vi.fn(),
      } as unknown as McpServer;

      let handler: Function | null = null;
      (mockServer.registerTool as any).mockImplementation(
        (name: string, config: any, h: Function) => {
          handler = h;
        }
      );

      registerGZipFileAsResourceTool(mockServer);

      const testContent = "Test content for compression";
      const dataUri = `data:text/plain;base64,${Buffer.from(
        testContent
      ).toString("base64")}`;

      const result = await handler!({
        name: "output.gz",
        data: dataUri,
        outputType: "resource",
      });

      expect(result.content[0].type).toBe("resource");
      expect(result.content[0].resource.mimeType).toBe("application/gzip");
      expect(result.content[0].resource.blob).toBeDefined();
    });

    it("should reject unsupported URL protocols", async () => {
      const mockServer = {
        registerTool: vi.fn(),
        registerResource: vi.fn(),
      } as unknown as McpServer;

      let handler: Function | null = null;
      (mockServer.registerTool as any).mockImplementation(
        (name: string, config: any, h: Function) => {
          handler = h;
        }
      );

      registerGZipFileAsResourceTool(mockServer);

      await expect(
        handler!({
          name: "test.gz",
          data: "ftp://example.com/file.txt",
          outputType: "resource",
        })
      ).rejects.toThrow("Unsupported URL protocol");
    });
  });
});
