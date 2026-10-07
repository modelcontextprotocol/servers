/**
 * Characterizes the everything server's experimental task tools (#4854):
 *
 * - `simulate-research-query`, a server-side task (`taskSupport: required`)
 *   that a client drives with `tools/call` + `task`, `tasks/get` and
 *   `tasks/result`, including the `input_required` elicitation it sends for an
 *   ambiguous topic and what happens when the client cancels it.
 * - `trigger-sampling-request-async` and `trigger-elicitation-request-async`,
 *   which send the client a task-augmented request and then poll the client's
 *   `tasks/get` until it is done. The test client declares the task request
 *   capabilities and keeps its tasks in an `InMemoryTaskStore`.
 *
 * Every wait in these tools is a `setTimeout` (one-second stages and polls),
 * so the tests fake `setTimeout` and advance the clock.
 *
 * SDK v2 removed the experimental tasks layer these tools and tests were
 * built on (SEP-2663), so the three tools are gone and every test here is
 * skipped until Part 5 (#4852) re-implements them on the
 * `io.modelcontextprotocol/tasks` extension. The tests are kept, not deleted,
 * as the record of the behavior Part 5 restores. The v1 client surface they
 * drive (`client.experimental.tasks`, `InMemoryTaskStore`, task-returning
 * request handlers) is typed by the stand-ins below so the bodies still
 * compile; calling any of them throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CallToolResult,
  Client,
  ElicitRequest,
  ElicitResult,
  GetTaskResult,
} from "@modelcontextprotocol/client";
import { CallToolResultSchema } from "@modelcontextprotocol/core";
import { connect, contentOf, textOf, type Session } from "./harness.js";

/** A task, as the v1 tasks API reported it. */
type Task = GetTaskResult;

/** One message of v1's `callToolStream`. */
type TaskStreamMessage =
  | { type: "taskCreated"; task: Task }
  | { type: "taskStatus"; task: Task }
  | { type: "result"; result: CallToolResult }
  | { type: "error"; error: Error };

const REMOVED =
  "SDK v2 removed the experimental tasks API (SEP-2663); see #4852";

/** Stand-in for v1's `client.experimental.tasks`. */
function experimentalTasks(_client: Client): {
  callToolStream: (
    params: { name: string; arguments: Record<string, unknown> },
    resultSchema: unknown,
  ) => AsyncGenerator<TaskStreamMessage, void, unknown>;
  listTasks: () => Promise<{ tasks: Task[] }>;
  cancelTask: (taskId: string) => Promise<Task>;
  getTask: (taskId: string) => Promise<Task>;
} {
  throw new Error(REMOVED);
}

/** Stand-in for v1's client-side `InMemoryTaskStore`. */
class InMemoryTaskStore {
  constructor() {
    throw new Error(REMOVED);
  }
  createTask(
    _params: { ttl?: number },
    _requestId: number,
    _request: unknown,
  ): Promise<Task> {
    throw new Error(REMOVED);
  }
  getTask(_taskId: string): Promise<Task | null> {
    throw new Error(REMOVED);
  }
  storeTaskResult(
    _taskId: string,
    _status: "completed" | "failed",
    _result: Record<string, unknown>,
  ): Promise<void> {
    throw new Error(REMOVED);
  }
  updateTaskStatus(
    _taskId: string,
    _status: Task["status"],
    _statusMessage?: string,
  ): Promise<void> {
    throw new Error(REMOVED);
  }
}

/**
 * Stand-in for a v1 client request handler that answers a task-augmented
 * request with a `CreateTaskResult`, which v2's typed handlers do not allow.
 */
function setTaskRequestHandler<
  M extends "sampling/createMessage" | "elicitation/create",
>(
  _client: Client,
  _method: M,
  _handler: (request: {
    params: { task?: { ttl?: number } };
  }) => Promise<{ task: Task }>,
): void {
  throw new Error(REMOVED);
}

let session: Session | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await session?.close();
  session = undefined;
});

