/**
 * Characterizes the tools that send a request back to the client (#4854):
 * `trigger-sampling-request` (`sampling/createMessage`),
 * `trigger-elicitation-request` (form-mode `elicitation/create`) and
 * `trigger-url-elicitation` (URL mode, by request or by the -32042 error
 * path). A test client answers each request; the tests pin both what the
 * server asked and what the tool then returned.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  CreateMessageRequestSchema,
  ElicitRequestSchema,
  ErrorCode,
  McpError,
  type ClientCapabilities,
  type CreateMessageRequest,
  type ElicitRequest,
  type ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import { __resetIssuedErrorPathElicitations } from "../tools/trigger-url-elicitation.js";
import {
  connect,
  contentOf,
  textOf,
  type ConnectOptions,
  type Session,
} from "./harness.js";

let session: Session | undefined;

afterEach(async () => {
  __resetIssuedErrorPathElicitations();
  await session?.close();
  session = undefined;
});

describe("trigger-sampling-request", () => {
  it("asks the client to sample and returns the client's answer", async () => {
    const asked: CreateMessageRequest["params"][] = [];
    session = await connect({
      capabilities: { sampling: {} },
      setup: (client) =>
        client.setRequestHandler(CreateMessageRequestSchema, async (req) => {
          asked.push(req.params);
          return {
            role: "assistant",
            content: { type: "text", text: "sampled reply" },
            model: "test-model",
            stopReason: "endTurn",
          };
        }),
    });

    const result = await session.client.callTool({
      name: "trigger-sampling-request",
      arguments: { prompt: "Say hi" },
    });

    expect(asked).toEqual([
      {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Resource trigger-sampling-request context: Say hi",
            },
          },
        ],
        systemPrompt: "You are a helpful test server.",
        maxTokens: 100,
        temperature: 0.7,
      },
    ]);
    expect(textOf(contentOf(result)[0])).toBe(
      `LLM sampling result: \n${JSON.stringify(
        {
          model: "test-model",
          stopReason: "endTurn",
          role: "assistant",
          content: { type: "text", text: "sampled reply" },
        },
        null,
        2,
      )}`,
    );
  });

  it("passes maxTokens through", async () => {
    let maxTokens: number | undefined;
    session = await connect({
      capabilities: { sampling: {} },
      setup: (client) =>
        client.setRequestHandler(CreateMessageRequestSchema, async (req) => {
          maxTokens = req.params.maxTokens;
          return {
            role: "assistant",
            content: { type: "text", text: "ok" },
            model: "m",
          };
        }),
    });
    await session.client.callTool({
      name: "trigger-sampling-request",
      arguments: { prompt: "p", maxTokens: 7 },
    });
    expect(maxTokens).toBe(7);
  });

  it("reports a client that fails to sample as a tool error", async () => {
    session = await connect({
      capabilities: { sampling: {} },
      setup: (client) =>
        client.setRequestHandler(CreateMessageRequestSchema, async () => {
          throw new McpError(ErrorCode.InvalidRequest, "user rejected");
        }),
    });
    const result = await session.client.callTool({
      name: "trigger-sampling-request",
      arguments: { prompt: "p" },
    });
    expect(result).toEqual({
      isError: true,
      // The SDK prefixes the client's error message twice on its way back.
      content: [
        {
          type: "text",
          text: "MCP error -32600: MCP error -32600: user rejected",
        },
      ],
    });
  });
});

/** Connect a client whose elicitation answers come from `answer`. */
async function connectElicitation(
  answer: (req: ElicitRequest) => ElicitResult,
  capabilities: ClientCapabilities = { elicitation: { form: {}, url: {} } },
  options: Omit<ConnectOptions, "capabilities" | "setup"> = {},
) {
  const asked: ElicitRequest["params"][] = [];
  const s = await connect({
    ...options,
    capabilities,
    setup: (client) =>
      client.setRequestHandler(ElicitRequestSchema, async (req) => {
        asked.push(req.params);
        return answer(req);
      }),
  });
  return { s, asked };
}

