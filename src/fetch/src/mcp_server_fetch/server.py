import ipaddress
import os
import socket
import ssl
from types import TracebackType
from typing import Annotated, Tuple
from urllib.parse import urlparse, urlunparse

import httpx
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

# =============================================================================
# SECURITY CONFIGURATION
# =============================================================================

# SSL Certificate Verification Configuration
# Set MCP_FETCH_SSL_VERIFY=false to disable SSL verification for internal/self-signed certificates
# NOTE: Only explicit "false" disables verification; any other value (including typos) keeps it enabled.
SSL_VERIFY = os.getenv("MCP_FETCH_SSL_VERIFY", "true").lower() != "false"

# SSRF Protection Configuration
# Set MCP_FETCH_ALLOW_PRIVATE_IPS=true to allow fetching from private/internal networks
ALLOW_PRIVATE_IPS = os.getenv("MCP_FETCH_ALLOW_PRIVATE_IPS", "false").lower() == "true"

# Comma-separated list of allowed private hosts (only used when ALLOW_PRIVATE_IPS=false)
# Example: "internal.company.com,api.internal.local"
ALLOWED_PRIVATE_HOSTS = [
    h.strip().lower()
    for h in os.getenv("MCP_FETCH_ALLOWED_PRIVATE_HOSTS", "").split(",")
    if h.strip()
]

DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"

# =============================================================================
# SSRF PROTECTION MODULE
# =============================================================================

# Blocked hostnames that resolve to internal services
BLOCKED_HOSTNAMES = frozenset([
    "localhost",
    "localhost.localdomain",
    "ip6-localhost",
    "ip6-loopback",
    "metadata.google.internal",           # GCP metadata
    "metadata.internal",                   # Generic cloud metadata
    "kubernetes.default",                  # Kubernetes
    "kubernetes.default.svc",
    "kubernetes.default.svc.cluster.local",
])

# Cloud metadata IP addresses
CLOUD_METADATA_IPS = frozenset([
    "169.254.169.254",  # AWS, Azure, GCP, DigitalOcean, Oracle Cloud
    "169.254.170.2",    # AWS ECS task metadata
    "fd00:ec2::254",    # AWS IPv6 metadata
])


def _parse_obfuscated_ip(hostname: str) -> str | None:
    """
    Detect and decode obfuscated IP address formats.

    Attackers may use alternative IP representations to bypass SSRF filters:
    - Decimal: 2130706433 (= 127.0.0.1)
    - Octal integer: 017700000001 (= 127.0.0.1)
    - Octal dotted: 0177.0.0.1 (= 127.0.0.1)
    - Hex: 0x7f000001 (= 127.0.0.1)
    - Mixed: 0x7f.0.0.1 (= 127.0.0.1)

    Returns the normalized IP string if detected, None otherwise.
    """
    hostname = hostname.strip()

    # Try octal integer format (e.g., 017700000001 = 127.0.0.1)
    # Must check before decimal since octal strings are also digits
    try:
        if hostname.startswith("0") and len(hostname) > 1 and hostname.isdigit():
            ip_int = int(hostname, 8)
            if 0 <= ip_int <= 0xFFFFFFFF:  # Valid 32-bit range
                return str(ipaddress.IPv4Address(ip_int))
    except (ValueError, ipaddress.AddressValueError):
        pass

    # Try decimal integer format (e.g., 2130706433 = 127.0.0.1)
    try:
        if hostname.isdigit():
            ip_int = int(hostname)
            if 0 <= ip_int <= 0xFFFFFFFF:  # Valid 32-bit range
                # Convert to dotted decimal
                return str(ipaddress.IPv4Address(ip_int))
    except (ValueError, ipaddress.AddressValueError):
        pass

    # Try hex format (e.g., 0x7f000001 = 127.0.0.1)
    try:
        if hostname.lower().startswith("0x") and "." not in hostname:
            ip_int = int(hostname, 16)
            if 0 <= ip_int <= 0xFFFFFFFF:
                return str(ipaddress.IPv4Address(ip_int))
    except (ValueError, ipaddress.AddressValueError):
        pass

    # Try octal/hex dotted format (e.g., 0177.0.0.1 or 0x7f.0.0.1)
    # Only return if there's actual obfuscation (hex prefix or leading zeros)
    if "." in hostname:
        parts = hostname.split(".")
        if len(parts) == 4:
            try:
                octets = []
                has_obfuscation = False
                for part in parts:
                    part = part.strip()
                    if part.lower().startswith("0x"):
                        octets.append(int(part, 16))
                        has_obfuscation = True
                    elif part.startswith("0") and len(part) > 1 and part.isdigit():
                        # Octal format (leading zero with more digits)
                        octets.append(int(part, 8))
                        has_obfuscation = True
                    else:
                        octets.append(int(part))

                # Only return if we detected obfuscation AND result is valid
                if has_obfuscation and all(0 <= o <= 255 for o in octets):
                    return f"{octets[0]}.{octets[1]}.{octets[2]}.{octets[3]}"
            except ValueError:
                pass

    return None


