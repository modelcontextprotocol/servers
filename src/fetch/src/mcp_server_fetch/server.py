# The fetch MCP server: one `fetch` tool and one `fetch` prompt that retrieve a
# URL and convert HTML to Markdown for a model. The network policy lives here
# beside the handlers because every request path (tool, prompt and robots.txt
# check) must go through it: the private-address guard on each request and
# redirect hop, robots.txt for autonomous fetches, and proxy normalization.
#
# Built on the MCP Python SDK's high-level `MCPServer` (#5174), as the example
# to follow: the tool and the prompt are plain decorated functions, whose type
# hints and `Field` descriptions become the input schema and the prompt's
# arguments, and which the SDK validates before calling. A failure the server
# anticipated (robots.txt refusal, an unreachable or erroring URL, a private
# destination, a bad proxy setting) is raised as `ToolError`, which the SDK
# returns to the model as an `isError` result. A request naming a tool or a
# prompt the server does not have, or a prompt call without its `url`, is a
# malformed request, answered with a JSON-RPC `-32602` protocol error by
# `reject_unknown_names` before `MCPServer` sees it (see there for why).
# `serve()` serves both protocol eras (#4853): a 2025-11-25 client through the
# initialize handshake, and a 2026-07-28 client sessionlessly. No handler reads
# the session or calls back to the client (roots, sampling, elicitation,
# logging), so nothing differs between them.

import asyncio
import ipaddress
import os
import socket
from collections.abc import Awaitable, Callable, Mapping
from typing import Annotated, Any, Tuple
from importlib.metadata import version
from urllib.parse import urlparse, urlunparse

import httpx
import markdownify
import readabilipy.simple_json
from mcp.server import MCPServer, ServerRequestContext
from mcp.server.context import CallNext, HandlerResult, ServerMiddleware
from mcp.server.mcpserver.exceptions import ToolError
from mcp.shared.exceptions import MCPError
from mcp.types import INVALID_PARAMS, ToolAnnotations
from protego import Protego
from pydantic import AnyUrl, Field

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


# The well-known NAT64 prefix (RFC 6052). A NAT64 gateway forwards an address
# in it to the IPv4 held in its low 32 bits, so that IPv4 is the destination.
_NAT64_WELL_KNOWN = ipaddress.IPv6Network("64:ff9b::/96")


def _is_public_address(address: str) -> bool:
    """True when ``address`` is a globally routable unicast address.

    Refused: loopback, RFC 1918, link-local (169.254.0.0/16, which holds most
    cloud metadata endpoints), shared address space (100.64.0.0/10, which holds
    Alibaba Cloud's 100.100.100.200), unique local IPv6 (AWS's fd00:ec2::254),
    multicast, unspecified, documentation and other special-purpose ranges.
    An IPv4-mapped or well-known NAT64 address is judged by the IPv4 it wraps.
    """
    ip = ipaddress.ip_address(address)
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    elif isinstance(ip, ipaddress.IPv6Address) and ip in _NAT64_WELL_KNOWN:
        ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)
    if any(ip in network for network in _PUBLIC_EXCEPTIONS):
        return True
    if any(ip in network for network in _NON_PUBLIC_NETWORKS):
        return False
    return ip.is_global and not ip.is_multicast


