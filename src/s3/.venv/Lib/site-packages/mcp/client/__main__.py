import logging
import sys
from functools import partial
from urllib.parse import urlparse

import anyio
import click

from mcp.client.session import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import StdioServerParameters, stdio_client

if not sys.warnoptions:
    import warnings

    warnings.simplefilter("ignore")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("client")


async def receive_loop(session: ClientSession):
    logger.info("Starting receive loop")
    async for message in session.incoming_messages:
        if isinstance(message, Exception):
            logger.error("Error: %s", message)
            continue

        logger.info("Received message from server: %s", message)


async def run_session(read_stream, write_stream):
    async with (
        ClientSession(read_stream, write_stream) as session,
        anyio.create_task_group() as tg,
    ):
        tg.start_soon(receive_loop, session)

        logger.info("Initializing session")
        await session.initialize()
        logger.info("Initialized")


async def main(command_or_url: str, args: list[str], env: list[tuple[str, str]]):
    env_dict = dict(env)

    if urlparse(command_or_url).scheme in ("http", "https"):
        # Use SSE client for HTTP(S) URLs
        async with sse_client(command_or_url) as streams:
            await run_session(*streams)
    else:
        # Use stdio client for commands
        server_parameters = StdioServerParameters(
            command=command_or_url, args=args, env=env_dict
        )
        async with stdio_client(server_parameters) as streams:
            await run_session(*streams)


@click.command()
@click.argument("command_or_url")
@click.argument("args", nargs=-1)
@click.option(
    "--env",
    "-e",
    multiple=True,
    nargs=2,
    metavar="KEY VALUE",
    help="Environment variables to set. Can be used multiple times.",
)
def cli(*args, **kwargs):
    anyio.run(partial(main, *args, **kwargs), backend="trio")


if __name__ == "__main__":
    cli()
