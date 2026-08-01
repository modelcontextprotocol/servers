import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import { CallToolResult, ContentBlock } from "@modelcontextprotocol/server";

// Tool input schema
const GetStructuredContentListInputSchema = {
  location: z
    .enum(["New York", "Chicago", "Los Angeles"])
    .describe("Choose city"),
  days: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe("How many forecast days to return (1-5)"),
};

// Tool output schema -- an ARRAY at the root, not an object.
//
// Before protocol revision 2026-07-28 an `outputSchema` had to have
// `"type": "object"`. SEP-2106 lifted that: an output schema may now be any
// JSON Schema, and `structuredContent` any JSON value. TypeScript is the SDK
// where the natural spelling is also the correct one -- `z.array(...)` is
// passed straight through, with no `RootModel`/wrapper dance needed.
const GetStructuredContentListOutputSchema = z.array(
  z.object({
    day: z.number().int().describe("Forecast day, 1-based"),
    temperature: z.number().describe("Temperature in celsius"),
    conditions: z.string().describe("Weather conditions description"),
    humidity: z.number().describe("Humidity percentage"),
  })
);

// Deterministic per-city baselines, so the forecast is reproducible.
const BASELINES = {
  "New York": { temperature: 33, conditions: "Cloudy", humidity: 82 },
  Chicago: {
    temperature: 36,
    conditions: "Light rain / drizzle",
    humidity: 82,
  },
  "Los Angeles": { temperature: 73, conditions: "Sunny / Clear", humidity: 48 },
} as const;

// Tool configuration
const name = "get-structured-content-list";
const config = {
  title: "Get Structured Content List Tool",
  description:
    "Returns an array-rooted structured content payload, demonstrating the 2026-07-28 removal of the object-root restriction on output schemas",
  inputSchema: GetStructuredContentListInputSchema,
  outputSchema: GetStructuredContentListOutputSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'get-structured-content-list' tool.
 *
 * The sibling `get-structured-content` tool demonstrates an object-rooted
 * output schema, which is all any revision before 2026-07-28 permitted. This
 * tool demonstrates the case that revision newly allows: a **bare array at the
 * root** of both `outputSchema` and `structuredContent` (SEP-2106).
 *
 * ## What each era sees
 *
 * The handler below is written once and returns the natural value -- a bare
 * array. The SDK's wire codec adapts it per era, so neither the schema nor the
 * handler needs an `ctx.era` branch:
 *
 * - **modern** (`2026-07-28`) -- identity. `outputSchema` goes out with
 *   `"type": "array"` and `structuredContent` is the bare array.
 * - **legacy** (through `2025-11-25`) -- the codec projects both halves so the
 *   response stays legal on a wire that requires an object. `tools/list`
 *   advertises `{"type":"object","properties":{"result":{"type":"array",...}}}`
 *   and `tools/call` answers `{"result": [...]}`. The projection is applied by
 *   `projectCallToolResult`, keyed on the tool's advertised schema, so the two
 *   halves cannot drift apart.
 *
 * This automatic legacy projection is specific to the TypeScript SDK; as of
 * this writing the Go, Python and Rust SDKs do not perform it, so an
 * array-rooted schema is a breaking change for older clients there.
 *
 * Note there is no failure path returning bare text. A tool that advertises an
 * `outputSchema` MUST return conforming structured content, so an error has to
 * be raised as an error rather than answered with a text-only result.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetStructuredContentListTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const baseline = BASELINES[args.location];

    // A simple deterministic drift off the city's baseline -- no clock and no
    // randomness, so the same arguments always produce the same forecast.
    const forecast = Array.from({ length: args.days }, (_, index) => ({
      day: index + 1,
      temperature: baseline.temperature + index,
      conditions: baseline.conditions,
      humidity: Math.max(0, baseline.humidity - index * 2),
    }));

    const backwardCompatibleContentBlock: ContentBlock = {
      type: "text",
      text: JSON.stringify(forecast),
    };

    return {
      content: [backwardCompatibleContentBlock],
      structuredContent: forecast,
    };
  });
};
