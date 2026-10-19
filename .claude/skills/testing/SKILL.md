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

**Every server is tested in-process, and every file is gated.** The four
TypeScript servers link a real `Client` to the server over an in-memory
transport (#4854); the three Python servers link a `ClientSession` to the real
`serve()` over in-memory streams (#4855). Both languages hold each file to a
per-file coverage floor, in CI and in `npm run local:gate`.

## Where a test goes

| Server | Directory | File name | Runner |
| --- | --- | --- | --- |
| `everything`, `filesystem`, `memory`, `sequentialthinking` | `src/<server>/__tests__/` | `<subject>.test.ts` | vitest, `globals: true` |
| `fetch`, `git`, `time` | `src/<server>/tests/` | `test_<subject>.py` | pytest, with `pytest-asyncio` (`asyncio_mode = "auto"`) |
| Root tooling | `scripts/`, beside the script | `<name>.test.mjs` | `node --test` |

Each vitest config includes only `**/__tests__/**/*.test.ts`, so a test file
anywhere else in a workspace is never run and reports nothing. Shared test
helpers go in `__tests__/` without the `.test` suffix, as each server's
connection harness does (`__tests__/harness.ts` in `everything`,
`__tests__/helpers.ts` in the other three).

## What each server's tests do

| Server | How its tests reach the code |
| --- | --- |
| `everything`, `filesystem`, `memory`, `sequentialthinking` | An SDK `Client` connected to the server's `createServer()` over `InMemoryTransport`, in the vitest process, through the server's own harness, plus unit tests of helper modules such as `lib.ts`. `everything` drives its stdio, SSE and Streamable HTTP transports in-process too; the other three have one thin spawn smoke of the built `dist/index.js` |
| `fetch`, `git`, `time` | A `ClientSession` linked in-process to the real `serve()` over in-memory streams (below), plus direct calls on the pure functions in `server.py` |

No TypeScript test uses an in-memory transport yet.

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
test can link a real `Client` to a real server with no process and no build.
**Each server's `__tests__/` has a harness that does the linking. Connect
through it**, never by calling `createServer()` and
`InMemoryTransport.createLinkedPair()` by hand: the harness also does the
per-session setup and teardown the server needs.

| Server | Factory | Harness | `connect(…)` takes |
| --- | --- | --- | --- |
| `everything` | `createServer()` in `server/index.ts`, returns `{ server, cleanup }` | `__tests__/harness.ts` | `{ capabilities, setup, sessionId }`, all optional |
| `filesystem` | `createServer(allowedDirectories)` in `server.ts` | `__tests__/helpers.ts` | the allowed directories, then `{ capabilities, listRoots }` |
| `memory` | `createServer(memoryFilePath)` in `index.ts` | `__tests__/helpers.ts` | the graph file's path (`makeTempGraph()` makes one) |
| `sequentialthinking` | `createServer()` in `index.ts` | `__tests__/helpers.ts` | `{ disableThoughtLogging }`, defaulting to `"true"` |

Each `connect` returns the `client` and a `close()`; call `close()` in
`afterEach`. The harnesses also export small result helpers (`call`,
`textOf` and the like); read the one you are using before adding another.

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/client";
import { connect, contentOf, textOf, type Session } from "./harness.js";

describe("echo, over the protocol", () => {
  let session: Session;
  let client: Client;

  beforeEach(async () => {
    session = await connect();
    client = session.client;
  });

  afterEach(async () => {
    await session.close();
  });

  it("returns the message", async () => {
    const result = await client.callTool({
      name: "echo",
      arguments: { message: "hi" },
    });
    expect(textOf(contentOf(result)[0])).toBe("Echo: hi");
  });

  it("reports bad input as a tool error", async () => {
    const result = await client.callTool({ name: "echo", arguments: {} });
    expect(result.isError).toBe(true);
  });
});
```

What `everything`'s harness does that a hand-rolled connection would miss:

- **A session id per connection.** Logging, subscriptions, roots and the
  toggle tools keep per-session state in module-level maps keyed by the
  transport's session id, and `InMemoryTransport` has none, so every
  hand-rolled session would share the `undefined` key and leak state into the
  next test. `connect()` sets a fresh `sessionId` on the server transport
  (`sessionId: null` keeps it undefined, as stdio does), and `close()` runs the
  server's `cleanup(sessionId)`, which also stops the timers `createServer()`
  starts (the roots sync).
- **Capabilities.** A tool `everything` registers in `registerConditionalTools`
  appears only when the client declares the matching capability: pass
  `capabilities` (`ALL_CAPABILITIES` declares every one), with `setup` to
  install the client's handlers for the requests the server sends back
  (sampling, elicitation, roots).
- **Notifications.** `session.notifications` collects every notification no
  specific handler consumed; `ofMethod(notifications, method)` filters it.

Assert on what the client receives (tool, resource and prompt lists, call
results, errors, notifications), never on SDK internals or a handler's context
object: the SDK v2 migration (#4856) must be able to update these tests with
import and type changes alone.

### TypeScript: the spawn smoke of the built binary

What only the published entry point can show (that `dist/index.js` starts as a
bin and serves over stdio; in `memory` and `sequentialthinking`, also through
a symlink, as npm's `.bin` entry runs it) is checked by one thin test per server that spawns it with
`StdioClientTransport`: `filesystem`'s `bin-smoke.test.ts`, and
`stdio-smoke.test.ts` in `memory` and `sequentialthinking`. `everything` has
none; its transports are driven in-process. Everything else is tested
in-process. Two hazards apply to these tests, and only to them:

- ⚠️ **They run the last build, not your edit.** `npm test` does not build.
  Build first, or run `npm run validate -w src/<server>`, which builds before
  it tests.
- ⚠️ **A missing `dist/` is handled two ways.** `filesystem` and
  `sequentialthinking` guard the smoke with `skipIf(!existsSync(distIndexPath))`,
  so with no build it is reported as **skipped** and the run stays green having
  tested nothing over stdio. `memory`'s has no guard and **fails**. A skipped
  test in this repo usually means "not built".

Close the client in `finally` or `afterEach`: that is what stops the child
process. Pipe its stderr (`stderr: "pipe"`), and pass environment variables
in the transport's `env` option (`MEMORY_FILE_PATH`, say), since the child
inherits only the SDK's default safelist (`PATH`, `HOME`, `USER` and the
like).

### Python: `ClientSession` over in-memory streams, in-process

Each Python server builds its `Server` inside `serve()` and serves it over the
`stdio_server()` it imports into `server.py`. A test replaces that one name
with a context manager that yields the server side of a pair of in-memory
streams, runs the real `serve()` in a task group, and opens a `ClientSession`
on the client side. No process, no build, and the SDK's input validation and
error mapping run exactly as they do for a real client:

```python
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator

import anyio
import pytest
from mcp import ClientSession
from mcp.shared.memory import create_client_server_memory_streams

import mcp_server_time.server as server_module


@asynccontextmanager
async def connect(**serve_kwargs: Any) -> AsyncIterator[ClientSession]:
    async with create_client_server_memory_streams() as (client, server):

        @asynccontextmanager
        async def fake_stdio_server() -> AsyncIterator[Any]:
            yield server

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(server_module, "stdio_server", fake_stdio_server)
            async with anyio.create_task_group() as tg:
                tg.start_soon(lambda: server_module.serve(**serve_kwargs))
                async with ClientSession(*client) as session:
                    await session.initialize()
                    yield session
                tg.cancel_scope.cancel()


async def test_get_current_time() -> None:
    async with connect() as session:
        result = await session.call_tool("get_current_time", {"timezone": "UTC"})
        assert result.isError is False
```

- **Patch the name `server.py` looks up** (`mcp_server_<name>.server.stdio_server`),
  not `mcp.server.stdio.stdio_server`: `server.py` imported the function, so
  the module attribute is what `serve()` calls.
- **Cancel the task group after the session closes.** `serve()` runs until its
  streams end, so without the cancel the test never returns.
- **Assert on the wire shape where you can**, for example
  `result.model_dump(by_alias=True, mode="json")`, rather than on Python
  attribute names: the SDK v2 port (#4851) renames them, and a wire-level
  assertion survives it.
- **No network in a test.** `fetch` replaces `httpx.AsyncClient` with one on an
  `httpx.MockTransport`; `git` works against a temporary repository its
  fixture creates and closes before removing.

`pytest-asyncio` with `asyncio_mode = "auto"` is a dev dependency of all three,
so an `async def test_…` runs as it stands.

A subprocess test over stdio (`StdioServerParameters(command=sys.executable,
args=["-m", "mcp_server_<name>"])` with `mcp.client.stdio.stdio_client`) is
kept to a thin smoke of the entry point. coverage.py does not measure a child
process, so code reached only that way reads as uncovered.

## Tests that pin a known bug

The suites are characterization tests: each asserts what the server does
today, so a migration that changes behavior fails a test. Most of what they pin
is intended. Some of it is a bug, pinned as it is so that the fix has to change
the assertion visibly. Every test of that kind carries one marker, directly
above the test (or above its `describe`/class when the whole block pins the
same bug):

```ts
// KNOWN BUG #<N>: pins current (wrong) behavior; the fix changes this assertion.
```

In Python the same text follows `#`. A bug with no issue yet reads
`KNOWN BUG (no issue): <what is wrong>; …`, which also marks it for filing.

- `git grep "KNOWN BUG"` lists every test that pins a bug. A test without the
  marker pins intended behavior, or guards a fixed bug against regression.
- **Fixing the bug** means changing that test's assertion to the correct
  behavior and removing the marker, in the fix PR.
- **Pinning a newly found bug**: write the test against what the code does,
  add the marker, and file the issue (`/issue-create`), then cite it.
- A pin of current design that a feature request wants changed is not a bug
  and gets no marker.

## Running them

| Scope | Command |
| --- | --- |
| One TypeScript server | `npm test -w src/<server>` |
| One file, or one test | `npm test -w src/<server> -- __tests__/<file>.test.ts -t "<name>"` |
| Every TypeScript server | `npm test` at the root |
| One TypeScript server's coverage gate | `npm run coverage -w src/<server>` (see below) |
| One TypeScript server's whole chain | `npm run validate -w src/<server>` (format check, lint, typecheck, build, test) |
| One Python server | `uv run pytest` in `src/<server>` |
| One Python test | `uv run pytest <path to the test file>::<name>` in `src/<server>` (for example `tests/test_server.py::test_git_checkout_existing_branch`) |
| One Python server's whole chain | `npm run validate:py -- <server>` |
| One Python server's coverage gate | `npm run coverage:py -- <server>` at the root |
| Every Python server's coverage gate | `npm run coverage:py` at the root |
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

**The Python servers' coverage is a gate.** `npm run coverage:py -- <server>`
runs, in `src/<server>`:

```sh
uv run --frozen pytest --cov --cov-report=term-missing --cov-report=json
```

which prints coverage.py's report (the missing lines and partial branches)
and writes `coverage.json` (ignored by git). `scripts/lib/py-coverage.mjs` then
checks **every file** in it: at least 90% of its lines and 90% of its branches,
each file on its own. What is measured is the server's `[tool.coverage.run]`
(`branch = true`, `source` set to its package). `local:gate` and CI's
**Coverage \<server\>** job both run it. It is kept out of the plain
`uv run pytest` loop, which stays fast and uninstrumented.

A line or branch that genuinely cannot run is marked
`# pragma: no cover  # <reason>`, with the reason on the same line; never
lower the gate. Diagnosing a red run is `/pre-push-gate`.

⚠️ **A spawned server is invisible to the report.** v8 coverage measures the
vitest process, not a child it starts, so code reached only through a spawn
smoke reads as uncovered. That is why behavior is tested in-process: a file
whose only test spawns it cannot clear the gate.

## Error output

A test that expects an error keeps it off the console. Spy on the logger for
the duration of the test (`vi.spyOn(console, "error").mockImplementation(() =>
{})`, restored afterwards), and pipe a spawned server's stderr rather than
inheriting it.
