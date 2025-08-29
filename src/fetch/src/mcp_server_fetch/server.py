from typing import Annotated, Tuple
from urllib.parse import urlparse, urlunparse
import ipaddress
import socket

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

# Default blocked IP ranges (local/internal networks)
DEFAULT_BLOCKED_IP_RANGES = [
    "127.0.0.0/8",      # Loopback
    "10.0.0.0/8",       # Private Class A
    "172.16.0.0/12",    # Private Class B
    "192.168.0.0/16",   # Private Class C
    "169.254.0.0/16",   # Link-local
    "224.0.0.0/4",      # Multicast
    "::1/128",          # IPv6 loopback
    "fc00::/7",         # IPv6 unique local
    "fe80::/10",        # IPv6 link-local
]


def is_ip_in_ranges(ip_str: str, ranges: list[str]) -> bool:
    """Check if an IP address is within any of the specified CIDR ranges.
    
    Args:
        ip_str: IP address string to check
        ranges: List of CIDR range strings
        
    Returns:
        True if IP is in any of the ranges, False otherwise
    """
    try:
        ip = ipaddress.ip_address(ip_str)
        for range_str in ranges:
            try:
                network = ipaddress.ip_network(range_str, strict=False)
                if ip in network:
                    return True
            except ValueError:
                continue
        return False
    except ValueError:
        return False


def resolve_hostname_to_ips(hostname: str) -> list[str]:
    """Resolve a hostname to its IP addresses.
    
    Args:
        hostname: Hostname to resolve
        
    Returns:
        List of IP addresses as strings
        
    Raises:
        socket.gaierror: If hostname cannot be resolved
    """
    try:
        # Get both IPv4 and IPv6 addresses
        addr_info = socket.getaddrinfo(hostname, None, family=socket.AF_UNSPEC, type=socket.SOCK_STREAM)
        ips = list(set(info[4][0] for info in addr_info))
        return ips
    except socket.gaierror:
        raise


async def validate_url_against_allowlist(
    url: str, 
    allowed_hosts: list[str] | None = None,
    blocked_ip_ranges: list[str] | None = None,
    allow_private_ips: bool = False
) -> None:
    """Validate a URL against host allowlist and IP range restrictions.
    
    Args:
        url: URL to validate
        allowed_hosts: List of allowed hostnames/domains. If None, all hosts allowed by IP rules
        blocked_ip_ranges: List of CIDR ranges to block. If None, uses DEFAULT_BLOCKED_IP_RANGES
        allow_private_ips: If True, allows access to private/internal IP ranges
        
    Raises:
        McpError: If URL is not allowed
    """
    if blocked_ip_ranges is None:
        blocked_ip_ranges = DEFAULT_BLOCKED_IP_RANGES if not allow_private_ips else []
    
    parsed = urlparse(url)
    hostname = parsed.hostname
    
    if not hostname:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message="Invalid URL: no hostname found"
        ))
    
    # Check against allowed hosts list if provided
    if allowed_hosts is not None:
        host_allowed = False
        for allowed_host in allowed_hosts:
            if allowed_host.startswith('*.'):
                # Wildcard domain matching
                domain_suffix = allowed_host[2:]
                if hostname == domain_suffix or hostname.endswith('.' + domain_suffix):
                    host_allowed = True
                    break
            elif hostname == allowed_host:
                host_allowed = True
                break
        
        if not host_allowed:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Host '{hostname}' is not in the allowed hosts list"
            ))
    
    # Resolve hostname to IP addresses and check against blocked ranges
    if blocked_ip_ranges:
        try:
            ips = resolve_hostname_to_ips(hostname)
        except socket.gaierror as e:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to resolve hostname '{hostname}': {e}"
            ))
        
        for ip in ips:
            if is_ip_in_ranges(ip, blocked_ip_ranges):
                raise McpError(ErrorData(
                    code=INTERNAL_ERROR,
                    message=f"Access to IP address '{ip}' (resolved from '{hostname}') is blocked as it falls within restricted IP ranges"
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

    async with AsyncClient(proxies=proxy_url) as client:
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
    url: str, user_agent: str, force_raw: bool = False, proxy_url: str | None = None
) -> Tuple[str, str]:
    """
    Fetch the URL and return the content in a form ready for the LLM, as well as a prefix string with status information.
    """
    from httpx import AsyncClient, HTTPError

    async with AsyncClient(proxies=proxy_url) as client:
        try:
            response = await client.get(
                url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
                timeout=30,
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
    allowed_hosts: list[str] | None = None,
    allow_private_ips: bool = False,
    blocked_ip_ranges: list[str] | None = None,
) -> None:
    """Run the fetch MCP server.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
        allowed_hosts: Optional list of allowed hostnames/domains (supports wildcards like *.example.com)
        allow_private_ips: Whether to allow access to private/internal IP ranges
        blocked_ip_ranges: Optional list of custom CIDR ranges to block
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

        # Validate URL against allowlist and IP restrictions
        await validate_url_against_allowlist(
            url, allowed_hosts, blocked_ip_ranges, allow_private_ips
        )

        if not ignore_robots_txt:
            await check_may_autonomously_fetch_url(url, user_agent_autonomous, proxy_url)

        content, prefix = await fetch_url(
            url, user_agent_autonomous, force_raw=args.raw, proxy_url=proxy_url
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
            # Validate URL against allowlist and IP restrictions  
            await validate_url_against_allowlist(
                url, allowed_hosts, blocked_ip_ranges, allow_private_ips
            )
            
            content, prefix = await fetch_url(url, user_agent_manual, proxy_url=proxy_url)
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
        await server.run(read_stream, write_stream, options, raise_exceptions=True)
