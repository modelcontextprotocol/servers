# Everything Server – Architecture

**Architecture
| [Project Structure](structure.md)
| [Startup Process](startup.md)
| [Server Features](features.md)
| [Extension Points](extension.md)
| [How It Works](how-it-works.md)**

This documentation summarizes the current layout and runtime architecture of the `src/everything` package.
It explains how the server starts, how transports are wired, where tools, prompts, and resources are registered, and how to extend the system.

## High‑level Overview

### Purpose

A minimal, modular MCP server showcasing core Model Context Protocol features. It exposes simple tools, prompts, and resources, and can be run over multiple transports (STDIO, SSE, and Streamable HTTP).

### Protocol eras

The server is **dual-era**: it serves both the legacy protocol revisions (`2024-10-07`
through `2025-11-25`) and the modern ones (`2026-07-28` onward) from a single codebase.
These are the SDK's own names, and the literal values of `ctx.era`.

The two differ structurally, not just by date. Legacy has an `initialize` handshake,
sessions, a server-to-client request channel, and unsolicited notifications. Modern has
none of those: every request carries its own protocol version, client identity, and
capabilities in `_meta`; servers obtain client input by _returning_ `inputRequired(...)`;
and change notifications flow over a `subscriptions/listen` stream the client opened.

### Design

A small “server factory” constructs the MCP server and registers features. Transports are
separate entry points that hand that factory to an SDK serving entry — `serveStdio` or
`createMcpHandler` — which decides the era and calls the factory to build an instance per
connection (stdio) or per request (HTTP).

Tools, prompts, and resources are organized in their own submodules and are written **once**,
era-agnostically. The SDK adapts them to whichever era is in play, so nothing under
`tools/` branches on `ctx.era`. The handful of things that genuinely cannot exist on one
era or the other are handled in the factory and transports.

### Multi‑client

The server supports multiple concurrent clients. On connections that have sessions (stdio,
SSE, legacy Streamable HTTP), per-session data is tracked and demonstrated with resource
subscriptions and simulated logging. Modern-era serving is per request and holds nothing
between exchanges — cross-call state travels in explicit, server-minted handles instead.

## Build and Distribution

- TypeScript sources are compiled into `dist/` via `npm run build`.
- The `build` script copies `docs/` into `dist/` so instruction files ship alongside the compiled server.
- The CLI bin is configured in `package.json` as `mcp-server-everything` → `dist/index.js`.

## [Project Structure](structure.md)

## [Startup Process](startup.md)

## [Server Features](features.md)

## [Extension Points](extension.md)

## [How It Works](how-it-works.md)
