---
name: local-dev
description: "Install, build and run a server from this checkout. Use when starting a server locally over stdio, SSE or Streamable HTTP; when pointing npx, uvx or an MCP client config at the local build; when a running server still shows old code, or dist is missing; when setting up a git worktree; or when adding an overrides pin."
disable-model-invocation: false
---

# Local development

The short form of the commands, and the dependency **rules**, are in
[`AGENTS.md`](../../../AGENTS.md) under **Development setup**. This skill is
how to get a server running from the checkout, and what goes wrong on the way.
Driving a running server with a client is `/client-smoke`; tests are
`/testing`.

## Install and build

Node 22 for the TypeScript servers, and `uv` for the Python ones.

```sh
npm install        # at the repo root: all four TypeScript workspaces
npm run build      # every workspace; or: npm run build -w src/<server>
```

Each workspace's `prepare` script is its build, so a root `npm install` also
builds every TypeScript server. `tsc` writes each server's `dist/`, which is
ignored by git and is what every run command below executes.

The Python servers need no separate install step. `uv run` creates the
server's `.venv` on first use, at the Python version its `.python-version`
pins, and installs the server into it in editable mode.

⚠️ **A fresh git worktree has none of this.** `node_modules`, every `dist/`
and every `.venv` are untracked, so a new worktree starts with no installed
dependencies and no build. Run `npm install` at the worktree's root before
anything else; the first `uv run` in a Python server builds its environment.

## Run a server

Every server speaks stdio. A stdio server started by hand prints a banner on
stderr and then waits for JSON-RPC on stdin, so on its own this only shows
that it boots; to send it requests, use `/client-smoke`.

| Server | From the repo root | Arguments and environment |
| --- | --- | --- |
| `everything` | `node src/everything/dist/index.js stdio` | First argument picks the transport: `stdio` (the default), `sse`, `streamableHttp` |
| `filesystem` | `node src/filesystem/dist/index.js <dir> [<dir>…]` | The allowed directories. A client that supports Roots can supply them instead |
| `memory` | `node src/memory/dist/index.js` | `MEMORY_FILE_PATH` sets the graph file |
| `sequentialthinking` | `node src/sequentialthinking/dist/index.js` | None required |
| `fetch` | `uv --directory src/fetch run mcp-server-fetch` | `--user-agent`, `--ignore-robots-txt`, `--proxy-url` |
| `git` | `uv --directory src/git run mcp-server-git` | `--repository <path>` |
| `time` | `uv --directory src/time run mcp-server-time` | `--local-timezone <IANA name>` |

Each server's `README.md` is the reference for its options and environment
variables.

⚠️ **`memory` writes inside the build by default.** With no
`MEMORY_FILE_PATH`, the graph file is `memory.jsonl` beside the built module,
which is `src/memory/dist/memory.jsonl` in a checkout. Point
`MEMORY_FILE_PATH` at a temporary file for local runs, so a test graph does not
outlive the session inside `dist/`.

### `everything` over HTTP

```sh
npm run start:streamableHttp -w src/everything    # http://localhost:3001/mcp
npm run start:sse -w src/everything               # http://localhost:3001/sse
PORT=3917 node src/everything/dist/index.js streamableHttp
```

Both HTTP transports listen on `PORT`, default `3001`, so they cannot run side
by side without setting it. Streamable HTTP serves POST, GET and DELETE on
`/mcp`. HTTP+SSE serves `GET /sse` and `POST /message`; it is deprecated, kept
working, and never the transport to recommend. The two log to different
streams: HTTP+SSE writes everything to stderr, while Streamable HTTP writes its
request and session messages to stdout and its `listening on port` line and
errors to stderr.

## Run the local package the way a user would

A user starts these servers with `npx` or `uvx`. Both accept a path in place of
the published name, which exercises the package's `bin` or console script
rather than a file path:

```sh
npx -y ./src/sequentialthinking          # the workspace's bin, from its dist/
uvx --from ./src/time mcp-server-time    # builds the project, runs its script
```

`npx` runs whatever is in `dist/`, so build first. For an MCP client's config
file, use absolute paths, since the client does not start in this directory:

```json
{
  "mcpServers": {
    "filesystem-local": {
      "command": "node",
      "args": ["/abs/path/to/servers/src/filesystem/dist/index.js", "/abs/dir"]
    },
    "time-local": {
      "command": "uv",
      "args": ["--directory", "/abs/path/to/servers/src/time", "run", "mcp-server-time"]
    }
  }
}
```

Give a local entry a name that differs from the published server's, so the
client cannot be running the released package while you read its output as
your change.

## When the server still shows old code

- **TypeScript runs from `dist/`, never from source.** An edit does nothing
  until the server is rebuilt: `npm run build -w src/<server>`, or leave
  `npm run watch -w src/<server>` running.
- **A stdio client holds the process it spawned.** Rebuilding does not replace
  a server a client already started; reconnect or restart the client.
- **Python needs no rebuild** under `uv run`, because the install is editable,
  but the running process still has to be restarted.
- **Deleting or renaming a TypeScript source file leaves its old `.js` in
  `dist/`.** `tsc` does not clean. Remove the server's `dist/` and rebuild when
  a file went away.

## Dependencies

The rules are in `AGENTS.md` under **Dependencies**: pin a transitive
dependency with `overrides`, keep shared devDependencies on one range, and
commit `uv.lock` with a Python dependency change. What follows is the
procedure for each.

**An `overrides` pin.** The root `package.json` is the only manifest whose
`overrides` npm honors in a workspace, so the entry goes there:

```sh
# 1. Add "<package>": "<range>" under "overrides" in the root package.json.
npm install
npm ls <package>      # every copy in the tree, and what pulled each one in
npm run build         # the pin puts a parent on a version it did not declare,
npm test              # so the build and tests are the real check, not the audit
```

An override is invisible once the audit is clean. Drop it when the parent
package widens its own range, rather than carrying it forever.

**A shared devDependency.** `typescript`, `vitest`, `@vitest/coverage-v8` and
`@types/node` are declared in each workspace that uses them, and
`npm run verify:dep-lockstep` (inside `validate:guards`) fails when two
declarations of one package disagree. The guard's own list, in
`scripts/verify-dep-lockstep.mjs`, is the set it covers. Bump every
declaration in one change, then `npm install` once at the root.

**A Python dependency.** Edit that server's `pyproject.toml`, then run
`uv lock` in the server's directory and commit `uv.lock` with it.
`npm run validate:py -- <server>` syncs with `--locked`, so a stale lockfile
fails its first step.

## Docker

Each server has a `Dockerfile`, and no gate builds them. The build context
differs by language. The TypeScript images build from the **repo root**,
because they copy the root `tsconfig.json`:
`docker build -t mcp/<server> -f src/<server>/Dockerfile .`. The Python images
build from the **server's directory**: `docker build -t mcp/<server> .`.
