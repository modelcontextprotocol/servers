/**
 * The everything server's task tools on the Tasks extension
 * (`io.modelcontextprotocol/tasks`, SEP-2663), on protocol version 2026-07-28
 * (#4852): `simulate-research-query`, `trigger-sampling-request-async` and
 * `trigger-elicitation-request-async`, and the extension's `tasks/get`,
 * `tasks/update` and `tasks/cancel`.
 *
 * A task tool answers `tools/call` with a task handle (`resultType: "task"`),
 * which the SDK `Client` refuses, since it has no tasks support of its own
 * (the extension's client lives in `@modelcontextprotocol/ext-tasks`). So
 * these tests speak raw JSON-RPC to the server, served by `serveStdio` over an
 * in-memory pair the way the stdio transport serves it, with the 2026-07-28
 * envelope on each request. A task's progress follows the clock, so the tests
 * fake `Date` and move it.
 *
 * These replace the Part 1 (#4854) tests of the same tools on the 2025-11-25
 * experimental tasks layer, which SDK v2 removed. Two behaviors those tests
 * pinned are gone with the 2025 era rather than ported: the async tools
 * sending the *client* a task-augmented request and polling the client's
 * tasks (2026-07-28 has no server-to-client requests, so the server's task
 * carries the request in its `input_required` status instead), and
 * `tasks/result` and `tasks/list`, which the extension does not define.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTasks,
  MAX_ANSWER_BYTES,
  MAX_TASKS,
  TASKS_EXTENSION,
} from "../server/tasks.js";
import { STAGE_DURATION, STAGES } from "../tools/simulate-research-query.js";
import { connectRaw as rawClient, type RawSession } from "./harness.js";

type Json = Record<string, unknown>;
type Peer = RawSession;

const TASKS = { extensions: { [TASKS_EXTENSION]: {} } };
const WITH_ELICITATION = { ...TASKS, elicitation: { form: {} } };

let peer: Peer;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-11T12:00:00Z"));
});

afterEach(async () => {
  await peer?.close();
  clearTasks();
  vi.useRealTimers();
});

/** Move the clock on by `ms`. */
function advance(ms: number) {
  vi.setSystemTime(Date.now() + ms);
}

/** The text of a completed task's result. */
function resultText(task: Json): string {
  const result = task.result as { content: { text: string }[] };
  return result.content.map((block) => block.text).join("\n");
}

