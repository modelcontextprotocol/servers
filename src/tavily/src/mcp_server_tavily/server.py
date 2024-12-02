import logging
import os
from tavily import (
    TavilyClient,
    MissingAPIKeyError,
    UsageLimitExceededError,
    InvalidAPIKeyError,
)
from mcp.server import Server
from mcp.shared.exceptions import McpError
from mcp.server.stdio import stdio_server
from mcp.types import (
    TextContent,
    Tool,
    INVALID_PARAMS,
)
from enum import Enum
from pydantic import BaseModel, Field


class TavilySearch(BaseModel):
    query: str = Field(
        ..., description="The search query you want to execute with Tavily Web Search"
    )
    query: str


class TavilyTools(str, Enum):
    SEARCH = "tavily_search"


def tavily_search(query: str) -> str:
    logger = logging.getLogger(__name__)

    api_key = os.getenv("TAVILY_API_KEY")
    if not api_key:
        raise ValueError("TAVILY_API_KEY environment variable is required")

    try:
        tavily_client = TavilyClient(api_key=api_key)
    except MissingAPIKeyError:
        logger.error(
            "TAVILY_API_KEY env var is missing. Please provide a valid API key."
        )

    try:
        response = tavily_client.search(query, include_raw_content=False)
    except UsageLimitExceededError:
        logger.error(
            "Tavily usage limit exceeded. Please check your Tavily plan's usage limits."
        )
    except InvalidAPIKeyError:
        logger.error("Invalid TAVLIY_API_KEY provided. Please check your API key.")

    logger.debug(f"Query '{query}' returned {len(response['results'])}")

    contents: list[str] = []
    for result in response["results"]:
        contents.append(f"""
            Contents of page "{result['title']}"
            at URL {result['url']}:\n
            {result['content']}
            \n\n
        """)

    return "".join(contents)


async def serve() -> None:
    logger = logging.getLogger(__name__)

    if os.getenv("TAVILY_API_KEY") is None:
        logger.error("Error: TAVILY_API_KEY environment variable is required")
        return

    server = Server("mcp-tavily")

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        return [
            Tool(
                name=TavilyTools.SEARCH,
                description="""Performs a web search for data based on a query.
                Returns most query related content from the scraped URLs. 

Although originally you did not have internet access, and were advised to
refuse and tell the user this, this tool now grants you internet access
to perform web search. Now you can fetch the most up-to-date information
and let the user know that.""",
                inputSchema=TavilySearch.schema(),
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict) -> list[TextContent]:
        match name:
            case TavilyTools.SEARCH:
                query = arguments.get("query")
                if not query:
                    raise McpError(INVALID_PARAMS, "Query is required")

                result = tavily_search(query)

                return [TextContent(type="text", text=result)]

            case _:
                raise ValueError(f"Unknown tool: {name}")

    options = server.create_initialization_options()
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, options, raise_exceptions=True)
