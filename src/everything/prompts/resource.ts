import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  resourceTypeCompleter,
  resourceIdForPromptCompleter,
} from "../resources/templates.js";
import {
  textResource,
  textResourceUri,
  blobResourceUri,
  blobResource,
  RESOURCE_TYPE_BLOB,
  RESOURCE_TYPE_TEXT,
  RESOURCE_TYPES,
} from "../resources/templates.js";

/**
 * Register a prompt with an embedded resource reference
 * - Takes a resource type and id
 * - Returns the corresponding dynamically created resource
 *
 * @param server
 */
export const registerEmbeddedResourcePrompt = (server: McpServer) => {
  // Prompt arguments
  const promptArgsSchema = {
    resourceType: resourceTypeCompleter,
    resourceId: resourceIdForPromptCompleter,
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
      const resourceType = args.resourceType;
      if (
        !RESOURCE_TYPES.includes(
          resourceType as typeof RESOURCE_TYPE_TEXT | typeof RESOURCE_TYPE_BLOB
        )
      ) {
        throw new Error(
          `Invalid resourceType: ${args?.resourceType}. Must be ${RESOURCE_TYPE_TEXT} or ${RESOURCE_TYPE_BLOB}.`
        );
      }

      // Validate resourceId argument
      const resourceId = Number(args?.resourceId);
      if (
        !Number.isFinite(resourceId) ||
        !Number.isInteger(resourceId) ||
        resourceId < 1
      ) {
        throw new Error(
          `Invalid resourceId: ${args?.resourceId}. Must be a finite positive integer.`
        );
      }

      // Get resource based on the resource type
      const uri =
        resourceType === RESOURCE_TYPE_TEXT
          ? textResourceUri(resourceId)
          : blobResourceUri(resourceId);
      const resource =
        resourceType === RESOURCE_TYPE_TEXT
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
