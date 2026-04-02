import { z } from "zod";
import {
  CompleteResourceTemplateCallback,
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";

// Resource types
export const RESOURCE_TYPE_TEXT = "Text" as const;
export const RESOURCE_TYPE_BLOB = "Blob" as const;
export const RESOURCE_TYPES: string[] = [
  RESOURCE_TYPE_TEXT,
  RESOURCE_TYPE_BLOB,
];

/**
 * A completer function for resource types.
 *
 * This variable provides functionality to perform autocompletion for the resource types based on user input.
 * It uses a schema description to validate the input and filters through a predefined list of resource types
 * to return suggestions that start with the given input.
 *
 * The input value is expected to be a string representing the type of resource to fetch.
 * The completion logic matches the input against available resource types.
 */
export const resourceTypeCompleter = completable(
  z.string().describe("Type of resource to fetch"),
  (value: string) => {
    return RESOURCE_TYPES.filter((t) => t.startsWith(value));
  }
);

/**
 * A completer function for resource IDs as strings.
 *
 * The `resourceIdCompleter` accepts a string input representing the ID of a text resource
 * and validates whether the provided value corresponds to an integer resource ID.
 *
 * NOTE: Currently, prompt arguments can only be strings since type is not field of `PromptArgument`
 * Consequently, we must define it as a string and convert the argument to number before using it
 * https://modelcontextprotocol.io/specification/2025-11-25/schema#promptargument
 *
 * If the value is a valid integer, it returns the value within an array.
 * Otherwise, it returns an empty array.
 *
 * The input string is first transformed into a number and checked to ensure it is an integer.
 * This helps validate and suggest appropriate resource IDs.
 */
export const resourceIdForPromptCompleter = completable(
  z.string().describe("ID of the text resource to fetch"),
  (value: string) => {
    const resourceId = Number(value);
    return Number.isInteger(resourceId) && resourceId > 0 ? [value] : [];
  }
);

/**
 * A callback function that acts as a completer for resource ID values, validating and returning
 * the input value as part of a resource template.
 *
 * @typedef {CompleteResourceTemplateCallback}
 * @param {string} value - The input string value to be evaluated as a resource ID.
 * @returns {string[]} Returns an array containing the input value if it represents a positive
 * integer resource ID, otherwise returns an empty array.
 */
export const resourceIdForResourceTemplateCompleter: CompleteResourceTemplateCallback =
  (value: string) => {
    const resourceId = Number(value);

    return Number.isInteger(resourceId) && resourceId > 0 ? [value] : [];
  };

const uriBase: string = "demo://resource/dynamic";
const textUriBase: string = `${uriBase}/text`;
const blobUriBase: string = `${uriBase}/blob`;
const textUriTemplate: string = `${textUriBase}/{resourceId}`;
const blobUriTemplate: string = `${blobUriBase}/{resourceId}`;

/**
 * Create a dynamic text resource
 * - Exposed for use by embedded resource prompt example
 * @param uri
 * @param resourceId
 */
export const textResource = (uri: URL, resourceId: number) => {
  const timestamp = new Date().toLocaleTimeString();
  return {
    uri: uri.toString(),
    mimeType: "text/plain",
    text: `Resource ${resourceId}: This is a plaintext resource created at ${timestamp}`,
  };
};

/**
 * Create a dynamic blob resource
 * - Exposed for use by embedded resource prompt example
 * @param uri
 * @param resourceId
 */
export const blobResource = (uri: URL, resourceId: number) => {
  const timestamp = new Date().toLocaleTimeString();
  const resourceText = Buffer.from(
    `Resource ${resourceId}: This is a base64 blob created at ${timestamp}`
  ).toString("base64");
  return {
    uri: uri.toString(),
    mimeType: "text/plain",
    blob: resourceText,
  };
};

/**
 * Create a dynamic text resource URI
 * - Exposed for use by embedded resource prompt example
 * @param resourceId
 */
export const textResourceUri = (resourceId: number) =>
  new URL(`${textUriBase}/${resourceId}`);

/**
 * Create a dynamic blob resource URI
 * - Exposed for use by embedded resource prompt example
 * @param resourceId
 */
export const blobResourceUri = (resourceId: number) =>
  new URL(`${blobUriBase}/${resourceId}`);

/**
 * Parses the resource identifier from the provided URI and validates it
 * against the given variables. Throws an error if the URI corresponds
 * to an unknown resource or if the resource identifier is invalid.
 *
 * @param {URL} uri - The URI of the resource to be parsed.
 * @param {Record<string, unknown>} variables - A record containing context-specific variables that include the resourceId.
 * @returns {number} The parsed and validated resource identifier as an integer.
 * @throws {Error} Throws an error if the URI matches unsupported base URIs or if the resourceId is invalid.
 */
const parseResourceId = (uri: URL, variables: Record<string, unknown>) => {
  const uriError = `Unknown resource: ${uri.toString()}`;
  if (
    uri.toString().startsWith(textUriBase) &&
    uri.toString().startsWith(blobUriBase)
  ) {
    throw new Error(uriError);
  } else {
    const idxStr = String((variables as any).resourceId ?? "");
    const idx = Number(idxStr);
    if (Number.isFinite(idx) && Number.isInteger(idx) && idx > 0) {
      return idx;
    } else {
      throw new Error(uriError);
    }
  }
};

/**
 * Register resource templates with the MCP server.
 * - Text and blob resources, dynamically generated from the URI {resourceId} variable
 * - Any finite positive integer is acceptable for the resourceId variable
 * - List resources method will not return these resources
 * - These are only accessible via template URIs
 * - Both blob and text resources:
 *   - have content that is dynamically generated, including a timestamp
 *   - have different template URIs
 *     - Blob: "demo://resource/dynamic/blob/{resourceId}"
 *     - Text: "demo://resource/dynamic/text/{resourceId}"
 *
 * @param server
 */
export const registerResourceTemplates = (server: McpServer) => {
  // Register the text resource template
  server.registerResource(
    "Dynamic Text Resource",
    new ResourceTemplate(textUriTemplate, {
      list: undefined,
      complete: { resourceId: resourceIdForResourceTemplateCompleter },
    }),
    {
      mimeType: "text/plain",
      description:
        "Plaintext dynamic resource fabricated from the {resourceId} variable, which must be an integer.",
    },
    async (uri, variables) => {
      const resourceId = parseResourceId(uri, variables);
      return {
        contents: [textResource(uri, resourceId)],
      };
    }
  );

  // Register the blob resource template
  server.registerResource(
    "Dynamic Blob Resource",
    new ResourceTemplate(blobUriTemplate, {
      list: undefined,
      complete: { resourceId: resourceIdForResourceTemplateCompleter },
    }),
    {
      mimeType: "application/octet-stream",
      description:
        "Binary (base64) dynamic resource fabricated from the {resourceId} variable, which must be an integer.",
    },
    async (uri, variables) => {
      const resourceId = parseResourceId(uri, variables);
      return {
        contents: [blobResource(uri, resourceId)],
      };
    }
  );
};
