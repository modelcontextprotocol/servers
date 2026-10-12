// The `get-header-params` tool: demonstrates two 2026-07-28 tool-definition
// features (#4852).
//
// - Its `inputSchema` and `outputSchema` are plain JSON Schema 2020-12
//   documents (`$schema` named), passed through `fromJsonSchema` rather than
//   built from Zod, and validated by the SDK's JSON Schema validator.
// - Its `region` argument carries `x-mcp-header: "Region"`. Over Streamable
//   HTTP a 2026-07-28 client mirrors that argument into an
//   `Mcp-Param-Region` request header, so infrastructure in front of the
//   server (a load balancer, a gateway) can route on it without reading the
//   body, and the server rejects a call whose header is missing or disagrees
//   with the body (-32020). The tool reports the header it was sent, which is
//   null on stdio and for a 2025-era client, which mirrors nothing.

import {
  McpServer,
  CallToolResult,
  fromJsonSchema,
  type JsonSchemaType,
} from "@modelcontextprotocol/server";

/**
 * The keyword that asks a 2026-07-28 client to mirror an argument into the
 * `Mcp-Param-<value>` header (SEP-2243). It is an extension keyword, so the
 * JSON Schema type has no member for it; it is spread into the property.
 */
const mirroredInHeader = { "x-mcp-header": "Region" };

/** The input: a region, mirrored into a header, and an optional count. */
const inputSchema: JsonSchemaType = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    region: {
      type: "string",
      description:
        "A region name, e.g. eu-west. Mirrored into the Mcp-Param-Region HTTP header.",
      ...mirroredInHeader,
    },
    repeat: {
      type: "integer",
      minimum: 1,
      maximum: 3,
      default: 1,
      description: "How many times to repeat the region in the result (1-3)",
    },
  },
  required: ["region"],
  additionalProperties: false,
};

/** The output: the region from the body, and the header that carried it. */
const outputSchema: JsonSchemaType = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    region: { type: "string" },
    // Nullable as anyOf with one type per branch, not `type: ["string",
    // "null"]`: some clients map tool schemas onto a dialect that allows a
    // single `type` per property (the OpenAPI subset of Gemini function
    // declarations, for one) and reject or drop the array form.
    regionHeader: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "The Mcp-Param-Region header the request carried, if any",
    },
    repeated: { type: "array", items: { type: "string" } },
  },
  required: ["region", "regionHeader", "repeated"],
  additionalProperties: false,
};

type HeaderParamsInput = { region: string; repeat?: number };

// Tool configuration
const name = "get-header-params";
const config = {
  title: "Get Header Params Tool",
  description:
    "Returns its region argument and the Mcp-Param-Region HTTP header it arrived in. Demonstrates " +
    "x-mcp-header (a 2026-07-28 Streamable HTTP client mirrors the argument into the header) and " +
    "JSON Schema 2020-12 input and output schemas.",
  inputSchema: fromJsonSchema<HeaderParamsInput>(inputSchema),
  outputSchema: fromJsonSchema(outputSchema),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'get-header-params' tool.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetHeaderParamsTool = (server: McpServer) => {
  server.registerTool(
    name,
    config,
    async ({ region, repeat }, ctx): Promise<CallToolResult> => {
      const regionHeader =
        ctx.http?.req?.headers.get("mcp-param-region") ?? null;
      const structuredContent = {
        region,
        regionHeader,
        repeated: Array.from({ length: repeat ?? 1 }, () => region),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(structuredContent) }],
        structuredContent,
      };
    },
  );
};