describe("the extension", () => {
  it("is advertised in server/discover", async () => {
    peer = await rawClient(TASKS);
    const discover = await peer.result("server/discover");
    expect(discover.capabilities).toMatchObject({
      extensions: { [TASKS_EXTENSION]: {} },
    });
  });

  it.each([
    ["tasks/get", {}],
    ["tasks/update", { inputResponses: {} }],
    ["tasks/cancel", {}],
  ])("refuses %s for an unknown task with -32602", async (method, extra) => {
    peer = await rawClient(TASKS);
    const response = await peer.request(method, { taskId: "nope", ...extra });
    expect(response.error).toMatchObject({
      code: -32602,
      message: expect.stringContaining("Unknown task: nope"),
    });
  });

  it.each([
    ["simulate-research-query", {}, { extensions: { [TASKS_EXTENSION]: {} } }],
    [
      "trigger-sampling-request-async",
      { sampling: {} },
      { extensions: { [TASKS_EXTENSION]: {} } },
    ],
    ["trigger-sampling-request-async", TASKS, { sampling: {} }],
    [
      "trigger-sampling-request-async",
      {},
      { extensions: { [TASKS_EXTENSION]: {} }, sampling: {} },
    ],
    [
      "trigger-elicitation-request-async",
      { elicitation: { form: {} } },
      { extensions: { [TASKS_EXTENSION]: {} } },
    ],
    ["trigger-elicitation-request-async", TASKS, { elicitation: { form: {} } }],
    [
      "trigger-elicitation-request-async",
      { ...TASKS, elicitation: { url: {} } },
      { elicitation: { form: {} } },
    ],
  ] as const)(
    "refuses %s from a client declaring %j with -32021 naming what is missing",
    async (tool, capabilities, requiredCapabilities) => {
      peer = await rawClient(capabilities);
      const response = await peer.request("tools/call", {
        name: tool,
        arguments:
          tool === "trigger-elicitation-request-async"
            ? {}
            : tool === "simulate-research-query"
              ? { topic: "t" }
              : { prompt: "p" },
      });
      expect(response.error).toMatchObject({
        code: -32021,
        data: { requiredCapabilities },
      });
    },
  );

  it.each([
    ["tasks/get", {}],
    ["tasks/update", { inputResponses: {} }],
    ["tasks/cancel", {}],
  ])(
    "refuses %s from a client without the extension with -32021",
    async (method, extra) => {
      peer = await rawClient(TASKS);
      const created = await peer.call("simulate-research-query", {
        topic: "t",
      });
      await peer.close();
      peer = await rawClient({});
      const response = await peer.request(method, {
        taskId: created.taskId,
        ...extra,
      });
      expect(response.error).toMatchObject({
        code: -32021,
        data: {
          requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } },
        },
      });
    },
  );

  it("refuses a new task at MAX_TASKS, keeping every live one until its TTL", async () => {
    peer = await rawClient(TASKS);
    const first = await peer.call("simulate-research-query", { topic: "t" });
    for (let i = 1; i < MAX_TASKS; i++) {
      await peer.call("simulate-research-query", { topic: "t" });
    }
    const refused = await peer.call("simulate-research-query", { topic: "t" });
    expect(refused).toMatchObject({
      isError: true,
      content: [
        {
          text: `The server is already running ${MAX_TASKS} tasks, its limit. Try again once one has expired.`,
        },
      ],
    });
    expect((await peer.get(first.taskId as string)).status).toBe("working");
    // Once the tasks expire, there is room again.
    advance(first.ttlMs as number);
    expect(
      (await peer.call("simulate-research-query", { topic: "t" })).resultType,
    ).toBe("task");
  });

  it("refuses a topic longer than it will keep", async () => {
    peer = await rawClient(TASKS);
    const result = await peer.call("simulate-research-query", {
      topic: "x".repeat(1001),
    });
    expect(result.isError).toBe(true);
  });

  it("refuses answers over MAX_ANSWER_BYTES with -32602, leaving the task waiting", async () => {
    peer = await rawClient({ ...TASKS, sampling: {} });
    const created = await peer.call("trigger-sampling-request-async", {
      prompt: "p",
    });
    const response = await peer.request("tasks/update", {
      taskId: created.taskId,
      inputResponses: {
        "sampling-1": {
          role: "assistant",
          model: "m",
          content: { type: "text", text: "x".repeat(MAX_ANSWER_BYTES) },
        },
      },
    });
    expect(response.error).toMatchObject({
      code: -32602,
      message: expect.stringContaining(
        `over the ${MAX_ANSWER_BYTES}-byte limit; the task is unchanged`,
      ),
    });
    const task = await peer.get(created.taskId as string);
    expect(task.status).toBe("input_required");
    expect(Object.keys(task.inputRequests as object)).toEqual(["sampling-1"]);
  });

  it("refuses tasks/update without inputResponses with -32602", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", { topic: "t" });
    const response = await peer.request("tasks/update", {
      taskId: created.taskId,
    });
    expect(response.error).toMatchObject({
      code: -32602,
      message: "Invalid params for tasks/update: inputResponses is required",
    });
  });

  it("drops a task once its TTL has passed", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", { topic: "t" });
    advance(created.ttlMs as number);
    const response = await peer.request("tasks/get", {
      taskId: created.taskId,
    });
    expect(response.error).toMatchObject({ code: -32602 });
  });
});

