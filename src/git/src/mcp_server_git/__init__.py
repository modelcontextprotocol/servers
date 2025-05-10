import asyncio
import click
import logging
from pathlib import Path
import sys
import signal
from .server import serve

def handle_sigint():
    for task in asyncio.all_tasks():
        task.cancel()

@click.command()
@click.option(
    "--repository",
    type=click.Path(exists=True, file_okay=False, dir_okay=True, path_type=Path),
    help="Path to Git repository to operate on",
)
@click.option("-v", "--verbose", count=True, default=0)
def main(repository: Path | None, verbose: int = 0) -> None:
    """MCP Git Server - Git functionality for MCP"""
    logging_level = logging.WARN
    if verbose == 1:
        logging_level = logging.INFO
    elif verbose > 1:
        logging_level = logging.DEBUG
    logging.basicConfig(level=logging_level)
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    # Set up signal handlers
    loop.add_signal_handler(signal.SIGINT, handle_sigint)
    loop.add_signal_handler(signal.SIGTERM, handle_sigint)
    
    try:
        loop.run_until_complete(serve(repository))
    except asyncio.CancelledError:
        logging.info("Server shutdown initiated")
    finally:
        loop.close()

if __name__ == "__main__":
    main()