/** Advance the fake clock until `promise` settles (or `limitMs` passes). */
async function settle<T>(promise: Promise<T>, limitMs = 30_000): Promise<T> {
  let settled = false;
  const tracked = promise.finally(() => {
    settled = true;
  });
  tracked.catch(() => {}); // observed below
  for (let t = 0; t < limitMs && !settled; t += 100) {
    await vi.advanceTimersByTimeAsync(100);
  }
  if (!settled) throw new Error(`did not settle within ${limitMs} ms`);
  return tracked;
}

/** Collect every message of an async iterable. */
async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const message of stream) out.push(message);
  return out;
}

describe("simulate-research-query", () => {
  /** Run the tool as a task to completion and return the stream's messages. */
  async function research(args: Record<string, unknown>) {
    const s = session!;
    await s.client.listTools(); // lets callToolStream see taskSupport
    return settle(
      collect(
        experimentalTasks(s.client).callToolStream(
          { name: "simulate-research-query", arguments: args },
          CallToolResultSchema,
        ),
      ),
    );
  }

  function statusMessages(messages: Awaited<ReturnType<typeof research>>) {
    return messages
      .filter((m) => m.type === "taskStatus")
      .map((m) => (m.type === "taskStatus" ? m.task.statusMessage : ""));
  }

  function report(messages: Awaited<ReturnType<typeof research>>): string {
    const last = messages.at(-1);
    if (last?.type !== "result") throw new Error(`no result: ${last?.type}`);
    return textOf(contentOf(last.result)[0]);
  }

  it.skip("creates a task that works through four stages and completes with a report", async () => {
    session = await connect();
    const messages = await research({ topic: "tides" });

    expect(messages[0]).toMatchObject({
      type: "taskCreated",
      task: { status: "working", ttl: 300000, pollInterval: 1000 },
    });
    expect(statusMessages(messages)).toEqual([
      "Gathering sources...",
      "Analyzing content...",
      "Synthesizing findings...",
      "Generating report...",
      // The completed task keeps the last stage's status message.
      "Generating report...",
    ]);
    expect(report(messages)).toMatchInlineSnapshot(`
      "# Research Report: tides

      ## Research Parameters
      - **Topic**: tides


      ## Synthesis
      This research query was processed through 4 stages:
      - Stage 1: Gathering sources ✓
      - Stage 2: Analyzing content ✓
      - Stage 3: Synthesizing findings ✓
      - Stage 4: Generating report ✓

      ---

      ## About This Demo (SEP-1686: Tasks)

      This tool demonstrates MCP's task-based execution pattern for long-running operations:

      **Task Lifecycle Demonstrated:**
      1. \`tools/call\` with \`task\` parameter → Server returns \`CreateTaskResult\` (not the final result)
      2. Client polls \`tasks/get\` → Server returns current status and \`statusMessage\`
      3. Status progressed: \`working\` → \`completed\`
      4. Client calls \`tasks/result\` → Server returns this final result


      **Key Concepts:**
      - Tasks enable "call now, fetch later" patterns
      - \`statusMessage\` provides human-readable progress updates
      - Tasks have TTL (time-to-live) for automatic cleanup
      - \`pollInterval\` suggests how often to check status
      - Elicitation requests use \`relatedTask\` to queue via tasks/result (works on all transports)

      *This is a simulated research report from the Everything MCP Server.*
      "
    `);
  });

  it.skip("is rejected as a tool error when called without a task", async () => {
    session = await connect();
    const result = await session.client.callTool({
      name: "simulate-research-query",
      arguments: { topic: "x" },
    });
    expect(result).toEqual({
      isError: true,
      content: [
        {
          type: "text",
          text: "MCP error -32601: Tool simulate-research-query requires task augmentation (taskSupport: 'required')",
        },
      ],
    });
  });

  it.skip("ignores 'ambiguous' for a client without elicitation", async () => {
    session = await connect();
    const messages = await research({ topic: "python", ambiguous: true });
    expect(statusMessages(messages)).not.toContain(
      expect.stringContaining("Requesting clarification"),
    );
    expect(report(messages)).toMatch(/^# Research Report: python\n/);
  });

  describe("with an ambiguous topic and an elicitation-capable client", () => {
    async function connectAnswering(
      answer: (req: ElicitRequest) => ElicitResult,
    ) {
      const asked: ElicitRequest["params"][] = [];
      session = await connect({
        capabilities: { elicitation: { form: {} } },
        setup: (client) =>
          client.setRequestHandler("elicitation/create", async (req) => {
            asked.push(req.params);
            return answer(req);
          }),
      });
      return asked;
    }

    it.skip("asks for a clarification through tasks/result, then completes with it", async () => {
      const asked = await connectAnswering(() => ({
        action: "accept",
        content: { interpretation: "programming" },
      }));
      const messages = await research({ topic: "Python", ambiguous: true });

      expect(asked).toHaveLength(1);
      expect(asked[0]).toMatchObject({
        message:
          'The research query "Python" could have multiple interpretations. Please clarify what you\'re looking for:',
        requestedSchema: {
          type: "object",
          properties: {
            interpretation: {
              type: "string",
              title: "Clarification",
              description: "Which interpretation of the topic do you mean?",
              oneOf: [
                { const: "programming", title: "Python programming language" },
                { const: "snake", title: "Python snake species" },
                { const: "comedy", title: "Monty Python comedy group" },
              ],
            },
          },
          required: ["interpretation"],
        },
      });
      expect(statusMessages(messages)).toContain(
        'Found multiple interpretations for "Python". Requesting clarification...',
      );
      const text = report(messages);
      expect(text).toMatch(/^# Research Report: Python \(programming\)\n/);
      expect(text).toContain("- **Clarification**: programming");
      expect(text).toContain(
        'After receiving clarification ("programming"), the task resumed processing and completed.',
      );
    });

    it.skip("offers generic interpretations for other topics", async () => {
      const asked = await connectAnswering(() => ({ action: "decline" }));
      await research({ topic: "Mercury", ambiguous: true });
      const params = asked[0];
      if (!("requestedSchema" in params)) throw new Error("expected form mode");
      expect(params.requestedSchema.properties.interpretation).toHaveProperty(
        "oneOf",
        [
          { const: "technical", title: "Technical/scientific perspective" },
          { const: "historical", title: "Historical perspective" },
          { const: "current", title: "Current events/news perspective" },
        ],
      );
    });

    it.skip.each([
      [{ action: "decline" }, "User declined - using default interpretation"],
      [{ action: "cancel" }, "User cancelled - using default interpretation"],
      [{ action: "accept", content: {} }, "User accepted without selection"],
      // An accept with no content is treated as a cancel.
      [{ action: "accept" }, "User cancelled - using default interpretation"],
    ] as [ElicitResult, string][])(
      "records %j as %j",
      async (answer, clarification) => {
        await connectAnswering(() => answer);
        const messages = await research({ topic: "tides", ambiguous: true });
        expect(report(messages)).toContain(
          `- **Clarification**: ${clarification}`,
        );
      },
    );

    it.skip("falls back to a default interpretation when the elicitation fails", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      await connectAnswering(() => {
        throw new Error("no UI");
      });
      const messages = await research({ topic: "tides", ambiguous: true });
      const text = report(messages);
      expect(text).toContain(
        "- **Clarification**: technical (default - elicitation unavailable)",
      );
      expect(text).toContain(
        "**Note:** Elicitation failed and a default interpretation was used.",
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/^Elicitation failed for task /),
        expect.stringContaining("no UI"),
      );
    });
  });

  it.skip("lists its task, and stops working on it once the client cancels it", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    session = await connect();
    const { client } = session;
    await client.listTools();
    const stream = experimentalTasks(client).callToolStream(
      { name: "simulate-research-query", arguments: { topic: "tides" } },
      CallToolResultSchema,
    );
    const first = await stream.next();
    if (first.done || first.value.type !== "taskCreated") {
      throw new Error("expected taskCreated");
    }
    const { taskId } = first.value.task;
    await stream.return(undefined);

    const { tasks } = await experimentalTasks(client).listTasks();
    expect(tasks.map((t) => t.taskId)).toContain(taskId);

    await experimentalTasks(client).cancelTask(taskId);
    // The next stage's status update fails on the cancelled task; the
    // failure is logged, marking it failed fails too, and it stays cancelled.
    await vi.advanceTimersByTimeAsync(5000);
    expect(errors).toHaveBeenCalledWith(
      `Research task ${taskId} failed:`,
      expect.any(Error),
    );
    expect(await experimentalTasks(client).getTask(taskId)).toMatchObject({
      status: "cancelled",
      statusMessage: "Client cancelled task execution.",
    });
  });
});

