import asyncio

from . import server


def main():
    """Main entry point for the package."""
    asyncio.run(server.main())


__all__ = ["main", "server"]
