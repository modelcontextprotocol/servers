---
name: project-structure
description: "Find where code lives in this repo's seven servers and decide where a new file goes. Use when choosing the file or directory for a new tool, resource, prompt, transport, helper module, command-line flag or root script; when a server's layout is unclear; or when asking whether code belongs in a server's entry file or a module of its own."
disable-model-invocation: false
---

# Project structure

The top-level tree, with each server's package name and registry, is in
[`AGENTS.md`](../../../AGENTS.md) under **Project structure**. This skill is the
level below it: what is inside each server, and where a new file goes. Test
placement and harnesses are `/testing`; building and running a server is
`/local-dev`.

There is **no shared library between servers**. Each directory under `src/` is
a complete package that versions and publishes on its own, so a helper two
servers need is written in both (`expandHome` exists in `filesystem` and in
`memory`, and the copy in `memory` says so). Do not add a cross-server import.

## The TypeScript servers

All four are npm workspaces of the root `package.json` and share one shape: the
entry point is `index.ts`, sources sit at the workspace root (there is no
`src/` inside a server), tests are in `__tests__/`, and `tsc` writes `dist/`.
Each has the same four config files: `package.json`, `tsconfig.json` (the
build), `tsconfig.test.json` (the no-emit typecheck program, which also
includes the tests) and `vitest.config.ts`.

| Server | Layout | Where its features are registered |
| --- | --- | --- |
| `everything` | `index.ts` picks a transport from `argv`; `server/` holds the factory; `tools/`, `resources/`, `prompts/` hold one file per feature plus an `index.ts`; `transports/` holds one file per transport; `docs/` is shipped | Each feature file exports a `register…` function, wired into its area's `index.ts` (`registerTools`, `registerResources`, `registerPrompts`), which `server/index.ts` calls from `createServer()` |
| `filesystem` | `index.ts` is the server; `lib.ts` holds the file operations and path validation; `path-utils.ts`, `path-validation.ts` and `roots-utils.ts` are focused helpers | Inline in `index.ts`, with `server.registerTool(...)` |
| `memory` | `index.ts` is the server and the `KnowledgeGraphManager`; `version.ts` reads the package version | Inline in `index.ts`; the resource and its subscription handlers are exported `register…` functions in the same file |
| `sequentialthinking` | `index.ts` is the server; `lib.ts` holds `SequentialThinkingServer`, the logic; `version.ts` reads the package version | Inline in `index.ts` |

Three things about `everything` that the table cannot hold:

- **`server/index.ts` exports `createServer()`**, which returns
  `{ server, cleanup }`. Every transport file calls it, once per stdio process
  or once per HTTP session. A tool that depends on what the client can do
  (roots, sampling, elicitation) is registered through
  `registerConditionalTools`, which runs after `initialize`, not through
  `registerTools`.
- **`docs/` is part of the server, not only documentation.** The build copies
  it into `dist/docs`, every file in it is served as a static resource, and
  `docs/instructions.md` is returned as the server's `instructions`. A file
  added there becomes a resource a client can list.
- **Its own maps are `src/everything/docs/structure.md` and
  `src/everything/docs/extension.md`.** A change to the server's files updates
  `structure.md`, and `src/everything/AGENTS.md` holds the rules that apply
  only inside that directory.

`filesystem`, `memory` and `sequentialthinking` run on import: each `index.ts`
builds the server at module scope and connects stdio at the bottom of the
file. That is why their logic lives in a separate module (`lib.ts`) or is
exported from `index.ts` for the tests, and why a test cannot import a ready
server from them. `/testing` covers what that means for a new test.

## The Python servers

`fetch`, `git` and `time` are independent `uv` projects with the same layout:

```
src/<server>/
├── pyproject.toml            dependencies, the console script; pytest config in `fetch` and `git`
├── uv.lock, .python-version
├── src/mcp_server_<name>/
│   ├── __init__.py           main(): the command-line flags, then asyncio.run(serve(...))
│   ├── __main__.py           python -m mcp_server_<name>
│   └── server.py             everything else
└── tests/                    test/ in `time`
```

`server.py` holds the Pydantic input models, the functions that do the work,
and `serve()`. `serve()` constructs the `Server`, declares the tools (and, in
`fetch`, the prompts) with the `@server.list_tools()` / `@server.call_tool()`
decorators inside its body, and then runs it over stdio. So a new tool is a
set of edits in `server.py`: its input model, its entry in `list_tools`, and
its branch in `call_tool`. In `git` and `time` there is a fourth: tool names
are members of an enum (`GitTools`, `TimeTools`) that `list_tools` and
`call_tool` both dispatch on, so the new name is added there first. `fetch`
has one tool and no enum. The `Server` object is local to `serve()` and not
importable.

## Where to put a new file

| It is… | It goes in |
| --- | --- |
| A tool, resource or prompt for `everything` | Its own kebab-case file in `tools/`, `resources/` or `prompts/`, exporting a `register…` function, wired into that directory's `index.ts` |
| A transport for `everything` | `src/everything/transports/`, plus a `case` in `src/everything/index.ts` and a `start:…` script |
| A tool for `filesystem`, `memory` or `sequentialthinking` | A `server.registerTool(...)` call in that server's `index.ts`; the logic it calls goes in `lib.ts` (or the class it extends) so a test can reach it |
| A helper module for `everything` | A kebab-case `.ts` file in the feature area it supports, beside its users (`server/logging.ts`, `server/roots.ts`, `resources/session.ts`), imported with the `.js` extension |
| A helper module for `filesystem`, `memory` or `sequentialthinking` | A kebab-case `.ts` file at the workspace root, imported with the `.js` extension |
| A tool for a Python server | `server.py`: the tool-name enum member (`git`, `time`), the model, the `list_tools` entry, the `call_tool` branch |
| A command-line flag for a Python server | `__init__.py`, passed into `serve()` |
| A test | `/testing` |
| Root tooling (a guard, a release helper) | `scripts/<name>.mjs`, with a sibling `<name>.test.mjs` when it has logic worth testing; shared helpers in `scripts/lib/` |
| A design document | `docs/` |
| A procedure for agents | `.claude/skills/<name>/SKILL.md`, with a row in the Skills index |

A new server directory is not on this list: the repository does not accept new
servers (`CONTRIBUTING.md`).

## What a new file is checked against

A TypeScript file in a new location is still inside the gate, because two
guards enumerate tracked files rather than trusting a glob:
`verify:typecheck-coverage` fails when a tracked `.ts` file is in no project
that `typecheck` runs, and `verify:format-coverage` fails when a tracked source
file matches no `prettier --check` glob. Both run in `npm run validate:guards`.
If one fires on a file you added, the fix is to bring the file into the
existing config, not to exclude it.

When a file or directory is added, removed, renamed or given a different
purpose, every entry that describes it changes in the same PR (`AGENTS.md`,
**Maintenance rules**): the root `README.md`, the server's own `README.md`,
the tree in `AGENTS.md`, and for `everything`, `docs/structure.md`.
