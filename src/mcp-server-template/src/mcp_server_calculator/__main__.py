# This template file mostly will stay the same for all MCP servers
# It is responsible for launching a uvicorn server with the given MCP server

import argparse
import logging
import os

import uvicorn
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from mcp_server_calculator.logging_config import (configure_logging,
                                                  logging_level)
from mcp_server_calculator.server import server
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.routing import Mount, Route

configure_logging()
logger = logging.getLogger(__name__)

# --- Application Factory --- #


def create_starlette_app() -> Starlette:
    """Create a Starlette application that can server the provied mcp server with SSE."""

    sse = SseServerTransport("/messages/")
    mcp_server: Server = server

    async def handle_sse(request: Request) -> None:
        async with sse.connect_sse(
            request.scope,
            request.receive,
            request._send,  # noqa: SLF001
        ) as (read_stream, write_stream):
            await mcp_server.run(
                read_stream,
                write_stream,
                mcp_server.create_initialization_options(),
            )

    return Starlette(
        debug=logging_level == "DEBUG",
        routes=[
            Route("/sse", endpoint=handle_sse),
            Mount("/messages/", app=sse.handle_post_message),
        ],
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run Calculator MCP server")
    parser.add_argument(
        "--host",
        default=os.getenv("MCP_CALCULATOR_HOST", "0.0.0.0"),  # Override with your env variables
        help="Host to bind to (Default: MCP_CALCULATOR_HOST or 0.0.0.0)", # Override with your env variables
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("MCP_CALCULATOR_PORT", "8000")), # Override with your env variables
        help="Port to listen on (Default: MCP_CALCULATOR_PORT or 8000)", # Override with your env variables
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        default=os.getenv("MCP_CALCULATOR_HOT_RELOAD", "false").lower()
        in ("true", "1", "t", "yes"), # Override with your env variables
        help="Enable hot reload (env: MCP_CALCULATOR_HOT_RELOAD)", # Override with your env variables
    )

    args = parser.parse_args()
    logger.info(f"Starting Calculator MCP server on {args.host}:{args.port}")

    # Don't forget to change the module name to your own!
    uvicorn.run(
        "mcp_server_calculator.__main__:create_starlette_app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level=logging_level.lower(),
        factory=True,
    )
