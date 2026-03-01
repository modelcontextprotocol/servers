import click
from pathlib import Path
import logging
import sys
import os
from .server import ACLConfigError, serve


def _env_flag(name: str) -> bool:
    value = os.getenv(name, "").strip().lower()
    return value in {"1", "true", "yes", "on"}


@click.command()
@click.option("--repository", "-r", type=Path, help="Git repository path")
@click.option(
    "--strict-acl",
    is_flag=True,
    help="Fail startup unless repository ACL is explicitly configured.",
)
@click.option("-v", "--verbose", count=True)
def main(repository: Path | None, strict_acl: bool, verbose: bool) -> None:
    """MCP Git Server - Git functionality for MCP"""
    import asyncio

    logging_level = logging.WARN
    if verbose == 1:
        logging_level = logging.INFO
    elif verbose >= 2:
        logging_level = logging.DEBUG

    logging.basicConfig(level=logging_level, stream=sys.stderr)
    strict_acl = strict_acl or _env_flag("MCP_SERVER_STRICT_ACL")
    try:
        asyncio.run(serve(repository, strict_acl=strict_acl))
    except ACLConfigError as exc:
        click.echo(str(exc), err=True)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
