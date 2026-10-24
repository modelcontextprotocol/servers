# Everything MCP Server

**[Architecture](docs/architecture.md)
| [Project Structure](docs/structure.md)
| [Startup Process](docs/startup.md)
| [Server Features](docs/features.md)
| [Extension Points](docs/extension.md)
| [How It Works](docs/how-it-works.md)**

This MCP server attempts to exercise all the features of the MCP protocol. It is not intended to be a useful server, but rather a test server for builders of MCP clients. It implements prompts, tools, resources, sampling, and more to showcase MCP capabilities.

## Tools, Resources, Prompts, and Other Features

A complete list of the registered MCP primitives and other protocol features demonstrated can be found in the [Server Features](docs/features.md) document.

## Protocol versions

The server serves both protocol eras, over stdio and Streamable HTTP, from one process:

- **2026-07-28** clients connect with `server/discover`, send their protocol version, identity and capabilities with each request, and have no session. The server demonstrates the revision's new features for them: multi-round-trip requests (`input_required`) with `requestState`, `subscriptions/listen` change notifications, per-request log levels, cache hints (`ttlMs` / `cacheScope`), the tasks extension (`io.modelcontextprotocol/tasks`) under the `extensions` capability, and `x-mcp-header` with JSON Schema 2020-12 tool schemas.
- **2025-era** clients connect with the `initialize` handshake, as before. Elicitation, sampling and roots are served to them from the same multi-round-trip handlers through the SDK's legacy shim.

Roots, sampling and logging are deprecated as of 2026-07-28 and stay available, labelled deprecated. [Server Features](docs/features.md) marks which era each feature belongs to.

## Requirements

Node.js 24 or later, when the server runs through `npx` or from source.

## Usage with Claude Desktop (uses [stdio Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#stdio))

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "everything": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

On Windows, use `cmd /c` to launch `npx`:

```json
{
  "mcpServers": {
    "everything": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

## Usage with VS Code

For quick installation, use one of the one-click install buttons below...

[![Install with NPX in VS Code](https://img.shields.io/badge/VS_Code-NPM-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-everything%22%5D%7D) [![Install with NPX in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-NPM-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22%40modelcontextprotocol%2Fserver-everything%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Feverything%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=everything&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Feverything%22%5D%7D&quality=insiders)

For manual installation, you can configure the MCP server using one of these methods:

**Method 1: User Configuration (Recommended)**
Add the configuration to your user-level MCP configuration file. Open the Command Palette (`Ctrl + Shift + P`) and run `MCP: Open User Configuration`. This will open your user `mcp.json` file where you can add the server configuration.

**Method 2: Workspace Configuration**
Alternatively, you can add the configuration to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> For more details about MCP configuration in VS Code, see the [official VS Code MCP documentation](https://code.visualstudio.com/docs/copilot/customization/mcp-servers).

#### NPX

```json
{
  "servers": {
    "everything": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

On Windows, use:

```json
{
  "servers": {
    "everything": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-everything"]
    }
  }
}
```

## Run from source with [Streamable HTTP Transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http)

```shell
cd src/everything
npm install
npm run start:streamableHttp
```

The endpoint is `http://localhost:3001/mcp` (`PORT` overrides the port). It serves 2026-07-28 clients statelessly and 2025-era clients with sessions, from the same URL.

Both HTTP transports (Streamable HTTP and HTTP+SSE) accept browser requests only from a localhost origin: an `Origin` header whose host is `localhost`, `127.0.0.1` or `[::1]`, on any port, such as the MCP Inspector's. A request carrying any other `Origin` is refused with `403 Forbidden`. Clients that send no `Origin` header, which is every non-browser client, are unaffected.

## Running from source with [HTTP+SSE Transport](https://modelcontextprotocol.io/specification/2024-11-05/basic/transports#http-with-sse) (deprecated as of [2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports))

```shell
cd src/everything
npm install
npm run start:sse
```

The HTTP+SSE transport serves 2025-era clients only, and the server prints a deprecation warning when it starts. Prefer Streamable HTTP.

## Running as an installed package

### Install

```shell
npm install -g @modelcontextprotocol/server-everything@latest
```

### Run the default (stdio) server

```shell
npx @modelcontextprotocol/server-everything
```

### Or specify stdio explicitly

```shell
npx @modelcontextprotocol/server-everything stdio
```

### Run the streamable HTTP server

```shell
npx @modelcontextprotocol/server-everything streamableHttp
```

### Run the SSE server (deprecated, 2025-era clients only)

```shell
npx @modelcontextprotocol/server-everything sse
```

## License

This MCP server is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
