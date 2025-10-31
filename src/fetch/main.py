from __future__ import annotations

from pathlib import Path
from typing import Annotated, Tuple
from urllib.parse import urlparse, urlunparse

from mcp_agent.app import MCPApp
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
from pydantic import AnyUrl, BaseModel, Field

CONFIG_PATH = (Path(__file__).parent / "mcp_agent.config.yaml").resolve()
app = MCPApp(
    name="fetch-server",
    description="Fetch MCP server",
    settings=str(CONFIG_PATH),
)

DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"


def extract_content_from_html(html: str) -> str:
    from readabilipy.simple_json import simple_json_from_html_string
    import markdownify

    ret = simple_json_from_html_string(html, use_readability=True)
    if not ret["content"]:
        return "<error>Page failed to be simplified from HTML</error>"
    return markdownify.markdownify(ret["content"], heading_style=markdownify.ATX)


def get_robots_txt_url(url: str) -> str:
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))


async def check_may_autonomously_fetch_url(
    url: str, user_agent: str, proxy_url: str | None = None
) -> None:
    from httpx import AsyncClient, HTTPError
    from protego import Protego

    robot_txt_url = get_robots_txt_url(url)

    async with AsyncClient(proxies=proxy_url) as client:
        try:
            response = await client.get(
                robot_txt_url,
                follow_redirects=True,
                headers={"User-Agent": user_agent},
            )
        except HTTPError:
            raise McpError(
                ErrorData(
                    code=INTERNAL_ERROR,
                    message=f"Failed to fetch robots.txt {robot_txt_url} due to a connection issue",
                )
            )
        if response.status_code in (401, 403):
            raise McpError(
                ErrorData(
                    code=INTERNAL_ERROR,
                    message=(
                        "When fetching robots.txt"
                        f" ({robot_txt_url}), received status {response.status_code} so assuming that"
                        " autonomous fetching is not allowed, the user can try manually fetching by"
                        " using the fetch prompt"
                    ),
                )
            )
        if 400 <= response.status_code < 500:
            return
        robot_txt = response.text

    processed_robot_txt = "\n".join(
        line for line in robot_txt.splitlines() if not line.strip().startswith("#")
    )
    robot_parser = Protego.parse(processed_robot_txt)
    if not robot_parser.can_fetch(str(url), user_agent):
        raise McpError(
            ErrorData(
                code=INTERNAL_ERROR,
                message=(
                    "The sites robots.txt"
                    f" ({robot_txt_url}), specifies that autonomous fetching of this page is not allowed, "
                    f"<useragent>{user_agent}</useragent>\n"
                    f"<url>{url}</url>"
                    f"<robots>\n{robot_txt}\n</robots>\n"
                    "The assistant must let the user know that it failed to view the page."
                    " The assistant may provide further guidance based on the above information.\n"
                    "The assistant can tell the user that they can try manually fetching the page"
                    " by using the fetch prompt within their UI."
                ),
            )
        )


async def fetch_url(
    url: str, user_agent: str, force_raw: bool = False, proxy_url: str | None = None
) -> Tuple[str, str]:
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
            raise McpError(
                ErrorData(code=INTERNAL_ERROR, message=f"Failed to fetch {url}: {e!r}")
            )
        if response.status_code >= 400:
            raise McpError(
                ErrorData(
                    code=INTERNAL_ERROR,
                    message=f"Failed to fetch {url} - status code {response.status_code}",
                )
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
        "Content type "
        f"{content_type} cannot be simplified to markdown, but here is the raw content:\n",
    )


class Fetch(BaseModel):
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
    server = Server("mcp-fetch")
    user_agent_autonomous = custom_user_agent or DEFAULT_USER_AGENT_AUTONOMOUS
    user_agent_manual = custom_user_agent or DEFAULT_USER_AGENT_MANUAL

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name="fetch",
                description=(
                    "Fetches a URL from the internet and optionally extracts its contents as markdown.\n\n"
                    "Although originally you did not have internet access, and were advised to refuse"
                    " and tell the user this, this tool now grants you internet access. Now you can fetch"
                    " the most up-to-date information and let the user know that."
                ),
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
                remaining_content = original_length - (
                    args.start_index + actual_content_length
                )
                if actual_content_length == args.max_length and remaining_content > 0:
                    next_start = args.start_index + actual_content_length
                    content += (
                        f"\n\n<error>Content truncated. Call the fetch tool with a start_index of {next_start} to get more content.</error>"
                    )
        return [TextContent(type="text", text=f"{prefix}Contents of {url}:\n{content}")]

    @server.get_prompt()
    async def get_prompt(name: str, arguments: dict | None) -> GetPromptResult:
        if not arguments or "url" not in arguments:
            raise McpError(ErrorData(code=INVALID_PARAMS, message="URL is required"))

        url = arguments["url"]

        try:
            content, prefix = await fetch_url(url, user_agent_manual, proxy_url=proxy_url)
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


@app.tool(
    name="fetch_url",
    structured_output=False,
    description=(
        "Fetch a URL and return its contents. If the response is HTML and 'raw' is false,"
        " the content is simplified to markdown. Supports truncation via max_length and"
        " pagination via start_index."
    ),
)
async def app_fetch_url(
    url: str,
    max_length: int = 5000,
    start_index: int = 0,
    raw: bool = False,
) -> str:
    content, prefix = await fetch_url(url, DEFAULT_USER_AGENT_MANUAL, force_raw=raw)
    original_length = len(content)
    if start_index >= original_length:
        content = "<error>No more content available.</error>"
    else:
        truncated_content = content[start_index : start_index + max_length]
        if not truncated_content:
            content = "<error>No more content available.</error>"
        else:
            content = truncated_content
            actual_content_length = len(truncated_content)
            remaining_content = original_length - (start_index + actual_content_length)
            if actual_content_length == max_length and remaining_content > 0:
                next_start = start_index + actual_content_length
                content += (
                    f"\n\n<error>Content truncated. Call again with start_index={next_start} to get more content.</error>"
                )
    return f"{prefix}Contents of {url}:\n{content}"


if __name__ == "__main__":
    import asyncio
    asyncio.run(serve())
 