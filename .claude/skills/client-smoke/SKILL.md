---
name: client-smoke
description: "Drive a locally built server with a real client: the Inspector CLI (scripted), the Inspector web UI (by hand) and an LLM client. Use when smoke-testing a server change; when calling a tool, reading a resource or getting a prompt from the command line; when choosing a protocol era; or when the Inspector CLI will not connect to, or misreads, a server command."
disable-model-invocation: false
---

# Client smoke

A server change is checked against real clients before its PR opens: the MCP
Inspector and an LLM client. This skill is how to run each one against a server
built from this checkout, and what the output means. What the PR must then
record is in `/pr-flow` (client evidence); building and starting the server is
`/local-dev`; automated tests are `/testing`.

Three clients, in the order to reach for them:

| Client | Driven by | Use it for |
| --- | --- | --- |
| Inspector **CLI** | A command. This is the **scripted path**, and the one an agent runs | One request, one JSON result: the evidence that goes in a PR |
| Inspector **web** UI | A person, by hand. Nothing in this repo automates a browser | What only a UI shows: notifications arriving, elicitation and sampling prompts, a long-running tool's progress |
| An **LLM client** | A prompt | Whether a model picks the tool and uses its result, which the PR checklist asks for |

Build first (`npm run build -w src/<server>`). Every command below runs the
last build of a TypeScript server, not your edit.

## The Inspector CLI

```sh
npx -y @modelcontextprotocol/inspector --cli <server command> [-- ] <inspector options>
```

It starts the server command over stdio (or connects to a URL), sends one
request, prints the result and exits. Pin the Inspector version in anything you
keep (`@modelcontextprotocol/inspector@<version>`); the commands here were run
on 2.9.0. `--cli --help` is the reference for the options.

```sh
INSPECT="npx -y @modelcontextprotocol/inspector --cli"

# List, then call, on a TypeScript server
$INSPECT node src/everything/dist/index.js stdio --method tools/list --format json
$INSPECT node src/everything/dist/index.js stdio \
  --method tools/call --tool-name echo --tool-arg message=hello --format json
# → {"result":{"content":[{"type":"text","text":"Echo: hello"}]}}

# Arguments that are not strings: pass them as JSON
$INSPECT node src/everything/dist/index.js stdio \
  --method tools/call --tool-name get-sum --tool-args-json '{"a":2,"b":3}' --format json

# Resources and prompts
$INSPECT node src/everything/dist/index.js stdio \
  --method resources/read --uri demo://resource/dynamic/text/1 --format json
$INSPECT node src/everything/dist/index.js stdio \
  --method prompts/get --prompt-name args-prompt --prompt-args city=Paris --format json

# A server that takes a positional argument
$INSPECT node src/filesystem/dist/index.js /abs/dir \
  --method tools/call --tool-name list_allowed_directories --format json

# A Python server: note the `--` (see below)
$INSPECT uv --directory src/time run mcp-server-time -- \
  --method tools/call --tool-name get_current_time --tool-arg timezone=UTC --format json
$INSPECT uv --directory src/git run mcp-server-git --repository "$PWD" -- \
  --method tools/list --format json
```

`--format json` prints a result as one JSON object, `{"result": …}`, on
**stdout**, and a failure as `{"error": …}` on **stderr**. The server's own
stderr (its startup banner) passes through on stderr too. So capture stdout
alone for the result, never `2>&1` into a JSON parser: a tool error produces
both objects, one on each stream (see the table below).

### How the command line is split

The server command comes **first** and the Inspector's options **after** it.
With no `--`, the server command ends at the first word that starts with `-`.
That rule produces the three failures people actually hit:

- **A server command with its own flags needs `--` before the Inspector's
  options.** `uv --directory …` and `mcp-server-git --repository …` both have
  one. Without the separator the command is cut at `--directory`, and what runs
  is a bare `uv`, which prints its help and exits. With it, everything before
  `--` is the server command and everything after is the Inspector's.
- **Putting an Inspector option before the server command loses the command.**
  `--cli -e KEY=VALUE node …` leaves no server command at all, and the CLI
  falls back to your personal catalog (`~/.mcp-inspector/mcp.json`). With
  several servers in it that fails with `Multiple servers found in config
  file. Please specify one with --server`. Either way it is no longer talking
  to your build, so move the option after the command.
- **`Method is required`** means the options ended up on the wrong side of a
  `--`.

### Environment variables

The spawned server does **not** inherit your shell's environment. Setting
`MEMORY_FILE_PATH=… npx …` has no effect on the server; pass it with `-e`:

```sh
$INSPECT node src/memory/dist/index.js \
  -e MEMORY_FILE_PATH=/abs/tmp/graph.jsonl \
  --method tools/call --tool-name read_graph --format json
```

### Exit codes and errors

The exit code is the verdict, so check it rather than reading the text:

| Outcome | stdout | stderr | Exit |
| --- | --- | --- | --- |
| The request succeeded | `{"result": …}` | | 0 |
| The tool ran and returned `isError: true` | `{"result": …, "isError": true}` | `{"error":{"code":"tool_is_error", …}}` | 5 |
| No such tool | | `{"error":{"code":"tool_not_found", …}}` | 5 |
| Could not connect, or bad arguments | | `{"error":{"code":"error", …}}` | 1 |