/**
 * A client that declares sampling and elicitation, with task support for
 * both, and keeps the tasks it creates in its own store.
 */
async function connectTaskClient(
  onRequest: (
    method: "sampling" | "elicitation",
    taskId: string | undefined,
  ) => void,
  extraTtl = 0,
) {
  const taskStore = new InMemoryTaskStore();
  let requestNumber = 0;
  const createTask = async (
    method: "sampling" | "elicitation",
    request: Parameters<InMemoryTaskStore["createTask"]>[2],
    ttl: number | undefined,
  ) => {
    const task = await taskStore.createTask(
      { ttl: ttl === undefined ? undefined : ttl + extraTtl },
      ++requestNumber,
      request,
    );
    onRequest(method, task.taskId);
    return { task };
  };
  session = await connect({
    capabilities: {
      sampling: {},
      elicitation: { form: {} },
      tasks: {
        list: {},
        cancel: {},
        requests: {
          sampling: { createMessage: {} },
          elicitation: { create: {} },
        },
      },
    },
    setup: (client) => {
      setTaskRequestHandler(client, "sampling/createMessage", async (req) =>
        createTask("sampling", req, req.params.task?.ttl),
      );
      setTaskRequestHandler(client, "elicitation/create", async (req) =>
        createTask("elicitation", req, req.params.task?.ttl),
      );
    },
  });
  return { client: session.client, taskStore };
}

