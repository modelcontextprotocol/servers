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
  ProtocolError,
  ProtocolErrorCode,
  type CallToolResult,
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

/** Whether the client that sent this request supports sampling. */
export function clientSupportsSampling(ctx: ServerContext): boolean {
  return clientCapabilitiesOf(ctx)?.sampling !== undefined;
}

/**
 * The result for a task tool whose task would ask the client for input it
 * did not declare it can give. The SDK checks a tool's own input requests,
 * but not the ones a task carries in its status, so the tool checks here.
 */
export function capabilityRequired(
  name: string,
  capability: string,
): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `${name} asks the client for input, so it needs a client that declares the ${capability} capability.`,
      },
    ],
    isError: true,
  };
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

/** The result for a task tool called by a client without the extension. */
export function tasksRequired(name: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: `${name} runs as a task, so it needs a client that declares the ${TASKS_EXTENSION} extension in its capabilities.`,
      },
    ],
    isError: true,
  };
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
 * `tasks/update` and `tasks/cancel`. An unknown or expired task id, and an
 * update or cancellation that does not fit the task's status, is refused
 * with -32602 (invalid params).
 *
 * @param {McpServer} server - The 2026-07-28 server to serve them on.
 */
export function registerTasksExtension(server: McpServer): void {
  server.server.setRequestHandler(
    "tasks/get",
    { params: TaskIdParams, result: TaskResult },
    async ({ taskId }) => {
      const now = Date.now();
      return describe(find(taskId, now), now);
    },
  );

  server.server.setRequestHandler(
    "tasks/update",
    { params: TaskIdParams, result: EmptyResult },
    async ({ taskId }, ctx) => {
      // The SDK lifts `inputResponses` out of the params of every request
      // (it is a reserved retry field on 2026-07-28) into the context.
      const inputResponses: TaskInputResponses =
        ctx.mcpReq.inputResponses ?? {};
      const now = Date.now();
      const task = find(taskId, now);
      const state = stateOf(task, now);
      if (state.status !== "input_required") {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Task ${taskId} is ${state.status}, not waiting for input`,
        );
      }
      const outstanding = Object.keys(state.inputRequests);
      const unknown = Object.keys(inputResponses).filter(
        (key) => !outstanding.includes(key),
      );
      if (unknown.length > 0) {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Task ${taskId} has no outstanding input request ${unknown.join(", ")}; it is waiting for ${outstanding.join(", ")}`,
        );
      }
      task.behavior.receive(inputResponses, now);
      return {};
    },
  );

  server.server.setRequestHandler(
    "tasks/cancel",
    { params: TaskIdParams, result: EmptyResult },
    async ({ taskId }) => {
      const now = Date.now();
      const task = find(taskId, now);
      const { status } = stateOf(task, now);
      if (status === "completed" || status === "cancelled") {
        throw new ProtocolError(
          ProtocolErrorCode.InvalidParams,
          `Task ${taskId} is already ${status}`,
        );
      }
      task.cancelledAt = now;
      return {};
    },
  );
}
