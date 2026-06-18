import ipaddress
import socket
from typing import Annotated, Tuple
from urllib.parse import urljoin, urlparse, urlunparse

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

# Maximum number of redirects to follow with per-hop URL revalidation.
# Mirrors httpx's conventional default but kept low so a malicious server
# cannot make us validate an unbounded number of hops.
MAX_REDIRECTS = 10

# Set of URL schemes the fetch tool will issue requests for. Other schemes
# (file://, gopher://, dict://, ftp://, etc.) get blocked at the URL-safety
# gate because httpx will happily honor them and they enable trivial local
# resource disclosure or SSRF against non-HTTP services.
ALLOWED_URL_SCHEMES = {"http", "https"}


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> str | None:
    """Return a human-readable reason if the IP is in a blocked range, else None.

    Order matters — Python's ipaddress library overlaps categories (e.g. 0.0.0.0
    is BOTH `is_unspecified` and `is_private`); we check the most-specific
    classification first so the error message is precise.

    Blocks (rejected unless caller opted into private networks):
      * Unspecified (0.0.0.0, ::)
      * Loopback (127.0.0.0/8, ::1)
      * Link-local (169.254.0.0/16, fe80::/10) — covers cloud-metadata endpoints
      * Private (10/8, 172.16/12, 192.168/16, fc00::/7)
      * Multicast
      * Reserved / broadcast
    """
    if ip.is_unspecified:
        return "unspecified address"
    if ip.is_loopback:
        return "loopback address"
    if ip.is_link_local:
        return "link-local address (covers cloud-metadata endpoints)"
    if ip.is_private:
        return "RFC1918 / unique-local private address"
    if ip.is_multicast:
        return "multicast address"
    if ip.is_reserved:
        return "reserved address"
    return None


