# The fetch MCP server: one `fetch` tool and one `fetch` prompt that retrieve a
# URL and convert HTML to Markdown for a model. The network policy lives here
# beside the handlers because every request path (tool, prompt and robots.txt
# check) must go through it: the private-address guard on each request and
# redirect hop, robots.txt for autonomous fetches, and proxy normalization.
#
# Built on the MCP Python SDK v2's low-level `Server` (#4851). That SDK no
# longer validates tool arguments or folds tool exceptions into `isError`
# results, so `call_tool` does both with SDK v1's messages, and `serve()` runs
# the legacy (2025-11-25) handshake loop only, keeping the wire as it was on v1.
# Serving 2026-07-28 is #4853.

import asyncio
import ipaddress
import os
import socket
from typing import Annotated, Any, Tuple
from importlib.metadata import version
from urllib.parse import urlparse, urlunparse

import httpx
import jsonschema
import markdownify
import readabilipy.simple_json
from mcp.shared.exceptions import MCPError
from mcp.server import Server, ServerRequestContext
from mcp.server.runner import serve_loop
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolRequestParams,
    CallToolResult,
    ContentBlock,
    GetPromptRequestParams,
    GetPromptResult,
    ListPromptsResult,
    ListToolsResult,
    PaginatedRequestParams,
    Prompt,
    PromptArgument,
    PromptMessage,
    TextContent,
    Tool,
    INVALID_PARAMS,
    INTERNAL_ERROR,
)
from protego import Protego
from pydantic import BaseModel, Field, AnyUrl

# The version this server reports in serverInfo, read from the installed
# distribution's metadata (pyproject.toml) so it cannot drift from the
# published version (#360). Without it the SDK reports its own `mcp` version.
SERVER_VERSION = version("mcp-server-fetch")

DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"


async def _resolve_host(host: str) -> list[str]:
    """Resolve ``host`` to every address the OS would hand the connector.

    getaddrinfo also parses IP literals, including the shorthand forms such as
    ``2130706433`` and ``127.1`` that a connector accepts as loopback.
    """
    infos = await asyncio.get_running_loop().getaddrinfo(host, None)
    return [str(info[4][0]) for info in infos]


# IANA special-purpose ranges that are not public destinations. ``is_global``
# covers most of them, but its tables were corrected only in recent releases
# (3.13, and patch releases of 3.11 and 3.12: before them 192.0.0.0/24 and
# 64:ff9b:1::/48, for example, read as global), so the ranges are listed here
# too, to give the same answer on every supported Python.
_NON_PUBLIC_NETWORKS = tuple(
    ipaddress.ip_network(network)
    for network in (
        "0.0.0.0/8",
        "10.0.0.0/8",
        "100.64.0.0/10",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.0.0.0/24",
        "192.0.2.0/24",
        "192.88.99.0/24",
        "192.168.0.0/16",
        "198.18.0.0/15",
        "198.51.100.0/24",
        "203.0.113.0/24",
        "240.0.0.0/4",
        "::/128",
        "::1/128",
        "64:ff9b:1::/48",
        "100::/64",
        "2001::/23",
        "2001:db8::/32",
        "2002::/16",
        "fc00::/7",
        "fe80::/10",
    )
)


# Globally reachable assignments inside the ranges above (anycast services
# and the like), matching the exceptions in current CPython's tables.
_PUBLIC_EXCEPTIONS = tuple(
    ipaddress.ip_network(network)
    for network in (
        "192.0.0.9/32",
        "192.0.0.10/32",
        "2001:1::1/128",
        "2001:1::2/128",
        "2001:3::/32",
        "2001:4:112::/48",
        "2001:20::/28",
        "2001:30::/28",
    )
)


def _is_public_address(address: str) -> bool:
    """True when ``address`` is a globally routable unicast address.

    Refused: loopback, RFC 1918, link-local (169.254.0.0/16, which holds most
    cloud metadata endpoints), shared address space (100.64.0.0/10, which holds
    Alibaba Cloud's 100.100.100.200), unique local IPv6 (AWS's fd00:ec2::254),
    multicast, unspecified, documentation and other special-purpose ranges.
    """
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if any(ip in network for network in _PUBLIC_EXCEPTIONS):
        return True
    if any(ip in network for network in _NON_PUBLIC_NETWORKS):
        return False
    return ip.is_global and not ip.is_multicast


