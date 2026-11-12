import logging
import sys
from pathlib import Path

import click

from .server import serve
from .transport import TRANSPORTS, http_endpoint


@click.command()
@click.option(
    "--repository",
    "-r",
    type=Path,
    help=(
        "Git repository to confine operations to (a path inside it selects the"
        " whole repository). Without this option, every repository the server"
        " process can reach is in scope."
    ),
)
@click.option("-v", "--verbose", count=True)
@click.option(
    "--transport",
    type=click.Choice(TRANSPORTS),
    default="stdio",
    show_default=True,
    help=(
        "How clients reach the server. streamable-http listens on"
        " $HOST:$PORT, 127.0.0.1:3001 by default."
    ),
)
def main(repository: Path | None, verbose: bool, transport: str) -> None:
    """MCP Git Server - Git functionality for MCP"""
    import asyncio

    logging_level = logging.WARNING
    if verbose == 1:
        logging_level = logging.INFO
    elif verbose >= 2:
        logging_level = logging.DEBUG

    logging.basicConfig(level=logging_level, stream=sys.stderr)
    if transport == "streamable-http":
        # A bad HOST or PORT stops the server here, as a usage error.
        try:
            http_endpoint()
        except ValueError as e:
            raise click.UsageError(str(e))
    asyncio.run(serve(repository, transport))


if (
    __name__ == "__main__"
):  # pragma: no cover  # `python -m` runs __main__.py; running this file directly fails on the relative import
    main()
