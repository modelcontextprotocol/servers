# Fetch MCP Server

<!-- mcp-name: io.github.modelcontextprotocol/server-fetch -->

A Model Context Protocol server that provides web content fetching capabilities. This server enables LLMs to retrieve and process content from web pages, converting HTML to markdown for easier consumption.

Source: https://github.com/modelcontextprotocol/servers/tree/main/src/fetch

Requires MCP Python SDK 2.x (`mcp>=2.3,<3`).

> [!CAUTION]
> This server can access local/internal IP addresses and may represent a security risk. Exercise caution when using this MCP server to ensure this does not expose any sensitive data.
>
> By default the server refuses to fetch private, loopback, link-local and other non-public addresses, including cloud metadata endpoints such as `169.254.169.254`, and checks every redirect hop the same way. The `--allow-private-ips` argument turns this guard off; see [Customization - Private addresses](#customization---private-addresses). The guard checks the addresses a hostname resolves to before each request, so it does not protect against DNS rebinding between that check and the connection, and a hostname the server cannot resolve itself (one only a proxy can resolve) is not checked.

The fetch tool will truncate the response, but by using the `start_index` argument, you can specify where to start the content extraction. This lets models read a webpage in chunks, until they find the information they need.

The markdown of an HTML page opens with the page's title as a `#` heading (its `og:title`, else its `<h1>` when the `<title>` holds it, else its `<title>` or `<h1>`), because the extraction drops a heading that repeats the title. It is not added when the markdown already opens with it, to a raw result, or to a page that failed to simplify.

### Available Tools

- `fetch` - Fetches a URL from the internet and extracts its contents as markdown.
    - `url` (string, required): URL to fetch
    - `max_length` (integer, optional): Maximum number of characters to return (default: 5000)
    - `start_index` (integer, optional): Start content from this character index (default: 0)
    - `raw` (boolean, optional): Get raw content without markdown conversion (default: false)
    - `timeout_ms` (integer, optional): HTTP request timeout for this call, in milliseconds, from 100 to 600000 (default: the server's timeout, 30000 unless configured; see [Customization - Timeout](#customization---timeout))
    - Annotations: `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true` (it only reads, and it reaches arbitrary hosts on the internet)

### Prompts

- **fetch**
  - Fetch a URL and extract its contents as markdown
  - Arguments:
    - `url` (string, required): URL to fetch

### Errors

- A failed fetch (a robots.txt refusal, an unreachable page, an HTTP error status, a refused private address, an unusable proxy setting) and arguments that do not match the tool's schema are returned as a tool result with `isError: true`, whose text starts `Error executing tool fetch:` and says what went wrong, so the model can read it and decide what to do.
- Calling a tool the server does not have is a JSON-RPC protocol error, `-32602` (`Unknown tool: <name>`), as the specification requires. So is getting a prompt it does not have (`Unknown prompt: <name>`), or the `fetch` prompt without its `url` (`URL is required`) or with a `url` that is not a valid URL (`Invalid URL '<url>': <reason>`).
- When the `fetch` prompt's fetch fails, the prompt still returns: its message holds the reason the fetch failed.

The server is built on the MCP Python SDK's high-level `MCPServer`: the tool and the prompt are decorated functions, and their type hints and field descriptions are the input schema and the prompt's arguments.

### Content negotiation

The tool and the prompt ask for markdown first, with the request header `Accept: text/markdown, text/html;q=0.9, */*;q=0.8`. A site that serves markdown through content negotiation sends it directly, and a `text/markdown` response is returned as-is: it is not simplified and carries no raw-content notice. A site that ignores the header sends what it always did, and HTML is simplified to markdown as before. A `raw` fetch keeps the default `Accept: */*`, so it gets whatever the site serves by default (for a web page, its HTML), unsimplified; a markdown response it receives anyway is returned as-is too.

### Protocol versions

The server speaks both eras of the Model Context Protocol over stdio, with nothing to configure: a **2026-07-28** client (discovered with `server/discover`, no session) and a **2025-11-25** client (the `initialize` handshake). The client's first request decides which. Tools and prompts behave the same in both. Methods the 2026-07-28 specification removes, such as `ping`, are answered only on a 2025-11-25 connection.

## Installation

Optionally: Install node.js, this will cause the fetch server to use a different HTML simplifier that is more robust.
Its JavaScript dependencies are then installed with npm on first use, which contacts the npm registry.
To keep the server from ever starting Node.js, see [Customization - HTML extraction](#customization---html-extraction).

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
the request was user initiated (via a prompt). Every redirect hop of a tool fetch is checked against the robots.txt of
the host it leads to, the same way as the requested URL. If the robots.txt request fails to connect, or is answered
with 401, 403 or a server error (5xx), the tool refuses the fetch rather than reading the response as rules (RFC 9309
treats a 5xx robots.txt as complete disallow); any other 4xx is treated as no rules. This can be disabled by adding the
argument `--ignore-robots-txt` to the `args` list in the configuration.

### Customization - Private addresses

By default, the server refuses any request, including a redirect hop or a robots.txt fetch, whose host resolves to an
address that is not globally routable: loopback (`127.0.0.0/8`, `::1`), private (`10.0.0.0/8`, `172.16.0.0/12`,
`192.168.0.0/16`, `fc00::/7`), link-local (`169.254.0.0/16`, `fe80::/10`), shared address space (`100.64.0.0/10`),
multicast, unspecified, documentation and the other IANA special-purpose ranges. An IPv4-mapped (`::ffff:0:0/96`) or
well-known NAT64 (`64:ff9b::/96`) address is judged by the IPv4 address it carries; a deprecated IPv4-compatible
address (`::/96`, such as `::127.0.0.1`) is refused whatever IPv4 it carries. A hostname is refused if any one of its addresses is in those ranges.
The client receives an error naming the refused address.

To fetch from local or internal hosts (a development server, an intranet page), add the argument
`--allow-private-ips` to the `args` list in the configuration.

### Customization - Allowed hosts

By default the server may fetch from any host (subject to the private-address guard above). To restrict it to the
hosts you name, add `--allowed-hosts` followed by one or more entries to the `args` list (the argument can also be
repeated). Each entry is one of:

- an exact host name, such as `docs.python.org`, which matches that host only, not its subdomains;
- `*.` followed by a domain, such as `*.github.com`, which matches every subdomain of it at any depth
  (`api.github.com`, `a.b.github.com`) but not `github.com` itself: list both to allow both;
- an IP address, such as `203.0.113.7` or `2001:db8::7`, which matches a URL that uses that address literally.

Matching ignores case and a trailing dot, and an internationalized name may be given in either its Unicode or its
`xn--` form. An entry names a host only, so it carries no scheme, port or path. The list is checked before every request
the server sends, by the host name in the URL rather than by the addresses it resolves to: the requested page, its
robots.txt check, and every redirect hop of either, from the tool and from the prompt alike. A request to any other host
is refused before it is sent, and the client receives an error naming the refused host.

The allowlist and the private-address guard are separate checks, and a request must pass both. Listing an internal
host, such as `localhost` or `10.0.0.5`, does not by itself let the server reach it: that also needs
`--allow-private-ips`, which in turn does not lift the allowlist.

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch", "--allowed-hosts", "docs.python.org", "*.wikipedia.org"]
    }
  }
}
```

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

### Customization - Timeout

The HTTP request for the page waits up to 30 seconds (30000 ms) by default: to connect, and then for each read of the
response. It bounds each of those separately, not the whole download, so a large page that keeps arriving is not cut
off. A request that times out fails with a tool error saying how long it waited.

The timeout can be set at three levels, the most specific winning:

1. The `fetch` tool's `timeout_ms` argument, for one call (for example `120000` for a large download, or `5000` to
   fail fast).
2. The argument `--timeout-ms=60000` in the `args` list in the configuration, for every call.
3. The `FETCH_TIMEOUT_MS` environment variable (for example `"env": {"FETCH_TIMEOUT_MS": "60000"}` in the
   configuration), for every call when `--timeout-ms` is not given.

The server-wide value also applies to the `fetch` prompt, and is the default the tool advertises for `timeout_ms`.
Every level takes a whole number of milliseconds from 100 to 600000 (10 minutes); the server refuses to start with a
value outside that range, and the tool refuses such a `timeout_ms`. This is the HTTP request timeout only: the
robots.txt check before an autonomous fetch keeps its own 5-second timeout, and HTML extraction is not covered.

### Customization - Proxy

The server can be configured to use a proxy by using the `--proxy-url` argument.

Without `--proxy-url`, the server uses the proxy in the standard `HTTP_PROXY`, `HTTPS_PROXY` and `ALL_PROXY`
environment variables (honoring `NO_PROXY`). Both `http(s)://` and SOCKS5 proxies are supported (SOCKS support is
installed with the server). A `socks://` proxy URL, as many desktop proxy settings export it, is treated as
`socks5://`. A proxy setting the server cannot use makes each fetch fail with a tool error that says so.