def _resolve_host(hostname: str) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Resolve a hostname to its IP addresses via socket.getaddrinfo. Returns
    parsed ipaddress objects. Raises socket.gaierror on resolution failure."""
    resolved: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for family, _socktype, _proto, _canonname, sockaddr in socket.getaddrinfo(
        hostname, None, type=socket.SOCK_STREAM
    ):
        if family == socket.AF_INET:
            resolved.append(ipaddress.IPv4Address(sockaddr[0]))
        elif family == socket.AF_INET6:
            resolved.append(ipaddress.IPv6Address(sockaddr[0]))
    return resolved


def assert_url_safe_or_raise(url: str, *, allow_private_networks: bool) -> None:
    """Reject URLs that target private / loopback / link-local / non-HTTP destinations.

    Best-effort SSRF defense:
      * Block non-http(s) schemes outright (file://, gopher://, dict://, ftp://, …).
      * Resolve the hostname to its full IP set and reject if any resolved IP is
        in a blocked range. The "any" semantics matter because DNS records can
        resolve to multiple A/AAAA entries; if even one is loopback, an attacker
        can win a race by being the one connection httpx picks.
      * Reject empty/missing hostname (catches `http:///path` style payloads).

    The hostname → IP resolution is best-effort against DNS rebinding: the IP
    seen here may differ from the IP that httpx ultimately connects to. For
    higher assurance, run the fetch server behind a network egress filter or
    an explicit proxy that enforces the same policy.

    Raises McpError with INVALID_PARAMS on rejection.
    """
    parsed = urlparse(url)

    scheme = (parsed.scheme or "").lower()
    if scheme not in ALLOWED_URL_SCHEMES:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Refusing to fetch URL with disallowed scheme {scheme!r}: only {sorted(ALLOWED_URL_SCHEMES)} are permitted.",
        ))

    hostname = parsed.hostname
    if not hostname:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Refusing to fetch URL with empty hostname: {url!r}",
        ))

    # If the hostname is itself an IP literal, evaluate it directly without DNS.
    try:
        literal_ip = ipaddress.ip_address(hostname)
    except ValueError:
        literal_ip = None

    if literal_ip is not None:
        block_reason = _is_blocked_ip(literal_ip)
        if block_reason and not allow_private_networks:
            raise McpError(ErrorData(
                code=INVALID_PARAMS,
                message=f"Refusing to fetch {url!r}: target IP {literal_ip} is a {block_reason}. "
                        f"Pass --allow-private-networks at startup to permit fetches against private/loopback ranges.",
            ))
        return

    # Hostname is a name — resolve and check every returned IP.
    try:
        resolved_ips = _resolve_host(hostname)
    except socket.gaierror as e:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Refusing to fetch {url!r}: failed to resolve hostname {hostname!r}: {e}",
        ))

    if not resolved_ips:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Refusing to fetch {url!r}: hostname {hostname!r} resolved to no IPs.",
        ))

    if allow_private_networks:
        return

    for ip in resolved_ips:
        block_reason = _is_blocked_ip(ip)
        if block_reason:
            raise McpError(ErrorData(
                code=INVALID_PARAMS,
                message=f"Refusing to fetch {url!r}: hostname {hostname!r} resolves to {ip}, a {block_reason}. "
                        f"Pass --allow-private-networks at startup to permit fetches against private/loopback ranges.",
            ))


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


async def check_may_autonomously_fetch_url(url: str, user_agent: str, proxy_url: str | None = None) -> None:
    """
    Check if the URL can be fetched by the user agent according to the robots.txt file.
    Raises a McpError if not.
    """
    from httpx import AsyncClient, HTTPError

    robot_txt_url = get_robots_txt_url(url)

    async with AsyncClient(proxy=proxy_url) as client:
        try:
            response = await client.get(
                robot_txt_url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
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
    url: str,
    user_agent: str,
    force_raw: bool = False,
    proxy_url: str | None = None,
    allow_private_networks: bool = False,
) -> Tuple[str, str]:
    """
    Fetch the URL and return the content in a form ready for the LLM, as well as a prefix string with status information.

    Follows up to MAX_REDIRECTS redirects manually so each hop's Location header
    is revalidated against the SSRF safety rules — `httpx`'s native
    `follow_redirects=True` would happily redirect from a public URL into a
    loopback or cloud-metadata endpoint without re-checking. Caller must have
    already validated the initial URL via assert_url_safe_or_raise.
    """
    from httpx import AsyncClient, HTTPError

    async with AsyncClient(proxy=proxy_url) as client:
        current_url = url
        for _ in range(MAX_REDIRECTS + 1):
            try:
                response = await client.get(
                    current_url,
                    follow_redirects=False,
                    headers={"User-Agent": user_agent},
                    timeout=30,
                )
            except HTTPError as e:
                raise McpError(ErrorData(code=INTERNAL_ERROR, message=f"Failed to fetch {current_url}: {e!r}"))

            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise McpError(ErrorData(
                        code=INTERNAL_ERROR,
                        message=f"Failed to fetch {current_url}: redirect response with no Location header",
                    ))
                # Resolve relative redirects against the current URL.
                next_url = urljoin(current_url, location)
                # Revalidate the redirect target against the SSRF policy before re-issuing.
                assert_url_safe_or_raise(next_url, allow_private_networks=allow_private_networks)
                current_url = next_url
                continue

            if response.status_code >= 400:
                raise McpError(ErrorData(
                    code=INTERNAL_ERROR,
                    message=f"Failed to fetch {current_url} - status code {response.status_code}",
                ))
            break
        else:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch {url}: exceeded {MAX_REDIRECTS} redirects",
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
    allow_private_networks: bool = False,
) -> None:
    """Run the fetch MCP server.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
        allow_private_networks: Disable the SSRF safety check that rejects URLs
            resolving to loopback / link-local / RFC1918 / cloud-metadata
            addresses. Off by default. Enable only for local-network use cases
            where every reachable target is trusted (developer-loop tooling,
            internal-network scraping with an explicit allowlist upstream).
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

        # SSRF safety gate: block private / loopback / link-local / non-HTTP
        # targets before any network call (including the robots.txt probe).
        assert_url_safe_or_raise(url, allow_private_networks=allow_private_networks)

        if not ignore_robots_txt:
            await check_may_autonomously_fetch_url(url, user_agent_autonomous, proxy_url)

        content, prefix = await fetch_url(
            url,
            user_agent_autonomous,
            force_raw=args.raw,
            proxy_url=proxy_url,
            allow_private_networks=allow_private_networks,
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
            assert_url_safe_or_raise(url, allow_private_networks=allow_private_networks)
            content, prefix = await fetch_url(
                url,
                user_agent_manual,
                proxy_url=proxy_url,
                allow_private_networks=allow_private_networks,
            )
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