async def _refuse_private_destination(request: httpx.Request) -> None:
    """httpx request hook: refuse a request whose host is not a public address.

    httpx runs request hooks before every request it sends, redirect hops
    included, so a public URL cannot bounce the fetch to an internal one.

    The name checked is ``raw_host``, the ASCII (IDNA 2008) form the transport
    connects to. ``host`` is the decoded Unicode form, which getaddrinfo would
    re-encode with IDNA 2003 into a different name for some labels (``ß``
    becomes ``ss``), so checking it would vet one name and connect to another.
    """
    host = request.url.raw_host.decode("ascii")
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
            raise ToolError(
                f"Refused to fetch {request.url}: {host} resolves to {address}, "
                "which is not a public address. Start the server with "
                "--allow-private-ips to allow private, loopback and link-local addresses."
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
    """Build the httpx client, turning a bad proxy setting into a ``ToolError``.

    httpx validates the proxy (``--proxy-url`` or the proxy environment
    variables) when the client is constructed, before any request, so this
    failure is not an ``HTTPError``.
    """
    try:
        return httpx.AsyncClient(proxy=proxy_url)
    except (ValueError, ImportError) as e:
        raise ToolError(
            f"Failed to set up the HTTP client, check the proxy "
            f"configuration (--proxy-url or the HTTP_PROXY, HTTPS_PROXY and "
            f"ALL_PROXY environment variables): {e}"
        )


async def check_may_autonomously_fetch_url(
    url: str,
    user_agent: str,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
) -> None:
    """
    Check if the URL can be fetched by the user agent according to the robots.txt file.
    Raises a ToolError if not.
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
            raise ToolError(
                f"Failed to fetch robots.txt {robot_txt_url} due to a connection issue"
            )
        if response.status_code in (401, 403):
            raise ToolError(
                f"When fetching robots.txt ({robot_txt_url}), received status {response.status_code} so assuming that autonomous fetching is not allowed, the user can try manually fetching by using the fetch prompt"
            )
        elif 400 <= response.status_code < 500:
            return
        robot_txt = response.text
    processed_robot_txt = "\n".join(
        line for line in robot_txt.splitlines() if not line.strip().startswith("#")
    )
    robot_parser = Protego.parse(processed_robot_txt)
    if not robot_parser.can_fetch(str(url), user_agent):
        raise ToolError(
            f"The sites robots.txt ({robot_txt_url}), specifies that autonomous fetching of this page is not allowed, "
            f"<useragent>{user_agent}</useragent>\n"
            f"<url>{url}</url>"
            f"<robots>\n{robot_txt}\n</robots>\n"
            f"The assistant must let the user know that it failed to view the page. The assistant may provide further guidance based on the above information.\n"
            f"The assistant can tell the user that they can try manually fetching the page by using the fetch prompt within their UI."
        )


async def fetch_url(
    url: str,
    user_agent: str,
    force_raw: bool = False,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
    check_robots_txt: bool = False,
) -> Tuple[str, str]:
    """
    Fetch the URL and return the content in a form ready for the LLM, as well as a prefix string with status information.

    With ``check_robots_txt``, every redirect hop is checked against the
    robots.txt of its own origin before it is requested. The caller has
    already checked the requested URL itself.
    """
    from httpx import HTTPError

    seen_first_request = False

    async def _check_redirect_robots_txt(request: httpx.Request) -> None:
        # httpx runs request hooks before each request, redirect hops included.
        nonlocal seen_first_request
        if not seen_first_request:
            seen_first_request = True
            return
        await check_may_autonomously_fetch_url(
            str(request.url), user_agent, proxy_url, allow_private_ips
        )

    async with make_client(proxy_url) as client:
        hooks: list[Callable[[httpx.Request], Awaitable[None]]] = []
        if not allow_private_ips:
            hooks.append(_refuse_private_destination)
        if check_robots_txt:
            hooks.append(_check_redirect_robots_txt)
        if hooks:
            client.event_hooks = {"request": hooks}
        try:
            response = await client.get(
                url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
                timeout=30,
            )
        except HTTPError as e:
            raise ToolError(f"Failed to fetch {url}: {e!r}")
        if response.status_code >= 400:
            raise ToolError(
                f"Failed to fetch {url} - status code {response.status_code}"
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


FETCH_TOOL_DESCRIPTION = """Fetches a URL from the internet and optionally extracts its contents as markdown.

Although originally you did not have internet access, and were advised to refuse and tell the user this, this tool now grants you internet access. Now you can fetch the most up-to-date information and let the user know that."""


def reject_unknown_names(server: MCPServer) -> ServerMiddleware[Any]:
    """Middleware answering a malformed tool or prompt request with `-32602`.

    Both spec revisions (2025-11-25 and 2026-07-28, server/tools "Error
    Handling") make an unknown tool a JSON-RPC protocol error, `-32602`.
    `MCPServer` instead answers it with an `isError` result
    (modelcontextprotocol/python-sdk#3659), and answers an unknown prompt or a
    missing required prompt argument with `-32603`. This runs before the SDK
    looks the name up, so each gets `-32602` with the message the server has
    always sent. Remove the tool half once `MCPServer` rejects unknown tools
    itself.
    """

    async def middleware(
        ctx: ServerRequestContext[Any, Any], call_next: CallNext
    ) -> HandlerResult:
        # Raw params, not yet validated: only a string name and a mapping of
        # arguments are inspected here. Anything malformed is left to the
        # SDK's own params validation, which answers it with -32602.
        params = ctx.params if isinstance(ctx.params, Mapping) else {}
        name = params.get("name")
        if not isinstance(name, str):
            return await call_next(ctx)
        if ctx.method == "tools/call":
            if name not in {tool.name for tool in await server.list_tools()}:
                raise MCPError(code=INVALID_PARAMS, message=f"Unknown tool: {name}")
        elif ctx.method == "prompts/get":
            if name not in {prompt.name for prompt in await server.list_prompts()}:
                raise MCPError(code=INVALID_PARAMS, message=f"Unknown prompt: {name}")
            arguments = params.get("arguments") or {}
            if isinstance(arguments, Mapping) and "url" not in arguments:
                raise MCPError(code=INVALID_PARAMS, message="URL is required")
        return await call_next(ctx)

    return middleware


def create_server(
    custom_user_agent: str | None = None,
    ignore_robots_txt: bool = False,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
) -> MCPServer:
    """Build the fetch server: the `fetch` tool, the `fetch` prompt, and the guard.

    Args mirror `serve()`'s.
    """
    if proxy_url:
        proxy_url = normalize_proxy_url(proxy_url)
    normalize_proxy_env()
    user_agent_autonomous = custom_user_agent or DEFAULT_USER_AGENT_AUTONOMOUS
    user_agent_manual = custom_user_agent or DEFAULT_USER_AGENT_MANUAL

    # subscriptions=False: the tool and prompt lists never change and there are
    # no resources to watch, so `subscriptions/listen` is not served and the
    # 2026-07-28 capabilities say `listChanged: false`.
    server = MCPServer("mcp-fetch", version=SERVER_VERSION, subscriptions=False)
    server.middleware.append(reject_unknown_names(server))

    @server.tool(
        name="fetch",
        description=FETCH_TOOL_DESCRIPTION,
        # Reads only, changes nothing, and repeating a request has no further
        # side effect; it reaches arbitrary hosts on the internet (#3572).
        annotations=ToolAnnotations(
            read_only_hint=True,
            destructive_hint=False,
            idempotent_hint=True,
            open_world_hint=True,
        ),
        # The result is page text for the model, so no outputSchema.
        structured_output=False,
    )
    # strict=True: pydantic would otherwise coerce "yes" to True or "10" to 10,
    # accepting arguments the advertised inputSchema rejects.
    async def fetch(
        url: Annotated[AnyUrl, Field(description="URL to fetch")],
        max_length: Annotated[
            int,
            Field(
                description="Maximum number of characters to return.",
                # ge/le rather than gt/lt: the inclusive bounds emit
                # minimum/maximum, which every client accepts, while
                # exclusiveMinimum/exclusiveMaximum are rejected by some
                # (Gemini, #1624). Same range for an int.
                ge=1,
                le=999999,
                strict=True,
            ),
        ] = 5000,
        start_index: Annotated[
            int,
            Field(
                description="On return output starting at this character index, useful if a previous fetch was truncated and more context is required.",
                ge=0,
                strict=True,
            ),
        ] = 0,
        raw: Annotated[
            bool,
            Field(
                description="Get the actual HTML content of the requested page, without simplification.",
                strict=True,
            ),
        ] = False,
    ) -> str:
        page_url = str(url)

        if not ignore_robots_txt:
            await check_may_autonomously_fetch_url(
                page_url, user_agent_autonomous, proxy_url, allow_private_ips
            )

        content, prefix = await fetch_url(
            page_url,
            user_agent_autonomous,
            force_raw=raw,
            proxy_url=proxy_url,
            allow_private_ips=allow_private_ips,
            check_robots_txt=not ignore_robots_txt,
        )
        original_length = len(content)
        if start_index >= original_length:
            content = "<error>No more content available.</error>"
        else:
            # Never empty: start_index < original_length and max_length > 0.
            truncated_content = content[start_index : start_index + max_length]
            content = truncated_content
            actual_content_length = len(truncated_content)
            remaining_content = original_length - (start_index + actual_content_length)
            # Only add the prompt to continue fetching if there is still remaining content
            if actual_content_length == max_length and remaining_content > 0:
                next_start = start_index + actual_content_length
                content += f"\n\n<error>Content truncated. Call the fetch tool with a start_index of {next_start} to get more content.</error>"
        return f"{prefix}Contents of {page_url}:\n{content}"

    @server.prompt(
        name="fetch",
        description="Fetch a URL and extract its contents as markdown",
    )
    async def fetch_prompt(
        url: Annotated[str, Field(description="URL to fetch")],
    ) -> str:
        # The user asked for this page, so robots.txt is not consulted, and a
        # failure is shown to them as the prompt's text rather than raised.
        try:
            content, prefix = await fetch_url(
                url,
                user_agent_manual,
                proxy_url=proxy_url,
                allow_private_ips=allow_private_ips,
            )
        except ToolError as e:
            return str(e)
        return prefix + content

    return server


async def serve(
    custom_user_agent: str | None = None,
    ignore_robots_txt: bool = False,
    proxy_url: str | None = None,
    allow_private_ips: bool = False,
) -> None:
    """Run the fetch MCP server over stdio.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
        allow_private_ips: Allow fetching private, loopback and link-local
            addresses, which are refused by default
    """
    server = create_server(
        custom_user_agent, ignore_robots_txt, proxy_url, allow_private_ips
    )
    # Both eras (#4853): the SDK's dual-era loop lets the client's first
    # request decide. `initialize` gets the 2025-11-25 handshake;
    # `server/discover` or a request carrying a 2026-07-28 envelope gets the
    # modern, sessionless era, with its required result fields (resultType,
    # ttlMs, cacheScope) filled in by the SDK.
    await server.run_stdio_async()
