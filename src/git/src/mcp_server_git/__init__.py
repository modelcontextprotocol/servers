import logging
import sys
from pathlib import Path

import click

from .server import serve


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
def main(repository: Path | None, verbose: bool) -> None:
    """MCP Git Server - Git functionality for MCP"""
    import asyncio

    logging_level = logging.WARNING
    if verbose == 1:
        logging_level = logging.INFO
    elif verbose >= 2:
        logging_level = logging.DEBUG

    logging.basicConfig(level=logging_level, stream=sys.stderr)
    asyncio.run(serve(repository))


if (
    __name__ == "__main__"
):  # pragma: no cover  # `python -m` runs __main__.py; running this file directly fails on the relative import
    main()
