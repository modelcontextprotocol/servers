import asyncio
import ipaddress
import socket
from typing import Annotated, Tuple
from urllib.parse import urlparse, urlunparse

import markdownify
import readabilipy.simple_json
from mcp.shared.exceptions import McpError
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    ErrorData,
    GetPromptResult,
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

DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"


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
    if not ret["content"]:
        return "<error>Page failed to be simplified from HTML</error>"
    content = markdownify.markdownify(
        ret["content"],
        heading_style=markdownify.ATX,
    )
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


# Cap on the number of redirect hops we will follow (and re-validate).
MAX_REDIRECTS = 20

# HTTP status codes that indicate a redirect with a Location header.
REDIRECT_STATUS_CODES = (301, 302, 303, 307, 308)

# Carrier-grade NAT range: not globally reachable, but not flagged by
# is_private on Python < 3.13, so it is checked explicitly.
_CGNAT_NETWORK = ipaddress.ip_network("100.64.0.0/10")


def _is_blocked_ip(
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address,
) -> bool:
    """Return True if an IP address is not safe to fetch (SSRF target).

    Blocks loopback, private (RFC1918), carrier-grade NAT, link-local
    (including the cloud metadata address 169.254.169.254), unique-local,
    multicast, reserved, and unspecified addresses.
    """
    # Unwrap IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1) so the
    # underlying IPv4 address is classified rather than the wrapper.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    # Unwrap deprecated IPv4-compatible IPv6 addresses (::a.b.c.d, ::/96),
    # other than :: and ::1 which are classified as unspecified/loopback
    # below, so the embedded IPv4 address (e.g. ::127.0.0.1) is checked.
    elif (
        isinstance(ip, ipaddress.IPv6Address)
        and int(ip) >> 32 == 0
        and int(ip) not in (0, 1)
    ):
        ip = ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF)

    if isinstance(ip, ipaddress.IPv4Address) and ip in _CGNAT_NETWORK:
        return True

    return (
        ip.is_loopback
        or ip.is_private
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def _resolve_host_ips(
    host: str, port: int | None, scheme: str
) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Resolve a host to the IP addresses it points at.

    If the host is already an IP literal it is returned directly; otherwise
    DNS resolution is performed and every returned address is checked.
    """
    try:
        return [ipaddress.ip_address(host)]
    except ValueError:
        pass

    default_port = 443 if scheme == "https" else 80
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(
            host, port or default_port, type=socket.SOCK_STREAM
        )
    except socket.gaierror as e:
        raise McpError(ErrorData(
            code=INTERNAL_ERROR,
            message=f"Failed to resolve host {host}: {e}",
        ))

    ips: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for info in infos:
        try:
            ips.append(ipaddress.ip_address(info[4][0]))
        except ValueError:
            continue
    return ips


async def _validate_url_is_safe(url: str) -> None:
    """Guard a URL against SSRF before it is fetched.

    Rejects non-http(s) schemes and any URL whose host resolves to a
    non-public IP address. Servers started with --allow-internal-ips skip
    this check entirely.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Cannot fetch {url}: only http and https URLs are supported.",
        ))

    host = parsed.hostname
    if not host:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Cannot fetch {url}: URL has no host.",
        ))

    for ip in await _resolve_host_ips(host, parsed.port, parsed.scheme):
        if _is_blocked_ip(ip):
            raise McpError(ErrorData(
                code=INVALID_PARAMS,
                message=(
                    f"Cannot fetch {url}: host {host} resolves to non-public IP "
                    f"address {ip}. Fetching loopback, private, link-local, and "
                    f"cloud-metadata addresses is blocked to prevent SSRF. Start "
                    f"the server with --allow-internal-ips to override this."
                ),
            ))


async def _get_following_redirects(
    client,
    url: str,
    *,
    headers: dict,
    timeout: float,
    allow_internal_ips: bool,
):
    """GET a URL, following redirects manually so every hop is re-validated.

    httpx's automatic redirect handling never re-checks the destination, so
    a public URL that 302-redirects to an internal address would bypass the
    guard. Following redirects manually lets us validate each hop.
    """
    from httpx import URL

    current_url = url
    for _ in range(MAX_REDIRECTS + 1):
        if not allow_internal_ips:
            await _validate_url_is_safe(current_url)
        response = await client.get(
            current_url,
            follow_redirects=False,
            headers=headers,
            timeout=timeout,
        )
        if response.status_code in REDIRECT_STATUS_CODES:
            location = response.headers.get("location")
            if not location:
                return response
            current_url = str(URL(current_url).join(location))
            continue
        return response

    raise McpError(ErrorData(
        code=INTERNAL_ERROR,
        message=f"Cannot fetch {url}: exceeded the maximum of {MAX_REDIRECTS} redirects.",
    ))


