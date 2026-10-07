import click
from pathlib import Path
import logging
import sys
from .server import serve

@click.command()
@click.option("--repository", "-r", type=Path, help="Git repository path")
@click.option(
    "--allow-any-repository",
    is_flag=True,
    default=False,
    help=(
        "Allow tool calls to operate on any repo_path supplied by the client, "
        "instead of restricting to the current working directory when "
        "--repository is not set. Only enable this if every client that can "
        "reach this server is trusted."
    ),
)
@click.option("-v", "--verbose", count=True)
def main(repository: Path | None, allow_any_repository: bool, verbose: bool) -> None:
    """MCP Git Server - Git functionality for MCP"""
    import asyncio

    logging_level = logging.WARN
    if verbose == 1:
        logging_level = logging.INFO
    elif verbose >= 2:
        logging_level = logging.DEBUG

    logging.basicConfig(level=logging_level, stream=sys.stderr)
    asyncio.run(serve(repository, allow_any_repository))

if __name__ == "__main__":
    main()
