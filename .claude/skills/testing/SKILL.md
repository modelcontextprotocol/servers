---
name: testing
description: "Write, place and run tests for a server in this repo. Use when choosing between driving the server through an MCP client and calling its functions directly; when writing a protocol-level test for a TypeScript or Python server; when choosing the command that runs one suite or a coverage report; or when a test is skipped or passes against a stale build."
disable-model-invocation: false
---

# Testing

The **rules** are in [`AGENTS.md`](../../../AGENTS.md) under **Always test new
or modified code**: new behavior comes with tests, every TypeScript file clears
the per-file coverage gate, test at the protocol level where you can, and keep
expected error output off the console. This skill explains the harness each
server has, how to write a test with it, which command runs what, and how to
clear the per-file coverage gate.

Driving a running server by hand, with the Inspector or an LLM client, is
`/client-smoke`. It is evidence for a PR, not a substitute for a test.

⚠️ **The TypeScript and Python harnesses differ.** All four TypeScript servers
are tested in-process, a real `Client` linked to the server over an in-memory
transport (#4854). The Python servers' tests call their functions directly,
and those servers have no coverage gate yet (#4855).

## Where a test goes

| Server | Directory | File name | Runner |
| --- | --- | --- | --- |
| `everything`, `filesystem`, `memory`, `sequentialthinking` | `src/<server>/__tests__/` | `<subject>.test.ts` | vitest, `globals: true` |
| `fetch`, `git` | `src/<server>/tests/` | `test_<subject>.py` | pytest |
| `time` | `src/time/test/` | `<subject>_test.py` | pytest |
| Root tooling | `scripts/`, beside the script | `<name>.test.mjs` | `node --test` |

Each vitest config includes only `**/__tests__/**/*.test.ts`, so a test file
anywhere else in a workspace is never run and reports nothing. Shared test
helpers go in `__tests__/` without the `.test` suffix, as
`src/everything/__tests__/helpers.ts` does.

## What each server's tests do

| Server | How its tests reach the code |
| --- | --- |
| `everything`, `filesystem`, `memory`, `sequentialthinking` | An SDK `Client` connected to the server's `createServer()` over `InMemoryTransport`, in the vitest process; unit tests of the helper modules beside them; at most a thin spawn-based smoke of the built `dist/index.js` |
| `fetch`, `git`, `time` | Direct calls on the functions in `server.py`, with `unittest.mock` |

No Python test opens a `ClientSession` yet.

## Choosing a harness for a new test

Ask what the test must prove.

- **Logic** (a path check, a graph operation, a timezone conversion): call the
  function directly. That is what `lib.ts` and the functions in `server.py` are
  for.
- **What a client sees** (a tool's result shape, its advertised schema, an
  error result, a capability, a notification): drive the server through a
  client. A handler called directly skips the SDK's input validation, output
  schema validation and error mapping, which is where the wire-level bugs in
  this repo have been.

Which client harness is available depends on the language.

### TypeScript: in-process, over an in-memory transport

Each TypeScript server exports a `createServer(…)` factory and starts its
transport only from a guarded `main()`, so importing it starts nothing and a
test can link a real `Client` to a real server with no process and no build:

| Server | Factory | Takes |
| --- | --- | --- |
| `everything` | `server/index.ts` | nothing; returns `{ server, cleanup }` |
| `filesystem` | `server.ts` | the allowed directories |
| `memory` | `index.ts` | the graph file's path |
| `sequentialthinking` | `index.ts` | nothing |

Each server's `__tests__/` already has a shared helper that does the
connecting (and, where the server needs one, the temporary directory or file).
**Use it** rather than writing the linking by hand again. What it does, shown
for `everything`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server/index.js";

describe("echo, over the protocol", () => {
  let client: Client;
  let cleanup: () => void;

  beforeEach(async () => {
    const created = createServer();
    cleanup = created.cleanup;
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([
      created.server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterEach(async () => {
    await client.close();
    cleanup();
  });

  it("returns the message", async () => {
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "hi" },
    });
    expect(result.content).toEqual([{ type: "text", text: "Echo: hi" }]);
  });

  it("reports bad input as a tool error", async () => {
    const result = await client.callTool({ name: "echo", arguments: {} });
    expect(result.isError).toBe(true);
  });
});
```

Close the client (and, for `everything`, call `cleanup()`) in `afterEach`:
`everything`'s `createServer()` starts timers (the roots sync after
`initialize`, the task store) that otherwise outlive the test. A tool
`everything` registers in `registerConditionalTools` appears only when the
`Client` declares the matching capability (`roots`, `sampling`,
`elicitation`) in its constructor options.

Assert on what the client receives (tool, resource and prompt lists, call
results, errors, notifications), never on SDK internals or a handler's context
object: the SDK v2 migration (#4856) must be able to update these tests with
import and type changes alone.

### TypeScript: the spawn smoke of the built binary

What only the published entry point can show (that `dist/index.js` starts,
reads its arguments and serves over stdio) is checked by a thin test that
spawns it with `StdioClientTransport`. Everything else is tested in-process.
Two hazards apply to that kind of test, and only to it:

- ⚠️ **It runs the last build, not your edit.** `npm test` does not build. Build
  first, or run `npm run validate -w src/<server>`, which builds before it
  tests.
- ⚠️ **A spawn test guarded with `skipIf(!existsSync(distIndexPath))` is
  reported as skipped with no build**, and the run stays green having tested
  nothing over stdio. A skipped test in this repo usually means "not built".

Close the client in `finally` or `afterEach`: that is what stops the child
process. Pipe its stderr (`stderr: "pipe"`), and pass environment variables
in the transport's `env` option, since the child inherits only the SDK's
default safelist (`PATH`, `HOME`, `USER` and the like).

### Python: `ClientSession` over stdio

Each Python server constructs its `Server` inside `serve()`, so it cannot be
handed to an in-memory session. A protocol-level test spawns the module and
talks to it through the SDK's stdio client:

```python
import sys

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


def test_get_current_time_over_stdio() -> None:
    async def _run() -> None:
        params = StdioServerParameters(
            command=sys.executable, args=["-m", "mcp_server_time"]
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                result = await session.call_tool(
                    "get_current_time", {"timezone": "UTC"}
                )
                assert result.isError is False

    anyio.run(_run)
```

`sys.executable` is the server's own virtual environment under `uv run pytest`,
and the install there is editable, so this runs your edit with no build step.

How an async test is written differs by server, because the dev dependencies
do: `fetch` has `pytest-asyncio` with `asyncio_mode = "auto"`, so an
`async def test_…` just works. `git` and `time` do not have it; wrap the
coroutine in `anyio.run(...)` as above (`git`'s `serve()` test does), rather
than adding a dependency for one test.

## Running them

| Scope | Command |
| --- | --- |
| One TypeScript server | `npm test -w src/<server>` |
| One file, or one test | `npm test -w src/<server> -- __tests__/<file>.test.ts -t "<name>"` |
| Every TypeScript server | `npm test` at the root |
| One TypeScript server's coverage gate | `npm run coverage -w src/<server>` (see below) |
| One TypeScript server's whole chain | `npm run validate -w src/<server>` (format check, lint, typecheck, build, test) |
| One Python server | `uv run pytest` in `src/<server>` |
| One Python test | `uv run pytest <path to the test file>::<name>` in `src/<server>` (for example `tests/test_server.py::test_git_checkout_existing_branch`, or `test/time_server_test.py::…` in `time`) |
| One Python server's whole chain | `npm run validate:py -- <server>` |
| Root tooling | `npm run test:scripts` |

`npm run typecheck -w src/<server>` is the only step that typechecks the test
files in `filesystem`, `memory` and `sequentialthinking`: their build
`tsconfig.json` excludes tests, and vitest does not typecheck.

## `test` versus `coverage`

`test` is `vitest run`, the fast loop, and part of `validate`. `coverage` is
`vitest run --coverage`: the same suite, instrumented, with a v8 report over
the workspace's `**/*.ts` (tests and `dist/` excluded) written to the terminal
and to the ignored `coverage/` directory (`coverage/index.html` has the
line-by-line view).

```sh
npm run coverage -w src/<server>    # one server
npm run coverage                    # all four
```

**`coverage` is a gate.** Each server's `vitest.config.ts` sets
`coverage.thresholds` to 90 on lines, statements, functions and branches with
`perFile: true`, so the command fails when any one file is below 90 on any
one of them, even if the totals are above. CI runs it as its own job
(`typescript.yml` → **Coverage \<server\>**) and `npm run local:gate` as its own
stage. `test` and `validate` never measure coverage, so a change can pass
them and still fail here: run `coverage` on the server you changed before you
push.

Clearing a red file:

- The `Uncovered Line #s` column is the to-do list. A branch shortfall with no
  uncovered line is the untaken side of a condition, `??`, `?.` or default
  parameter: write the test that takes it.
- Only code that **cannot** run gets an ignore, at the source and with its
  reason: `/* v8 ignore next -- <reason> */`, or `/* v8 ignore start -- <reason> */`
  … `/* v8 ignore stop */` around a block. "Hard to test" is not a reason.
- Never lower a threshold, drop `perFile`, or add a file to the coverage
  `exclude` to get green.

⚠️ **A spawned server is invisible to the report.** v8 coverage measures the
vitest process, not a child it starts, so code reached only through the spawn
smoke reads as uncovered. That is why behavior is tested in-process: a file
whose only test spawns it cannot clear the gate.

The Python servers have no coverage tooling yet (#4855).

## Error output

A test that expects an error keeps it off the console. Spy on the logger for
the duration of the test (`vi.spyOn(console, "error").mockImplementation(() =>
{})`, restored afterwards), and pipe a spawned server's stderr rather than
inheriting it.