async function callAsync(name: string, args: Record<string, unknown> = {}) {
  const result = await settle(
    session!.client.callTool(
      { name, arguments: args },
      {
        timeout: 3_600_000,
      },
    ),
    700_000,
  );
  return contentOf(result).map(textOf);
}

/** Run `fn` half a second from now, before the server's first one-second poll. */
function later(fn: () => Promise<unknown>): void {
  setTimeout(() => void fn(), 500);
}

const SAMPLE = {
  role: "assistant" as const,
  content: { type: "text" as const, text: "sampled" },
  model: "test-model",
};

describe("trigger-sampling-request-async", () => {
  it.skip("sends a task-augmented sampling request, polls the client's task, and returns its result", async () => {
    let created = "";
    const { taskStore } = await connectTaskClient((_method, taskId) => {
      created = taskId!;
      // Finish the client-side task before the server's first poll.
      later(() => taskStore.storeTaskResult(taskId!, "completed", SAMPLE));
    });
    const [text] = await callAsync("trigger-sampling-request-async", {
      prompt: "hello",
      maxTokens: 5,
    });
    const task = await taskStore.getTask(created);
    expect(task?.ttl).toBe(300000);
    expect(text).toBe(
      `[COMPLETED] Async sampling completed!\n\n**Progress:**\nTask created: ${created}\nPoll 1: completed\n\n**Result:**\n${JSON.stringify(
        {
          ...SAMPLE,
          _meta: {
            "io.modelcontextprotocol/related-task": { taskId: created },
          },
        },
        null,
        2,
      )}`,
    );
  });

  it.skip("reports a failed client task with its status message", async () => {
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      later(() =>
        taskStore.updateTaskStatus(taskId!, "failed", "model overloaded"),
      );
    });
    const [text] = await callAsync("trigger-sampling-request-async", {
      prompt: "p",
    });
    expect(text).toMatch(
      /^\[FAILED\] model overloaded\n\nProgress:\nTask created: \S+\nPoll 1: failed - model overloaded$/,
    );
  });

  it.skip("reports the status message of a client task that is already finished when it is created", async () => {
    // A task that fails before it is returned is never polled, so its status
    // message comes from the CreateTaskResult.
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      void taskStore.updateTaskStatus(taskId!, "failed", "instant failure");
    });
    const [text] = await callAsync("trigger-sampling-request-async", {
      prompt: "p",
    });
    expect(text).toMatch(
      /^\[FAILED\] instant failure\n\nProgress:\nTask created: \S+$/,
    );
  });

  it.skip("reports a cancelled client task with no message", async () => {
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      later(() => taskStore.updateTaskStatus(taskId!, "cancelled"));
    });
    const [text] = await callAsync("trigger-sampling-request-async", {
      prompt: "p",
    });
    expect(text).toMatch(/^\[CANCELLED\] No message\n\nProgress:\n/);
  });

  it.skip("gives up after 60 polls of a task that never finishes", async () => {
    await connectTaskClient(() => {});
    const [text] = await callAsync("trigger-sampling-request-async", {
      prompt: "p",
    });
    expect(text).toMatch(
      /^\[TIMEOUT\] Task timed out after 60 poll attempts\n\nProgress:\nTask created: \S+\nPoll 1: working\n/,
    );
    expect(text.split("\n").filter((l) => l.startsWith("Poll "))).toHaveLength(
      60,
    );
  });

  it.skip("returns a synchronous answer from a client that ignores the task request", async () => {
    session = await connect({
      capabilities: {
        sampling: {},
        tasks: { requests: { sampling: { createMessage: {} } } },
      },
      setup: (client) => {
        // A client that answers outside the SDK's sampling handler, which
        // would insist on a CreateTaskResult for a task-augmented request.
        client.fallbackRequestHandler = async () => SAMPLE;
      },
    });
    const [text] = await callAsync("trigger-sampling-request-async", {
      prompt: "p",
    });
    expect(text).toBe(
      `[SYNC] Client executed synchronously:\n${JSON.stringify(SAMPLE, null, 2)}`,
    );
  });
});