async def _refuse_private_destination(request: httpx.Request) -> None:
    """httpx request hook: refuse a request whose host is not a public address.

    httpx runs request hooks before every request it sends, redirect hops
    included, so a public URL cannot bounce the fetch to an internal one.
    """
    host = request.url.host
    if not host:
        return  # httpx rejects a URL with no host itself.
    try:
        addresses = await _resolve_host(host)
    except socket.gaierror:
        # Unresolvable here: a direct connection fails on its own, and a proxy
        # resolves the name on its side.
        return
    for address in addresses:
        if not _is_public_address(address):
            raise MCPError(
                code=INVALID_PARAMS,
                message=f"Refused to fetch {request.url}: {host} resolves to {address}, "
                "which is not a public address. Start the server with "
                "--allow-private-ips to allow private, loopback and link-local addresses.",
            )


def extract_content_from_html(html: str) -> str:
    """Extract and convert HTML content to Markdown format.

    Args:
        html: Raw HTML content to process

    Returns:
        Simplified markdown version of the content
    """
    ret = readabilipy.simple_json.simple_json_from_html_string(
        html, use_readability=True
    )
    failed = "<error>Page failed to be simplified from HTML</error>"
    if not ret["content"]:
        return failed
    content = markdownify.markdownify(
        ret["content"],
        heading_style=markdownify.ATX,
    )
    # Without Node, readabilipy's pure-Python extractor never returns empty
    # content: an empty page comes back as "<div></div>", which converts to an
    # empty string. Report that as the same simplification failure the Node
    # path reports, rather than letting it reach pagination as an exhausted page.
    if not content.strip():
        return failed
    return content


def get_robots_txt_url(url: str) -> str:
    """Get the robots.txt URL for a given website URL.

    Args:
        url: Website URL to get robots.txt for

    Returns:
        URL of the robots.txt file
    """
    # Parse the URL into components
    parsed = urlparse(url)

    # Reconstruct the base URL with just scheme, netloc, and /robots.txt path
    robots_url = urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))

    return robots_url


PROXY_ENV_VARS = (
    "HTTP_PROXY",
    "http_proxy",
    "HTTPS_PROXY",
    "https_proxy",
    "ALL_PROXY",
    "all_proxy",
)


def normalize_proxy_url(proxy_url: str) -> str:
    """Rewrite the ``socks://`` alias, which httpx rejects, to ``socks5://``.

    Desktop proxy settings often export ``socks://host:port``; httpx only
    accepts ``socks5://``. Every other value is returned unchanged.
    """
    if proxy_url.lower().startswith("socks://"):
        return "socks5://" + proxy_url[len("socks://") :]
    return proxy_url


def normalize_proxy_env() -> None:
    """Apply ``normalize_proxy_url`` to the proxy variables httpx reads."""
    for name in PROXY_ENV_VARS:
        value = os.environ.get(name)
        if value:
            os.environ[name] = normalize_proxy_url(value)


def make_client(proxy_url: str | None) -> httpx.AsyncClient:
    """Build the httpx client, turning a bad proxy setting into a tool error.

    httpx validates the proxy (``--proxy-url`` or the proxy environment
    variables) when the client is constructed, before any request, so this
    failure is not an ``HTTPError``.
    """
    try:
        return httpx.AsyncClient(proxy=proxy_url)
    except (ValueError, ImportError) as e:
        raise MCPError(
            code=INTERNAL_ERROR,
            message=f"Failed to set up the HTTP client, check the proxy "
            f"configuration (--proxy-url or the HTTP_PROXY, HTTPS_PROXY and "
            f"ALL_PROXY environment variables): {e}",
        )