def _is_ip_private_or_reserved(ip_str: str) -> bool:
    """
    Check if an IP address is private, reserved, loopback, or link-local.

    This function handles:
    - IPv4 and IPv6 addresses
    - Loopback (127.0.0.0/8, ::1)
    - Private networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
    - Link-local (169.254.0.0/16, fe80::/10)
    - Reserved ranges
    - Multicast addresses
    - Unspecified addresses (0.0.0.0, ::)
    """
    try:
        ip = ipaddress.ip_address(ip_str)

        # Check all dangerous categories
        if ip.is_private:
            return True
        if ip.is_loopback:
            return True
        if ip.is_link_local:
            return True
        if ip.is_reserved:
            return True
        if ip.is_multicast:
            return True
        if ip.is_unspecified:
            return True

        # Additional check for IPv4-mapped IPv6 addresses (::ffff:127.0.0.1)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            return _is_ip_private_or_reserved(str(ip.ipv4_mapped))

        # Check cloud metadata IPs explicitly
        if ip_str in CLOUD_METADATA_IPS:
            return True

        return False
    except ValueError:
        # If we can't parse it, block it to be safe
        return True


def _normalize_hostname(hostname: str) -> str:
    """Normalize hostname for comparison."""
    # Remove trailing dots (FQDN notation)
    hostname = hostname.rstrip(".")
    # Lowercase for case-insensitive comparison
    return hostname.lower()


def _is_hostname_blocked(hostname: str) -> bool:
    """Check if hostname is in the blocked list."""
    normalized = _normalize_hostname(hostname)

    # Direct match
    if normalized in BLOCKED_HOSTNAMES:
        return True

    # Check for subdomain matches of blocked hostnames
    for blocked in BLOCKED_HOSTNAMES:
        if normalized.endswith("." + blocked):
            return True

    return False


def _is_hostname_whitelisted(hostname: str) -> bool:
    """Check if hostname is explicitly whitelisted for private access."""
    if not ALLOWED_PRIVATE_HOSTS:
        return False

    normalized = _normalize_hostname(hostname)
    return normalized in ALLOWED_PRIVATE_HOSTS


