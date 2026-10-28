/**
 * Characterizes the everything server's self-contained tools through the
 * protocol (#4854): each is called with `tools/call` from a real client, and
 * the test pins the result or error the client receives. Tools that talk back
 * to the client (sampling, elicitation, roots), the task tools, logging,
 * subscriptions and gzip each have their own file.
 */
import { crc32 } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INCLUDE_SECRETS_VAR, REDACTED } from "../tools/get-env.js";
import { MCP_TINY_IMAGE } from "../tools/get-tiny-image.js";
import {
  connect,
  contentOf,
  contentOfType,
  textOf,
  type Session,
} from "./harness.js";

let session: Session | undefined;

afterEach(async () => {
  await session?.close();
  session = undefined;
});

async function call(name: string, args: Record<string, unknown> = {}) {
  session ??= await connect();
  return session.client.callTool({ name, arguments: args });
}

describe("echo", () => {
  it("echoes the message", async () => {
    const result = await call("echo", { message: "hello" });
    expect(result).toEqual({
      content: [{ type: "text", text: "Echo: hello" }],
    });
  });

  it("echoes an empty message", async () => {
    const result = await call("echo", { message: "" });
    expect(textOf(contentOf(result)[0])).toBe("Echo: ");
  });

  it("reports missing input as a tool error, not a protocol error", async () => {
    const result = await call("echo", {});
    expect(result.isError).toBe(true);
    expect(textOf(contentOf(result)[0])).toMatch(
      /^Input validation error: Invalid arguments for tool echo/,
    );
  });
});

describe("get-sum", () => {
  it.each([
    [2, 3, 5],
    [-5, 3, -2],
    [0, 0, 0],
    [1.5, 2.25, 3.75],
  ])("sums %d and %d", async (a, b, sum) => {
    const result = await call("get-sum", { a, b });
    expect(textOf(contentOf(result)[0])).toBe(
      `The sum of ${a} and ${b} is ${sum}.`,
    );
  });

  it("rejects a non-numeric operand", async () => {
    const result = await call("get-sum", { a: "1", b: 2 });
    expect(result.isError).toBe(true);
  });
});

