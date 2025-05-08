import logging
import sys
from pathlib import Path

import click
import uvicorn

from .server import serve


@click.command()
@click.option("--repository", "-r", type=Path, help="Git repository path")
@click.option("-v", "--verbose", count=True)
@click.option(
    "--transport",
    type=click.Choice(["stdio", "sse"]),
    default="stdio",
    show_default=True,
    help="Transport to use: stdio or sse",
)
@click.option(
    "--host",
    type=str,
    default="127.0.0.1",
    show_default=True,
    help="Host for SSE transport",
)
@click.option(
    "--port", type=int, default=9000, show_default=True, help="Port for SSE transport"
)
def main(
    repository: Path | None, verbose: bool, transport: str, host: str, port: int
) -> None:
    """MCP Git Server - Git functionality for MCP"""
    import asyncio

    logging_level = logging.WARN
    if verbose == 1:
        logging_level = logging.INFO
    elif verbose >= 2:
        logging_level = logging.DEBUG

    logging.basicConfig(level=logging_level, stream=sys.stderr)
    if transport == "sse":
        result = asyncio.run(
            serve(repository, transport=transport, host=host, port=port)
        )
        if result is not None:
            app, host, port = result
            uvicorn.run(app, host=host, port=port)
    else:
        asyncio.run(serve(repository, transport=transport, host=host, port=port))


if __name__ == "__main__":
    main()
