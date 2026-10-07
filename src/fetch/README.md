# Fetch MCP Server

<!-- mcp-name: io.github.modelcontextprotocol/server-fetch -->

A Model Context Protocol server that provides web content fetching capabilities. This server enables LLMs to retrieve and process content from web pages, converting HTML to markdown for easier consumption.

Source: https://github.com/modelcontextprotocol/servers/tree/main/src/fetch

Requires MCP Python SDK 2.x (`mcp>=2.2,<3`).

> [!CAUTION]
> This server can access local/internal IP addresses and may represent a security risk. Exercise caution when using this MCP server to ensure this does not expose any sensitive data.
>
> By default the server refuses to fetch private, loopback, link-local and other non-public addresses, including cloud metadata endpoints such as `169.254.169.254`, and checks every redirect hop the same way. The `--allow-private-ips` argument turns this guard off; see [Customization - Private addresses](#customization---private-addresses). The guard checks the addresses a hostname resolves to before each request, so it does not protect against DNS rebinding between that check and the connection, and a hostname the server cannot resolve itself (one only a proxy can resolve) is not checked.

The fetch tool will truncate the response, but by using the `start_index` argument, you can specify where to start the content extraction. This lets models read a webpage in chunks, until they find the information they need.

### Available Tools

- `fetch` - Fetches a URL from the internet and extracts its contents as markdown.
    - `url` (string, required): URL to fetch
    - `max_length` (integer, optional): Maximum number of characters to return (default: 5000)
    - `start_index` (integer, optional): Start content from this character index (default: 0)
    - `raw` (boolean, optional): Get raw content without markdown conversion (default: false)

### Prompts

- **fetch**
  - Fetch a URL and extract its contents as markdown
  - Arguments:
    - `url` (string, required): URL to fetch

## Installation

Optionally: Install node.js, this will cause the fetch server to use a different HTML simplifier that is more robust.

### Using uv (recommended)

When using [`uv`](https://docs.astral.sh/uv/) no specific installation is needed. We will
use [`uvx`](https://docs.astral.sh/uv/guides/tools/) to directly run *mcp-server-fetch*.

### Using PIP

Alternatively you can install `mcp-server-fetch` via pip:

```
pip install mcp-server-fetch
```

After installation, you can run it as a script using:

```
python -m mcp_server_fetch
```

## Configuration

### Configure for Claude.app

Add to your Claude settings:

<details>
<summary>Using uvx</summary>

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    }
  }
}
```
</details>

<details>
<summary>Using docker</summary>

```json
{
  "mcpServers": {
    "fetch": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "mcp/fetch"]
    }
  }
}
```
</details>

<details>
<summary>Using pip installation</summary>

```json
{
  "mcpServers": {
    "fetch": {
      "command": "python",
      "args": ["-m", "mcp_server_fetch"]
    }
  }
}
```
</details>

### Configure for VS Code

For quick installation, use one of the one-click install buttons below...

[![Install with UV in VS Code](https://img.shields.io/badge/VS_Code-UV-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=fetch&config=%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22mcp-server-fetch%22%5D%7D) [![Install with UV in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-UV-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=fetch&config=%7B%22command%22%3A%22uvx%22%2C%22args%22%3A%5B%22mcp-server-fetch%22%5D%7D&quality=insiders)

[![Install with Docker in VS Code](https://img.shields.io/badge/VS_Code-Docker-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=fetch&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Ffetch%22%5D%7D) [![Install with Docker in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Docker-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=fetch&config=%7B%22command%22%3A%22docker%22%2C%22args%22%3A%5B%22run%22%2C%22-i%22%2C%22--rm%22%2C%22mcp%2Ffetch%22%5D%7D&quality=insiders)

For manual installation, add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. This will allow you to share the configuration with others.

> Note that the `mcp` key is needed when using the `mcp.json` file.

<details>
<summary>Using uvx</summary>

```json
{
  "mcp": {
    "servers": {
      "fetch": {
        "command": "uvx",
        "args": ["mcp-server-fetch"]
      }
    }
  }
}
```
</details>

<details>
<summary>Using Docker</summary>

```json
{
  "mcp": {
    "servers": {
      "fetch": {
        "command": "docker",
        "args": ["run", "-i", "--rm", "mcp/fetch"]
      }
    }
  }
}
```
</details>

### Customization - robots.txt

By default, the server will obey a websites robots.txt file if the request came from the model (via a tool), but not if
the request was user initiated (via a prompt). This can be disabled by adding the argument `--ignore-robots-txt` to the
`args` list in the configuration.

### Customization - Private addresses

By default, the server refuses any request, including a redirect hop or a robots.txt fetch, whose host resolves to an
address that is not globally routable: loopback (`127.0.0.0/8`, `::1`), private (`10.0.0.0/8`, `172.16.0.0/12`,
`192.168.0.0/16`, `fc00::/7`), link-local (`169.254.0.0/16`, `fe80::/10`), shared address space (`100.64.0.0/10`),
multicast, unspecified, documentation and the other IANA special-purpose ranges. A hostname is refused if any one of its addresses is in those ranges.
The client receives an error naming the refused address.

To fetch from local or internal hosts (a development server, an intranet page), add the argument
`--allow-private-ips` to the `args` list in the configuration.

### Customization - User-agent

By default, depending on if the request came from the model (via a tool), or was user initiated (via a prompt), the
server will use either the user-agent
```
ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)
```
or
```
ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)
```

This can be customized by adding the argument `--user-agent=YourUserAgent` to the `args` list in the configuration.

### Customization - Proxy

The server can be configured to use a proxy by using the `--proxy-url` argument.

Without `--proxy-url`, the server uses the proxy in the standard `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY`
environment variables (honoring `NO_PROXY`). Both `http(s)://` and SOCKS5 proxies are supported (SOCKS support is
installed with the server). A `socks://` proxy URL, as many desktop proxy settings export it, is treated as
`socks5://`. A proxy setting the server cannot use makes each fetch fail with a tool error that says so.

