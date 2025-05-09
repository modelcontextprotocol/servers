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
import traceback

DEFAULT_USER_AGENT_AUTONOMOUS = "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"
DEFAULT_USER_AGENT_MANUAL = "ModelContextProtocol/1.0 (User-Specified; +https://github.com/modelcontextprotocol/servers)"

# Import selenium modules for handling SPAs
try:
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options
    from selenium.webdriver.common.by import By
    from selenium.common.exceptions import TimeoutException
    import time
    SELENIUM_AVAILABLE = True
except ImportError:
    SELENIUM_AVAILABLE = False

def fetch_with_selenium(url: str, user_agent: str, proxy_url: str | None = None) -> str:
    """Fetch content using Selenium to render JavaScript.

    Args:
        url: URL to fetch
        user_agent: User agent string to use
        proxy_url: Optional proxy URL

    Returns:
        Markdown content extracted from the rendered page
    """
    print(f"Using Selenium to render: {url}")
    
    # Configure Chrome options
    chrome_options = Options()
    chrome_options.add_argument("--headless")  # Run in headless mode (no GUI)
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument(f"user-agent={user_agent}")
    
    if proxy_url:
        chrome_options.add_argument(f"--proxy-server={proxy_url}")
    
    # Initialize the driver
    driver = webdriver.Chrome(options=chrome_options)
    
    try:
        # Set page load timeout
        driver.set_page_load_timeout(30)
        
        # Navigate to the URL
        driver.get(url)
        
        # Wait for the page to load completely
        time.sleep(5)  # Additional wait for JavaScript to execute
        
        # Extract the main content
        try:
            # Try to find main content elements
            main_content = None
            content_selectors = [
                "main", "article", ".content", "#content", 
                "[role='main']", ".main-content", "#main-content"
            ]
            
            for selector in content_selectors:
                try:
                    elements = driver.find_elements(By.CSS_SELECTOR, selector)
                    if elements:
                        main_content = elements[0].get_attribute('innerHTML')
                        break
                except:
                    continue
            
            # If no specific content container found, use the body
            if not main_content:
                main_content = driver.find_element(By.TAG_NAME, "body").get_attribute('innerHTML')
            
            # Convert to markdown
            content = markdownify.markdownify(
                main_content,
                heading_style=markdownify.ATX,
            )
            return content
            
        except Exception as e:
            print(f"Error extracting content with Selenium: {str(e)}")
            traceback.print_exc()
            return f"<e>Error extracting content with Selenium: {str(e)}</e>"
    
    except TimeoutException:
        return "<e>Page load timed out in Selenium</e>"
    except Exception as e:
        print(f"Selenium exception: {str(e)}")
        traceback.print_exc()
        return f"<e>Selenium exception: {str(e)}</e>"
    
    finally:
        # Close the browser
        driver.quit()

def extract_content_from_html(html: str, url: str = "", user_agent: str = "", proxy_url: str | None = None) -> str:
    """Extract and convert HTML content to Markdown format with fallback to Selenium for SPAs.

    Args:
        html: Raw HTML content to process
        url: Original URL (used for Selenium fallback)
        user_agent: User agent string (used for Selenium fallback)
        proxy_url: Optional proxy URL (used for Selenium fallback)

    Returns:
        Simplified markdown version of the content
    """
    try:
        ret = readabilipy.simple_json.simple_json_from_html_string(
            html, use_readability=True
        )
        if ret["content"]:
            content = markdownify.markdownify(
                ret["content"],
                heading_style=markdownify.ATX,
            )
            return content
        else:
            print("No content found with readabilipy, trying Selenium fallback...")
            
            # If readabilipy fails and Selenium is available, try using Selenium
            if SELENIUM_AVAILABLE and url and user_agent:
                return fetch_with_selenium(url, user_agent, proxy_url)
            else:
                if not SELENIUM_AVAILABLE:
                    print("Selenium not available. Install with: pip install selenium")
                return "<e>Page failed to be simplified from HTML and Selenium fallback not available.</e>"
    except Exception as e:
        print(f"Exception in readabilipy processing: {str(e)}")
        traceback.print_exc()
        
        # Try selenium fallback
        if SELENIUM_AVAILABLE and url and user_agent:
            return fetch_with_selenium(url, user_agent, proxy_url)
        else:
            return f"<e>Exception: {str(e)} and Selenium fallback not available</e>"


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
        return extract_content_from_html(page_raw, url, user_agent, proxy_url), ""

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
            content = "<e>No more content available.</e>"
        else:
            truncated_content = content[args.start_index : args.start_index + args.max_length]
            if not truncated_content:
                content = "<e>No more content available.</e>"
            else:
                content = truncated_content
                actual_content_length = len(truncated_content)
                remaining_content = original_length - (args.start_index + actual_content_length)
                if remaining_content:
                    content += f"\n<e>{remaining_content:,} more characters available. "
                    if args.max_length < 1000000:
                        content += f"Use <max_length={min(args.max_length * 2, 1000000)}> to get more content on the next fetch. "
                    content += f"Use <start_index={args.start_index + actual_content_length}> to start from this point on the next fetch.</e>"

        return [TextContent(type="text", text=prefix + content)]

    @server.get_prompt()
    async def get_prompt(name: str, arguments: dict | None) -> GetPromptResult:
        if name != "fetch":
            raise McpError(ErrorData(code=INVALID_PARAMS, message=f"Unknown prompt: {name}"))

        if not arguments:
            raise McpError(ErrorData(code=INVALID_PARAMS, message="URL is required"))

        url = arguments.get("url")
        if not url:
            raise McpError(ErrorData(code=INVALID_PARAMS, message="URL is required"))

        try:
            content, prefix = await fetch_url(
                url, user_agent_manual, force_raw=False, proxy_url=proxy_url
            )
        except McpError:
            # Try again without robots.txt check
            # This is OK because we're in the context of a user-initiated prompt
            content, prefix = await fetch_url(
                url, user_agent_manual, force_raw=False, proxy_url=proxy_url
            )

        default_length = 5000
        if len(content) > default_length:
            main_content = content[:default_length]
            main_content += f"\n<e>{len(content) - default_length:,} more characters available. Call the fetch tool with a larger max_length parameter to get more content.</e>"
        else:
            main_content = content

        return GetPromptResult(
            messages=[
                PromptMessage(
                    role="system",
                    content=f"""The URL was fetched successfully. When referring to any external sources, you should always cite them.""",
                ),
                PromptMessage(
                    role="user",
                    content=f"""I'd like information from this URL: {url}
                    
{prefix}{main_content}""",
                ),
            ]
        )

    # Set up the server using the correct approach
    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=True)


if __name__ == "__main__":
    import asyncio

    asyncio.run(serve())
