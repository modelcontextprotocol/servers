import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { MCP_TINY_IMAGE } from "./get-tiny-image.js";

// Tool input schema
const GetAnnotatedMessageSchema = z.object({
  messageType: z
    .enum(["error", "success", "debug"])
    .describe("Type of message to demonstrate different annotation patterns"),
  includeImage: z
    .boolean()
    .default(false)
    .describe("Whether to include an example image"),
});

// Tool configuration
const name = "get-annotated-message";
const config = {
  title: "Get Annotated Message Tool",
  description:
    "Demonstrates how annotations can be used to provide metadata about content.",
  inputSchema: GetAnnotatedMessageSchema,
};

/**
 * Registers the 'get-annotated-message' tool.
 *
 * The registered tool generates and sends messages with specific types, such as error,
 * success, or debug, carrying associated annotations like priority level and intended
 * audience.
 *
 * The response will have annotations and optionally contain an annotated image.
 *
 * @function
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetAnnotatedMessageTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const { messageType, includeImage } = GetAnnotatedMessageSchema.parse(args);

    const content: CallToolResult["content"] = [];

    // Main message with different priorities/audiences based on type
    if (messageType === "error") {
      content.push({
        type: "text",
        text: "Error: Operation failed",
        annotations: {
          priority: 1.0, // Errors are highest priority
          audience: ["user", "assistant"], // Both need to know about errors
        },
      });
    } else if (messageType === "success") {
      content.push({
        type: "text",
        text: "Operation completed successfully",
        annotations: {
          priority: 0.7, // Success messages are important but not critical
          audience: ["user"], // Success mainly for user consumption
        },
      });
    } else if (messageType === "debug") {
      content.push({
        type: "text",
        text: "Debug: Cache hit ratio 0.95, latency 150ms",
        annotations: {
          priority: 0.3, // Debug info is low priority
          audience: ["assistant"], // Technical details for assistant
        },
      });
    }

    // Optional image with its own annotations
    if (includeImage) {
      content.push({
        type: "image",
        data: MCP_TINY_IMAGE,
        mimeType: "image/png",
        annotations: {
          priority: 0.5,
          audience: ["user"], // Images primarily for user visualization
        },
      });
    }

    return { content };
  });
};