describe("simulate-research-query", () => {
  it("returns a task handle, then works through four stages and completes with a report", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", {
      topic: "MCP",
    });
    expect(created).toMatchObject({
      resultType: "task",
      status: "working",
      statusMessage: "Gathering sources...",
      ttlMs: 300000,
      pollIntervalMs: STAGE_DURATION,
    });
    expect(created.taskId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.createdAt).toBe("2026-10-11T12:00:00.000Z");

    const messages = [];
    for (let stage = 1; stage < STAGES.length; stage++) {
      advance(STAGE_DURATION);
      messages.push((await peer.get(created.taskId as string)).statusMessage);
    }
    expect(messages).toEqual([
      "Analyzing content...",
      "Synthesizing findings...",
      "Generating report...",
    ]);

    advance(STAGE_DURATION);
    const done = await peer.get(created.taskId as string);
    expect(done).toMatchObject({
      status: "completed",
      statusMessage: "Research complete",
      resultType: "complete",
      lastUpdatedAt: new Date(Date.now()).toISOString(),
    });
    expect(resultText(done)).toMatch(/^# Research Report: MCP\n/);
    expect(resultText(done)).toContain("Stage 4: Generating report ✓");
  });

  it("reports when each status began, not when a poll noticed it", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", { topic: "t" });
    const start = Date.now();
    // Polled long after it finished: the timestamp is the completion's.
    advance(STAGE_DURATION * STAGES.length * 3);
    const done = await peer.get(created.taskId as string);
    expect(done.status).toBe("completed");
    expect(done.lastUpdatedAt).toBe(
      new Date(start + STAGE_DURATION * STAGES.length).toISOString(),
    );
  });

  it("reports the moment of a cancellation as the last update", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", { topic: "t" });
    const taskId = created.taskId as string;
    advance(500);
    const cancelledAt = new Date(Date.now()).toISOString();
    await peer.result("tasks/cancel", { taskId });
    advance(STAGE_DURATION * 10);
    expect((await peer.get(taskId)).lastUpdatedAt).toBe(cancelledAt);
  });

  it("does not ask a client that supports only URL-mode elicitation", async () => {
    peer = await rawClient({ ...TASKS, elicitation: { url: {} } });
    const created = await peer.call("simulate-research-query", {
      topic: "t",
      ambiguous: true,
    });
    advance(STAGE_DURATION * STAGES.length);
    expect((await peer.get(created.taskId as string)).status).toBe("completed");
  });

  it("ignores 'ambiguous' for a client without elicitation", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", {
      topic: "t",
      ambiguous: true,
    });
    advance(STAGE_DURATION * STAGES.length);
    expect((await peer.get(created.taskId as string)).status).toBe("completed");
  });

  describe("with an ambiguous topic and an elicitation-capable client", () => {
    /** Start an ambiguous query and run it to its clarification request. */
    async function toClarification(topic: string) {
      peer = await rawClient(WITH_ELICITATION);
      const created = await peer.call("simulate-research-query", {
        topic,
        ambiguous: true,
      });
      const taskId = created.taskId as string;
      advance(STAGE_DURATION * 2);
      return { taskId, task: await peer.get(taskId) };
    }

    it("waits for a clarification with tasks/update, then completes with it", async () => {
      const { taskId, task } = await toClarification("python");
      expect(task).toMatchObject({
        status: "input_required",
        statusMessage:
          'Found multiple interpretations for "python". Requesting clarification...',
      });
      const request = (task.inputRequests as Json).clarification as Json;
      expect(request).toMatchObject({
        method: "elicitation/create",
        params: { mode: "form" },
      });
      const oneOf = (
        (request.params as Json).requestedSchema as {
          properties: { interpretation: { oneOf: unknown[] } };
        }
      ).properties.interpretation.oneOf;
      expect(oneOf).toEqual([
        { const: "programming", title: "Python programming language" },
        { const: "snake", title: "Python snake species" },
        { const: "comedy", title: "Monty Python comedy group" },
      ]);

      // Still waiting, however long it takes.
      advance(STAGE_DURATION * 10);
      expect((await peer.get(taskId)).status).toBe("input_required");

      expect(
        await peer.result("tasks/update", {
          taskId,
          inputResponses: {
            clarification: {
              action: "accept",
              content: { interpretation: "programming" },
            },
          },
        }),
      ).toMatchObject({ resultType: "complete" });
      expect(await peer.get(taskId)).toMatchObject({
        status: "working",
        statusMessage: 'Continuing with interpretation: "programming"...',
      });

      advance(STAGE_DURATION * 2);
      const done = await peer.get(taskId);
      expect(done.status).toBe("completed");
      expect(resultText(done)).toMatch(
        /^# Research Report: python \(programming\)\n/,
      );
      expect(resultText(done)).toContain("answered it with `tasks/update`");
    });

    it("offers generic interpretations for other topics", async () => {
      const { task } = await toClarification("climate");
      const request = (task.inputRequests as Json).clarification as {
        params: {
          requestedSchema: {
            properties: { interpretation: { oneOf: { const: string }[] } };
          };
        };
      };
      expect(
        request.params.requestedSchema.properties.interpretation.oneOf.map(
          (option) => option.const,
        ),
      ).toEqual(["technical", "historical", "current"]);
    });

    it.each([
      ["decline", "User declined - using default interpretation"],
      ["cancel", "User cancelled - using default interpretation"],
    ])(
      "continues with a default when the user chooses %s",
      async (action, clarification) => {
        const { taskId } = await toClarification("t");
        await peer.result("tasks/update", {
          taskId,
          inputResponses: { clarification: { action } },
        });
        advance(STAGE_DURATION * 2);
        expect(resultText(await peer.get(taskId))).toContain(
          `- **Clarification**: ${clarification}`,
        );
      },
    );

    it("continues with a default when the answer is not usable", async () => {
      const { taskId } = await toClarification("t");
      await peer.result("tasks/update", {
        taskId,
        inputResponses: { clarification: { action: "accept", content: {} } },
      });
      advance(STAGE_DURATION * 2);
      expect(resultText(await peer.get(taskId))).toContain(
        "No usable answer - using default interpretation",
      );
    });

    it("ignores an answer to a request it did not make, and keeps waiting", async () => {
      const { taskId } = await toClarification("t");
      expect(
        await peer.result("tasks/update", {
          taskId,
          inputResponses: { other: { action: "accept" } },
        }),
      ).toMatchObject({ resultType: "complete" });
      expect((await peer.get(taskId)).status).toBe("input_required");
    });

    it("uses only the outstanding answer from an update that also carries others", async () => {
      const { taskId } = await toClarification("python");
      await peer.result("tasks/update", {
        taskId,
        inputResponses: {
          other: { action: "decline" },
          clarification: {
            action: "accept",
            content: { interpretation: "snake" },
          },
        },
      });
      advance(STAGE_DURATION * 2);
      expect(resultText(await peer.get(taskId))).toMatch(
        /^# Research Report: python \(snake\)\n/,
      );
    });

    it("does not take an interpretation it did not offer", async () => {
      const { taskId } = await toClarification("python");
      await peer.result("tasks/update", {
        taskId,
        inputResponses: {
          clarification: {
            action: "accept",
            content: { interpretation: "astrology" },
          },
        },
      });
      advance(STAGE_DURATION * 2);
      expect(resultText(await peer.get(taskId))).toContain(
        "No usable answer - using default interpretation",
      );
    });
  });

  it("acknowledges and ignores tasks/update while the task is working", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", { topic: "t" });
    expect(
      await peer.result("tasks/update", {
        taskId: created.taskId,
        inputResponses: { clarification: { action: "accept" } },
      }),
    ).toMatchObject({ resultType: "complete" });
    expect((await peer.get(created.taskId as string)).status).toBe("working");
  });

  it("stays cancelled once the client cancels it, and acknowledges a second cancel", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", { topic: "t" });
    const taskId = created.taskId as string;
    expect(await peer.result("tasks/cancel", { taskId })).toMatchObject({
      resultType: "complete",
    });
    advance(STAGE_DURATION * STAGES.length);
    expect(await peer.get(taskId)).toMatchObject({
      status: "cancelled",
      statusMessage: "Cancelled by the client",
    });
    expect(await peer.result("tasks/cancel", { taskId })).toMatchObject({
      resultType: "complete",
    });
    expect((await peer.get(taskId)).status).toBe("cancelled");
  });

  it("acknowledges a cancel of a completed task, which stays completed", async () => {
    peer = await rawClient(TASKS);
    const created = await peer.call("simulate-research-query", { topic: "t" });
    const taskId = created.taskId as string;
    advance(STAGE_DURATION * STAGES.length);
    expect(await peer.result("tasks/cancel", { taskId })).toMatchObject({
      resultType: "complete",
    });
    expect((await peer.get(taskId)).status).toBe("completed");
  });
});

