import click
from pathlib import Path
import logging
import sys
from .server import serve, DiscoveryConfig

@click.command()
@click.option("--repository", "-r", "repositories", multiple=True, type=Path, 
              help="Git repository path (can be specified multiple times)")
@click.option("--enable-discovery", is_flag=True, default=False,
              help="Enable repository auto-discovery within MCP session roots")
@click.option("--max-discovery-depth", default=2, type=int,
              help="Maximum directory depth for auto-discovery (default: 2)")
@click.option("--discovery-exclude", multiple=True, 
              help="Patterns to exclude from discovery (e.g., 'node_modules', '.venv')")
@click.option("-v", "--verbose", count=True)
def main(repositories: tuple[Path, ...], enable_discovery: bool, max_discovery_depth: int, 
         discovery_exclude: tuple[str, ...], verbose: bool) -> None:
    """MCP Git Server - Git functionality for MCP"""
    import asyncio

    logging_level = logging.WARN
    if verbose == 1:
        logging_level = logging.INFO
    elif verbose >= 2:
        logging_level = logging.DEBUG

    logging.basicConfig(level=logging_level, stream=sys.stderr)
    
    # Convert tuple to list for easier handling
    repo_list = list(repositories) if repositories else []
    
    # Create discovery configuration
    discovery_config = DiscoveryConfig(
        enabled=enable_discovery,
        max_depth=max_discovery_depth,
        exclude_patterns=list(discovery_exclude)
    ) if enable_discovery else None
    
    asyncio.run(serve(repo_list, discovery_config))

if __name__ == "__main__":
    main()
