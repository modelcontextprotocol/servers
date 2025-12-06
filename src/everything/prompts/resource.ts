import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import {
  textResource,
  textResourceUri,
  blobResourceUri,
  blobResource,
} from "../resources/templates.js";

/**
 * Register a prompt with an embedded resource reference
 * - Takes a resource type and id
 * - Returns the corresponding dynamically created resource
 *
 * @param server
 */
export const registerEmbeddedResourcePrompt = (server: McpServer) => {
  // Resource types
  const BLOB_TYPE = "Blob";
  const TEXT_TYPE = "Text";
  const resourceTypes = [BLOB_TYPE, TEXT_TYPE];

  // Prompt arguments
  const promptArgsSchema = {
    resourceType: completable(
      z.string().describe("Type of resource to fetch"),
      (value: string) => {
        return [TEXT_TYPE, BLOB_TYPE].filter((t) => t.startsWith(value));
      }
    ),
    // NOTE: Currently, prompt arguments can only be strings since type is not field of PromptArgument
    // Consequently, we must define it as a string and convert the argument to number before using it
    // https://modelcontextprotocol.io/specification/2025-11-25/schema#promptargument
    resourceId: completable(
      z.string().describe("ID of the text resource to fetch"),
      (value: string) => {
        const resourceId = Number(value);
        return Number.isInteger(resourceId) ? [value] : [];
      }
    ),
  };

  // Register the prompt
  server.registerPrompt(
    "resource-prompt",
    {
      title: "Resource Prompt",
      description: "A prompt that includes an embedded resource reference",
      argsSchema: promptArgsSchema,
    },
    (args) => {
      // Validate resource type argument
      const { resourceType } = args;
      if (!resourceTypes.includes(resourceType)) {
        throw new Error(
          `Invalid resourceType: ${args?.resourceType}. Must be ${TEXT_TYPE} or ${BLOB_TYPE}.`
        );
      }

      // Validate resourceId argument
      const resourceId = Number(args?.resourceId);
      if (!Number.isFinite(resourceId) || !Number.isInteger(resourceId)) {
        throw new Error(
          `Invalid resourceId: ${args?.resourceId}. Must be a finite integer.`
        );
      }

      // Get resource based on the resource type
      const uri =
        resourceType === TEXT_TYPE
          ? textResourceUri(resourceId)
          : blobResourceUri(resourceId);
      const resource =
        resourceType === TEXT_TYPE
          ? textResource(uri, resourceId)
          : blobResource(uri, resourceId);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `This prompt includes the ${resourceType} resource with id: ${resourceId}. Please analyze the following resource:`,
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