A tool error is a **successful protocol exchange**: the result object is still
printed on stdout, and it is what to quote when the change is about an error a
tool returns.

### `everything` over HTTP

Start the transport in one terminal (or in the background), then give the CLI
the URL. The transport is inferred from the path: `/mcp` is Streamable HTTP,
`/sse` is HTTP+SSE.

```sh
PORT=3917 node src/everything/dist/index.js streamableHttp &
$INSPECT http://localhost:3917/mcp \
  --method tools/call --tool-name echo --tool-arg message=over-http --format json
kill %1
```

A change to a tool, resource or prompt of `everything` is checked over stdio
and Streamable HTTP. Check HTTP+SSE as well when the change touches transport
or session code; it is deprecated but must keep working.

## Protocol eras

The Inspector connects in one of three eras, chosen with `--protocol-era` (the
CLI) or **Server Settings → Protocol Era** (the web UI):

| Era | What the Inspector does |
| --- | --- |
| `legacy` (the default) | A plain `initialize`. Negotiates 2025-11-25 or older |
| `modern` | Pins 2026-07-28 through `server/discover`, with no fallback |
| `auto` | Probes `server/discover`, and falls back to `initialize` |

⚠️ **Only the legacy era can be exercised against these servers today.** All
seven are on a v1 SDK (`@modelcontextprotocol/sdk` 1.x, `mcp` 1.x), whose
newest protocol version is 2025-11-25. None implements `server/discover`. So:

- `--protocol-era modern` fails, by design, with `Version negotiation failed:
  the server did not offer pinned protocol version 2026-07-28 via
  server/discover (no fallback in pin mode)` and exit 1. That is the expected
  result for an unmigrated server, not a regression in your change.
- `--protocol-era auto` succeeds, but through the fallback, so it is a legacy
  connection and proves nothing about 2026-07-28.

The both-eras check that `/pr-flow` asks for (#4857) therefore has one half
that can pass today. For a server still on a v1 SDK, record the legacy run,
and say in the PR that the server does not yet speak 2026-07-28 rather than
leaving the modern era unmentioned. Once a server is migrated under #4857, run
every command twice, with `--protocol-era legacy` and `--protocol-era modern`,
and expect both to succeed. Do not use `auto` for evidence in either case: it
does not say which era answered.

## The Inspector web UI

The web client is the hand-driven path. It needs a person at a browser; this
repo configures no browser automation, so an agent prepares the command and
the steps and asks for what was observed.

```sh
npx -y @modelcontextprotocol/inspector node src/everything/dist/index.js stdio
npx -y @modelcontextprotocol/inspector -- uv --directory src/time run mcp-server-time
npx -y @modelcontextprotocol/inspector --transport http --server-url http://localhost:3001/mcp
```

⚠️ **The web launcher reads `--` the other way round from the CLI.** Here the
Inspector's own options come **before** `--` and the server command **after**
it; in `--cli` mode the server command is before `--` and the options after.
A line copied from one mode to the other starts the wrong thing. Pass a
server's environment with `-e KEY=VALUE` before the `--`.

Use the web UI for what a single request cannot show: `toggle-simulated-logging` and
`toggle-subscriber-updates` (notifications over time),
`trigger-elicitation-request` and `trigger-sampling-request` (the client is
asked something), `trigger-long-running-operation` (progress), and a
filesystem server's response to a Roots change.

Evidence from the web UI is what was clicked and what appeared, in words. This
repo does not attach screenshots.

## An LLM client

The PR checklist asks whether the change was tested with an LLM client. Any
client that can launch a stdio server works; each server's `README.md` has the
config blocks for Claude Desktop and VS Code, and `/local-dev` shows how to
point one at the local build.

Claude Code can do it in one headless command, which makes it the scriptable
option. Write a config that names the local build with an **absolute** path:

```json
{
  "mcpServers": {
    "everything": {
      "command": "node",
      "args": ["/abs/path/to/servers/src/everything/dist/index.js", "stdio"]
    }
  }
}
```

```sh
printf '%s' "Call the echo tool of the everything server with the message 'llm-smoke' and reply with exactly the text it returned." \
  | claude -p --mcp-config /abs/path/to/config.json --strict-mcp-config \
      --allowedTools "mcp__everything__echo" --max-turns 3
# → Echo: llm-smoke
```

`--strict-mcp-config` makes the file the only source of servers, so the answer
cannot have come from a published copy configured elsewhere. A tool is
addressed as `mcp__<server name in the config>__<tool name>`, and only the
tools listed in `--allowedTools` can be called without a prompt. Keep the
config file outside the worktree.

An LLM client does not report which protocol version it negotiated, and offers
no era switch. Record the client and its version; do not present an LLM run as
evidence for a particular era.

## What to write down

For each client: the command or the prompt, and the result trimmed to what
shows the change. For a bug fix, run the same CLI command against `v2/main`
and against the branch, and keep both outputs. Where the evidence goes in the
PR, and what a change with no client-visible surface records instead, is
`/pr-flow`.