async def check_may_autonomously_fetch_url(url: str, user_agent: str, proxy_url: str | None = None, allow_internal_ips: bool = False) -> None:
    """
    Check if the URL can be fetched by the user agent according to the robots.txt file.
    Raises a McpError if not.
    """
    from httpx import AsyncClient, HTTPError

    robot_txt_url = get_robots_txt_url(url)

    async with AsyncClient(proxy=proxy_url) as client:
        try:
            response = await _get_following_redirects(
                client,
                robot_txt_url,
                headers={"User-Agent": user_agent},
                timeout=30,
                allow_internal_ips=allow_internal_ips,
            )
        except HTTPError:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch robots.txt {robot_txt_url} due to a connection issue",
            ))
        if response.status_code in (401, 403):
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"When fetching robots.txt ({robot_txt_url}), received status {response.status_code} so assuming that autonomous fetching is not allowed, the user can try manually fetching by using the fetch prompt",
            ))
        elif 400 <= response.status_code < 500:
            return
        robot_txt = response.text
    processed_robot_txt = "\n".join(
        line for line in robot_txt.splitlines() if not line.strip().startswith("#")
    )
    robot_parser = Protego.parse(processed_robot_txt)
    if not robot_parser.can_fetch(str(url), user_agent):
        raise McpError(ErrorData(
            code=INTERNAL_ERROR,
            message=f"The sites robots.txt ({robot_txt_url}), specifies that autonomous fetching of this page is not allowed, "
            f"<useragent>{user_agent}</useragent>\n"
            f"<url>{url}</url>"
            f"<robots>\n{robot_txt}\n</robots>\n"
            f"The assistant must let the user know that it failed to view the page. The assistant may provide further guidance based on the above information.\n"
            f"The assistant can tell the user that they can try manually fetching the page by using the fetch prompt within their UI.",
        ))


async def fetch_url(
    url: str, user_agent: str, force_raw: bool = False, proxy_url: str | None = None, allow_internal_ips: bool = False
) -> Tuple[str, str]:
    """
    Fetch the URL and return the content in a form ready for the LLM, as well as a prefix string with status information.
    """
    from httpx import AsyncClient, HTTPError

    async with AsyncClient(proxy=proxy_url) as client:
        try:
            response = await _get_following_redirects(
                client,
                url,
                headers={"User-Agent": user_agent},
                timeout=30,
                allow_internal_ips=allow_internal_ips,
            )
        except HTTPError as e:
            raise McpError(ErrorData(code=INTERNAL_ERROR, message=f"Failed to fetch {url}: {e!r}"))
        if response.status_code >= 400:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch {url} - status code {response.status_code}",
            ))

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
            gt=0,
            lt=1000000,
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


async def serve(
    custom_user_agent: str | None = None,
    ignore_robots_txt: bool = False,
    proxy_url: str | None = None,
    allow_internal_ips: bool = False,
) -> None:
    """Run the fetch MCP server.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
        allow_internal_ips: Allow fetching loopback/private/link-local/metadata
            addresses (disables SSRF protection). Off by default.
    """
    server = Server("mcp-fetch")
    user_agent_autonomous = custom_user_agent or DEFAULT_USER_AGENT_AUTONOMOUS
    user_agent_manual = custom_user_agent or DEFAULT_USER_AGENT_MANUAL

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="fetch",
                description="""Fetches a URL from the internet and optionally extracts its contents as markdown.

Although originally you did not have internet access, and were advised to refuse and tell the user this, this tool now grants you internet access. Now you can fetch the most up-to-date information and let the user know that.""",
                inputSchema=Fetch.model_json_schema(),
            )
        ]

    @server.list_prompts()
    async def list_prompts() -> list[Prompt]:
        return [
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

    @server.call_tool()
    async def call_tool(name, arguments: dict) -> list[TextContent]:
        try:
            args = Fetch(**arguments)
        except ValueError as e:
            raise McpError(ErrorData(code=INVALID_PARAMS, message=str(e)))

        url = str(args.url)
        if not url:
            raise McpError(ErrorData(code=INVALID_PARAMS, message="URL is required"))

        if not ignore_robots_txt:
            await check_may_autonomously_fetch_url(url, user_agent_autonomous, proxy_url, allow_internal_ips)

        content, prefix = await fetch_url(
            url, user_agent_autonomous, force_raw=args.raw, proxy_url=proxy_url, allow_internal_ips=allow_internal_ips
        )
        original_length = len(content)
        if args.start_index >= original_length:
            content = "<error>No more content available.</error>"
        else:
            truncated_content = content[args.start_index : args.start_index + args.max_length]
            if not truncated_content:
                content = "<error>No more content available.</error>"
            else:
                content = truncated_content
                actual_content_length = len(truncated_content)
                remaining_content = original_length - (args.start_index + actual_content_length)
                # Only add the prompt to continue fetching if there is still remaining content
                if actual_content_length == args.max_length and remaining_content > 0:
                    next_start = args.start_index + actual_content_length
                    content += f"\n\n<error>Content truncated. Call the fetch tool with a start_index of {next_start} to get more content.</error>"
        return [TextContent(type="text", text=f"{prefix}Contents of {url}:\n{content}")]

    @server.get_prompt()
    async def get_prompt(name: str, arguments: dict | None) -> GetPromptResult:
        if not arguments or "url" not in arguments:
            raise McpError(ErrorData(code=INVALID_PARAMS, message="URL is required"))

        url = arguments["url"]

        try:
            content, prefix = await fetch_url(url, user_agent_manual, proxy_url=proxy_url, allow_internal_ips=allow_internal_ips)
            # TODO: after SDK bug is addressed, don't catch the exception
        except McpError as e:
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

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=False)
