/**
 * Characterizes what the everything server advertises over the wire (#4854):
 * `initialize` (server info, capabilities, instructions), and the tool,
 * prompt, resource and resource-template lists, including which tools appear
 * only for clients that declare a capability. These lists are the regression
 * net for the SDK v2 migration: an assertion here that has to change is a
 * behavior change.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_CAPABILITIES,
  connect,
  ofMethod,
  type Session,
} from "./harness.js";

let session: Session | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
});

const BASE_TOOLS = [
  "echo",
  "get-annotated-message",
  "get-env",
  "get-resource-links",
  "get-resource-reference",
  "get-structured-content",
  "get-sum",
  "get-tiny-image",
  "gzip-file-as-resource",
  "simulate-research-query",
  "toggle-simulated-logging",
  "toggle-subscriber-updates",
  "trigger-long-running-operation",
];

describe("initialize", () => {
  it("reports the server info, capabilities and instructions", async () => {
    session = await connect();
    const { client } = session;

    expect(client.getServerVersion()).toMatchObject({
      name: "mcp-servers/everything",
      title: "Everything Reference Server",
    });
    expect(client.getServerCapabilities()).toEqual({
      tools: { listChanged: true },
      prompts: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      logging: {},
      completions: {},
      tasks: {
        list: {},
        cancel: {},
        requests: { tools: { call: {} } },
      },
    });
    expect(client.getInstructions()).toMatch(
      /^# Everything Server – Server Instructions/,
    );
  });

  it("names capability-gated tools in its instructions even for a client that cannot see them (#4792)", async () => {
    // Characterization of #4792: the instructions are static, so a client
    // that declares no sampling, elicitation or roots capability is told
    // about tools that are not in its tools/list. The fix changes this test.
    session = await connect();
    const instructions = session.client.getInstructions() ?? "";
    const { tools } = await session.client.listTools();
    const names = tools.map((t) => t.name);

    for (const gated of [
      "trigger-sampling-request",
      "trigger-elicitation-request",
      "get-roots-list",
    ]) {
      expect(instructions).toContain(`\`${gated}\``);
      expect(names).not.toContain(gated);
    }
  });
});

describe("tools/list", () => {
  it("lists the base tools for a client that declares no capabilities", async () => {
    session = await connect();
    const { tools } = await session.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(BASE_TOOLS);
  });

  it("adds every capability-gated tool for a client that declares them all", async () => {
    session = await connect({ capabilities: ALL_CAPABILITIES });
    const { tools } = await session.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        ...BASE_TOOLS,
        "get-roots-list",
        "trigger-elicitation-request",
        "trigger-elicitation-request-async",
        "trigger-sampling-request",
        "trigger-sampling-request-async",
        "trigger-url-elicitation",
      ].sort(),
    );
  });

  it.each([
    [{ roots: {} }, ["get-roots-list"]],
    [{ sampling: {} }, ["trigger-sampling-request"]],
    [{ elicitation: {} }, ["trigger-elicitation-request"]],
    [
      { elicitation: { url: {} } },
      ["trigger-elicitation-request", "trigger-url-elicitation"],
    ],
    [
      {
        sampling: {},
        tasks: { requests: { sampling: { createMessage: {} } } },
      },
      ["trigger-sampling-request", "trigger-sampling-request-async"],
    ],
    [
      { elicitation: {}, tasks: { requests: { elicitation: { create: {} } } } },
      ["trigger-elicitation-request", "trigger-elicitation-request-async"],
    ],
    // The async tools need the base capability as well as the task one.
    [{ tasks: { requests: { sampling: { createMessage: {} } } } }, []],
    [{ tasks: { requests: { elicitation: { create: {} } } } }, []],
  ])(
    "gates tools on the client's declared capabilities: %j",
    async (capabilities, extra) => {
      session = await connect({ capabilities });
      const { tools } = await session.client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(
        [...BASE_TOOLS, ...extra].sort(),
      );
    },
  );

  it("sends tools/list_changed after initialize, when the conditional tools are registered", async () => {
    session = await connect();
    await session.client.listTools();
    expect(
      ofMethod(session.notifications, "notifications/tools/list_changed")
        .length,
    ).toBeGreaterThan(0);
  });

  it("advertises each tool's title and annotations", async () => {
    session = await connect({ capabilities: ALL_CAPABILITIES });
    const { tools } = await session.client.listTools();
    const summary = Object.fromEntries(
      tools
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => [
          t.name,
          {
            title: t.title,
            annotations: t.annotations,
            execution: t.execution,
            hasOutputSchema: t.outputSchema !== undefined,
          },
        ]),
    );
    expect(summary).toMatchInlineSnapshot(`
      {
        "echo": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Echo Tool",
        },
        "get-annotated-message": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Get Annotated Message Tool",
        },
        "get-env": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Print Environment Tool",
        },
        "get-resource-links": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Get Resource Links Tool",
        },
        "get-resource-reference": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Get Resource Reference Tool",
        },
        "get-roots-list": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Get Roots List Tool",
        },
        "get-structured-content": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": true,
          "title": "Get Structured Content Tool",
        },
        "get-sum": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Get Sum Tool",
        },
        "get-tiny-image": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Get Tiny Image Tool",
        },
        "gzip-file-as-resource": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": true,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "GZip File as Resource Tool",
        },
        "simulate-research-query": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": false,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "required",
          },
          "hasOutputSchema": false,
          "title": "Simulate Research Query",
        },
        "toggle-simulated-logging": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": false,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Toggle Simulated Logging",
        },
        "toggle-subscriber-updates": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": false,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Toggle Subscriber Updates",
        },
        "trigger-elicitation-request": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": false,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Trigger Elicitation Request Tool",
        },
        "trigger-elicitation-request-async": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": false,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Trigger Async Elicitation Request Tool",
        },
        "trigger-long-running-operation": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Trigger Long Running Operation Tool",
        },
        "trigger-sampling-request": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": true,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Trigger Sampling Request Tool",
        },
        "trigger-sampling-request-async": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": true,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Trigger Async Sampling Request Tool",
        },
        "trigger-url-elicitation": {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": true,
            "readOnlyHint": false,
          },
          "execution": {
            "taskSupport": "forbidden",
          },
          "hasOutputSchema": false,
          "title": "Trigger URL Elicitation Tool",
        },
      }
    `);
  });

  it("advertises each tool's input schema", async () => {
    session = await connect({ capabilities: ALL_CAPABILITIES });
    const { tools } = await session.client.listTools();
    const schemas = Object.fromEntries(
      tools
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => [t.name, t.inputSchema]),
    );
    expect(schemas).toMatchInlineSnapshot(`
      {
        "echo": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "message": {
              "description": "Message to echo",
              "type": "string",
            },
          },
          "required": [
            "message",
          ],
          "type": "object",
        },
        "get-annotated-message": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "includeImage": {
              "default": false,
              "description": "Whether to include an example image",
              "type": "boolean",
            },
            "messageType": {
              "description": "Type of message to demonstrate different annotation patterns",
              "enum": [
                "error",
                "success",
                "debug",
              ],
              "type": "string",
            },
          },
          "required": [
            "messageType",
          ],
          "type": "object",
        },
        "get-env": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {},
          "type": "object",
        },
        "get-resource-links": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "count": {
              "default": 3,
              "description": "Number of resource links to return (1-10)",
              "maximum": 10,
              "minimum": 1,
              "type": "number",
            },
          },
          "type": "object",
        },
        "get-resource-reference": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "resourceId": {
              "default": 1,
              "description": "ID of the text resource to fetch",
              "type": "number",
            },
            "resourceType": {
              "default": "Text",
              "enum": [
                "Text",
                "Blob",
              ],
              "type": "string",
            },
          },
          "type": "object",
        },
        "get-roots-list": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {},
          "type": "object",
        },
        "get-structured-content": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "location": {
              "description": "Choose city",
              "enum": [
                "New York",
                "Chicago",
                "Los Angeles",
              ],
              "type": "string",
            },
          },
          "required": [
            "location",
          ],
          "type": "object",
        },
        "get-sum": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "a": {
              "description": "First number",
              "type": "number",
            },
            "b": {
              "description": "Second number",
              "type": "number",
            },
          },
          "required": [
            "a",
            "b",
          ],
          "type": "object",
        },
        "get-tiny-image": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {},
          "type": "object",
        },
        "gzip-file-as-resource": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "data": {
              "default": "https://raw.githubusercontent.com/modelcontextprotocol/servers/refs/heads/main/README.md",
              "description": "URL or data URI of the file content to compress",
              "format": "uri",
              "type": "string",
            },
            "name": {
              "default": "README.md.gz",
              "description": "Name of the output file",
              "type": "string",
            },
            "outputType": {
              "default": "resourceLink",
              "description": "How the resulting gzipped file should be returned. 'resourceLink' returns a link to a resource that can be read later, 'resource' returns a full resource object.",
              "enum": [
                "resourceLink",
                "resource",
              ],
              "type": "string",
            },
          },
          "type": "object",
        },
        "simulate-research-query": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "ambiguous": {
              "default": false,
              "description": "Simulate an ambiguous query that requires clarification (triggers input_required status)",
              "type": "boolean",
            },
            "topic": {
              "description": "The research topic to investigate",
              "type": "string",
            },
          },
          "required": [
            "topic",
          ],
          "type": "object",
        },
        "toggle-simulated-logging": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {},
          "type": "object",
        },
        "toggle-subscriber-updates": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {},
          "type": "object",
        },
        "trigger-elicitation-request": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {},
          "type": "object",
        },
        "trigger-elicitation-request-async": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {},
          "type": "object",
        },
        "trigger-long-running-operation": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "duration": {
              "default": 10,
              "description": "Duration of the operation in seconds",
              "type": "number",
            },
            "steps": {
              "default": 5,
              "description": "Number of steps in the operation",
              "type": "number",
            },
          },
          "type": "object",
        },
        "trigger-sampling-request": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "maxTokens": {
              "default": 100,
              "description": "Maximum number of tokens to generate",
              "type": "number",
            },
            "prompt": {
              "description": "The prompt to send to the LLM",
              "type": "string",
            },
          },
          "required": [
            "prompt",
          ],
          "type": "object",
        },
        "trigger-sampling-request-async": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "maxTokens": {
              "default": 100,
              "description": "Maximum number of tokens to generate",
              "type": "number",
            },
            "prompt": {
              "description": "The prompt to send to the LLM",
              "type": "string",
            },
          },
          "required": [
            "prompt",
          ],
          "type": "object",
        },
        "trigger-url-elicitation": {
          "$schema": "http://json-schema.org/draft-07/schema#",
          "properties": {
            "elicitationId": {
              "description": "Optional explicit elicitation ID. Defaults to a random UUID.",
              "type": "string",
            },
            "errorPath": {
              "default": false,
              "description": "Controls which elicitation mechanism is used. When false (default), sends an elicitation/create request (request path). When true, throws a UrlElicitationRequiredError (MCP error code -32042) so the client handles the URL elicitation via the error path rather than waiting for a response. To clear the error, satisfy the prerequisite and retry this call with the same arguments; the retry ignores errorPath and proceeds, so the client does not loop on the same error.",
              "type": "boolean",
            },
            "message": {
              "default": "Please open the link to complete this action.",
              "description": "Message shown to the user before opening the URL",
              "type": "string",
            },
            "url": {
              "description": "The URL the user should open",
              "format": "uri",
              "type": "string",
            },
          },
          "required": [
            "url",
          ],
          "type": "object",
        },
      }
    `);
  });

  it("advertises the output schema of get-structured-content", async () => {
    session = await connect();
    const { tools } = await session.client.listTools();
    const tool = tools.find((t) => t.name === "get-structured-content");
    expect(tool?.outputSchema).toMatchInlineSnapshot(`
      {
        "$schema": "http://json-schema.org/draft-07/schema#",
        "additionalProperties": false,
        "properties": {
          "conditions": {
            "description": "Weather conditions description",
            "type": "string",
          },
          "humidity": {
            "description": "Humidity percentage",
            "type": "number",
          },
          "temperature": {
            "description": "Temperature in celsius",
            "type": "number",
          },
        },
        "required": [
          "temperature",
          "conditions",
          "humidity",
        ],
        "type": "object",
      }
    `);
  });
});

describe("prompts/list", () => {
  it("lists the four prompts with their arguments", async () => {
    session = await connect();
    const { prompts } = await session.client.listPrompts();
    expect(prompts).toMatchInlineSnapshot(`
      [
        {
          "arguments": undefined,
          "description": "A prompt with no arguments",
          "name": "simple-prompt",
          "title": "Simple Prompt",
        },
        {
          "arguments": [
            {
              "description": "Name of the city",
              "name": "city",
              "required": true,
            },
            {
              "description": undefined,
              "name": "state",
              "required": false,
            },
          ],
          "description": "A prompt with two arguments, one required and one optional",
          "name": "args-prompt",
          "title": "Arguments Prompt",
        },
        {
          "arguments": [
            {
              "description": "Choose the department.",
              "name": "department",
              "required": true,
            },
            {
              "description": "Choose a team member to lead the selected department.",
              "name": "name",
              "required": true,
            },
          ],
          "description": "First argument choice narrows values for second argument.",
          "name": "completable-prompt",
          "title": "Team Management",
        },
        {
          "arguments": [
            {
              "description": "Type of resource to fetch",
              "name": "resourceType",
              "required": true,
            },
            {
              "description": "ID of the text resource to fetch",
              "name": "resourceId",
              "required": true,
            },
          ],
          "description": "A prompt that includes an embedded resource reference",
          "name": "resource-prompt",
          "title": "Resource Prompt",
        },
      ]
    `);
  });
});

describe("resources/list and resources/templates/list", () => {
  it("lists one static resource per file in docs/", async () => {
    session = await connect();
    const { resources } = await session.client.listResources();
    expect(resources).toMatchInlineSnapshot(`
      [
        {
          "description": "Static document file exposed from /docs: architecture.md",
          "mimeType": "text/markdown",
          "name": "architecture.md",
          "uri": "demo://resource/static/document/architecture.md",
        },
        {
          "description": "Static document file exposed from /docs: extension.md",
          "mimeType": "text/markdown",
          "name": "extension.md",
          "uri": "demo://resource/static/document/extension.md",
        },
        {
          "description": "Static document file exposed from /docs: features.md",
          "mimeType": "text/markdown",
          "name": "features.md",
          "uri": "demo://resource/static/document/features.md",
        },
        {
          "description": "Static document file exposed from /docs: how-it-works.md",
          "mimeType": "text/markdown",
          "name": "how-it-works.md",
          "uri": "demo://resource/static/document/how-it-works.md",
        },
        {
          "description": "Static document file exposed from /docs: instructions.md",
          "mimeType": "text/markdown",
          "name": "instructions.md",
          "uri": "demo://resource/static/document/instructions.md",
        },
        {
          "description": "Static document file exposed from /docs: startup.md",
          "mimeType": "text/markdown",
          "name": "startup.md",
          "uri": "demo://resource/static/document/startup.md",
        },
        {
          "description": "Static document file exposed from /docs: structure.md",
          "mimeType": "text/markdown",
          "name": "structure.md",
          "uri": "demo://resource/static/document/structure.md",
        },
      ]
    `);
  });

  it("lists the dynamic text and blob templates", async () => {
    session = await connect();
    const { resourceTemplates } = await session.client.listResourceTemplates();
    expect(resourceTemplates).toMatchInlineSnapshot(`
      [
        {
          "description": "Plaintext dynamic resource fabricated from the {resourceId} variable, which must be an integer.",
          "mimeType": "text/plain",
          "name": "Dynamic Text Resource",
          "uriTemplate": "demo://resource/dynamic/text/{resourceId}",
        },
        {
          "description": "Binary (base64) dynamic resource fabricated from the {resourceId} variable, which must be an integer.",
          "mimeType": "application/octet-stream",
          "name": "Dynamic Blob Resource",
          "uriTemplate": "demo://resource/dynamic/blob/{resourceId}",
        },
      ]
    `);
  });
});
