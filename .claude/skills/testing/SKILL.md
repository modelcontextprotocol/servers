---
name: testing
description: "Write, place and run tests for a server in this repo. Use when choosing between driving the server through an MCP client and calling its functions directly; when writing a protocol-level test for a TypeScript or Python server; when choosing the command that runs one suite or a coverage report; or when a test is skipped or passes against a stale build."
disable-model-invocation: false
---

# Testing

The **rules** are in [`AGENTS.md`](../../../AGENTS.md) under **Always test new
or modified code**: new behavior comes with tests, test at the protocol level
where you can, and keep expected error output off the console. This skill
explains which harness each server has **today**, how to write a test with it,
and which command runs what.

Driving a running server by hand, with the Inspector or an LLM client, is
`/client-smoke`. It is evidence for a PR, not a substitute for a test.

⚠️ **The harnesses are uneven, and this page describes them as they are.** Only
`everything` can be driven in-process today. A shared in-process harness for
every server, and a per-file coverage threshold, are the work of #4854
(TypeScript) and #4855 (Python); neither exists yet, and this skill changes
when they land. Do not write a test that assumes them.

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

## What each server's tests do today

| Server | How its tests reach the code |
| --- | --- |
| `everything` | Call a `register…` function with a mocked `McpServer`, capture the handler it registered, and invoke the handler directly. `__tests__/helpers.ts` types the captured handlers |
| `filesystem` | Unit tests of `lib.ts` and the path helpers, plus an SDK `Client` over `StdioClientTransport` that spawns the built `dist/index.js` |
| `sequentialthinking` | Unit tests of `lib.ts`, plus an SDK `Client` over stdio against `dist/index.js` |
| `memory` | Direct calls on the exported `KnowledgeGraphManager` and `register…` functions, with a mocked server |
| `fetch`, `git`, `time` | Direct calls on the functions in `server.py`, with `unittest.mock` |

No test in the repo uses an in-memory transport yet, and no Python test opens
a `ClientSession`.

## Choosing a harness for a new test

Ask what the test must prove.

- **Logic** (a path check, a graph operation, a timezone conversion): call the
  function directly. That is what `lib.ts` and the functions in `server.py` are
  for.
- **What a client sees** (a tool's result shape, its advertised schema, an
  error result, a capability, a notification): drive the server through a
  client. A handler called directly skips the SDK's input validation, output
  schema validation and error mapping, which is where the wire-level bugs in
  this repo have been. The regression tests in `filesystem` and
  `sequentialthinking` that go through a `Client` exist for exactly that
  reason.

Which client harness is available depends on the server.

### `everything`: in-process, over an in-memory transport

`src/everything/server/index.ts` exports `createServer()`, so a test can link a
real `Client` to a real server with no process and no build:

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

Call `cleanup()` in `afterEach`: `createServer()` starts timers (the roots sync
after `initialize`, the task store) that otherwise outlive the test. A tool
registered by `registerConditionalTools` appears only when the `Client`
declares the matching capability (`roots`, `sampling`, `elicitation`) in its
constructor options.

### `filesystem`, `memory`, `sequentialthinking`: a client over stdio, against the build

These three build their server at module scope and connect stdio when
`index.ts` is imported, so there is no factory to call and the in-memory
recipe above does not apply to them. A protocol-level test spawns the built
server instead:

```ts
const distIndexPath = path.join(packageRoot, "dist", "index.js");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [distIndexPath],
  stderr: "pipe",
});
const client = new Client({ name: "test-client", version: "0.0.0" });
await client.connect(transport);
// … assert …
await client.close(); // this is what stops the child process
```

`src/sequentialthinking/__tests__/input-schema.test.ts` is the reference.
`stderr: "pipe"` keeps the server's startup banner off the console.

Give the server what it needs to start. `filesystem` takes its allowed
directories as arguments (`args: [distIndexPath, testDir]`, with `testDir` a
`realpath`-resolved temporary directory, as
`src/filesystem/__tests__/structured-content.test.ts` does); with none, and a
client that offers no Roots, every file operation is refused. Environment
variables such as `MEMORY_FILE_PATH` go in the transport's `env` option: the
child inherits only the SDK's default safelist (`PATH`, `HOME`, `USER` and the
like), not the other variables of the test process.

⚠️ **These tests run the last build, not your edit.** `npm test` does not build.
A test that spawns `dist/index.js` passes or fails on whatever `tsc` last
wrote, so after changing a server's source, build before trusting the result,
or run `npm run validate -w src/<server>`, which builds before it tests.

⚠️ **A missing `dist/` is handled two ways.** The `sequentialthinking` tests
wrap themselves in `skipIf(!existsSync(distIndexPath))`, so with no build they
are reported as **skipped**, and the run stays green having tested nothing over
the wire. The `filesystem` stdio tests and `memory`'s dist-layout test have no
such guard and **fail**. A skipped test in this repo usually means "not
built".

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
| One TypeScript server's whole chain | `npm run validate -w src/<server>` (format check, lint, typecheck, build, test) |
| One Python server | `uv run pytest` in `src/<server>` |
| One Python test | `uv run pytest <path to the test file>::<name>` in `src/<server>` (for example `tests/test_server.py::test_git_checkout_existing_branch`, or `test/time_server_test.py::…` in `time`) |
| One Python server's whole chain | `npm run validate:py -- <server>` |
| Root tooling | `npm run test:scripts` |

`npm run typecheck -w src/<server>` is the only step that typechecks the test
files in `filesystem`, `memory` and `sequentialthinking`: their build
`tsconfig.json` excludes tests, and vitest does not typecheck.

## `test` versus `coverage`

`test` is `vitest run`. `coverage` is `vitest run --coverage`: the same suite,
plus a v8 coverage report over the workspace's `**/*.ts` (tests and `dist/`
excluded), written to the terminal and to the ignored `coverage/` directory.

```sh
npm run coverage -w src/<server>    # one server
npm run coverage                    # all four
```

Today the report is **informational**. No vitest config sets a threshold, so
`coverage` fails only when a test fails, and neither `validate` nor CI runs it.
The Python servers have no coverage tooling at all: `pytest-cov` is not a dev
dependency of any of them. Read the report to find what a change left
untested; do not describe it as a gate.

⚠️ **A spawned server is invisible to the report.** v8 coverage measures the
vitest process, not a child it starts, so code reached only through a stdio
test reads as uncovered: `sequentialthinking`'s `index.ts` reports 0% while its
stdio tests exercise it. A low number on an entry file is not, by itself,
missing tests.

## Error output

A test that expects an error keeps it off the console. Spy on the logger for
the duration of the test (`vi.spyOn(console, "error").mockImplementation(() =>
{})`, restored afterwards), and pipe a spawned server's stderr rather than
inheriting it.