## Windows Configuration

If you're experiencing timeout issues on Windows, you may need to set the `PYTHONIOENCODING` environment variable to ensure proper character encoding:

<details>
<summary>Windows configuration (uvx)</summary>

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "env": {
        "PYTHONIOENCODING": "utf-8"
      }
    }
  }
}
```
</details>

<details>
<summary>Windows configuration (pip)</summary>

```json
{
  "mcpServers": {
    "fetch": {
      "command": "python",
      "args": ["-m", "mcp_server_fetch"],
      "env": {
        "PYTHONIOENCODING": "utf-8"
      }
    }
  }
}
```
</details>

This addresses character encoding issues that can cause the server to timeout on Windows systems.

## Debugging

You can use the MCP inspector to debug the server. For uvx installations:

```
npx @modelcontextprotocol/inspector uvx mcp-server-fetch
```

Or if you've installed the package in a specific directory or are developing on it:

```
cd path/to/servers/src/fetch
npx @modelcontextprotocol/inspector uv run mcp-server-fetch
```

## Development

From `src/fetch`:

```
uv sync --frozen --all-extras --dev
uv run --frozen pytest
```

The tests drive `serve()` through an MCP `ClientSession` in-process, with HTTP mocked, so they need no network. The HTML extraction tests need Node.js on `PATH` (readabilipy uses Readability.js when Node is present and a pure-Python fallback when it is not).

Coverage, measured per file with branch coverage:

```
uv run --frozen pytest --cov --cov-report=term-missing --cov-report=json
```

This writes `coverage.json` (git-ignored). The command reports coverage but does not enforce a threshold; the target is at least 90% of lines and 90% of branches for every file under `src/mcp_server_fetch`.

## Contributing

We encourage contributions to help improve mcp-server-fetch. Bug reports, ideas for new tools, enhancements to existing functionality, and documentation improvements are all valuable.

For examples of other MCP servers and implementation patterns, see:
https://github.com/modelcontextprotocol/servers

Contributions arrive as **issues, not pull requests**: the repository maintainers do the implementation. Open an issue with the [bug report or feature request form](https://github.com/modelcontextprotocol/servers/issues/new/choose), and if you have already prototyped a change, share the prompt you used rather than a diff. See [CONTRIBUTING.md](https://github.com/modelcontextprotocol/servers/blob/main/CONTRIBUTING.md) for the full policy.

## License

mcp-server-fetch is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