async def check_may_autonomously_fetch_url(
    url: str,
    user_agent: str,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
) -> None:
    """
    Check if the URL can be fetched by the user agent according to the robots.txt file.
    Raises an MCPError if not.
    """
    from httpx import HTTPError

    robot_txt_url = get_robots_txt_url(url)

    async with make_client(proxy_url) as client:
        if not allow_private_ips:
            client.event_hooks = {"request": [_refuse_private_destination]}
        try:
            response = await client.get(
                robot_txt_url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
            )
        except HTTPError:
            raise MCPError(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch robots.txt {robot_txt_url} due to a connection issue",
            )
        if response.status_code in (401, 403):
            raise MCPError(
                code=INTERNAL_ERROR,
                message=f"When fetching robots.txt ({robot_txt_url}), received status {response.status_code} so assuming that autonomous fetching is not allowed, the user can try manually fetching by using the fetch prompt",
            )
        elif 400 <= response.status_code < 500:
            return
        robot_txt = response.text
    processed_robot_txt = "\n".join(
        line for line in robot_txt.splitlines() if not line.strip().startswith("#")
    )
    robot_parser = Protego.parse(processed_robot_txt)
    if not robot_parser.can_fetch(str(url), user_agent):
        raise MCPError(
            code=INTERNAL_ERROR,
            message=f"The sites robots.txt ({robot_txt_url}), specifies that autonomous fetching of this page is not allowed, "
            f"<useragent>{user_agent}</useragent>\n"
            f"<url>{url}</url>"
            f"<robots>\n{robot_txt}\n</robots>\n"
            f"The assistant must let the user know that it failed to view the page. The assistant may provide further guidance based on the above information.\n"
            f"The assistant can tell the user that they can try manually fetching the page by using the fetch prompt within their UI.",
        )


async def fetch_url(
    url: str,
    user_agent: str,
    force_raw: bool = False,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
) -> Tuple[str, str]:
    """
    Fetch the URL and return the content in a form ready for the LLM, as well as a prefix string with status information.
    """
    from httpx import HTTPError

    async with make_client(proxy_url) as client:
        if not allow_private_ips:
            client.event_hooks = {"request": [_refuse_private_destination]}
        try:
            response = await client.get(
                url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
                timeout=30,
            )
        except HTTPError as e:
            raise MCPError(code=INTERNAL_ERROR, message=f"Failed to fetch {url}: {e!r}")
        if response.status_code >= 400:
            raise MCPError(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch {url} - status code {response.status_code}",
            )

        page_raw = response.text

    content_type = response.headers.get("content-type", "")
    is_page_html = (
        "<html" in page_raw[:100] or "text/html" in content_type or not content_type
    )

    if is_page_html and not force_raw:
        return extract_content_from_html(page_raw), ""

    return (
        page_raw,
        f"Content type {content_type} cannot be simplified to markdown, but here is the raw content:\n",
    )


class Fetch(BaseModel):
    """Parameters for fetching a URL."""

    url: Annotated[AnyUrl, Field(description="URL to fetch")]
    max_length: Annotated[
        int,
        Field(
            default=5000,
            description="Maximum number of characters to return.",
            # ge/le rather than gt/lt: the inclusive bounds emit minimum/maximum,
            # which every client accepts, while exclusiveMinimum/exclusiveMaximum
            # are rejected by some (Gemini, #1624). Same range for an int.
            ge=1,
            le=999999,
        ),
    ]
    start_index: Annotated[
        int,
        Field(
            default=0,
            description="On return output starting at this character index, useful if a previous fetch was truncated and more context is required.",
            ge=0,
        ),
    ]
    raw: Annotated[
        bool,
        Field(
            default=False,
            description="Get the actual HTML content of the requested page, without simplification.",
        ),
    ]


def tool_error(message: str) -> CallToolResult:
    """A tool call that failed, as an `isError` result the model can read."""
    return CallToolResult(
        content=[TextContent(type="text", text=message)], is_error=True
    )