### Customization - HTML extraction

HTML is converted to Markdown with [readabilipy](https://github.com/alan-turing-institute/ReadabiliPy). When Node.js 14
or newer is on the `PATH`, the server runs Mozilla's Readability.js (readabilipy's `ExtractArticle.js`) in a Node.js
subprocess; otherwise it uses readabilipy's pure-Python extractor, which keeps headings and text but drops link
targets. The subprocess runs off the server's event loop, so other requests are answered while it works, and under a
30 second timeout: a Node.js that hangs is killed, together with anything it started, and that page is extracted with
the pure-Python extractor instead. If Readability.js fails in any other way, the same fallback is used. Every reason
for a fallback is written to stderr (the server's log), never to stdout, which carries the protocol.

**Readability.js's dependencies are installed with npm on first use, which reaches the npm registry.** readabilipy
ships only the `package.json` for its JavaScript (`@mozilla/readability`, `jsdom`, `minimist`). The first time the
server extracts HTML with Node.js on the `PATH` and those packages missing, it runs `npm install` in readabilipy's
`javascript` directory, inside that tool call, so:

- `registry.npmjs.org` belongs in the egress allowlist of a deployment that restricts outbound traffic, unless the
  packages are installed ahead of time (below) or Readability.js is turned off. Without it the install fails and the
  server uses the pure-Python extractor.
- The JavaScript that runs is resolved from readabilipy's unpinned version ranges when it is installed, so pinning
  `mcp-server-fetch` does not pin it.
- The install runs at most once per server process, under a 120 second timeout. Its output goes to stderr. If it
  fails, or Node.js is missing or older than 14, the server uses the pure-Python extractor until it is restarted.

To install the packages ahead of time (in a container image, say), run `npm install` in readabilipy's `javascript`
directory from the Python environment the server runs in; the server then finds them and installs nothing:

```bash
cd "$(python -c "import os, readabilipy; print(os.path.join(os.path.dirname(readabilipy.__file__), 'javascript'))")"
npm install --no-audit --no-fund
```

Readability.js discards hidden elements. Pages rendered progressively on the server often send a visible loading
shell, then the real content in a container hidden (`display: none`, `visibility: hidden`, `hidden`) until scripts
run in the browser. When a hidden element other than navigation or similar page furniture holds more text than
Readability.js extracted, the server unhides it and runs Readability.js again, keeping that result only if it has more
text. Other pages are extracted once, exactly as before.

To always use the pure-Python extractor, add the argument `--no-readability-js` to the `args` list in the
configuration. The server then never starts Node.js (or npm), whether or not it is installed, and never contacts the
npm registry.

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

Readability.js works on Windows as it does elsewhere: the server finds Node.js and npm (`npm.cmd`) on the `PATH`, and
installs Readability.js's dependencies on first use as described in
[Customization - HTML extraction](#customization---html-extraction).

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

The tests drive `serve()` through an MCP `ClientSession` in-process (and, in `tests/test_eras.py`, through a `Client` as a 2026-07-28 and as a 2025-11-25 client), with HTTP mocked, so they need no network. The HTML extraction tests need Node.js and npm on `PATH` (the server uses Readability.js when Node is present and a pure-Python fallback when it is not), and the first run installs Readability.js's dependencies from the npm registry.

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