def validate_url_for_ssrf(url: str) -> None:
    """
    Validate a URL to prevent SSRF attacks.

    This function performs comprehensive SSRF protection:
    1. Validates URL scheme (only http/https allowed)
    2. Blocks known dangerous hostnames
    3. Resolves hostname to IP and validates against private ranges
    4. Handles IP address obfuscation (octal, hex, decimal encoding)

    Raises:
        McpError: If the URL is potentially dangerous

    Security Note:
        This validation provides early rejection of obviously dangerous URLs.
        DNS rebinding protection is handled at the transport layer by
        SSRFSafeTransport, which validates resolved IPs at connection time.
    """
    try:
        parsed = urlparse(url)
    except Exception as e:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Invalid URL format: {str(e)}",
        ))

    # Validate scheme
    if parsed.scheme not in ("http", "https"):
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"URL scheme '{parsed.scheme}' is not allowed. Only http and https are permitted.",
        ))

    # Extract hostname
    hostname = parsed.hostname
    if not hostname:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message="URL must contain a valid hostname.",
        ))

    # Check if hostname is whitelisted (bypass other checks)
    if _is_hostname_whitelisted(hostname):
        return

    # Check blocked hostnames
    if _is_hostname_blocked(hostname):
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Access to '{hostname}' is blocked for security reasons. "
            f"This hostname is associated with internal services.",
        ))

    # Check for obfuscated IP addresses (decimal, octal, hex encoding)
    # Python's ipaddress module does NOT parse these from strings, so we handle them explicitly
    obfuscated_ip = _parse_obfuscated_ip(hostname)
    if obfuscated_ip:
        if _is_ip_private_or_reserved(obfuscated_ip):
            if not ALLOW_PRIVATE_IPS:
                raise McpError(ErrorData(
                    code=INVALID_PARAMS,
                    message=f"Access to obfuscated private IP address '{hostname}' "
                    f"(decoded: {obfuscated_ip}) is blocked. "
                    f"Set MCP_FETCH_ALLOW_PRIVATE_IPS=true to allow internal network access.",
                ))
        return

    # Try to parse hostname as standard IP address
    try:
        ip = ipaddress.ip_address(hostname)
        if _is_ip_private_or_reserved(str(ip)):
            if not ALLOW_PRIVATE_IPS:
                raise McpError(ErrorData(
                    code=INVALID_PARAMS,
                    message=f"Access to private/internal IP address '{hostname}' is blocked. "
                    f"Set MCP_FETCH_ALLOW_PRIVATE_IPS=true to allow internal network access.",
                ))
        return
    except ValueError:
        # Not an IP address, continue with DNS resolution
        pass

    # Resolve hostname to IP addresses
    try:
        # Get all IP addresses for the hostname
        addr_info = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        resolved_ips = set()
        for family, _, _, _, sockaddr in addr_info:
            ip_str = sockaddr[0]
            resolved_ips.add(ip_str)
    except socket.gaierror as e:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Failed to resolve hostname '{hostname}': {str(e)}",
        ))

    # Validate all resolved IPs
    if not ALLOW_PRIVATE_IPS:
        for ip_str in resolved_ips:
            if _is_ip_private_or_reserved(ip_str):
                raise McpError(ErrorData(
                    code=INVALID_PARAMS,
                    message=f"Hostname '{hostname}' resolves to private/internal IP address '{ip_str}'. "
                    f"Access to internal networks is blocked for security. "
                    f"Set MCP_FETCH_ALLOW_PRIVATE_IPS=true or add the host to "
                    f"MCP_FETCH_ALLOWED_PRIVATE_HOSTS to allow access.",
                ))


