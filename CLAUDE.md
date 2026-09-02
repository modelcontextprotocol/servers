# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Official MCP reference server implementations. This is an npm workspaces monorepo containing 7 servers (4 TypeScript, 3 Python) under `src/`. Each server is a standalone package published to npm or PyPI.

## Monorepo Structure

```
src/
  everything/          TS  @modelcontextprotocol/server-everything    (reference server, all MCP features)
  filesystem/          TS  @modelcontextprotocol/server-filesystem    (file operations with Roots access control)
  memory/              TS  @modelcontextprotocol/server-memory        (knowledge graph persistence)
  sequentialthinking/  TS  @modelcontextprotocol/server-sequential-thinking  (step-by-step reasoning)
  fetch/               Py  mcp-server-fetch                           (web content fetching)
  git/                 Py  mcp-server-git                             (git repository operations)
  time/                Py  mcp-server-time                            (timezone queries and conversion)
```

## Build & Test Commands

### TypeScript servers

```bash
# Single server
cd src/<server> && npm ci && npm run build && npm test

# All TS servers from root
npm install && npm run build
```

- Build: `tsc` (target ES2022, module Node16, strict mode)
- Tests: **vitest** with `@vitest/coverage-v8` (required for new tests)
- Node version: **22**

### Python servers

```bash
cd src/<server> && uv sync --frozen --all-extras --dev

# Run tests (if tests/ or test/ directory exists)
uv run pytest

# Type checking
uv run pyright

# Linting
uv run ruff check .
```

- Build system: **hatchling** (`uv build`)
- Package manager: **uv** (not pip)
- Python version: **>= 3.10** (per-server `.python-version` file)
- Type checking: **pyright** (enforced in CI)
- Linting: **ruff**

## Code Style

### TypeScript

- ES modules with `.js` extension in import paths
- Strict TypeScript typing for all functions and variables
- Zod schemas for tool input validation
- 2-space indentation, trailing commas in multi-line objects
- camelCase for variables/functions, PascalCase for types/classes, UPPER_CASE for constants
- kebab-case for file names and registered tools/prompts/resources
- Verb-first tool names (e.g., `get-file-info`, not `file-info`)
- Imports grouped: external first, then internal

### Python

- Type hints enforced via pyright
- Async/await patterns (especially in fetch server with pytest-asyncio)
- Follow existing module layout per server

## Contributing Guidelines

**Accepted:** Bug fixes, usability improvements, enhancements demonstrating MCP protocol features (Resources, Prompts, Roots -- not just Tools).

**Selective:** New features outside a server's core purpose or highly opinionated additions.

**Not accepted:** New server implementations (use the [MCP Server Registry](https://github.com/modelcontextprotocol/registry)), README server listing changes.

## CI/CD Pipeline

Both TypeScript and Python workflows use **dynamic package detection** (find + jq matrix strategy):

1. `detect-packages` -- finds all `package.json` / `pyproject.toml` under `src/`
2. `test` -- runs tests per package
3. `build` -- compiles and type-checks per package
4. `publish` -- on release events only (npm for TS, PyPI trusted publishing for Python)

## MCP Protocol Reference

The repo is configured with an MCP docs server (`.mcp.json`) pointing to `https://modelcontextprotocol.io/mcp`. For schema details, reference `https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/schema` which contains versioned schemas in JSON and TypeScript formats.

## Key Patterns

- Each server registers capabilities via `registerTools(server)`, `registerResources(server)`, `registerPrompts(server)` functions
- Tool annotations: set `readOnlyHint`, `idempotentHint`, `destructiveHint` per MCP spec
- Transport support: stdio (default), SSE (deprecated), Streamable HTTP
- All PRs are reviewed against the [PR template](.github/pull_request_template.md) checklist -- ensure MCP docs are read, security best practices followed, and changes tested with an LLM client
