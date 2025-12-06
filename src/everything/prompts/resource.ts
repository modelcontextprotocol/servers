import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {textResource, textResourceUri} from "../resources/template.js";

export const registerEmbeddedResourcePrompt = (server: McpServer) => {
  // NOTE: Currently, prompt arguments can only be strings since type is not field of PromptArgument
  // Consequently, we must define it as a string and convert the argument to number before using it
  // https://modelcontextprotocol.io/specification/2025-11-25/schema#promptargument
  const promptArgsSchema = {
    resourceId: z.string().describe("ID of the text resource to fetch"),
  };

  server.registerPrompt(
    "resource-prompt",
    {
      title: "Resource Prompt",
      description: "A prompt that includes an embedded resource reference",
      argsSchema: promptArgsSchema,
    },
    (args) => {
      const resourceId = Number(args?.resourceId); // Inspector sends strings only
      if (!Number.isFinite(resourceId) || !Number.isInteger(resourceId)) {
        throw new Error(
          `Invalid resourceId: ${args?.resourceId}. Must be a finite integer.`
        );
      }

      const uri = textResourceUri(resourceId);
      const resource = textResource(uri, resourceId);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `This prompt includes the text resource with id: ${resourceId}. Please analyze the following resource:`,
            },
          },
          {
            role: "user",
            content: {
              type: "resource",
              resource: resource,
            },
          },
        ],
      };
    }
  );
};