describe("get-env", () => {
  /** Calls `get-env` and parses the JSON object it returns. */
  async function getEnv(): Promise<Record<string, string>> {
    const result = await call("get-env");
    return JSON.parse(textOf(contentOf(result)[0]));
  }

  beforeEach(() => {
    // Mask by default even if the developer's shell sets the opt-in.
    vi.stubEnv(INCLUDE_SECRETS_VAR, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns every variable name, with non-credential values intact", async () => {
    vi.stubEnv("EVERYTHING_TEST_VAR", "test-value");
    const env = await getEnv();
    expect(env.EVERYTHING_TEST_VAR).toBe("test-value");
    expect(env.PATH).toBe(process.env.PATH);
    expect(Object.keys(env).sort()).toEqual(Object.keys(process.env).sort());
  });

  it.each([
    "OPENAI_API_KEY",
    "GITHUB_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "DB_PASSWORD",
    "MYSQL_PASSWD",
    "GOOGLE_APPLICATION_CREDENTIAL",
    "BASIC_AUTH",
    "SESSION_COOKIE",
    "key",
    "my_Token",
  ])("masks the value of the credential-like name %s", async (key) => {
    vi.stubEnv(key, "planted-secret-9f3a1c");
    const env = await getEnv();
    expect(env[key]).toBe(REDACTED);
    expect(JSON.stringify(env)).not.toContain("planted-secret-9f3a1c");
  });

  it.each([
    "PWD",
    "OLDPWD",
    "KEYBOARD_LAYOUT",
    "MONKEY",
    "TOKENIZER_PATH",
    "AUTHOR_NAME",
    "PASSWORDLESS",
  ])(
    "leaves %s readable: no whole segment is a credential word",
    async (key) => {
      vi.stubEnv(key, "plain-value");
      const env = await getEnv();
      expect(env[key]).toBe("plain-value");
    },
  );

  it.each(["1", "true", "TRUE", " yes ", "on"])(
    "returns credential values unmasked when GET_ENV_INCLUDE_SECRETS=%j",
    async (flag) => {
      vi.stubEnv(INCLUDE_SECRETS_VAR, flag);
      vi.stubEnv("OPENAI_API_KEY", "planted-secret-9f3a1c");
      const env = await getEnv();
      expect(env.OPENAI_API_KEY).toBe("planted-secret-9f3a1c");
      expect(env[INCLUDE_SECRETS_VAR]).toBe(flag);
    },
  );

  it.each(["", "0", "false", "no"])(
    "keeps masking when GET_ENV_INCLUDE_SECRETS=%j",
    async (flag) => {
      vi.stubEnv(INCLUDE_SECRETS_VAR, flag);
      vi.stubEnv("OPENAI_API_KEY", "planted-secret-9f3a1c");
      const env = await getEnv();
      expect(env.OPENAI_API_KEY).toBe(REDACTED);
    },
  );

  it("says in its description that credential values are masked", async () => {
    session ??= await connect();
    const { tools } = await session.client.listTools();
    const tool = tools.find((t) => t.name === "get-env");
    expect(tool?.description).toContain(REDACTED);
    expect(tool?.description).toContain(INCLUDE_SECRETS_VAR);
    expect(tool?.inputSchema.properties ?? {}).toEqual({});
  });
});

describe("get-tiny-image", () => {
  it("returns the MCP logo between two text blocks", async () => {
    const result = await call("get-tiny-image");
    expect(result.content).toEqual([
      { type: "text", text: "Here's the image you requested:" },
      { type: "image", data: MCP_TINY_IMAGE, mimeType: "image/png" },
      { type: "text", text: "The image above is the MCP logo." },
    ]);
    expect(
      Buffer.from(MCP_TINY_IMAGE, "base64").subarray(1, 4).toString(),
    ).toBe("PNG");
  });

  // #5208: the embedded PNG once carried an iCCP chunk whose CRC did not
  // match, which strict decoders reject. Walk every chunk of the image the
  // client receives and check its stored CRC-32 against its type and data.
  it("returns a PNG whose every chunk has a valid CRC", async () => {
    const result = await call("get-tiny-image");
    const image = contentOfType(contentOf(result)[1], "image");
    const png = Buffer.from(image.data, "base64");
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    const chunks: string[] = [];
    let offset = 8;
    while (offset < png.length) {
      const length = png.readUInt32BE(offset);
      const type = png.subarray(offset + 4, offset + 8).toString("latin1");
      const stored = png.readUInt32BE(offset + 8 + length);
      expect(crc32(png.subarray(offset + 4, offset + 8 + length)), type).toBe(
        stored,
      );
      chunks.push(type);
      offset += 12 + length;
    }
    expect(offset).toBe(png.length);
    expect(chunks[0]).toBe("IHDR");
    expect(chunks.at(-1)).toBe("IEND");
    expect(chunks).toContain("IDAT");
  });
});

describe("get-structured-content", () => {
  it.each([
    ["New York", { temperature: 33, conditions: "Cloudy", humidity: 82 }],
    [
      "Chicago",
      { temperature: 36, conditions: "Light rain / drizzle", humidity: 82 },
    ],
    [
      "Los Angeles",
      { temperature: 73, conditions: "Sunny / Clear", humidity: 48 },
    ],
  ])("returns the weather for %s", async (location, weather) => {
    const result = await call("get-structured-content", { location });
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify(weather) }],
      structuredContent: weather,
    });
  });

  it("rejects a city outside the enum", async () => {
    const result = await call("get-structured-content", { location: "Paris" });
    expect(result.isError).toBe(true);
  });
});

describe("get-annotated-message", () => {
  it.each([
    [
      "error",
      "Error: Operation failed",
      { priority: 1, audience: ["user", "assistant"] },
    ],
    [
      "success",
      "Operation completed successfully",
      { priority: 0.7, audience: ["user"] },
    ],
    [
      "debug",
      "Debug: Cache hit ratio 0.95, latency 150ms",
      { priority: 0.3, audience: ["assistant"] },
    ],
  ])("annotates a %s message", async (messageType, text, annotations) => {
    const result = await call("get-annotated-message", { messageType });
    expect(result.content).toEqual([{ type: "text", text, annotations }]);
  });

  it("appends an annotated image when asked", async () => {
    const result = await call("get-annotated-message", {
      messageType: "success",
      includeImage: true,
    });
    expect(contentOf(result)[1]).toEqual({
      type: "image",
      data: MCP_TINY_IMAGE,
      mimeType: "image/png",
      annotations: { priority: 0.5, audience: ["user"] },
    });
  });

  it("rejects an unknown message type", async () => {
    const result = await call("get-annotated-message", {
      messageType: "info",
    });
    expect(result.isError).toBe(true);
  });
});

