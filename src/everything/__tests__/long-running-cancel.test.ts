/**
 * Cancellation of `trigger-long-running-operation` (#1124, #4846).
 *
 * The tool waits on a timer per step. Before #4846 it ignored the request's
 * cancellation: a cancelled call kept stepping and sending progress, and its
 * pending timer held a stdio server's process open after the client went
 * away. Each case cancels a call from a real SDK client, in both protocol
 * eras.
 *
 * - Over the stdio transport manager on in-memory pipes, the server's raw
 *   output is read, since the SDK client silently drops progress for a
 *   request it has cancelled: no progress may cross the wire after the
 *   cancel, and the session keeps serving.
 * - The step timer is what kept the process alive, and nothing on the wire
 *   shows whether it is still pending, so `node:timers/promises` is wrapped
 *   (calling through) to show the tool's wait is abandoned on the cancel.
 *   That wait clears its own timer when its signal aborts.
 */
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/client";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { connect, connectModern, contentOf, textOf } from "./harness.js";
import type { Session } from "./harness.js";
import { main, type StdioSession } from "../transports/stdio.js";

const timers = vi.hoisted(() => ({
  sleeps: [] as Array<{ ms: number | undefined; settled: Promise<unknown> }>,
}));

vi.mock("node:timers/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:timers/promises")>();
  return {
    ...actual,
    setTimeout: <T>(
      ms?: number,
      value?: T,
      options?: Parameters<typeof actual.setTimeout>[2],
    ) => {
      const promise = actual.setTimeout(ms, value, options);
      timers.sleeps.push({
        ms,
        settled: promise.then(
          () => "elapsed",
          (error: unknown) => error,
        ),
      });
      return promise;
    },
  };
});

let session: Session | undefined;
const started: StdioSession[] = [];

afterEach(async () => {
  timers.sleeps.length = 0;
  await session?.close();
  session = undefined;
  for (const { shutdown } of started.splice(0)) {
    process.off("SIGINT", shutdown);
  }
});

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.each([
  ["2025-era", {}],
  ["2026-07-28", { versionNegotiation: { mode: { pin: "2026-07-28" } } }],
] as const)("over stdio, a cancelled call (%s)", (_era, opts) => {
  it("sends no progress after the cancel, and the session keeps serving", async () => {
    const toServer = new PassThrough();
    const fromServer = new PassThrough();
    started.push(await main(toServer, fromServer));
    // Every line the server writes, read alongside the client's transport.
    let wire = "";
    fromServer.on("data", (chunk: Buffer) => {
      wire += chunk.toString();
    });
    const client = new Client({ name: "stdio-test", version: "0.0.0" }, opts);
    await client.connect(new StdioServerTransport(fromServer, toServer));

    // Four 50 ms steps: uncancelled, the last progress lands at about 200 ms.
    const controller = new AbortController();
    const call = client.callTool(
      {
        name: "trigger-long-running-operation",
        arguments: { duration: 0.2, steps: 4 },
      },
      {
        signal: controller.signal,
        onprogress: () => controller.abort("cancelled by test"),
      },
    );
    await expect(call).rejects.toBeDefined();
    await delay(300);
    expect(wire.match(/"notifications\/progress"/g)).toHaveLength(1);

    const echo = await client.callTool({
      name: "echo",
      arguments: { message: "after cancel" },
    });
    expect(echo.content).toEqual([
      { type: "text", text: "Echo: after cancel" },
    ]);
    await client.close();
  });
});

describe.each([
  ["2025-era", () => connect()],
  ["2026-07-28", () => connectModern()],
])("a cancelled call (%s)", (_era, open) => {
  it("abandons its pending step wait, so no timer holds the process open", async () => {
    session = await open();
    const controller = new AbortController();
    const call = session.client.callTool(
      {
        name: "trigger-long-running-operation",
        arguments: { duration: 20, steps: 2 },
      },
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(timers.sleeps).toHaveLength(1));
    controller.abort("cancelled by test");
    await expect(call).rejects.toBeDefined();

    // The 10 s wait settles at once, rejected by the abort, not elapsed.
    expect(timers.sleeps[0]?.ms).toBe(10_000);
    const outcome = await timers.sleeps[0]?.settled;
    expect(outcome).toMatchObject({ name: "AbortError" });
    // The loop stopped: no further step was scheduled.
    await delay(20);
    expect(timers.sleeps).toHaveLength(1);

    const result = await session.client.callTool({
      name: "echo",
      arguments: { message: "still here" },
    });
    expect(textOf(contentOf(result)[0])).toBe("Echo: still here");
  });
});
