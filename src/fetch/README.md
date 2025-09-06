# Fetch MCP Server

A Model Context Protocol server that provides web content fetching capabilities. This server enables LLMs to retrieve and process content from web pages, converting HTML to markdown for easier consumption.

> [!CAUTION]
> This server can access local/internal IP addresses and may represent a security risk. Exercise caution when using this MCP server to ensure this does not expose any sensitive data.

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

## Contributing

We encourage contributions to help expand and improve mcp-server-fetch. Whether you want to add new tools, enhance existing functionality, or improve documentation, your input is valuable.

For examples of other MCP servers and implementation patterns, see:
https://github.com/modelcontextprotocol/servers

Pull requests are welcome! Feel free to contribute new ideas, bug fixes, or enhancements to make mcp-server-fetch even more powerful and useful.

## License

mcp-server-fetch is licensed under the MIT License. This means you are free to use, modify, and distribute the software, subject to the terms and conditions of the MIT License. For more details, please see the LICENSE file in the project repository.