describe("trigger-elicitation-request", () => {
  async function trigger(answer: ElicitResult) {
    const { s, asked } = await connectElicitation(() => answer);
    session = s;
    const result = await s.client.callTool({
      name: "trigger-elicitation-request",
      arguments: {},
    });
    return { texts: contentOf(result).map(textOf), asked };
  }

  it("asks for the demo form", async () => {
    const { asked } = await trigger({ action: "cancel" });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchInlineSnapshot(`
      {
        "message": "Please provide inputs for the following fields:",
        "requestedSchema": {
          "properties": {
            "birthdate": {
              "description": "Your date of birth",
              "format": "date",
              "title": "String with date format",
              "type": "string",
            },
            "check": {
              "description": "Agree to the terms and conditions",
              "title": "Boolean",
              "type": "boolean",
            },
            "email": {
              "description": "Your email address (will be verified, and never shared with anyone else)",
              "format": "email",
              "title": "String with email format",
              "type": "string",
            },
            "firstLine": {
              "default": "It was a dark and stormy night.",
              "description": "Favorite first line of a story",
              "title": "String with default",
              "type": "string",
            },
            "homepage": {
              "description": "Portfolio / personal website",
              "format": "uri",
              "title": "String with uri format",
              "type": "string",
            },
            "integer": {
              "default": 42,
              "description": "Your favorite integer (do not give us your phone number, pin, or other sensitive info)",
              "maximum": 100,
              "minimum": 1,
              "title": "Integer",
              "type": "integer",
            },
            "legacyTitledEnum": {
              "default": "pet-1",
              "description": "Choose your favorite type of pet",
              "enum": [
                "pet-1",
                "pet-2",
                "pet-3",
                "pet-4",
                "pet-5",
              ],
              "enumNames": [
                "Cats",
                "Dogs",
                "Birds",
                "Fish",
                "Reptiles",
              ],
              "title": "Legacy Titled Single Select Enum",
              "type": "string",
            },
            "name": {
              "description": "Your full, legal name",
              "title": "String",
              "type": "string",
            },
            "number": {
              "default": 3.14,
              "description": "Favorite number (there are no wrong answers)",
              "maximum": 1000,
              "minimum": 0,
              "title": "Number in range 1-1000",
              "type": "number",
            },
            "titledMultipleSelectEnum": {
              "default": [
                "fish-1",
              ],
              "description": "Choose your favorite types of fish",
              "items": {
                "anyOf": [
                  {
                    "const": "fish-1",
                    "title": "Tuna",
                  },
                  {
                    "const": "fish-2",
                    "title": "Salmon",
                  },
                  {
                    "const": "fish-3",
                    "title": "Trout",
                  },
                ],
              },
              "maxItems": 3,
              "minItems": 1,
              "title": "Titled Multiple Select Enum",
              "type": "array",
            },
            "titledSingleSelectEnum": {
              "default": "hero-1",
              "description": "Choose your favorite hero",
              "oneOf": [
                {
                  "const": "hero-1",
                  "title": "Superman",
                },
                {
                  "const": "hero-2",
                  "title": "Green Lantern",
                },
                {
                  "const": "hero-3",
                  "title": "Wonder Woman",
                },
              ],
              "title": "Titled Single Select Enum",
              "type": "string",
            },
            "untitledMultipleSelectEnum": {
              "default": [
                "Guitar",
              ],
              "description": "Choose your favorite instruments",
              "items": {
                "enum": [
                  "Guitar",
                  "Piano",
                  "Violin",
                  "Drums",
                  "Bass",
                ],
                "type": "string",
              },
              "maxItems": 3,
              "minItems": 1,
              "title": "Untitled Multiple Select Enum",
              "type": "array",
            },
            "untitledSingleSelectEnum": {
              "default": "Monica",
              "description": "Choose your favorite friend",
              "enum": [
                "Monica",
                "Rachel",
                "Joey",
                "Chandler",
                "Ross",
                "Phoebe",
              ],
              "title": "Untitled Single Select Enum",
              "type": "string",
            },
          },
          "required": [
            "name",
          ],
          "type": "object",
        },
      }
    `);
  });

  it("summarizes every field of an accepted form", async () => {
    // `color` and `petType` are not in the requested schema; the summary
    // still reads them if a client sends them (#4854 baseline).
    const content = {
      name: "Ada",
      check: false,
      color: "teal",
      email: "ada@example.com",
      homepage: "https://example.com",
      birthdate: "1815-12-10",
      integer: 0,
      number: 3.5,
      petType: "pet-2",
    };
    const { texts } = await trigger({ action: "accept", content });
    expect(texts).toEqual([
      "✅ User provided the requested information!",
      "User inputs:\n" +
        "- Name: Ada\n" +
        "- Agreed to terms: false\n" +
        "- Favorite Color: teal\n" +
        "- Email: ada@example.com\n" +
        "- Homepage: https://example.com\n" +
        "- Birthdate: 1815-12-10\n" +
        "- Favorite Integer: 0\n" +
        "- Favorite Number: 3.5\n" +
        "- Pet Type: pet-2",
      `\nRaw result: ${JSON.stringify({ action: "accept", content }, null, 2)}`,
    ]);
  });

  it("summarizes an accepted form with no fields filled", async () => {
    const { texts } = await trigger({ action: "accept", content: {} });
    expect(texts.slice(0, 2)).toEqual([
      "✅ User provided the requested information!",
      "User inputs:\n",
    ]);
  });

  it("reports only the raw result for an accept with no content", async () => {
    const { texts } = await trigger({ action: "accept" });
    expect(texts).toEqual([
      `\nRaw result: ${JSON.stringify({ action: "accept" }, null, 2)}`,
    ]);
  });

  it("reports a decline", async () => {
    const { texts } = await trigger({ action: "decline" });
    expect(texts[0]).toBe(
      "❌ User declined to provide the requested information.",
    );
  });

  it("reports a cancel", async () => {
    const { texts } = await trigger({ action: "cancel" });
    expect(texts[0]).toBe("⚠️ User cancelled the elicitation dialog.");
  });

  it("is listed for a URL-only client, which then cannot answer its form request", async () => {
    // Characterization: the tool is gated on `elicitation` alone, so a
    // client that declared only URL mode sees it and the call fails.
    const { s } = await connectElicitation(() => ({ action: "cancel" }), {
      elicitation: { url: {} },
    });
    session = s;
    const result = await s.client.callTool({
      name: "trigger-elicitation-request",
      arguments: {},
    });
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "MCP error -32602: MCP error -32602: Client does not support form-mode elicitation requests",
        },
      ],
    });
  });
});

