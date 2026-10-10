/**
 * Characterizes the everything server's prompts and argument completions
 * through the protocol (#4854): `prompts/get` for each prompt, and
 * `completion/complete` for prompt arguments and for the resource templates'
 * `{resourceId}` variable.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connect, textOf, type Session } from "./harness.js";

let session: Session;

beforeEach(async () => {
  session = await connect();
});

afterEach(async () => {
  await session.close();
});

describe("simple-prompt", () => {
  it("returns its fixed message", async () => {
    const result = await session.client.getPrompt({ name: "simple-prompt" });
    expect(result).toEqual({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "This is a simple prompt without arguments.",
          },
        },
      ],
    });
  });
});

describe("args-prompt", () => {
  it("uses the city alone when no state is given", async () => {
    const result = await session.client.getPrompt({
      name: "args-prompt",
      arguments: { city: "San Francisco" },
    });
    expect(textOf(result.messages[0].content)).toBe(
      "What's weather in San Francisco?",
    );
  });

  it("appends the state when given", async () => {
    const result = await session.client.getPrompt({
      name: "args-prompt",
      arguments: { city: "Austin", state: "Texas" },
    });
    expect(textOf(result.messages[0].content)).toBe(
      "What's weather in Austin, Texas?",
    );
  });

  it("rejects a missing required argument", async () => {
    await expect(
      session.client.getPrompt({ name: "args-prompt", arguments: {} }),
    ).rejects.toThrow(/Invalid arguments for prompt args-prompt/);
  });
});

describe("completable-prompt", () => {
  it("builds the promotion message from both arguments", async () => {
    const result = await session.client.getPrompt({
      name: "completable-prompt",
      arguments: { department: "Engineering", name: "Alice" },
    });
    expect(textOf(result.messages[0].content)).toBe(
      "Please promote Alice to the head of the Engineering team.",
    );
  });
});

describe("resource-prompt", () => {
  it("embeds a text resource", async () => {
    const result = await session.client.getPrompt({
      name: "resource-prompt",
      arguments: { resourceType: "Text", resourceId: "1" },
    });
    expect(textOf(result.messages[0].content)).toBe(
      "This prompt includes the Text resource with id: 1. Please analyze the following resource:",
    );
    expect(result.messages[1]).toMatchObject({
      role: "user",
      content: {
        type: "resource",
        resource: {
          uri: "demo://resource/dynamic/text/1",
          mimeType: "text/plain",
          text: expect.stringMatching(/^Resource 1: This is a plaintext/),
        },
      },
    });
  });

  it("embeds a blob resource", async () => {
    const result = await session.client.getPrompt({
      name: "resource-prompt",
      arguments: { resourceType: "Blob", resourceId: "2" },
    });
    expect(result.messages[1]).toMatchObject({
      content: {
        type: "resource",
        resource: {
          uri: "demo://resource/dynamic/blob/2",
          mimeType: "application/octet-stream",
          blob: expect.any(String),
        },
      },
    });
  });

  it("rejects an unknown resource type", async () => {
    await expect(
      session.client.getPrompt({
        name: "resource-prompt",
        arguments: { resourceType: "Video", resourceId: "1" },
      }),
    ).rejects.toThrow("Invalid resourceType: Video. Must be Text or Blob.");
  });

  it.each(["0", "-3", "1.5", "abc"])(
    "rejects resource id %s",
    async (resourceId) => {
      await expect(
        session.client.getPrompt({
          name: "resource-prompt",
          arguments: { resourceType: "Text", resourceId },
        }),
      ).rejects.toThrow(
        `Invalid resourceId: ${resourceId}. Must be a finite positive integer.`,
      );
    },
  );
});

describe("an unknown prompt", () => {
  it("is a protocol error", async () => {
    await expect(
      session.client.getPrompt({ name: "no-such-prompt" }),
    ).rejects.toThrow("Prompt no-such-prompt not found");
  });
});

/** Complete one argument of a prompt. */
async function completePrompt(
  name: string,
  argument: string,
  value: string,
  context?: Record<string, string>,
) {
  const { completion } = await session.client.complete({
    ref: { type: "ref/prompt", name },
    argument: { name: argument, value },
    ...(context ? { context: { arguments: context } } : {}),
  });
  return completion.values;
}

describe("completion/complete for prompts", () => {
  it.each([
    ["", ["Engineering", "Sales", "Marketing", "Support"]],
    ["S", ["Sales", "Support"]],
    ["X", []],
  ])("completes department %j", async (value, expected) => {
    expect(
      await completePrompt("completable-prompt", "department", value),
    ).toEqual(expected);
  });

  it.each([
    ["Engineering", "", ["Alice", "Bob", "Charlie"]],
    ["Sales", "", ["David", "Eve", "Frank"]],
    ["Marketing", "I", ["Iris"]],
    ["Support", "K", ["Kim"]],
  ])(
    "completes a %s team member from %j",
    async (department, value, expected) => {
      expect(
        await completePrompt("completable-prompt", "name", value, {
          department,
        }),
      ).toEqual(expected);
    },
  );

  it("offers no team members without a known department", async () => {
    expect(await completePrompt("completable-prompt", "name", "")).toEqual([]);
    expect(
      await completePrompt("completable-prompt", "name", "", {
        department: "Legal",
      }),
    ).toEqual([]);
  });

  it.each([
    ["", ["Text", "Blob"]],
    ["T", ["Text"]],
    ["x", []],
  ])("completes resource-prompt's resourceType %j", async (value, expected) => {
    expect(
      await completePrompt("resource-prompt", "resourceType", value),
    ).toEqual(expected);
  });

  it.each([
    ["5", ["5"]],
    ["0", []],
    ["abc", []],
  ])("completes resource-prompt's resourceId %j", async (value, expected) => {
    expect(
      await completePrompt("resource-prompt", "resourceId", value),
    ).toEqual(expected);
  });

  it("offers nothing for an argument without a completer", async () => {
    expect(await completePrompt("args-prompt", "city", "S")).toEqual([]);
  });
});

describe("completion/complete for resource templates", () => {
  it.each([
    ["demo://resource/dynamic/text/{resourceId}", "3", ["3"]],
    ["demo://resource/dynamic/blob/{resourceId}", "12", ["12"]],
    ["demo://resource/dynamic/text/{resourceId}", "-1", []],
    ["demo://resource/dynamic/blob/{resourceId}", "x", []],
  ])("completes %s from %j", async (uri, value, expected) => {
    const { completion } = await session.client.complete({
      ref: { type: "ref/resource", uri },
      argument: { name: "resourceId", value },
    });
    expect(completion.values).toEqual(expected);
  });
});