async def serve(
    custom_user_agent: str | None = None,
    ignore_robots_txt: bool = False,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
) -> None:
    """Run the fetch MCP server.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
        allow_private_ips: Allow fetching private, loopback and link-local
            addresses, which are refused by default
    """
    if proxy_url:
        proxy_url = normalize_proxy_url(proxy_url)
    normalize_proxy_env()
    user_agent_autonomous = custom_user_agent or DEFAULT_USER_AGENT_AUTONOMOUS
    user_agent_manual = custom_user_agent or DEFAULT_USER_AGENT_MANUAL

    tool = Tool(
        name="fetch",
        description="""Fetches a URL from the internet and optionally extracts its contents as markdown.

Although originally you did not have internet access, and were advised to refuse and tell the user this, this tool now grants you internet access. Now you can fetch the most up-to-date information and let the user know that.""",
        input_schema=Fetch.model_json_schema(),
    )

    async def list_tools(
        ctx: ServerRequestContext, params: PaginatedRequestParams | None
    ) -> ListToolsResult:
        return ListToolsResult(tools=[tool])

    async def list_prompts(
        ctx: ServerRequestContext, params: PaginatedRequestParams | None
    ) -> ListPromptsResult:
        return ListPromptsResult(
            prompts=[
                Prompt(
                    name="fetch",
                    description="Fetch a URL and extract its contents as markdown",
                    arguments=[
                        PromptArgument(
                            name="url", description="URL to fetch", required=True
                        )
                    ],
                )
            ]
        )

    async def run_tool(name: str, arguments: dict[str, Any]) -> list[ContentBlock]:
        if name != "fetch":
            raise ValueError(f"Unknown tool: {name}")
        try:
            args = Fetch(**arguments)
        except ValueError as e:
            raise MCPError(code=INVALID_PARAMS, message=str(e))

        url = str(args.url)

        if not ignore_robots_txt:
            await check_may_autonomously_fetch_url(
                url, user_agent_autonomous, proxy_url, allow_private_ips
            )

        content, prefix = await fetch_url(
            url,
            user_agent_autonomous,
            force_raw=args.raw,
            proxy_url=proxy_url,
            allow_private_ips=allow_private_ips,
        )
        original_length = len(content)
        if args.start_index >= original_length:
            content = "<error>No more content available.</error>"
        else:
            # Never empty: start_index < original_length and max_length > 0.
            truncated_content = content[
                args.start_index : args.start_index + args.max_length
            ]
            content = truncated_content
            actual_content_length = len(truncated_content)
            remaining_content = original_length - (
                args.start_index + actual_content_length
            )
            # Only add the prompt to continue fetching if there is still remaining content
            if actual_content_length == args.max_length and remaining_content > 0:
                next_start = args.start_index + actual_content_length
                content += f"\n\n<error>Content truncated. Call the fetch tool with a start_index of {next_start} to get more content.</error>"
        return [TextContent(type="text", text=f"{prefix}Contents of {url}:\n{content}")]

    async def call_tool(
        ctx: ServerRequestContext, params: CallToolRequestParams
    ) -> CallToolResult:
        # SDK v2's low-level server neither validates arguments nor turns a
        # handler exception into an isError result, both of which SDK v1 did.
        # Both are done here, with v1's messages, so the wire is unchanged.
        arguments = params.arguments or {}
        if params.name == tool.name:
            try:
                jsonschema.validate(instance=arguments, schema=tool.input_schema)
            except jsonschema.ValidationError as e:
                return tool_error(f"Input validation error: {e.message}")
        try:
            return CallToolResult(content=await run_tool(params.name, arguments))
        except Exception as e:
            return tool_error(str(e))

    async def get_prompt(
        ctx: ServerRequestContext, params: GetPromptRequestParams
    ) -> GetPromptResult:
        name, arguments = params.name, params.arguments
        if name != "fetch":
            raise MCPError(code=INVALID_PARAMS, message=f"Unknown prompt: {name}")
        if not arguments or "url" not in arguments:
            raise MCPError(code=INVALID_PARAMS, message="URL is required")

        url = arguments["url"]

        try:
            content, prefix = await fetch_url(
                url,
                user_agent_manual,
                proxy_url=proxy_url,
                allow_private_ips=allow_private_ips,
            )
            # TODO: after SDK bug is addressed, don't catch the exception
        except MCPError as e:
            return GetPromptResult(
                description=f"Failed to fetch {url}",
                messages=[
                    PromptMessage(
                        role="user",
                        content=TextContent(type="text", text=str(e)),
                    )
                ],
            )
        return GetPromptResult(
            description=f"Contents of {url}",
            messages=[
                PromptMessage(
                    role="user", content=TextContent(type="text", text=prefix + content)
                )
            ],
        )

    server = Server(
        "mcp-fetch",
        version=SERVER_VERSION,
        on_list_tools=list_tools,
        on_list_prompts=list_prompts,
        on_call_tool=call_tool,
        on_get_prompt=get_prompt,
    )

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        # Legacy era only. Server.run() would also serve 2026-07-28 (its
        # dual-era loop answers server/discover and per-request envelopes);
        # adopting that era is #4853, so this port (#4851) serves the
        # handshake loop alone and keeps the wire unchanged.
        async with server.lifespan(server) as lifespan_state:
            await serve_loop(
                server,
                read_stream,
                write_stream,
                lifespan_state=lifespan_state,
                init_options=options,
            )
