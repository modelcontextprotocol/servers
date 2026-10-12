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

A minimal, modular MCP server showcasing core Model Context Protocol features. It exposes simple tools, prompts, and resources, and can be run over multiple transports (STDIO, Streamable HTTP, and the deprecated HTTP+SSE). It serves both protocol eras: 2026-07-28 clients (`server/discover`, per-request `_meta`, no sessions) and 2025-era clients (`initialize`), from one server factory.

### Design

A small “server factory” constructs the MCP server for a protocol era and registers features.
Transports are separate entry points that serve the factory and handle network concerns: the SDK's `serveStdio` and `createMcpHandler` entries pick each client's era.
Tools, prompts, and resources are organized in their own submodules.

### Multi‑client

The server supports multiple concurrent clients. Per-connection state (resource subscriptions,
simulated logging) lives on the server instance serving the connection, and state that must outlive
a 2026-07-28 request (tasks, minted resources) is stored under handles the server mints.

## Build and Distribution

- TypeScript sources are compiled into `dist/` via `npm run build`.
- The `build` script copies `docs/` into `dist/` so instruction files ship alongside the compiled server.
- The CLI bin is configured in `package.json` as `mcp-server-everything` → `dist/index.js`.

## [Project Structure](structure.md)

## [Startup Process](startup.md)

## [Server Features](features.md)

## [Extension Points](extension.md)

## [How It Works](how-it-works.md)
