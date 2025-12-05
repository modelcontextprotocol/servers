import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register dynamic resources with the MCP server.
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
export const registerDynamicResources = (server: McpServer) => {
  const uriBase: string = "demo://resource/dynamic";
  const textUriBase: string = `${uriBase}/text`;
  const blobUriBase: string = `${uriBase}/blob`;
  const textUriTemplate: string = `${textUriBase}/{index}`;
  const blobUriTemplate: string = `${blobUriBase}/{index}`;

  // Format a GMT timestamp like "7:30AM GMT on November 3"
  const formatGmtTimestamp = () => {
    const d = new Date();
    const h24 = d.getUTCHours();
    const minutes = d.getUTCMinutes();
    const ampm = h24 >= 12 ? "PM" : "AM";
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    const mm = String(minutes).padStart(2, "0");
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const monthName = months[d.getUTCMonth()];
    const day = d.getUTCDate();
    return `${h12}:${mm}${ampm} GMT on ${monthName} ${day}`;
  };

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

  // Text resource registration
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
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/plain",
            text: `Resource ${index}: This is a plaintext resource created at ${formatGmtTimestamp()}`,
          },
        ],
      };
    }
  );

  // Blob resource registration
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
      const buffer = Buffer.from(
        `Resource ${index}: This is a base64 blob created at ${formatGmtTimestamp()}`
      );
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/octet-stream",
            blob: buffer.toString("base64"),
          },
        ],
      };
    }
  );
};