describe("trigger-sampling-request-async", () => {
  it("waits with a sampling request, then completes with the client's answer", async () => {
    peer = await rawClient({ ...TASKS, sampling: {} });
    const created = await peer.call("trigger-sampling-request-async", {
      prompt: "Say hi",
    });
    expect(created).toMatchObject({
      resultType: "task",
      status: "input_required",
      statusMessage: "Waiting for the client's LLM to respond",
      ttlMs: 600000,
      inputRequests: {
        "sampling-1": {
          method: "sampling/createMessage",
          params: {
            maxTokens: 100,
            systemPrompt: "You are a helpful test server.",
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: "Resource trigger-sampling-request-async context: Say hi",
                },
              },
            ],
          },
        },
      },
    });
    const taskId = created.taskId as string;
    await peer.result("tasks/update", {
      taskId,
      inputResponses: {
        "sampling-1": {
          role: "assistant",
          model: "test-model",
          content: { type: "text", text: "hi" },
        },
      },
    });
    const done = await peer.get(taskId);
    expect(done.status).toBe("completed");
    expect(resultText(done)).toMatch(/^LLM sampling result: \n/);
    expect(resultText(done)).toContain('"text": "hi"');
  });

  it("asks again, under a new key, after an answer of the wrong kind", async () => {
    peer = await rawClient({ ...TASKS, sampling: {} });
    const created = await peer.call("trigger-sampling-request-async", {
      prompt: "p",
    });
    await peer.result("tasks/update", {
      taskId: created.taskId,
      inputResponses: { "sampling-1": { action: "accept" } },
    });
    const again = await peer.get(created.taskId as string);
    expect(again.status).toBe("input_required");
    expect(Object.keys(again.inputRequests as object)).toEqual(["sampling-2"]);
  });
});

