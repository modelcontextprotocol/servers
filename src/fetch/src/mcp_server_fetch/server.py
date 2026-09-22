from typing import TYPE_CHECKING, Annotated, Any, Tuple
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

if TYPE_CHECKING:
    from httpx import AsyncClient, Response

DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"

REDIRECT_STATUS_CODES = frozenset({301, 302, 303, 307, 308})
MAX_REDIRECTS = 20


def _normalize_host(host: str) -> str:
    """Normalize a hostname or allowlist entry for comparison.

    Lowercases, strips surrounding whitespace, trailing root-label dots and
    IP-literal brackets, and IDNA-encodes Unicode names (so ``例え.jp`` and
    its punycode form ``xn--r8jz45g.jp`` compare equal). Anything that fails
    IDNA encoding is returned as-is; worst case it simply never matches,
    which fails closed.
    """
    host = host.strip().lower().rstrip(".").strip("[]")
    try:
        return host.encode("idna").decode("ascii")
    except (UnicodeError, ValueError):
        return host


def is_host_allowed(hostname: str | None, allowed_hosts: list[str] | None) -> bool:
    """Check whether a hostname is permitted by the configured allowlist.

    Args:
        hostname: Hostname taken from the request URL
        allowed_hosts: Allowlist entries. ``None`` disables the allowlist (every
            host is allowed). An entry is either an exact host (``example.com``)
            or a wildcard (``*.example.com``, which matches ``example.com`` itself
            and any subdomain). Matching is case-insensitive and IDNA-normalized.

    Returns:
        True if the host may be fetched, False otherwise
    """
    if allowed_hosts is None:
        return True
    if not hostname:
        return False
    hostname = _normalize_host(hostname)
    for entry in allowed_hosts:
        wildcard = entry.lstrip().startswith("*.")
        normalized = _normalize_host(entry.lstrip()[2:] if wildcard else entry)
        if wildcard:
            if hostname == normalized or hostname.endswith("." + normalized):
                return True
        elif hostname == normalized:
            return True
    return False


def validate_url_allowed(url: str, allowed_hosts: list[str] | None) -> None:
    """Validate a URL's host against the allowlist.

    The URL is parsed with httpx — the same parser that will be used to
    connect — so the validated host is always the host that gets connected.

    Raises:
        McpError: If the URL has no hostname or its host is not allowlisted
    """
    if allowed_hosts is None:
        return
    from httpx import URL, InvalidURL

    try:
        hostname = URL(url).host
    except InvalidURL:
        hostname = None
    if not hostname:
        raise McpError(ErrorData(
            code=INVALID_PARAMS,
            message=f"Invalid URL: could not determine a hostname for {url}",
        ))
    if not is_host_allowed(hostname, allowed_hosts):
        raise McpError(ErrorData(
            code=INTERNAL_ERROR,
            message=f"Fetching '{hostname}' is not allowed: this server is configured with a host allowlist (--allowed-hosts) and this host is not on it. The user can adjust the server configuration if this host should be accessible.",
        ))


async def _get_following_redirects(
    client: "AsyncClient",
    url: str,
    *,
    user_agent: str,
    allowed_hosts: list[str] | None,
    timeout: float | None = None,
) -> "Response":
    """GET a URL, following redirects manually and re-validating every hop.

    Redirects are followed by hand (instead of httpx's follow_redirects) so that
    each redirect target is checked against the allowlist before connecting;
    otherwise a 302 from an allowed host could bounce the fetch to any host.

    Args:
        client: httpx.AsyncClient to use
        url: Initial URL to fetch
        user_agent: User-Agent header value
        allowed_hosts: Allowlist applied to the initial URL and every redirect hop
        timeout: Optional per-request timeout in seconds (httpx default if None)

    Returns:
        The final (non-redirect) httpx.Response

    Raises:
        McpError: If a hop is not allowlisted or the redirect limit is exceeded
    """
    request_kwargs: dict[str, Any] = {"follow_redirects": False, "headers": {"User-Agent": user_agent}}
    if timeout is not None:
        request_kwargs["timeout"] = timeout

    current_url = url
    redirects_remaining = MAX_REDIRECTS
    while True:
        validate_url_allowed(current_url, allowed_hosts)
        response = await client.get(current_url, **request_kwargs)
        if response.status_code not in REDIRECT_STATUS_CODES:
            return response
        location = response.headers.get("location")
        if location is None:
            # A redirect status without a Location header is not followable;
            # the response is used as-is (matches httpx's follow_redirects).
            return response
        if redirects_remaining <= 0:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch {url}: exceeded the limit of {MAX_REDIRECTS} redirects",
            ))
        redirects_remaining -= 1
        # An empty Location redirects to the same URL (matching httpx), so a
        # redirect loop — self-inflicted or otherwise — hits the limit above.
        try:
            current_url = urljoin(str(response.url), location)
        except ValueError:
            raise McpError(ErrorData(
                code=INTERNAL_ERROR,
                message=f"Failed to fetch {url}: redirect target {location!r} is not a valid URL",
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


async def check_may_autonomously_fetch_url(url: str, user_agent: str, proxy_url: str | None = None, allowed_hosts: list[str] | None = None) -> None:
    """
    Check if the URL can be fetched by the user agent according to the robots.txt file.
    Raises a McpError if not.
    """
    from httpx import AsyncClient, HTTPError

    validate_url_allowed(url, allowed_hosts)
    robot_txt_url = get_robots_txt_url(url)

    async with AsyncClient(proxy=proxy_url) as client:
        try:
            response = await _get_following_redirects(
                client,
                robot_txt_url,
                user_agent=user_agent,
                allowed_hosts=allowed_hosts,
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
    url: str, user_agent: str, force_raw: bool = False, proxy_url: str | None = None, allowed_hosts: list[str] | None = None
) -> Tuple[str, str]:
    """
    Fetch the URL and return the content in a form ready for the LLM, as well as a prefix string with status information.
    """
    from httpx import AsyncClient, HTTPError

    validate_url_allowed(url, allowed_hosts)

    async with AsyncClient(proxy=proxy_url) as client:
        try:
            response = await _get_following_redirects(
                client,
                url,
                user_agent=user_agent,
                allowed_hosts=allowed_hosts,
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
) -> None:
    """Run the fetch MCP server.

    Args:
        custom_user_agent: Optional custom User-Agent string to use for requests
        ignore_robots_txt: Whether to ignore robots.txt restrictions
        proxy_url: Optional proxy URL to use for requests
        allowed_hosts: Optional host allowlist; when set, only these hosts
            (exact names or *.example.com wildcards) may be fetched
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
            await check_may_autonomously_fetch_url(url, user_agent_autonomous, proxy_url, allowed_hosts=allowed_hosts)

        content, prefix = await fetch_url(
            url, user_agent_autonomous, force_raw=args.raw, proxy_url=proxy_url, allowed_hosts=allowed_hosts
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
            content, prefix = await fetch_url(url, user_agent_manual, proxy_url=proxy_url, allowed_hosts=allowed_hosts)
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
