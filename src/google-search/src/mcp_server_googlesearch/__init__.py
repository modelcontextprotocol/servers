"""Command line interface for the Google search MCP server."""

import asyncio
import os

import click
from dotenv import load_dotenv
from mcp_server_googlesearch.client import CustomGoogleSearchClient
from mcp_server_googlesearch.server import (
    run_sse_server,
    run_stdio_server,
)
from pydantic import SecretStr


@click.command()
@click.option("--host", default="0.0.0.0", help="Host to listen on")
@click.option("--port", default=8000, help="Port to listen on for SSE")
@click.option(
    "--transport",
    type=click.Choice(["stdio", "sse"]),
    default="stdio",
    help="Transport type",
)
def main(port: int, host: str, transport: str) -> None:
    """Run the Google search MCP server."""

    load_dotenv()

    if os.getenv("GOOGLE_API_KEY") is None:
        raise ValueError("GOOGLE_API_KEY is not set")
    if os.getenv("GOOGLE_CSE_ID") is None:
        raise ValueError("GOOGLE_CSE_ID is not set")

    google_search_client = CustomGoogleSearchClient(
        google_api_key=SecretStr(os.environ["GOOGLE_API_KEY"]),
        google_cse_id=SecretStr(os.environ["GOOGLE_CSE_ID"]),
    )

    if transport == "sse":
        asyncio.run(run_sse_server(google_search_client, host, port))
    else:
        asyncio.run(run_stdio_server(google_search_client))


if __name__ == "__main__":
    main()
