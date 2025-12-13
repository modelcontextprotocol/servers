import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  textResource,
  textResourceUri,
  blobResourceUri,
  blobResource,
  RESOURCE_TYPE_BLOB,
  RESOURCE_TYPE_TEXT,
  RESOURCE_TYPES,
} from "../resources/templates.js";

// Tool input schema
const GetResourceReferenceSchema = z.object({
  resourceType: z
    .enum([RESOURCE_TYPE_TEXT, RESOURCE_TYPE_BLOB])
    .default(RESOURCE_TYPE_TEXT),
  resourceId: z
    .number()
    .default(1)
    .describe("ID of the text resource to fetch"),
});

// Tool configuration
const name = "get-resource-reference";
const config = {
  title: "Get Resource Reference Tool",
  description: "Returns a resource reference that can be used by MCP clients",
  inputSchema: GetResourceReferenceSchema,
};

/**
 * Registers the 'get-resource-reference' tool.
 *
 * The registered tool validates and processes arguments for retrieving a resource
 * reference. Supported resource types include predefined `RESOURCE_TYPE_TEXT` and
 * `RESOURCE_TYPE_BLOB`. The retrieved resource's reference will include the resource
 * ID, type, and its associated URI.
 *
 * The tool performs the following operations:
 * 1. Validates the `resourceType` argument to ensure it matches a supported type.
 * 2. Validates the `resourceId` argument to ensure it is a finite positive integer.
 * 3. Constructs a URI for the resource based on its type (text or blob).
 * 4. Retrieves the resource and returns it in a content block.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetResourceReferenceTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    // Validate resource type argument
    const { resourceType } = args;
    if (!RESOURCE_TYPES.includes(resourceType)) {
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
      content: [
        {
          type: "text",
          text: `Returning resource reference for Resource ${resourceId}:`,
        },
        {
          type: "resource",
          resource: resource,
        },
        {
          type: "text",
          text: `You can access this resource using the URI: ${resource.uri}`,
        },
      ],
    };
  });
};