describe("trigger-url-elicitation", () => {
  const URL_ARG = "https://example.com/authorize";

  async function callUrlTool(s: Session, args: Record<string, unknown>) {
    return s.client.callTool({
      name: "trigger-url-elicitation",
      arguments: { url: URL_ARG, ...args },
    });
  }

  it("sends a URL-mode elicitation with the given id and reports acceptance", async () => {
    const { s, asked } = await connectElicitation(() => ({ action: "accept" }));
    session = s;
    const result = await callUrlTool(s, { elicitationId: "elic-1" });
    expect(asked).toEqual([
      {
        mode: "url",
        url: URL_ARG,
        message: "Please open the link to complete this action.",
        elicitationId: "elic-1",
      },
    ]);
    expect(contentOf(result).map(textOf)).toEqual([
      `✅ User completed the URL elicitation flow.\nElicitation ID: elic-1\nURL: ${URL_ARG}`,
      `\nRaw result: ${JSON.stringify({ action: "accept" }, null, 2)}`,
    ]);
  });

  it("generates a UUID elicitation id when none is given", async () => {
    const { s, asked } = await connectElicitation(() => ({
      action: "decline",
    }));
    session = s;
    const result = await callUrlTool(s, { message: "Go here" });
    const params = asked[0];
    const id = "elicitationId" in params ? params.elicitationId : undefined;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(asked[0]).toMatchObject({ message: "Go here" });
    expect(textOf(contentOf(result)[0])).toBe(
      `❌ User declined to open the URL (Elicitation ID: ${id}).`,
    );
  });

  it("reports a cancel", async () => {
    const { s } = await connectElicitation(() => ({ action: "cancel" }));
    session = s;
    const result = await callUrlTool(s, { elicitationId: "e" });
    expect(textOf(contentOf(result)[0])).toBe(
      "⚠️ User cancelled the URL elicitation (Elicitation ID: e).",
    );
  });

  it("rejects a malformed URL at input validation", async () => {
    const { s } = await connectElicitation(() => ({ action: "accept" }));
    session = s;
    const result = await callUrlTool(s, { url: "not a url" });
    expect(result.isError).toBe(true);
  });

  /** Call with errorPath and return the protocol error it is rejected with. */
  async function errorPathRejection(s: Session, args = {}) {
    try {
      await callUrlTool(s, { errorPath: true, ...args });
    } catch (error) {
      return error;
    }
    throw new Error("expected the call to be rejected");
  }

  it("on the error path, rejects the call with -32042 and a prerequisite at a different URL", async () => {
    const { s, asked } = await connectElicitation(() => ({ action: "accept" }));
    session = s;
    const error = await errorPathRejection(s);
    expect(error).toBeInstanceOf(McpError);
    const mcpError = error as McpError;
    expect(mcpError.code).toBe(-32042);
    // The SDK prefixes the code twice on the client side.
    expect(mcpError.message).toBe(
      "MCP error -32042: MCP error -32042: This request requires browser-based authorization.",
    );
    expect(mcpError.data).toEqual({
      elicitations: [
        {
          mode: "url",
          url: "https://modelcontextprotocol.io",
          message:
            "Open this link to satisfy the prerequisite, then retry the request.",
          elicitationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        },
      ],
    });
    expect(asked).toEqual([]);
  });

  it("takes the request path when the same call is retried, then errors again on the next one", async () => {
    const { s, asked } = await connectElicitation(() => ({ action: "accept" }));
    session = s;
    await errorPathRejection(s, { elicitationId: "x" });

    const retry = await callUrlTool(s, { errorPath: true, elicitationId: "x" });
    expect(textOf(contentOf(retry)[0])).toMatch(
      /^✅ User completed the URL elicitation flow\./,
    );
    expect(asked).toHaveLength(1);

    // The one-shot marker was consumed, so a third call errors again.
    expect(await errorPathRejection(s, { elicitationId: "x" })).toBeInstanceOf(
      McpError,
    );
  });

  it("keys the retry on the session, URL and requested id, not on the generated id", async () => {
    const { s } = await connectElicitation(() => ({ action: "accept" }));
    session = s;
    await errorPathRejection(s);
    // A different requested id is a different call: it errors.
    expect(
      await errorPathRejection(s, { elicitationId: "other" }),
    ).toBeInstanceOf(McpError);
    // The original call (no requested id) is recognized as the retry.
    const retry = await callUrlTool(s, { errorPath: true });
    expect(retry.isError).toBeUndefined();
  });

  it("keys a session with no id under 'default' (stdio)", async () => {
    const { s } = await connectElicitation(
      () => ({ action: "accept" }),
      undefined,
      { sessionId: null },
    );
    session = s;
    await errorPathRejection(s);
    const retry = await callUrlTool(s, { errorPath: true });
    expect(retry.isError).toBeUndefined();
  });
});