describe("trigger-long-running-operation", () => {
  it("completes and reports one progress notification per step", async () => {
    session = await connect();
    const progress: unknown[] = [];
    const result = await session.client.callTool(
      {
        name: "trigger-long-running-operation",
        arguments: { duration: 0.03, steps: 3 },
      },
      { onprogress: (p) => progress.push(p) },
    );
    expect(textOf(contentOf(result)[0])).toBe(
      "Long running operation completed. Duration: 0.03 seconds, Steps: 3.",
    );
    expect(progress).toEqual([
      { progress: 1, total: 3 },
      { progress: 2, total: 3 },
      { progress: 3, total: 3 },
    ]);
  });

  it("sends no progress when the request carries no progress token", async () => {
    session = await connect();
    const result = await call("trigger-long-running-operation", {
      duration: 0.01,
      steps: 1,
    });
    expect(textOf(contentOf(result)[0])).toBe(
      "Long running operation completed. Duration: 0.01 seconds, Steps: 1.",
    );
    expect(
      session.notifications.filter(
        (n) => n.method === "notifications/progress",
      ),
    ).toEqual([]);
  });
});

describe("get-resource-links", () => {
  it("returns three links by default, blob for odd ids and text for even", async () => {
    const result = await call("get-resource-links");
    const content = contentOf(result);
    expect(textOf(content[0])).toBe(
      "Here are 3 resource links to resources available in this server:",
    );
    expect(content.slice(1)).toEqual([
      {
        type: "resource_link",
        uri: "demo://resource/dynamic/blob/1",
        name: "Blob Resource 1",
        description: "Resource 1: binary blob resource",
        mimeType: "application/octet-stream",
      },
      {
        type: "resource_link",
        uri: "demo://resource/dynamic/text/2",
        name: "Text Resource 2",
        description: "Resource 2: plaintext resource",
        mimeType: "text/plain",
      },
      {
        type: "resource_link",
        uri: "demo://resource/dynamic/blob/3",
        name: "Blob Resource 3",
        description: "Resource 3: binary blob resource",
        mimeType: "application/octet-stream",
      },
    ]);
  });

  it("returns the requested number of links", async () => {
    const result = await call("get-resource-links", { count: 10 });
    expect(contentOf(result)).toHaveLength(11);
  });

  it.each([0, 11])("rejects a count of %d", async (count) => {
    const result = await call("get-resource-links", { count });
    expect(result.isError).toBe(true);
  });
});

describe("get-resource-reference", () => {
  it("returns an embedded text resource by default", async () => {
    const result = await call("get-resource-reference");
    const content = contentOf(result);
    expect(textOf(content[0])).toBe(
      "Returning resource reference for Resource 1:",
    );
    const embedded = contentOfType(content[1], "resource").resource;
    expect(embedded).toMatchObject({
      uri: "demo://resource/dynamic/text/1",
      mimeType: "text/plain",
    });
    expect("text" in embedded && embedded.text).toMatch(
      /^Resource 1: This is a plaintext resource created at /,
    );
    expect(textOf(content[2])).toBe(
      "You can access this resource using the URI: demo://resource/dynamic/text/1",
    );
  });

  it("returns an embedded blob resource", async () => {
    const result = await call("get-resource-reference", {
      resourceType: "Blob",
      resourceId: 7,
    });
    const embedded = contentOfType(contentOf(result)[1], "resource").resource;
    expect(embedded.uri).toBe("demo://resource/dynamic/blob/7");
    expect(embedded.mimeType).toBe("application/octet-stream");
    const blob = "blob" in embedded ? embedded.blob : "";
    expect(Buffer.from(blob, "base64").toString()).toMatch(
      /^Resource 7: This is a base64 blob created at /,
    );
  });

  it("rejects an unknown resource type at input validation", async () => {
    const result = await call("get-resource-reference", {
      resourceType: "Audio",
    });
    expect(result.isError).toBe(true);
    expect(textOf(contentOf(result)[0])).toContain("Input validation error");
  });

  it.each([0, -1, 1.5])(
    "reports resource id %d as a tool error",
    async (resourceId) => {
      const result = await call("get-resource-reference", { resourceId });
      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid resourceId: ${resourceId}. Must be a finite positive integer.`,
          },
        ],
      });
    },
  );
});

describe("an unknown tool", () => {
  it("is rejected with -32602", async () => {
    await expect(call("no-such-tool")).rejects.toMatchObject({
      code: -32602,
      message: "Tool no-such-tool not found",
    });
  });
});
