# CLAUDE.md

## Overview

Paubox fork of [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) — a monorepo of reference MCP (Model Context Protocol) servers. Each server is a standalone package under `src/` that exposes tools, resources, and/or prompts over MCP transports (stdio, SSE, streamable HTTP).

`upstream` remote points at `modelcontextprotocol/servers`; `origin` is `Paubox/servers`. The fork carries minimal/no Paubox-specific changes — treat this as upstream and rebase rather than diverge unless intentionally adding Paubox servers.

## Layout

Monorepo using npm workspaces (`src/*`). Mixed TypeScript and Python packages.

TypeScript servers (npm workspaces, MCP TS SDK):
- `src/everything/` — reference/test server exercising all MCP features. Multiple transports: `index.ts` (stdio), `sse.ts`, `streamableHttp.ts`.
- `src/filesystem/` — secure file operations with configurable access controls. Entry `index.ts`; path safety helpers in `path-utils.ts`, `path-validation.ts`, `roots-utils.ts`. Jest tests in `__tests__/`.
- `src/memory/` — knowledge-graph persistent memory. Entry `index.ts`.
- `src/sequentialthinking/` — multi-step reasoning tool. Entry `index.ts`.

Python servers (uv + hatchling, MCP Python SDK):
- `src/fetch/` — fetches and converts web content (markdownify, readabilipy, protego robots).
- `src/git/` — read/search/manipulate Git repos via GitPython. Tests in `src/git/tests/`.
- `src/time/` — time and timezone tools (tzdata, tzlocal). Tests in `src/time/test/`.

Other:
- `scripts/release.py` — uv-script CLI (click + tomlkit) that bumps versions and tags releases across packages.
- `.github/workflows/` — `python.yml`, `typescript.yml`, `release.yml`.
- `README.md` — extensive catalog of reference + third-party servers (alphabetical).

## Build / Run / Test

### Repo root (TypeScript workspaces)
- Install: `npm install`
- Build all TS servers: `npm run build` (runs `tsc` per workspace, then `chmod +x dist/*.js`)
- Watch all: `npm run watch`
- Link all binaries locally: `npm run link-all`
- Publish all: `npm run publish-all`

### Per TS server (e.g. `src/filesystem/`)
- Build: `npm run build` (or `npm run prepare`)
- Watch: `npm run watch`
- Test (filesystem only): `npm test` → `jest --config=jest.config.cjs --coverage`
- Run server binary after build: `node dist/index.js` (or use the package's `bin` entry, e.g. `mcp-server-filesystem`)

### `src/everything/` extra entrypoints
- stdio: `npm run start`
- SSE: `npm run start:sse`
- Streamable HTTP: `npm run start:streamableHttp`

### Per Python server (e.g. `src/git/`)
- Install + sync deps: `uv sync` (uses `uv.lock`)
- Run: `uv run mcp-server-git` (each package defines a `[project.scripts]` entry: `mcp-server-fetch`, `mcp-server-git`, `mcp-server-time`)
- Tests (git): `uv run pytest` (configured via `[tool.pytest.ini_options]` in `pyproject.toml`)
- Lint/typecheck: `uv run ruff check`, `uv run pyright`

### Docker
Every server ships a `Dockerfile` at `src/<server>/Dockerfile` for containerized stdio invocation.

### Release
- `scripts/release.py` (run via uv: `uv run scripts/release.py ...`) bumps versions and creates tags. Requires Python ≥ 3.12.

## TypeScript Conventions

- ES modules (`"type": "module"`). Import paths must include `.js` extensions (e.g. `import { x } from "./foo.js"`) — required by `"module": "Node16"` in `tsconfig.json`.
- Strict TS (`"strict": true`, `target: ES2022`).
- Tool input validation via `zod`; expose JSON schemas with `zod-to-json-schema`.
- Prefer `async`/`await`; clean up timers/resources on shutdown.
- Naming: `camelCase` vars/functions, `PascalCase` types/classes, `UPPER_CASE` constants.
- 2-space indent; trailing commas in multi-line objects.
- Each TS package emits to `dist/` and declares a `bin` entry pointing at `dist/index.js`. The build step `chmod +x` the output so the binary is directly executable.

## Python Conventions

- `requires-python = ">=3.10"`.
- Build backend: `hatchling`. Dependency + venv management: `uv` (lockfiles checked in as `uv.lock`).
- Validation/models via `pydantic` v2.
- Dev tools: `ruff` (lint/format), `pyright` (typecheck), `pytest` (tests).

## Dependencies (high-level)

- TS servers: `@modelcontextprotocol/sdk` (varies by package — filesystem on `^1.17.0`, everything on `^1.12.0`, memory pinned at `1.0.1`), `zod`, `express` (everything server, for HTTP transports).
- Python servers: `mcp` (≥1.0.0/1.1.3), `pydantic`. Per-server: `httpx`/`markdownify`/`readabilipy`/`protego` (fetch), `gitpython`/`click` (git), `tzdata`/`tzlocal` (time).

## Notes for Claude Code sessions

- This is an upstream-tracking fork. Before adding changes, check whether the same change exists upstream (`git fetch upstream && git log upstream/main`). Prefer upstream PRs; only land Paubox-only changes on `origin/main`.
- When editing a single server, prefer running tests/builds inside that server's directory rather than at the repo root to avoid rebuilding every workspace.
- `src/everything/CLAUDE.md` exists with server-specific conventions — read it before modifying that package.
- The root `README.md` is large (~260 KB) and mostly a curated third-party server list kept in alphabetical order; preserve ordering when editing.