describe("trigger-elicitation-request-async", () => {
  it.skip("sends a task-augmented elicitation and summarizes the accepted answer", async () => {
    const asked: string[] = [];
    const { taskStore } = await connectTaskClient((method, taskId) => {
      asked.push(method);
      later(() =>
        taskStore.storeTaskResult(taskId!, "completed", {
          action: "accept",
          content: { name: "Ada", favoriteColor: "Blue", agreeToTerms: true },
        }),
      );
    });
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(asked).toEqual(["elicitation"]);
    expect(texts[0]).toBe(
      "[COMPLETED] User provided the requested information!",
    );
    expect(texts[1]).toBe(
      "User inputs:\n- Name: Ada\n- Favorite Color: Blue\n- Agreed to terms: true",
    );
    expect(texts[2]).toMatch(
      /^\nProgress:\nTask created: \S+\nPoll 1: completed\n\nRaw result: \{/,
    );
  });

  it.skip("summarizes an accepted answer with no fields", async () => {
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      later(() =>
        taskStore.storeTaskResult(taskId!, "completed", {
          action: "accept",
          content: {},
        }),
      );
    });
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(texts.slice(0, 2)).toEqual([
      "[COMPLETED] User provided the requested information!",
      "User inputs:\n",
    ]);
  });

  it.skip.each([
    [
      "decline",
      "[DECLINED] User declined to provide the requested information.",
    ],
    ["cancel", "[CANCELLED] User cancelled the elicitation dialog."],
  ])("reports a %s", async (action, expected) => {
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      later(() => taskStore.storeTaskResult(taskId!, "completed", { action }));
    });
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(texts[0]).toBe(expected);
  });

  it.skip("reports only progress and the raw result for an answer of another shape", async () => {
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      later(() =>
        taskStore.storeTaskResult(taskId!, "completed", { action: "accept" }),
      );
    });
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(/^\nProgress:\n/);
  });

  it.skip("logs the first poll, every tenth, and every status change while input is required", async () => {
    let taskId = "";
    const { taskStore } = await connectTaskClient((_m, id) => {
      taskId = id!;
      later(() => taskStore.updateTaskStatus(id!, "input_required", "waiting"));
    });
    const call = callAsync("trigger-elicitation-request-async");
    // Let 21 polls happen while input is required, then finish.
    await vi.advanceTimersByTimeAsync(21_500);
    await taskStore.storeTaskResult(taskId, "completed", { action: "decline" });
    const texts = await call;
    const polls = texts[1].split("\n").filter((l) => l.startsWith("Poll "));
    expect(polls.slice(0, 3)).toEqual([
      "Poll 1: input_required - waiting",
      "Poll 10: input_required - waiting",
      "Poll 20: input_required - waiting",
    ]);
    // The completed status keeps the earlier message.
    expect(polls.at(-1)).toMatch(/^Poll 2\d: completed - waiting$/);
    expect(polls).toHaveLength(4);
  });

  it.skip("reports the status message of a client task that is already finished when it is created", async () => {
    // A task that fails before it is returned is never polled, so its status
    // message comes from the CreateTaskResult.
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      void taskStore.updateTaskStatus(taskId!, "failed", "instant failure");
    });
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(texts).toEqual([
      expect.stringMatching(
        /^\[FAILED\] instant failure\n\nProgress:\nTask created: \S+$/,
      ),
    ]);
  });

  it.skip("reports a failed client task", async () => {
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      later(() => taskStore.updateTaskStatus(taskId!, "failed"));
    });
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(texts[0]).toMatch(/^\[FAILED\] No message\n\nProgress:\n/);
  });

  /** Also fake `performance`, which the tool's polling deadline is measured with. */
  function fakeClock() {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance"],
    });
  }

  it.skip("gives up 5 seconds before the 10-minute TTL of a task that never finishes", async () => {
    fakeClock();
    // A client that keeps its task longer than the 10-minute TTL asked for.
    await connectTaskClient(() => {}, 60_000);
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(texts[0]).toMatch(
      /^\[TIMEOUT\] Task timed out after 595 poll attempts, before its 10-minute TTL expired\n\nProgress:\n/,
    );
  });

  it.skip("times out before a client that honors the 10-minute TTL expires the task", async () => {
    fakeClock();
    let created = "";
    const { taskStore } = await connectTaskClient((_m, taskId) => {
      created = taskId!;
    });
    const texts = await callAsync("trigger-elicitation-request-async");
    // The last poll reached the task while the client still held it.
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatch(
      /^\[TIMEOUT\] Task timed out after 595 poll attempts, before its 10-minute TTL expired\n\nProgress:\nTask created: \S+\nPoll 1: working\n/,
    );
    expect(texts[0]).toMatch(/\nPoll 595: working$/);
    // The client still holds the task when the tool gives up, 5 s before the
    // 600000 ms TTL it asked for runs out.
    expect((await taskStore.getTask(created))?.ttl).toBe(600000);
  });

  it.skip("times out without polling when its wait ends past the deadline", async () => {
    // A timer that fires late: the first reading sets the deadline, and every
    // later one is already past it.
    let readings = 0;
    vi.spyOn(performance, "now").mockImplementation(() =>
      readings++ === 0 ? 0 : 600_000,
    );
    await connectTaskClient(() => {});
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(texts).toEqual([
      expect.stringMatching(
        /^\[TIMEOUT\] Task timed out after 0 poll attempts, before its 10-minute TTL expired\n\nProgress:\nTask created: \S+$/,
      ),
    ]);
  });

  it.skip("returns a synchronous answer from a client that ignores the task request", async () => {
    session = await connect({
      capabilities: {
        elicitation: {},
        tasks: { requests: { elicitation: { create: {} } } },
      },
      setup: (client) => {
        client.fallbackRequestHandler = async () => ({ action: "cancel" });
      },
    });
    const texts = await callAsync("trigger-elicitation-request-async");
    expect(texts).toEqual([
      `[SYNC] Client executed synchronously:\n${JSON.stringify(
        { action: "cancel" },
        null,
        2,
      )}`,
    ]);
  });
});
