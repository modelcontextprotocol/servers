// The server side of the Tasks extension (`io.modelcontextprotocol/tasks`,
// SEP-2663) on the 2026-07-28 revision (#4852).
//
// A tool that runs as a task answers `tools/call` with a task handle
// (`resultType: "task"`) instead of its result. The client then polls
// `tasks/get` for the task's status, answers an `input_required` status with
// `tasks/update`, and may stop the task with `tasks/cancel`; the final result
// arrives inside the `completed` status. The SDK has no server implementation
// of the extension (modelcontextprotocol/ext-tasks#30), so this module is one,
// for the everything server's three task tools.
//
// A task outlives the request that created it, and on the 2026-07-28 HTTP
// path every request is served by a fresh server instance, so tasks live in a
// process-wide store keyed by the task id. The id is a random UUID the server
// mints: it is the handle, and knowing it is what lets a client reach the
// task. Nothing runs in the background. A task's status is worked out from the
// clock when it is read, so there are no timers to stop; a task past its TTL
// is dropped the next time the store is touched.
//
// The extension is served on 2026-07-28 only. The 2025-11-25 revision had its
// own, different task methods in the core protocol; they are not served.

import { randomUUID } from "node:crypto";
import {
  CLIENT_CAPABILITIES_META_KEY,
  McpServer,
  MissingRequiredClientCapabilityError,
  ProtocolError,
  ProtocolErrorCode,
  type CallToolResult,
  type ClientCapabilities,
  type InputRequests,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";

/** The extension's identifier, as declared in `capabilities.extensions`. */
export const TASKS_EXTENSION = "io.modelcontextprotocol/tasks";

/** The status of a task. */
export type TaskStatus =
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * The client's answers to a task's input requests, by key, as the SDK hands
 * them to a handler.
 */
export type TaskInputResponses = NonNullable<
  ServerContext["mcpReq"]["inputResponses"]
>;

/** What a task kind decides about its task at one moment. */
export type TaskState = (
  | { status: "working"; statusMessage: string }
  | {
      status: "input_required";
      statusMessage: string;
      inputRequests: InputRequests;
    }
  | { status: "completed"; statusMessage?: string; result: CallToolResult }
) & {
  /**
   * When the task entered this state (epoch milliseconds), reported as its
   * `lastUpdatedAt`: the moment it changed, not the moment a poll noticed.
   */
  since: number;
};

/**
 * One kind of task: how its status follows from the clock, and what it does
 * with the client's answers to its input requests.
 */
export type TaskBehavior = {
  /** The task's state at `now` (epoch milliseconds). */
  stateAt: (now: number) => TaskState;
  /** Take the client's answers, sent with `tasks/update` at `now`. */
  receive: (responses: TaskInputResponses, now: number) => void;
};

/** A task in the store. */
type StoredTask = {
  taskId: string;
  createdAt: number;
  ttlMs: number;
  pollIntervalMs: number;
  behavior: TaskBehavior;
  /** When the client cancelled it; a cancelled task stays cancelled. */
  cancelledAt?: number;
};

/** Every live task, by id, across every server instance in the process. */
const tasks = new Map<string, StoredTask>();

/**
 * The most tasks the process keeps. A task holds its tool's arguments (each
 * task tool bounds their length) and the client's answers (bounded by the
 * transports' request size) until its TTL, so without a cap a burst of calls
 * could exhaust memory first. A live task is kept until its TTL, since the
 * extension lets a server discard one only after that, so at the cap a new
 * task is refused rather than an old one dropped.
 */
export const MAX_TASKS = 100;

/**
 * The most bytes of answers, serialized, one `tasks/update` may hand a task.
 * A task keeps its answers until its TTL, and a transport accepts messages
 * far larger than any of these tasks needs (10 MiB on stdio), so with
 * `MAX_TASKS` this bounds what the store holds.
 */
export const MAX_ANSWER_BYTES = 64 * 1024;

/** Drop every task past its TTL. */
function sweep(now: number): void {
  for (const [taskId, task] of tasks) {
    if (task.createdAt + task.ttlMs <= now) tasks.delete(taskId);
  }
}

/** The task with this id, or a -32602 error naming it as unknown. */
function find(taskId: string, now: number): StoredTask {
  sweep(now);
  const task = tasks.get(taskId);
  if (!task) {
    throw new ProtocolError(
      ProtocolErrorCode.InvalidParams,
      `Unknown task: ${taskId}`,
    );
  }
  return task;
}

/** The task's state now, honoring a cancellation. */
function stateOf(task: StoredTask, now: number): TaskState | CancelledState {
  return task.cancelledAt !== undefined
    ? {
        status: "cancelled",
        statusMessage: "Cancelled by the client",
        since: task.cancelledAt,
      }
    : task.behavior.stateAt(now);
}

type CancelledState = {
  status: "cancelled";
  statusMessage: string;
  since: number;
};

/** The wire form of a task (the `DetailedTask` of the extension's schema). */
function describe(task: StoredTask, now: number): Record<string, unknown> {
  const state = stateOf(task, now);
  return {
    taskId: task.taskId,
    status: state.status,
    ...(state.statusMessage !== undefined && {
      statusMessage: state.statusMessage,
    }),
    createdAt: new Date(task.createdAt).toISOString(),
    lastUpdatedAt: new Date(
      Math.max(task.createdAt, state.since),
    ).toISOString(),
    ttlMs: task.ttlMs,
    pollIntervalMs: task.pollIntervalMs,
    ...(state.status === "input_required" && {
      inputRequests: state.inputRequests,
    }),
    ...(state.status === "completed" && { result: state.result }),
  };
}

/**
 * Store a new task and return the `tools/call` result that hands its handle
 * to the client: the task's fields, with `resultType: "task"`.
 *
 * @param behavior - How the task progresses.
 * @param options - Its time-to-live and the polling interval to suggest.
 */
export function createTask(
  behavior: TaskBehavior,
  options: { ttlMs: number; pollIntervalMs: number },
): CallToolResult {
  const now = Date.now();
  sweep(now);
  if (tasks.size >= MAX_TASKS) {
    return {
      content: [
        {
          type: "text",
          text: `The server is already running ${MAX_TASKS} tasks, its limit. Try again once one has expired.`,
        },
      ],
      isError: true,
    };
  }
  const task: StoredTask = {
    taskId: randomUUID(),
    createdAt: now,
    ...options,
    behavior,
  };
  tasks.set(task.taskId, task);
  // The SDK passes a tool result's `resultType` through to the wire on
  // 2026-07-28, which is how a task handle replaces the tool's result.
  return { content: [], resultType: "task", ...describe(task, now) };
}

/**
 * The capabilities the client declared in this request's `_meta` envelope,
 * where a 2026-07-28 client sends them with every request.
 */
export function clientCapabilitiesOf(
  ctx: ServerContext,
): Record<string, unknown> | undefined {
  // The SDK's published typing of the envelope has no members, so it is read
  // as the plain JSON object it is.
  const envelope: unknown = ctx.mcpReq.envelope;
  const capabilities = isObject(envelope)
    ? envelope[CLIENT_CAPABILITIES_META_KEY]
    : undefined;
  return isObject(capabilities) ? capabilities : undefined;
}

/**
 * Whether the client that sent this request supports form-mode elicitation:
 * `elicitation.form`, or an `elicitation` object with neither mode, which the
 * spec reads as form mode (#4985).
 */
export function clientSupportsFormElicitation(ctx: ServerContext): boolean {
  const elicitation = clientCapabilitiesOf(ctx)?.elicitation;
  return (
    isObject(elicitation) &&
    (elicitation.form !== undefined || elicitation.url === undefined)
  );
}

/**
 * Whether the client that sent this request declared the tasks extension, so
 * it can follow a task handle. A tool may answer with a task only then.
 */
export function clientSupportsTasks(ctx: ServerContext): boolean {
  const extensions = clientCapabilitiesOf(ctx)?.extensions;
  return isObject(extensions) && extensions[TASKS_EXTENSION] !== undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The tasks extension, as a client declares it. */
const TASKS_CAPABILITY: ClientCapabilities = {
  extensions: { [TASKS_EXTENSION]: {} },
};

/**
 * What each task tool needs the client to have declared: the tasks
 * extension, to follow the handle, and the capability its task asks for
 * input with. The SDK checks the input requests a tool returns itself, but
 * not the ones a task carries in its status, so they are checked here.
 */
const TASK_TOOL_REQUIREMENTS: Record<
  string,
  (ctx: ServerContext) => ClientCapabilities | undefined
> = {
  "simulate-research-query": (ctx) => missingTasks(ctx),
  "trigger-sampling-request-async": (ctx) =>
    merged(
      missingTasks(ctx),
      clientCapabilitiesOf(ctx)?.sampling === undefined
        ? { sampling: {} }
        : undefined,
    ),
  "trigger-elicitation-request-async": (ctx) =>
    merged(
      missingTasks(ctx),
      clientSupportsFormElicitation(ctx)
        ? undefined
        : { elicitation: { form: {} } },
    ),
};

/** The tasks extension, if this request's client did not declare it. */
function missingTasks(ctx: ServerContext): ClientCapabilities | undefined {
  return clientSupportsTasks(ctx) ? undefined : TASKS_CAPABILITY;
}

/** Both sets of missing capabilities, or undefined when neither is. */
function merged(
  a: ClientCapabilities | undefined,
  b: ClientCapabilities | undefined,
): ClientCapabilities | undefined {
  return a || b ? { ...a, ...b } : undefined;
}

/** The -32021 error naming the capabilities the client did not declare. */
function missingCapabilities(
  requiredCapabilities: ClientCapabilities,
): MissingRequiredClientCapabilityError {
  return new MissingRequiredClientCapabilityError(
    { requiredCapabilities },
    `Missing required client capability: ${Object.keys(requiredCapabilities).join(", ")}`,
  );
}

/**
 * Refuse a call to a task tool from a client that did not declare what the
 * tool needs, with the JSON-RPC error -32021 naming it, as the extension
 * requires: such a client cannot be served without a task handle.
 *
 * `McpServer` reports anything a tool handler throws as an `isError` tool
 * result, so the check cannot live in the tools. Instead it wraps the
 * `tools/call` handler `McpServer` installs, which the SDK then runs behind
 * its own era checks, so the error reaches the client as an error. Call this
 * before the first tool is registered, on a server constructed without a
 * `tools` capability: `McpServer` installs the handler at the first
 * registration then, or in its constructor when `tools` is declared.
 *
 * @param {McpServer} server - The 2026-07-28 server whose task tools to guard.
 */
export function guardTaskTools(server: McpServer): void {
  const lowLevel = server.server;
  const setRequestHandler = lowLevel.setRequestHandler.bind(lowLevel);
  // The SDK's overloads cannot be restated for a wrapper; this one only
  // inspects the arguments and passes them through unchanged.
  lowLevel.setRequestHandler = ((...args: unknown[]) => {
    const handler = args.at(-1);
    if (args[0] === "tools/call" && typeof handler === "function") {
      args[args.length - 1] = (
        request: { params: { name: string } },
        ctx: ServerContext,
      ) => {
        const missing = TASK_TOOL_REQUIREMENTS[request.params.name]?.(ctx);
        if (missing) throw missingCapabilities(missing);
        return handler(request, ctx);
      };
    }
    return (setRequestHandler as (...a: unknown[]) => unknown)(...args);
  }) as typeof lowLevel.setRequestHandler;
}

/** Refuse a tasks/* request from a client without the extension (-32021). */
function requireTasks(ctx: ServerContext): void {
  const missing = missingTasks(ctx);
  if (missing) throw missingCapabilities(missing);
}

/** Forget every task. For tests. */
export function clearTasks(): void {
  tasks.clear();
}

const TaskIdParams = z.object({
  taskId: z.string().describe("The task identifier"),
});

const TaskResult = z.looseObject({});
const EmptyResult = z.object({});

/**
 * Serve the extension's methods on a 2026-07-28 server: `tasks/get`,
 * `tasks/update` and `tasks/cancel`. A request from a client that does not
 * declare the extension is refused with -32021. An unknown or expired task
 * id is refused with -32602 (invalid params). A cancellation is acknowledged
 * whatever the task's status, and changes only a task still running. An update's answers to requests that are not outstanding are
 * ignored. Each input request a task makes has a key of its own, never reused
 * once answered (the extension requires it), so a re-asked request gets a
 * new key.
 *
 * @param {McpServer} server - The 2026-07-28 server to serve them on.
 */
export function registerTasksExtension(server: McpServer): void {
  server.server.setRequestHandler(
    "tasks/get",
    { params: TaskIdParams, result: TaskResult },
    async ({ taskId }, ctx) => {
      requireTasks(ctx);
      const now = Date.now();
      return describe(find(taskId, now), now);
    },
  );

  server.server.setRequestHandler(
    "tasks/update",
    { params: TaskIdParams, result: EmptyResult },
    async ({ taskId }, ctx) => {
      requireTasks(ctx);
      // The SDK lifts `inputResponses` out of the params of every request
      // (it is a reserved retry field on 2026-07-28) into the context. The
      // extension requires it, so a request without it is malformed.
      const inputResponses = ctx.mcpReq.inputResponses;
      if (inputResponses === undefined) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          "Invalid params for tasks/update: inputResponses is required",
        );
      }
      const now = Date.now();
      const task = find(taskId, now);
      const state = stateOf(task, now);
      // Only answers to requests outstanding now are passed on. The rest (a
      // key never issued, one already answered, or any answer to a task not
      // waiting for input) are ignored, as the extension asks, so a client
      // that resends or batches responses is not failed for it.
      const outstanding =
        state.status === "input_required"
          ? Object.keys(state.inputRequests)
          : [];
      const answered = Object.fromEntries(
        Object.entries(inputResponses).filter(([key]) =>
          outstanding.includes(key),
        ),
      );
      const size = JSON.stringify(answered).length;
      if (size > MAX_ANSWER_BYTES) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Invalid params for tasks/update: the answers are ${size} bytes, over the ${MAX_ANSWER_BYTES}-byte limit; the task is unchanged`,
        );
      }
      if (Object.keys(answered).length > 0) {
        task.behavior.receive(answered, now);
      }
      return {};
    },
  );

  server.server.setRequestHandler(
    "tasks/cancel",
    { params: TaskIdParams, result: EmptyResult },
    async ({ taskId }, ctx) => {
      requireTasks(ctx);
      const now = Date.now();
      const task = find(taskId, now);
      // Cancellation is cooperative: the request is acknowledged whatever
      // the task's status, and a task that has already finished stays as it
      // ended.
      const { status } = stateOf(task, now);
      if (status !== "completed" && status !== "cancelled") {
        task.cancelledAt = now;
      }
      return {};
    },
  );
}