class SSRFSafeTransport(httpx.AsyncBaseTransport):
    """
    Custom async transport that prevents DNS rebinding attacks.

    DNS rebinding TOCTOU (Time-of-Check-Time-of-Use) attack:
    1. validate_url_for_ssrf() resolves DNS → gets public IP → passes check
    2. Attacker's DNS server changes the record to a private IP (e.g., 169.254.169.254)
    3. httpx resolves DNS again → gets private IP → connects to internal service

    This transport eliminates the TOCTOU window by:
    1. Resolving DNS ourselves
    2. Validating the resolved IP
    3. Replacing the hostname in the URL with the validated IP
    4. Preserving the original Host header for correct HTTP routing
    """

    def __init__(self, proxy: str | None = None, verify: bool = True):
        kwargs: dict = {"verify": verify}
        if proxy:
            kwargs["proxy"] = proxy
        self._transport = httpx.AsyncHTTPTransport(**kwargs)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        hostname = request.url.host
        # Skip IP validation for already-resolved IPs
        try:
            ipaddress.ip_address(hostname)
            # Already an IP - validation was done in validate_url_for_ssrf()
            return await self._transport.handle_async_request(request)
        except ValueError:
            pass  # It's a hostname, resolve it

        # Resolve DNS
        try:
            addr_info = socket.getaddrinfo(
                hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM
            )
            if not addr_info:
                raise McpError(ErrorData(
                    code=INVALID_PARAMS,
                    message=f"Failed to resolve hostname '{hostname}': no addresses found",
                ))
            resolved_ip = addr_info[0][4][0]
        except socket.gaierror as e:
            raise McpError(ErrorData(
                code=INVALID_PARAMS,
                message=f"Failed to resolve hostname '{hostname}': {str(e)}",
            ))

        # Validate resolved IP against SSRF rules
        if not ALLOW_PRIVATE_IPS and _is_ip_private_or_reserved(resolved_ip):
            raise McpError(ErrorData(
                code=INVALID_PARAMS,
                message=f"DNS rebinding protection: hostname '{hostname}' resolved to "
                f"private/internal IP '{resolved_ip}' at connection time. "
                f"Set MCP_FETCH_ALLOW_PRIVATE_IPS=true to allow internal network access.",
            ))

        # Replace hostname with validated IP to prevent DNS rebinding
        # The Host header is already set to the original hostname by httpx
        new_url = request.url.copy_with(host=resolved_ip)
        # Create new request with the IP-based URL but same headers (including Host)
        new_request = httpx.Request(
            method=request.method,
            url=new_url,
            headers=request.headers,
            stream=request.stream,
            extensions=request.extensions,
        )

        return await self._transport.handle_async_request(new_request)

    async def aclose(self):
        await self._transport.aclose()

    async def __aenter__(self):
        await self._transport.__aenter__()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None = None,
        exc_val: BaseException | None = None,
        exc_tb: TracebackType | None = None,
    ) -> None:
        await self._transport.__aexit__(exc_type, exc_val, exc_tb)


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

    Security Features:
    - SSRF protection via URL validation
    - SSL certificate verification (configurable via SSL_VERIFY)
    - Comprehensive SSL error handling
    """
    robot_txt_url = get_robots_txt_url(url)

    # SSRF Protection: Validate robots.txt URL before fetching
    validate_url_for_ssrf(robot_txt_url)

    transport = SSRFSafeTransport(proxy=proxy_url, verify=SSL_VERIFY)
    async with httpx.AsyncClient(transport=transport) as client:
        try:
            response = await client.get(
                robot_txt_url,
                follow_redirects=False,
                headers={"User-Agent": user_agent},
                timeout=30,
            )
        except ssl.SSLError as e:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"SSL Certificate verification failed for {robot_txt_url}. "
                f"If this is an internal server with a self-signed certificate, "
                f"set MCP_FETCH_SSL_VERIFY=false in your environment. "
                f"Error details: {str(e)}",
            ))
        except httpx.ConnectError as e:
            # httpx wraps SSL errors in ConnectError in some cases
            error_str = str(e).lower()
            if "ssl" in error_str or "certificate" in error_str or "verify" in error_str:
                raise McpError(ErrorData(
                    code=INTERNAL_ERROR,
                    message=f"SSL Certificate verification failed for {robot_txt_url}. "
                    f"If this is an internal server with a self-signed certificate, "
                    f"set MCP_FETCH_SSL_VERIFY=false in your environment. "
                    f"Error details: {str(e)}",
                ))
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to connect to {robot_txt_url}: {str(e)}",
            ))
        except httpx.HTTPError as e:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch robots.txt {robot_txt_url} due to a connection issue: {str(e)}",
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

    Security Features:
    - SSRF protection via comprehensive URL validation
    - SSL certificate verification (configurable via SSL_VERIFY)
    - Timeout protection (30 seconds) to prevent resource exhaustion
    - User-Agent header for transparency
    - Comprehensive SSL error handling (catches wrapped exceptions)
    """
    # SSRF Protection: Validate URL before fetching
    validate_url_for_ssrf(url)

    transport = SSRFSafeTransport(proxy=proxy_url, verify=SSL_VERIFY)
    async with httpx.AsyncClient(transport=transport) as client:
        try:
            response = await client.get(
                url,
                follow_redirects=False,
                headers={"User-Agent": user_agent},
                timeout=30,
            )
        except ssl.SSLError as e:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"SSL Certificate verification failed for {url}. "
                f"If this is an internal server with a self-signed certificate, "
                f"set MCP_FETCH_SSL_VERIFY=false in your environment. "
                f"Error details: {str(e)}",
            ))
        except httpx.ConnectError as e:
            # httpx wraps SSL errors in ConnectError in some cases
            error_str = str(e).lower()
            if "ssl" in error_str or "certificate" in error_str or "verify" in error_str:
                raise McpError(ErrorData(
                    code=INTERNAL_ERROR,
                    message=f"SSL Certificate verification failed for {url}. "
                    f"If this is an internal server with a self-signed certificate, "
                    f"set MCP_FETCH_SSL_VERIFY=false in your environment. "
                    f"Error details: {str(e)}",
                ))
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to connect to {url}: {str(e)}",
            ))
        except httpx.HTTPError as e:
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
) -> None:
    """Run the fetch MCP server.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
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