describe("trigger-elicitation-request-async", () => {
  async function answer(response: Json) {
    peer = await rawClient(WITH_ELICITATION);
    const created = await peer.call("trigger-elicitation-request-async");
    expect(created).toMatchObject({
      status: "input_required",
      statusMessage: "Waiting for the user's input",
      inputRequests: {
        "form-1": {
          method: "elicitation/create",
          params: { mode: "form", requestedSchema: { required: ["name"] } },
        },
      },
    });
    const taskId = created.taskId as string;
    await peer.result("tasks/update", {
      taskId,
      inputResponses: { "form-1": response },
    });
    return peer.get(taskId);
  }

  it("summarizes an accepted answer", async () => {
    const done = await answer({
      action: "accept",
      content: { name: "Ada", favoriteColor: "blue", agreeToTerms: true },
    });
    expect(done).toMatchObject({
      status: "completed",
      statusMessage: "Input received",
    });
    expect(resultText(done)).toBe(
      "Elicitation accept.\nName: Ada\nFavorite color: blue\nAgreed to terms: true",
    );
  });

  it("summarizes an accepted answer with only the required name", async () => {
    const done = await answer({ action: "accept", content: { name: "Ada" } });
    expect(resultText(done)).toBe("Elicitation accept.\nName: Ada");
  });

  it("reports when the answer arrived as the last update", async () => {
    peer = await rawClient(WITH_ELICITATION);
    const created = await peer.call("trigger-elicitation-request-async");
    advance(1500);
    const answeredAt = new Date(Date.now()).toISOString();
    await peer.result("tasks/update", {
      taskId: created.taskId,
      inputResponses: { "form-1": { action: "decline" } },
    });
    advance(60_000);
    expect((await peer.get(created.taskId as string)).lastUpdatedAt).toBe(
      answeredAt,
    );
  });

  it.each([
    ["no name", {}],
    ["a blank name", { name: "" }],
    ["a color that is not a choice", { name: "Ada", favoriteColor: "mauve" }],
  ])(
    "asks again, under a new key, after an accepted answer with %s",
    async (_label, content) => {
      peer = await rawClient(WITH_ELICITATION);
      const created = await peer.call("trigger-elicitation-request-async");
      await peer.result("tasks/update", {
        taskId: created.taskId,
        inputResponses: { "form-1": { action: "accept", content } },
      });
      const again = await peer.get(created.taskId as string);
      expect(again.status).toBe("input_required");
      expect(Object.keys(again.inputRequests as object)).toEqual(["form-2"]);
      // The spent key is no longer outstanding, so an answer to it is ignored.
      await peer.result("tasks/update", {
        taskId: created.taskId,
        inputResponses: { "form-1": { action: "decline" } },
      });
      expect((await peer.get(created.taskId as string)).status).toBe(
        "input_required",
      );
    },
  );

  it.each(["decline", "cancel"])("reports a %s", async (action) => {
    const done = await answer({ action });
    expect(resultText(done)).toBe(`Elicitation ${action}.`);
  });

  it("asks again, under a new key, after an answer of the wrong kind", async () => {
    peer = await rawClient(WITH_ELICITATION);
    const created = await peer.call("trigger-elicitation-request-async");
    await peer.result("tasks/update", {
      taskId: created.taskId,
      inputResponses: { "form-1": { roots: [] } },
    });
    const again = await peer.get(created.taskId as string);
    expect(Object.keys(again.inputRequests as object)).toEqual(["form-2"]);
  });
});
