Add [mcp-cj](https://atomgit.com/ystyle/mcp-cj) to the Frameworks (For servers) list in ADDITIONAL.md.

## What is mcp-cj?

**mcp-cj** is a Model Context Protocol (MCP) framework for the **Cangjie** programming language (Huawei's native programming language). It provides:

- **Server and client** implementations (one SDK, both sides)
- Multiple transports: **Stdio**, **Streamable HTTP** (2025-11-25 session-based, 2026-07-28 stateless), and HTTP+SSE (legacy 2024-11-05)
- Full protocol coverage: tools, resources (incl. templates), prompts, and the complete notification set (progress, cancellation, list-changed, logging)
- Type-safe APIs built on the `jsonvalue` + `json-rpc` layered architecture

## Package

Published on the Cangjie package registry as **`mcp` v2.3.5**: https://pkg.cangjie-lang.cn/package/mcp

## Repository

https://atomgit.com/ystyle/mcp-cj (AtomGit, primary home of the Cangjie ecosystem)
