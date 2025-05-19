from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from enum import StrEnum
from typing import AsyncIterator

from mcp.server import Server
from mcp.types import TextContent, Tool
from mcp_server_youtube.youtube import (YouTubeClientError, YouTubeSearcher,
                                        get_youtube_searcher)
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)


# --- Tool Constants & Enums ---
class YouTubeToolNames(StrEnum):
    """Enum for YouTube MCP tool names."""

    SEARCH_AND_TRANSCRIPT = "youtube_search_and_transcript"


# --- Tool Input/Output Schemas --- #
class YouTubeSearchRequest(BaseModel):
    """Input schema for the youtube_search_and_transcript tool."""

    query: str = Field(..., description="The search query string for YouTube videos.")
    max_results: int = Field(
        default=3, description="Maximum number of video results to return.", ge=1, le=20
    )
    transcript_language: str = Field(
        default="en",
        description="The language code for the transcript (e.g., 'en', 'es').",
    )


# --- MCP Server Initialization --- #
@asynccontextmanager
async def server_lifespan(server: Server) -> AsyncIterator[dict]:
    """Manage server startup/shutdown."""
    logger.info("Lifespan: Initializing services...")
    try:
        youtube_searcher: YouTubeSearcher = get_youtube_searcher()
        logger.info("Lifespan: Services initialized successfully.")
        yield {"youtube_searcher": youtube_searcher}
    except YouTubeClientError as init_err:
        logger.error(
            f"FATAL: Lifespan initialization failed: {init_err}", exc_info=True
        )
        raise init_err
    except Exception as startup_err:
        logger.error(
            f"FATAL: Unexpected error during lifespan initialization: {startup_err}",
            exc_info=True,
        )
        raise startup_err
    finally:
        logger.info("Lifespan: Shutdown cleanup (if any).")


server = Server("youtube-mcp-server", lifespan=server_lifespan)


# --- Tool Definitions --- #


@server.list_tools()
async def list_tools() -> list[Tool]:
    """Lists the tools available in this MCP server."""
    logger.info("Listing available tools.")
    return [
        Tool(
            name=YouTubeToolNames.SEARCH_AND_TRANSCRIPT.value,
            description=(
                "Searches YouTube for videos based on a query and attempts to retrieve the transcript "
                "for ALL videos found (limited to max_results). Useful for getting information or content "
                "from YouTube videos."
            ),
            inputSchema=YouTubeSearchRequest.model_json_schema(),
        )
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handles incoming tool calls for the YouTube MCP server."""
    logger.info(f"Received call_tool request for '{name}' with args: {arguments}")

    youtube_searcher: YouTubeSearcher = server.request_context.lifespan_context.get(
        "youtube_searcher"
    )

    match name:
        case YouTubeToolNames.SEARCH_AND_TRANSCRIPT.value:
            try:
                # 1. Validate Input Arguments
                request_model = YouTubeSearchRequest(**arguments)
                logger.info(
                    f"Validated request for query: '{request_model.query}', max_results: {request_model.max_results}"
                )

                # 2. Perform the search with transcripts
                logger.debug(f"Searching YouTube for: '{request_model.query}'")
                search_result = youtube_searcher.search_videos(
                    query=request_model.query,
                    max_results=request_model.max_results,
                    language=request_model.transcript_language,
                )

                logger.debug(f"Found {len(search_result)} videos")

                formatted_result = ",\n\n".join([str(video) for video in search_result])
                return [TextContent(type="text", text=formatted_result)]

            except ValidationError as ve:
                error_msg = f"Invalid arguments for tool '{name}': {ve}"
                logger.warning(error_msg)
                return [TextContent(type="text", text=error_msg)]

            except YouTubeClientError as yt_err:
                error_msg = f"YouTube client error processing tool '{name}': {yt_err}"
                logger.error(error_msg, exc_info=True)
                return [TextContent(type="text", text=error_msg)]

            except Exception as e:
                error_msg = f"Unexpected error processing tool '{name}': {e}"
                logger.error(error_msg, exc_info=True)
                return [TextContent(type="text", text=error_msg)]

        case _:
            logger.warning(f"Received call for unknown tool: {name}")
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
