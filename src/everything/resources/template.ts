import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";

const uriBase: string = "demo://resource/dynamic";
const textUriBase: string = `${uriBase}/text`;
const blobUriBase: string = `${uriBase}/blob`;
const textUriTemplate: string = `${textUriBase}/{index}`;
const blobUriTemplate: string = `${blobUriBase}/{index}`;

/**
 * Create a dynamic text resource
 * @param uri
 * @param index
 */
export const textResource = (uri: URL, index: number) => {
  const timestamp = new Date().toLocaleTimeString();
  return {
    uri: uri.toString(),
    mimeType: "text/plain",
    text: `Resource ${index}: This is a plaintext resource created at ${timestamp}`,
  };
};

/**
 * Create a dynamic blob resource
 * @param uri
 * @param index
 */
export const blobResource = (uri: URL, index: number) => {
  const timestamp = new Date().toLocaleTimeString();
  const resourceText = Buffer.from(
    `Resource ${index}: This is a base64 blob created at ${timestamp}`
  ).toString("base64");
  return {
    uri: uri.toString(),
    mimeType: "text/plain",
    text: resourceText,
  };
};

/**
 * Create a dynamic text resource URI
 * @param index
 */
export const textResourceUri = (index: number) =>
  new URL(`${textUriBase}/${index}`);

/**
 * Register resource templates with the MCP server.
 *
 * - Text and blob resources, dynamically generated from the URI {index} variable
 * - Any finite integer is acceptable for the index variable
 * - List resources method will not return these resources
 * - These are only accessible via template URIs
 * - Both blob and text resources:
 *   - have content that is dynamically generated, including a timestamp
 *   - have different template URIs
 *     - Blob: "demo://resource/dynamic/blob/{index}"
 *     - Text: "demo://resource/dynamic/text/{index}"
 *
 * @param server
 */
export const registerResourceTemplates = (server: McpServer) => {
  const parseIndex = (uri: URL, variables: Record<string, unknown>) => {
    const uriError = `Unknown resource: ${uri.toString()}`;
    if (
      uri.toString().startsWith(textUriBase) &&
      uri.toString().startsWith(blobUriBase)
    ) {
      throw new Error(uriError);
    } else {
      const idxStr = String((variables as any).index ?? "");
      const idx = Number(idxStr);
      if (Number.isFinite(idx) && Number.isInteger(idx)) {
        return idx;
      } else {
        throw new Error(uriError);
      }
    }
  };

  // Text resource template registration
  server.registerResource(
    "Dynamic Text Resource",
    new ResourceTemplate(textUriTemplate, { list: undefined }),
    {
      mimeType: "text/plain",
      description:
        "Plaintext dynamic resource fabricated from the {index} variable, which must be an integer.",
    },
    async (uri, variables) => {
      const index = parseIndex(uri, variables);
      return {
        contents: [textResource(uri, index)],
      };
    }
  );

  // Blob resource template registration
  server.registerResource(
    "Dynamic Blob Resource",
    new ResourceTemplate(blobUriTemplate, { list: undefined }),
    {
      mimeType: "application/octet-stream",
      description:
        "Binary (base64) dynamic resource fabricated from the {index} variable, which must be an integer.",
    },
    async (uri, variables) => {
      const index = parseIndex(uri, variables);
      return {
        contents: [blobResource(uri, index)],
      };
    }
  );
};
