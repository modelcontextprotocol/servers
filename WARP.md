# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

Monorepo of Model Context Protocol (MCP) servers with both TypeScript and Python implementations. Independent server packages are published to npm under the @modelcontextprotocol/server-* scope. CI/CD runs via GitHub Actions for both TypeScript and Python packages.

- TypeScript servers live under `src/`: everything, filesystem, git, memory, sequentialthinking, time
- Python servers (fetch, git, time) are implemented in Python - some servers have both TS and Python implementations
- Each server has its own `package.json` with standard scripts: build, test, watch, prepare
- Tests for TypeScript servers use Vitest with coverage

## Common Commands (per server package)

### TypeScript

From a server folder (e.g., `src/filesystem`):

- **Install dependencies**:
  ```bash
  npm ci
  ```

- **Build**:
  ```bash
  npm run build
  ```

- **Watch mode** (rebuild on change):
  ```bash
  npm run watch
  ```

- **Test** (Vitest with coverage):
  ```bash
  npm test
  ```

- **Run a single test by name/pattern**:
  ```bash
  npm test -- -t "pattern"
  ```

- **Run a specific test file**:
  ```bash
  npx vitest run path/to/file.test.ts
  ```

- **Prepare for release**:
  ```bash
  npm run prepare
  ```

### Python

From a Python server folder (e.g., `src/fetch`):

- **Using uv** (recommended):
  ```bash
  uv venv
  uv pip install -e .
  python -m mcp_server_<name>
  ```

- **Using pip/venv**:
  ```powershell
  py -m venv .venv
  .\.venv\Scripts\Activate
  pip install -e .
  python -m mcp_server_<name>
  ```

## Running Servers Locally

### TypeScript (after build)

```bash
node dist/index.js
```

Or if published:
```bash
npx @modelcontextprotocol/server-<name>
```

### Python

```bash
python -m mcp_server_<name>
```

### Docker

If a Dockerfile exists:

```bash
# Build
docker build -t mcp-server-<name> path/to/server

# Run
docker run --rm -it mcp-server-<name>
```

## Architecture Highlights

- **Monorepo structure**: Multiple independent servers. Each server is a standalone package with its own package.json and tests
- **Dual implementations**: Some server concepts exist in both TS and Python (e.g., git, time). Language-specific servers are entirely separate implementations
- **MCP Protocol compliance**: All servers implement the Model Context Protocol for LLM integration
- **Independent publishing**: Each TypeScript server publishes independently to npm under @modelcontextprotocol/server-* namespace
- **CI/CD**: GitHub Actions runs build and tests across the matrix for TS and Python to maintain parity and correctness
- **Prepare script**: TS packages use `prepare` script to ensure build steps are performed on install/publish

## Key Concepts

### Server Types

1. **everything** - Reference/test server demonstrating all MCP features (prompts, resources, tools, sampling)
2. **fetch** - Web content fetching with HTML-to-markdown conversion
3. **filesystem** - Secure file operations with configurable access controls and MCP Roots support
4. **git** - Git repository interaction (status, diff, commit, branch operations)
5. **memory** - Knowledge graph-based persistent memory for Claude
6. **sequentialthinking** - Dynamic problem-solving through thought sequences
7. **time** - Time and timezone conversion capabilities

### MCP Features Demonstrated

- **Tools**: Callable functions that LLMs can invoke
- **Resources**: Static or dynamic content LLMs can read
- **Prompts**: Pre-built prompt templates
- **Roots**: Dynamic directory access control (filesystem server)
- **Sampling**: LLM sampling capability (everything server)
- **Progress notifications**: Long-running operation updates

## What to Consult

- **README.md** (root) — High-level repo goals, getting started, reference server list
- **CONTRIBUTING.md** — Contribution flow, coding/testing standards, PR template requirements
- **Individual server README.md** — Per-server usage, configuration options, security considerations
- **.github/workflows/** — CI matrices for TS/Python; useful to mirror locally when debugging CI-only failures
- **src/everything/CLAUDE.md** — Code style guidelines specific to the everything server

## Productivity Tips

- **TS testing**: Target a single spec when iterating: `npm test -- -t "keyword"` or `npx vitest run path/to/spec`
- **Isolated environments**: Run commands from within the server folder to keep node_modules isolated and faster
- **Quick sanity checks**: For published servers, test via `npx @modelcontextprotocol/server-<name>` after local build
- **Windows considerations**: fetch server may need `PYTHONIOENCODING=utf-8` env variable to prevent timeout issues
- **Security**: filesystem server requires explicit directory allowlisting via args or MCP Roots; never expose sensitive directories

## Tooling Rules (from src/everything/CLAUDE.md)

- Use ES modules with `.js` extension in import paths
- Strictly type all functions and variables with TypeScript
- Follow zod schema patterns for tool input validation
- Prefer async/await over callbacks and Promise chains
- Place all imports at top of file, grouped by external then internal
- Use descriptive variable names that clearly indicate purpose
- Implement proper cleanup for timers and resources in server shutdown
- Follow camelCase for variables/functions, PascalCase for types/classes, UPPER_CASE for constants
- Handle errors with try/catch blocks and provide clear error messages
- Use consistent indentation (2 spaces) and trailing commas in multi-line objects
