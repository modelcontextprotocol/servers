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
| `fetch`, `git`, `time` | `src/<server>/tests/` | `test_<subject>.py` | pytest |
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
test can link a real `Client` to a real server with no process and no build.
**Each server's `__tests__/` has a harness that does the linking. Connect
through it**, never by calling `createServer()` and
`InMemoryTransport.createLinkedPair()` by hand: the harness also does the
per-session setup and teardown the server needs.

| Server | Factory | Harness | `connect(…)` takes |
| --- | --- | --- | --- |
| `everything` | `createServer()` in `server/index.ts`, returns `{ server, cleanup }` | `__tests__/harness.ts` | `{ capabilities, taskStore, setup, sessionId }`, all optional |
| `filesystem` | `createServer(allowedDirectories)` in `server.ts` | `__tests__/helpers.ts` | the allowed directories, then `{ capabilities, listRoots }` |
| `memory` | `createServer(memoryFilePath)` in `index.ts` | `__tests__/helpers.ts` | the graph file's path (`makeTempGraph()` makes one) |
| `sequentialthinking` | `createServer()` in `index.ts` | `__tests__/helpers.ts` | `{ disableThoughtLogging }`, defaulting to `"true"` |

Each `connect` returns the `client` and a `close()`; call `close()` in
`afterEach`. The harnesses also export small result helpers (`call`,
`textOf` and the like); read the one you are using before adding another.

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
  starts (the roots sync, the task store).
- **Capabilities.** A tool `everything` registers in `registerConditionalTools`
  appears only when the client declares the matching capability: pass
  `capabilities` (`ALL_CAPABILITIES` declares every one), with `setup` to
  install the client's handlers for the requests the server sends back
  (sampling, elicitation, roots) and `taskStore` for the task-augmented ones.
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

## Tests that pin a known bug

The suites are characterization tests: each asserts what the server does
today, so a migration that changes behavior fails a test. Most of what they pin
is intended. Some of it is a bug, pinned as it is so that the fix has to change
the assertion visibly. Every test of that kind carries one marker, directly
above the test (or above its `describe`/class when the whole block pins the
same bug):

```ts
// KNOWN BUG #4808: pins current (wrong) behavior; the fix changes this assertion.
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
vitest process, not a child it starts, so code reached only through a spawn
smoke reads as uncovered. That is why behavior is tested in-process: a file
whose only test spawns it cannot clear the gate.

The Python servers have no coverage tooling yet (#4855).

## Error output

A test that expects an error keeps it off the console. Spy on the logger for
the duration of the test (`vi.spyOn(console, "error").mockImplementation(() =>
{})`, restored afterwards), and pipe a spawned server's stderr rather than
inheriting it.
