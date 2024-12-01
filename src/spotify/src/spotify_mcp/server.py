import asyncio
import os
import logging
from enum import Enum
import json
from typing import List, Optional, Tuple
from datetime import datetime
from pathlib import Path

import mcp.types as types
from mcp.server import NotificationOptions, Server, stdio_server
from pydantic import BaseModel, Field, AnyUrl
from spotipy import SpotifyException

from . import spotify_api


logger = logging.getLogger("spotify_mcp")
logger.setLevel(logging.INFO)
server = Server("spotify-mcp")
spotify_client = spotify_api.Client(logger)


class ToolModel(BaseModel):
    @classmethod
    def as_tool(cls):
        return types.Tool(
            name="Spotify" + cls.__name__,
            description=cls.__doc__,
            inputSchema=cls.model_json_schema()
        )


class GetCurrentTrack(ToolModel):
    """Get information about user's current track."""
    pass

class StartPlayback(ToolModel):
    """Controls song playback. If track_id is omitted, resumes current playback."""
    track_id: str | None = None


class PausePlayback(ToolModel):
    """Pauses the current playback."""
    pass


class Queue(ToolModel):
    """Manage the playback queue - add tracks, view queue, or skip to next track."""
    action: str = Field(description="Action to perform: 'add_track', 'get', or 'next'")
    track_id: Optional[str] = Field(default=None, description="Track ID to add to queue (required for add_track action)")
    num_skips: Optional[int] = Field(default=1, description="Number of tracks in queue to skip.")


class GetInfo(ToolModel):
    """
    Get detailed information about a Spotify item (track, album, artist, or playlist).
    """
    item_id: str = Field(description="ID of the item to get information about")
    qtype: str = Field(default="track", description="Type of item: 'track', 'album', 'artist', or 'playlist'. "
                                                    "If 'playlist' or 'album', returns its tracks. If 'artist',"
                                                    "returns albums and top tracks.")


class Search(ToolModel):
    """Search for tracks, albums, artists, or playlists on Spotify."""
    query: str = Field(description="query term")
    qtype: Optional[str] = Field(default="track", description="Type of items to search for (track, album, artist, playlist, or comma-separated combination)")
    limit: Optional[int] = Field(default=10, description="Maximum number of items to return")



@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """List available tools."""
    logger.info("Listing available tools")
    tools = [
        GetCurrentTrack.as_tool(),
        StartPlayback.as_tool(),
        PausePlayback.as_tool(),
        Search.as_tool(),
        Queue.as_tool(),
        GetInfo.as_tool(),
    ]
    logger.info(f"Available tools: {[tool.name for tool in tools]}")
    return tools


@server.call_tool()
async def handle_call_tool(
        name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """Handle tool execution requests."""
    logger.info(f"Tool called: {name} with arguments: {arguments}")
    assert name[:7] == "Spotify", f"Unknown tool: {name}"

    try:
        match name[7:]:
            case "GetCurrentTrack":
                logger.info("Attempting to get current track")
                curr_track = spotify_client.get_current_track()
                if curr_track:
                    logger.info(f"Current track retrieved: {curr_track.get('name', 'Unknown')}")
                    return [types.TextContent(
                        type="text",
                        text=json.dumps(curr_track, indent=2)
                    )]
                logger.info("No track currently playing")
                return [types.TextContent(
                    type="text",
                    text="No track playing."
                )]

            case "StartPlayback":
                logger.info(f"Starting playback with arguments: {arguments}")
                spotify_client.start_playback(**arguments)
                logger.info("Playback started successfully")
                return [types.TextContent(
                    type="text",
                    text="Playback starting with no errors."
                )]

            case "PausePlayback":
                logger.info("Attempting to pause playback")
                spotify_client.pause_playback()
                logger.info("Playback paused successfully")
                return [types.TextContent(
                    type="text",
                    text="Playback paused successfully."
                )]

            case "Search":
                logger.info(f"Performing search with arguments: {arguments}")
                search_results = spotify_client.search(
                    query=arguments.get("query", ""),
                    qtype=arguments.get("qtype", "track"),
                    limit=arguments.get("limit", 10)
                )
                logger.info("Search completed successfully")
                return [types.TextContent(
                    type="text",
                    text=json.dumps(search_results, indent=2)
                )]

            case "Queue":
                logger.info(f"Queue operation with arguments: {arguments}")
                action = arguments.get("action")

                match action:
                    case "add_track":
                        track_id = arguments.get("track_id")
                        if not track_id:
                            return [types.TextContent(
                                type="text",
                                text="track_id is required for add_track action"
                            )]
                        spotify_client.add_to_queue(track_id)
                        return [types.TextContent(
                            type="text",
                            text=f"Track added to queue successfully."
                        )]

                    case "get":
                        queue = spotify_client.get_queue()
                        return [types.TextContent(
                            type="text",
                            text=json.dumps(queue, indent=2)
                        )]

                    case "skip":
                        num_skips = arguments.get("skip", 1)
                        spotify_client.skip_track(n=num_skips)
                        return [types.TextContent(
                            type="text",
                            text="Skipped to next track."
                        )]

                    case _:
                        return [types.TextContent(
                            type="text",
                            text=f"Unknown queue action: {action}. Supported actions are: add_track, get, next"
                        )]

            case "GetInfo":
                logger.info(f"Getting item info with arguments: {arguments}")
                item_info = spotify_client.get_info(
                    item_id=arguments.get("item_id"),
                    qtype=arguments.get("qtype", "track")
                )
                return [types.TextContent(
                    type="text",
                    text=json.dumps(item_info, indent=2)
                )]



            case _:
                error_msg = f"Unknown tool: {name}"
                logger.error(error_msg)
                raise ValueError(error_msg)

    except SpotifyException as se:
        error_msg = f"Spotify Client error occurred: {str(se)}"
        logger.error(error_msg, exc_info=True)
        return [types.TextContent(
            type="text",
            text=f"An error occurred with the Spotify Client: {str(se)}"
        )]
    except Exception as e:
        error_msg = f"Unexpected error occurred: {str(e)}"
        logger.error(error_msg, exc_info=True)
        raise


async def main():
    logger.info("Starting Spotify MCP server")
    try:
        options = server.create_initialization_options()
        async with stdio_server() as (read_stream, write_stream):
            logger.info("Server initialized successfully")
            await server.run(
                read_stream,
                write_stream,
                options
            )
    except Exception as e:
        logger.error(f"Server error occurred: {str(e)}", exc_info=True)
        raise